#!/usr/bin/env python3
"""Certification V2 — Wave 1.5c snapshot/report generator.

Usage:
  python3 scripts/cert-v2/01c-snapshot-report.py pre  > (writes 01c-pre-zero-snapshot.md)
  python3 scripts/cert-v2/01c-snapshot-report.py post > (writes 01c-true-zero-state-certification.md)

Reads the database through psql (PG* env vars) and the governed harness
functions. Identity classification counts are supplied via the
CERT_IDENTITY_JSON environment variable (produced by
`select public.cert_v2_auth_purge_precheck()` executed with service_role),
because that function is service-role only by design.

No passwords or secrets are ever read, printed or written.
"""
import datetime
import json
import os
import subprocess
import sys

DOCS = "docs/certification/v2"


def q(sql):
    r = subprocess.run(["psql", "-At", "-F", "|", "-c", sql], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr)
    return [l.split("|") for l in r.stdout.strip().split("\n") if l]


def scalar(sql):
    return q(sql)[0][0]


RUNTIME_CTE = (
    "with cls as (select c.table_name t, c.row_count n "
    "from public.cert_v2_table_classification() c "
    "where c.category='RUNTIME_MUST_ZERO') "
)

GROUPS = {
    "Notification runtime": "t like 'notification%' or t like '%_notifications' or t='notifications'",
    "Correspondence runtime": "t like 'correspondence_%'",
    "Audit / log runtime": "t like 'audit\\_%' or t like '%_audit_%' or t like '%_logs' or t like '%_log'",
    "Entity / licensing runtime": "t like 'entity%' or t like 'application%' or t like 'licen%' or t like 'registration_%'",
    "Returns runtime": "t like 'return%' or t='compliance_returns'",
    "Prudential runtime": "t like 'prudential_%' or t like 'group_%' or t like 'financial_group%' or t like 'risk_%'",
    "Fit & Proper runtime": "t like 'fp\\_%' or t like 'aml_%'",
    "Complaints / conduct runtime": "t like 'complaint%' or t like 'conduct_%'",
    "Inspection / examination runtime": "t like 'examination%' or t like 'inspection%'",
    "Enforcement runtime": "t like 'enforcement_%'",
    "Workflow runtime": "t like 'approval_action%' or t like 'workflow_instance%' or t like 'review_%' or t like 'decision_%'",
    "Supervisory intelligence runtime": "t like 'supervisory_%' or t like 'monitoring_%' or t like 'ai\\_%'",
    "Payments / fees runtime": "t like 'payment%' or t like 'invoice%' or t like 'refund%'",
    "Escalation runtime": "t like 'escalation%' or t like '%_escalation%'",
    "Document runtime": "t like 'document%' or t='file_uploads'",
}

ORDER = [
    "CONFIG_KEEP",
    "REFERENCE_KEEP",
    "SECURITY_CONFIG_KEEP",
    "CERTIFICATION_HARNESS_KEEP",
    "RUNTIME_MUST_ZERO",
]


def collect():
    rows = q(
        "select table_name, category, row_count from public.cert_v2_table_classification() "
        "order by category, table_name"
    )
    cats = {}
    for t, c, n in rows:
        cats.setdefault(c, []).append((t, int(n)))
    areas = q(
        "select area, tables_count, row_count, expectation, status "
        "from public.cert_v2_operational_area_matrix()"
    )
    groups = [
        (name, int(scalar(f"{RUNTIME_CTE} select coalesce(sum(n),0) from cls where {pred}")))
        for name, pred in GROUPS.items()
    ]
    ident = json.loads(os.environ.get("CERT_IDENTITY_JSON", "{}"))
    identity = [
        ("auth users", ident.get("total", "n/a")),
        ("certification identities (manifest)", ident.get("certification_keep", "n/a")),
        ("machine/system identities", ident.get("machine_keep", "n/a")),
        ("old human identities", ident.get("old_human_purge", "n/a")),
        ("unknown identities (blockers)", ident.get("unknown_blocker", "n/a")),
        ("profiles", scalar("select count(*) from public.profiles")),
        ("sec_user_roles assignments (canonical)", scalar("select count(*) from public.sec_user_roles")),
        ("user_dynamic_roles assignments (projection)", scalar("select count(*) from public.user_dynamic_roles")),
        ("user_roles assignments (legacy projection)", scalar("select count(*) from public.user_roles")),
    ]
    config = q(
        "select area, actual_count, expected_min, status from public.cert_v2_config_integrity_gate()"
    )
    return cats, areas, groups, identity, config


def table(out, header, rows):
    out.append("| " + " | ".join(header) + " |")
    out.append("|" + "|".join(["---"] * len(header)) + "|")
    for r in rows:
        out.append("| " + " | ".join(str(x) for x in r) + " |")
    out.append("")


def main():
    phase = (sys.argv[1] if len(sys.argv) > 1 else "pre").lower()
    cats, areas, groups, identity, config = collect()
    ts = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    out = []
    if phase == "pre":
        out.append("# Certification V2 — PRE-ZERO Snapshot (Wave 1.5c)\n")
    else:
        out.append("# Certification V2 — TRUE OPERATIONAL ZERO-STATE Certification (Wave 1.5c)\n")
    out.append(f"Captured: {ts}")
    out.append("Environment: non-production certification database "
               "(guard: environment=non_production, reset_enabled=true)\n")
    out.append("No passwords or secrets are recorded in this document.\n")

    out.append("## Identity baseline\n")
    table(out, ["Metric", "Count"], identity)

    out.append("## Runtime volume by domain group (RUNTIME_MUST_ZERO tables only)\n")
    table(out, ["Domain group", "Rows"], groups)

    out.append("## Operational-area zero-state matrix\n")
    table(out, ["Area", "Runtime tables", "Rows", "Expectation", "Status"], areas)

    out.append("## Configuration preservation gate\n")
    table(out, ["Configuration area", "Actual", "Expected minimum", "Status"], config)

    out.append("## Table-by-table row counts by classification\n")
    for c in ORDER:
        lst = cats.get(c, [])
        out.append(f"### {c} — {len(lst)} tables, {sum(n for _, n in lst)} rows\n")
        table(out, ["Table", "Rows"], lst)

    name = "01c-pre-zero-snapshot.md" if phase == "pre" else "01c-true-zero-state-certification.md"
    path = os.path.join(DOCS, name)
    os.makedirs(DOCS, exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(out) + "\n")
    print("written", path, "tables:", sum(len(v) for v in cats.values()))


if __name__ == "__main__":
    main()
