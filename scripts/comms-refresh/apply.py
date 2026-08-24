#!/usr/bin/env python3
"""
Enterprise Communication Content Refresh — content-only applier.

Reads the curated content pack under scripts/comms-refresh/content/*.json and
rewrites ONLY the wording of existing notification event configs and the
notification templates already bound to them.

Guarantees (content-first, zero functional regression):
  * event keys, recipient rules, channels, dedupe windows, severity and every
    other configuration column are never written;
  * a new content token is rejected unless it already appears in the current
    content for the same event (or is a system token the dispatcher always
    injects), so no template can reference a variable the payload lacks;
  * template ids/codes are preserved; historic notification_template_versions
    rows are never mutated — a new version row is appended and the binding is
    re-pinned so the improved wording goes live;
  * a BEFORE snapshot of every touched row is written to
    scripts/comms-refresh/out/before-snapshot.json for evidence.

Usage:
  python3 scripts/comms-refresh/apply.py --dry-run
  python3 scripts/comms-refresh/apply.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT_DIR = ROOT / "content"
OUT_DIR = ROOT / "out"

SYSTEM_TOKENS = {"app_name", "app_url", "cta_url", "cta_label", "support_email", "portal_url", "login_url"}
TOKEN_RE = re.compile(r"\{\{\s*[#^/]?\s*([\w.]+)\s*\}\}")


def q(sql: str) -> list[dict]:
    db = os.environ.get("SUPABASE_DB_URL")
    if not db:
        sys.exit("SUPABASE_DB_URL is not set")
    res = subprocess.run(
        ["psql", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        sys.exit(f"query failed: {res.stderr.strip()}")
    out = res.stdout.strip()
    return json.loads(out) if out else []


def run_sql_file(path: Path) -> None:
    db = os.environ["SUPABASE_DB_URL"]
    res = subprocess.run(["psql", db, "-v", "ON_ERROR_STOP=1", "-f", str(path)], capture_output=True, text=True)
    print(res.stdout.strip()[-4000:])
    if res.returncode != 0:
        sys.exit(f"apply failed: {res.stderr.strip()[-4000:]}")


def tokens(*texts: str | None) -> set[str]:
    found: set[str] = set()
    for t in texts:
        if t:
            found |= set(TOKEN_RE.findall(t))
    return found


def lit(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "$refresh$" + value + "$refresh$"


def load_pack() -> dict[str, dict]:
    pack: dict[str, dict] = {}
    for f in sorted(CONTENT_DIR.glob("*.json")):
        data = json.loads(f.read_text())
        for key, entry in data.items():
            entry["_source_file"] = f.name
            pack[key] = entry
    return pack


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    prior_snapshot = OUT_DIR / "before-snapshot.json"
    prior_baseline: dict[str, dict] = {}
    if prior_snapshot.exists():
        for row in json.loads(prior_snapshot.read_text()):
            prior_baseline[row["event_key"]] = row["before"]

    pack = load_pack()
    keys = sorted(pack)
    keys_sql = ",".join("'" + k.replace("'", "''") + "'" for k in keys)

    configs = q(f"""
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select c.id, c.event_key, c.channels, c.is_active,
               c.title_template, c.message_template,
               c.email_subject_template, c.email_body_template
        from public.notification_event_configs c
        where c.event_key in ({keys_sql})
      ) t;
    """)
    by_key = {c["event_key"]: c for c in configs}

    bindings = q(f"""
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select b.id as binding_id, b.channel, b.template_id, b.template_version,
               c.event_key, t.template_code, t.subject, t.body, t.variables,
               t.status, t.version, t.published_version
        from public.notification_event_channel_templates b
        join public.notification_event_configs c on c.id = b.event_config_id
        join public.notification_templates t on t.id = b.template_id
        where c.event_key in ({keys_sql})
      ) t;
    """)

    missing = [k for k in keys if k not in by_key]
    stmts: list[str] = []
    snapshot: list[dict] = []
    rejected: list[dict] = []
    stats = {"configs": 0, "email_templates": 0, "in_app_templates": 0, "sms_templates": 0}

    for key in keys:
        cfg = by_key.get(key)
        if not cfg:
            continue
        entry = pack[key]
        allowed = tokens(
            cfg["title_template"], cfg["message_template"],
            cfg["email_subject_template"], cfg["email_body_template"],
        ) | SYSTEM_TOKENS
        for b in bindings:
            if b["event_key"] == key:
                allowed |= tokens(b["subject"], b["body"])
        # tokens present in the original (pre-refresh) copy remain valid even after a
        # previous refresh pass has already rewritten the live rows.
        baseline = prior_baseline.get(key)
        if baseline:
            allowed |= tokens(*baseline.values())

        new_tokens = tokens(
            entry.get("in_app_title"), entry.get("in_app_message"),
            entry.get("email_subject"), entry.get("email_body"),
        )
        unknown = sorted(new_tokens - allowed)
        if unknown:
            rejected.append({"event_key": key, "unknown_tokens": unknown})
            continue

        snapshot.append({
            "event_key": key,
            "before": {
                "title_template": cfg["title_template"],
                "message_template": cfg["message_template"],
                "email_subject_template": cfg["email_subject_template"],
                "email_body_template": cfg["email_body_template"],
            },
            "after": {
                "title_template": entry.get("in_app_title"),
                "message_template": entry.get("in_app_message"),
                "email_subject_template": entry.get("email_subject"),
                "email_body_template": entry.get("email_body"),
            },
            "channels": cfg["channels"],
            "bound_templates": [
                {
                    "channel": b["channel"], "template_code": b["template_code"],
                    "pinned_version": b["template_version"],
                    "subject": b["subject"], "body": b["body"],
                }
                for b in bindings if b["event_key"] == key
            ],
        })

        sets = []
        if entry.get("in_app_title"):
            sets.append(f"title_template = {lit(entry['in_app_title'])}")
        if entry.get("in_app_message"):
            sets.append(f"message_template = {lit(entry['in_app_message'])}")
        if entry.get("email_subject"):
            sets.append(f"email_subject_template = {lit(entry['email_subject'])}")
        if entry.get("email_body"):
            sets.append(f"email_body_template = {lit(entry['email_body'])}")
        if sets:
            stats["configs"] += 1
            stmts.append(
                "update public.notification_event_configs set "
                + ", ".join(sets)
                + f", updated_at = now() where event_key = {lit(key)};"
            )

        for b in bindings:
            if b["event_key"] != key:
                continue
            channel = b["channel"]
            if channel == "email":
                subject, body = entry.get("email_subject"), entry.get("email_body")
            elif channel == "in_app":
                subject, body = entry.get("in_app_title"), entry.get("in_app_message")
            else:
                subject, body = entry.get("sms_message"), entry.get("sms_message")
            if not subject or not body:
                continue
            stats[f"{channel}_templates"] = stats.get(f"{channel}_templates", 0) + 1
            stmts.append(f"""
with nextv as (
  select coalesce(max(version), 0) + 1 as v
  from public.notification_template_versions where template_id = '{b['template_id']}'
), ins as (
  insert into public.notification_template_versions
    (template_id, version, template_code, name, module, event_key, channel, severity, subject, body, variables, content_hash, published_at)
  select t.id, nextv.v, t.template_code, t.name, t.module, t.event_key, t.channel, t.severity,
         {lit(subject)}, {lit(body)}, t.variables, md5({lit(subject)} || {lit(body)}), now()
  from public.notification_templates t, nextv
  where t.id = '{b['template_id']}'
  returning version
), upd as (
  update public.notification_templates t
     set subject = {lit(subject)}, body = {lit(body)},
         version = (select version from ins),
         published_version = (select version from ins),
         updated_at = now()
   where t.id = '{b['template_id']}'
  returning t.id
)
update public.notification_event_channel_templates b
   set template_version = (select version from ins), updated_at = now()
 where b.id = '{b['binding_id']}';""".strip())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    snap_path = OUT_DIR / "before-snapshot.json"
    if not snap_path.exists() or args.apply:
        snap_path.write_text(json.dumps(snapshot, indent=2))
    (OUT_DIR / "rejected-tokens.json").write_text(json.dumps(rejected, indent=2))
    (OUT_DIR / "missing-events.json").write_text(json.dumps(missing, indent=2))

    sql_path = OUT_DIR / "refresh.sql"
    sql_path.write_text("begin;\n" + "\n\n".join(stmts) + "\ncommit;\n")

    print(json.dumps({
        "pack_entries": len(pack),
        "event_configs_matched": len(by_key),
        "event_keys_not_found": missing,
        "rejected_for_unknown_tokens": rejected,
        "statements": len(stmts),
        "stats": stats,
    }, indent=2))

    if args.apply:
        run_sql_file(sql_path)
        print("applied")


if __name__ == "__main__":
    main()
