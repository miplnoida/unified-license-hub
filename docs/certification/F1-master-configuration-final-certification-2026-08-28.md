# F1 — MASTER CONFIGURATION — FINAL CERTIFICATION & FREEZE

- Track: A (Platform / Configuration Foundation)
- Stage: F1-C (certification and freeze attempt)
- Date: 2026-08-28
- HEAD at certification: `24a9542c9`
- Evidence gate: `scripts/verify-f1c-certification.sql` (81 assertions, single-transaction, self-rolling-back)
- Authoritative inputs:
  - `docs/certification/F1-master-configuration-discovery-2026-08-28.md`
  - `docs/certification/F1-master-configuration-remediation-2026-08-28.md`

## FINAL VERDICT

**F1 NOT CERTIFIED — RETURN TO F1-B**

> **Superseded by F1-B2 (2026-08-28).** Both defects were remediated and proved
> closed in
> `docs/certification/F1-B2-decision-authority-and-grant-remediation-2026-08-28.md`.
> This report remains the authoritative record of the failed F1-C attempt.

Two material defects were proven empirically during certification. Per the
Track-A charter, certification does not silently remediate material defects, so
no product or schema change was made in this pass.

| Defect | Severity | Area | Status |
| --- | --- | --- | --- |
| DEF-F1-C-01 — Governed-table grant regression | HIGH | Governance / RBAC posture | OPEN |
| DEF-F1-C-02 — Decision Authority retire/reactivate is non-functional | HIGH | Decision Authority | OPEN |

F0 remains frozen and unaffected: all F0 protected gates (including
`verify:f0c`) were green at this HEAD during the Stage-1 rebaseline, and no F0
artefact was touched.

## 1. Rebaseline (Stage 1)

| Gate | Result |
| --- | --- |
| Frontend test suite (1277 tests) | PASS |
| Build + typecheck | PASS |
| `verify:service-completeness` | PASS |
| F0 protected gates (`verify:f0c`, hardening, definer-guards, anon-execute, breadcrumbs, authz scanners) | PASS |
| F1 pgTAP (`supabase/tests/config/02_f1b_decision_authority_completeness.sql`) | **FAIL** — assertion 3, "expectations are governed-writer only: no direct DML for authenticated" |

The F1 pgTAP failure is the first observation of DEF-F1-C-01.

## 2. Evidence gate result

`scripts/verify-f1c-certification.sql`: **75 TESTED_PASS / 6 TESTED_FAIL / 0 N-A**

| Section | Scope | Result |
| --- | --- | --- |
| S1 | Governed configuration writes: authorized create/update/retire/reactivate → governed writer → DB change → attributed audit; unauthorized operator denied; direct DML revoked on registries, fee bindings and verification templates; hard delete of referenced configuration refused; duplicate configuration rejected; audit log append-only (RLS no-op plus append-only trigger) | 18/19 PASS |
| S2 | Anonymous read surface: no rows visible to `anon` on any governed configuration table; allowlist is the only public read path; `anon` cannot execute the governed writer | data exposure 11/11 PASS; **grant posture 9/11 PASS** |
| S3 | Decision Authority E2E | **13/16 PASS** |
| S4 | Service configuration completeness (136 services × 5 dimensions = 680) | 12/12 PASS |
| S5 | Configuration integrity, effective dating, audit coverage, allowlist coherence, no hard-coded policy | **7/9 PASS** |

## 3. Defects

### DEF-F1-C-01 — Governed-table grant regression (HIGH)

`public.service_config_expectations` and `public.config_change_log` still carry
blanket table privileges for `authenticated` and `anon`
(SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER).

Proven:

- `S5 I-02` — 1 governed registry table accepts direct DML privileges from
  signed-in users: `service_config_expectations`.
- `S5 I-08` — 2 governed tables are `anon`-readable outside the public
  allowlist: `service_config_expectations`, `config_change_log`.
- `S2 G-*` — `has_table_privilege('anon', …, 'SELECT')` is `true` for both.
- F1 pgTAP assertion 3 fails for the same reason.

Mitigation actually in force (also proven, so this is a posture defect rather
than a live data exposure): RLS is enabled on both tables and each has only a
single `SELECT` policy scoped to `authenticated` internal staff. Therefore
`anon` sees **zero rows** (`S2 A-service_config_expectations`,
`S2 A-config_change_log` PASS) and signed-in direct writes affect zero rows
(`S1 C-16`, `C-17` PASS). No configuration data is currently exposed or
mutable through these grants.

Nonetheless it contradicts the F1-B claim of governed-writer-only registries
and fail-closed `anon` narrowing, and it is one missing RLS policy away from
becoming a live exposure. Remediation belongs in F1-B: revoke the surplus
privileges (keep `authenticated` SELECT where the operator screens read, keep
`service_role`), then re-run the F1 pgTAP suite and this gate.

### DEF-F1-C-02 — Decision Authority retire/reactivate is non-functional (HIGH)

The status vocabulary is inconsistent across three layers:

- Table constraint `decision_authority_rules_status_chk` allows
  `('active','inactive')`.
- `public.decision_authority_rule_set_status` is called with, and writes,
  `'retired'`.
- `src/hooks/useDecisionAuthority.ts` types the status as
  `'active' | 'retired'`.

Proven:

- `S3 D-12a` — retiring the temporary certification rule fails with
  `23514: new row for relation "decision_authority_rules" violates check
  constraint "decision_authority_rules_status_chk"`.
- `S3 D-12` — consequently the rule keeps governing the decision
  (`mode: ENFORCED` still returned after the retire attempt). The resolver
  itself is correct: it filters `status = 'active'` and honours the effective
  window; the rule simply never left `active`.
- `S3 D-13` — reactivate could not be certified for the same reason.

**Correction (F1-B2, 2026-08-28):** this report originally also claimed that
`src/pages/admin/DecisionAuthorityManager.tsx` contained a corrupted `'nd'`
status identifier. That was **false** — an artefact of a certification search
command that used ripgrep's `-r` (replace) flag, which rewrote the matched text
`retire` to `n` in the output. Source truth is that the screen has always used
`'active'` / `'retired'` correctly. The single root cause of DEF-F1-C-02 was the
table check constraint.

Remediation belongs in F1-B: align the constraint with the canonical
`'active'` / `'retired'` vocabulary already used by the RPC, hook, resolver and
screen, then re-prove retire → resolution `OFF` → reactivate.

## 4. Certified surfaces (evidence held, pending the two defects)

### Governed writes and RBAC

- Authorized operator create/update/retire/reactivate all flow through
  `public.config_save` / `config_retire`, land in the database, and write an
  attributed `public.config_change_log` entry carrying both `old_data` and
  `new_data` plus the operator reason (`S1 C-01`…`C-04`, `C-11`…`C-13`).
- An unauthorized signed-in actor is denied by the governed writer with
  `not_authorised` (`S1 C-05`).
- Direct `INSERT`/`UPDATE` on `sectors`, `regulators`, `license_fee_bindings`
  and `license_verification_templates` is revoked for signed-in users
  (`S1 C-06`…`C-09`), closing GAP-F1-03 and GAP-F1-05 for those registries.
- Hard deletion of referenced configuration is refused
  (`config_hard_delete_forbidden`, `S1 C-10`); retirement is the only path.
- Duplicate/conflicting configuration is rejected by the writer (`S1 C-15`).
- The configuration audit log is append-only: RLS exposes no row to a signed-in
  `UPDATE`/`DELETE` (`S1 C-16`, `C-17`) and the append-only trigger blocks
  mutation outright (`S1 C-19`).
- 27+ configuration registries are enrolled in `public.config_governed_tables`
  (`S5 I-01`).

### Anonymous surface (GAP-F1-02)

`anon` sees no rows in `form_templates`, `notification_templates`,
`escalation_rules`, `engine_rules`, `license_fee_bindings`,
`license_verification_templates`, `process_templates`,
`license_lifecycle_configs`, `decision_authority_rules`,
`service_config_expectations` or `config_change_log`, and cannot execute
`config_save` (`S2`). Every table on
`public.config_public_read_allowlist` is genuinely `anon`-readable
(`S5 I-07`), so the public portal read path is intact.

### Decision Authority (GAP-F1-01) — partial

Certified: governed create with audit (`D-01`, `D-02`); unauthorized operator
denied (`D-03`); overlapping scope/period rejected with
`decision_authority_conflict` (`D-04`); invalid effective window rejected
(`D-05`); an `ENFORCED` rule without a real requirement rejected (`D-06`);
`OBSERVE_ONLY` permits the decision while still reporting the authority verdict
and writing exactly one observation (`D-07`…`D-09`); with a temporary
certification rule in `ENFORCED` mode the resolver genuinely **denies** an
actor lacking the configured authority and **permits** one holding it
(`D-10`, `D-11`); `approval_actions` carries
`trg_approval_action_decision_authority`, so the product decision path
evaluates authority on every approval action (`D-14`).

Rollback proven: the temporary certification rule and its observations were
removed (`D-15`, 0 remaining). Its `config_change_log` entries deliberately
remain — the audit log is append-only by design. No invented production policy
persists: **0** active rules are in `ENFORCED` mode and the baseline rules
remain `OBSERVE_ONLY` (`D-16`, `D-17`).

Not certified: retire/reactivate and post-retirement resolution (DEF-F1-C-02).

### Service configuration completeness (GAP-F1-04)

- All **136** active services are evaluated across all **5** dimensions =
  **680** rows (`SC-01`).
- **0** unexplained gaps: every incomplete dimension carries an explicit
  `BUSINESS_CONFIGURATION_REQUIRED` justification (`SC-02`).
- Exactly **9 BUSINESS_CONFIGURATION_REQUIRED** items remain visible —
  **8 renewal service standards** (`sla`) and **1 renewal fee** (`fee`)
  (`SC-03`…`SC-05`), each with a recorded justification (`SC-06`).
- Those 9 are never represented as configured (`SC-07`) and no fee or service
  standard value has been invented for them: the services still hold
  `sla_days IS NULL` and no service-scoped active fee configuration
  (`SC-08`).
- Disposition semantics behave: `NOT_APPLICABLE` resolves to a complete state
  (`SC-09`) and `SHARED_FALLBACK` requires a real fallback (`SC-10`).
- The permanent gate `public.service_configuration_gate()` passes (`SC-11`) and
  the operator report RPC exists (`SC-12`).

Reporting note: at database level these 9 rows surface as
`state = 'MISSING_REQUIRED'` with a `BUSINESS_CONFIGURATION_REQUIRED`
justification; the operator screen renders the
`BUSINESS_CONFIGURATION_REQUIRED` label from that justification
(`src/hooks/useServiceCompleteness.ts`). Wording across the F1 reports is
aligned on **9 items (8 renewal SLA + 1 renewal fee)**.

### Configuration integrity

Effective dating exists on `decision_authority_rules` and
`service_config_expectations` (`S5 I-03`, `I-04`); audit entries are attributed
and span multiple configuration domains (`I-05`, `I-06`); the duplicate-detection
window is read from `complaint_duplicate_scoring_config` rather than code
(`I-09`).

## 5. Gap register disposition (GAP-F1-01…09)

| Gap | Disposition |
| --- | --- |
| GAP-F1-01 Decision Authority | **NOT CLOSED** — configuration, conflict validation, OBSERVE_ONLY/ENFORCED behaviour and approval-path hook all certified, but retire/reactivate is broken (DEF-F1-C-02) |
| GAP-F1-02 Anonymous configuration reads | CLOSED for data exposure; **grant posture reopened** by DEF-F1-C-01 for 2 tables |
| GAP-F1-03 Governed configuration writes | CLOSED (accepted in F1-B; re-proved by S1) |
| GAP-F1-04 Service completeness | CLOSED with **9 BUSINESS_CONFIGURATION_REQUIRED** items formally recorded |
| GAP-F1-05 Registry DML revocation | CLOSED for fee bindings / verification templates / registries; **1 exception** `service_config_expectations` (DEF-F1-C-01) |
| GAP-F1-06 Residual hard-coded data | CLOSED |
| GAP-F1-07 Configuration audit | CLOSED (attributed, before/after, append-only) |
| GAP-F1-08 Inconsistent action gating | CLOSED |
| GAP-F1-09 Automated F1 coverage | CLOSED for the frontend suite; the F1 pgTAP suite is red because of DEF-F1-C-01 |

## 6. Scoring

| Dimension | Score | Note |
| --- | --- | --- |
| Configuration completeness | 4.8 | 680/680 dimensions explained; 9 recorded business items |
| Governance / RBAC | 4.2 | governed writers and denial proven; grant regression on 2 tables |
| Audit | 4.9 | attributed, before/after, append-only proven twice |
| Data integrity | 4.6 | duplicates, effective dating, retire-vs-referenced all enforced |
| Decision authority | 3.8 | enforcement proven; lifecycle (retire/reactivate) broken |
| Testing / E2E | 4.4 | 81-assertion gate added; F1 pgTAP red |

Freeze criteria require 0 Critical/High product gaps and all material
dimensions ≥ 4.5 (governance/security/audit/testing ≥ 4.8). Two HIGH defects
and three dimensions below threshold — **freeze withheld**.

## 7. Required actions before F1-C retry

1. DEF-F1-C-01 — revoke surplus `anon`/`authenticated` privileges on
   `public.service_config_expectations` and `public.config_change_log`,
   retaining only the reads the operator screens need plus `service_role`.
2. DEF-F1-C-02 — align the `decision_authority_rules_status_chk` constraint
   with the canonical `'active'` / `'retired'` vocabulary already used by
   `decision_authority_rule_set_status`, `useDecisionAuthority.ts` and
   `DecisionAuthorityManager.tsx`.
3. Re-run: F1 pgTAP, `scripts/verify-f1c-certification.sql` (expect 81/81),
   `verify:service-completeness`, the full frontend suite, build/typecheck and
   all F0 protected gates including `verify:f0c`.

**F1 NOT CERTIFIED — RETURN TO F1-B**

---

# F1-C RETRY — FINAL CERTIFICATION & FREEZE (2026-08-28)

- Stage: F1-C retry (certification and freeze attempt #2)
- HEAD at certification: `8501ad24d`
- Authoritative inputs:
  - this report (F1-C attempt #1)
  - `docs/certification/F1-B2-decision-authority-and-grant-remediation-2026-08-28.md`
- Mode: certification only — no remediation performed in this pass.

## FINAL VERDICT (RETRY)

**F1 NOT CERTIFIED — RETURN TO F1-B**

Every requested gate is green and both former blockers are proved closed.
Certification is withheld because re-proving blocker 1 (governed-table
privilege posture) exposed a **new HIGH privilege defect on two governed
configuration tables that were outside the F1-B2 remediation scope**. Per the
Track-A charter this pass did not remediate it.

| Defect | Severity | Area | Status |
| --- | --- | --- | --- |
| DEF-F1-C2-01 — `anon` and `authenticated` hold destructive privileges on `license_fee_bindings` / `license_verification_templates` / `license_fee_process_settings` | HIGH | Governance / RBAC posture | OPEN |

Former blockers DEF-F1-C-01 and DEF-F1-C-02 are **CLOSED** (re-proved below).

## 1. Rebaseline at HEAD `8501ad24d`

No F0 or F1 protected contract changed after F1-B2: the only tree delta is the
F1-B2 grant/lifecycle migration and its evidence document.

| Gate | Expected | Result |
| --- | --- | --- |
| `scripts/verify-f1c-certification.sql` | 86/86 | **PASS — 86 TESTED_PASS / 0 TESTED_FAIL / 0 N-A** |
| F1 pgTAP (`supabase/tests/config/`) | 15/15 | **PASS — ok=15 not_ok=0 errors=0** |
| `verify:service-completeness` | pass | **PASS — 0 unexplained gaps** |
| Frontend suite | full | **PASS — 139 files / 1277 tests** |
| Typecheck | clean | **PASS** |
| Build | clean | **PASS** |
| `verify:f0c` | pass | **PASS — 34 TESTED_PASS / 0 TESTED_FAIL** |
| `verify:hardening` | pass | **PASS — 31 passed / 0 failed** |
| `verify:anon-execute` | pass | **PASS — 8 allowlisted, 0 defects** |
| `verify:definer-guards` | pass | **PASS** |
| `verify:breadcrumbs` | pass | **PASS — 0 uncovered** |

## 2. Former blocker DEF-F1-C-01 — governed configuration grants: CLOSED, with a new adjacent defect

Proved closed for the tables the defect named:

| Surface | `anon` | `authenticated` | Result |
| --- | --- | --- | --- |
| `service_config_expectations` | no privileges | SELECT only | PASS |
| `config_change_log` | no privileges | SELECT only | PASS |
| `service_configuration_completeness` | no privileges | SELECT only | PASS |
| all 31 governed registry tables | no SELECT off the public read allowlist (`I-08` off-allowlist = 0) | no INSERT/UPDATE/DELETE (`I-02` leaking tables = 0) | PASS |

**New defect DEF-F1-C2-01.** A privilege census that also covers `TRUNCATE`
(the F1-C gate checks only INSERT/UPDATE/DELETE) shows:

| Table | Role | Residual privileges |
| --- | --- | --- |
| `license_fee_bindings` | `anon` | INSERT, UPDATE, DELETE, TRUNCATE |
| `license_verification_templates` | `anon` | INSERT, UPDATE, DELETE, TRUNCATE |
| `license_fee_bindings` | `authenticated` | TRUNCATE |
| `license_verification_templates` | `authenticated` | TRUNCATE |
| `license_fee_process_settings` | `authenticated` | TRUNCATE |

Empirical proof (transaction, rolled back, `SET LOCAL ROLE anon`):

- `TRUNCATE public.license_fee_bindings` passes the privilege check and fails
  only on an incidental foreign-key reference (`0A000`, not `42501`) — the
  privilege *is* held.
- `TRUNCATE public.license_verification_templates` behaves identically.
- Row-level DML is contained: RLS on all three tables exposes SELECT to
  internal staff only, and anon DELETE affects zero rows.

Why this is HIGH: PostgreSQL RLS does not apply to `TRUNCATE`, so the only
thing preventing anonymous destruction of two governed configuration registries
today is an incidental FK reference, not the governance model. The F1 claim
"governed configuration tables expose no unauthorized direct DML" therefore does
not hold as stated.

Recommended F1-B3 fix (not applied here): `REVOKE ALL ON public.license_fee_bindings,
public.license_verification_templates FROM anon;` plus `REVOKE TRUNCATE ... FROM
authenticated` on the three tables, and extend `verify-f1c-certification.sql`
assertions `I-02`/`I-08` to include `TRUNCATE`, `REFERENCES` and `TRIGGER`.

## 3. Former blocker DEF-F1-C-02 — Decision Authority lifecycle: CLOSED

Proved end-to-end against `public.resolve_decision_authority` with a temporary
ENFORCED certification rule inside a rolled-back transaction:

| Step | Observed | Expected | Result |
| --- | --- | --- | --- |
| create `status='active'`, `ENFORCED` | `mode=ENFORCED`, `allowed=false` | rule applies | PASS |
| `status='retired'` | `mode=OFF`, `allowed=true`, `requires_review=true` | resolver OFF, behaviour preserved | PASS |
| `status='active'` (reactivate) | `mode=ENFORCED`, `allowed=false` | rule applies again | PASS |
| observations | 3 rows for the certification decision type | every evaluation recorded | PASS |
| `config_change_log` for `decision_authority_rules` | 8 rows before and after | audit retained | PASS |
| post-rollback | 0 certification rules remain | no artefact leaks | PASS |

Vocabulary is canonical `active` / `retired` end-to-end: CHECK constraint, data,
`decision_authority_rule_set_status`, `useDecisionAuthority.ts`, resolver filter,
`DecisionAuthorityManager.tsx`, tests. Conflict validation and effective-date
validation remain covered by F1 pgTAP (15/15).

## 4. Production baseline confirmation

| Baseline item | Required | Observed | Result |
| --- | --- | --- | --- |
| Unexplained service configuration gaps | 0 | 0 | PASS |
| `BUSINESS_CONFIGURATION_REQUIRED` items visible | 9 | 9 | PASS |
| — renewal service standards (SLA) | 8 | 8 | PASS |
| — renewal fee | 1 | 1 | PASS |
| Items silently represented as configured | 0 | 0 | PASS |
| Invented fee / SLA values | 0 | 0 | PASS |
| ENFORCED Decision Authority rules | 0 | 0 | PASS |
| OBSERVE_ONLY baseline rules | 10 | 10 (all `active`) | PASS |
| Invented regulator policy | none | none | PASS |

Completeness census across 136 services × 5 dimensions: workflow 136 satisfied;
forms/documents 136 satisfied; decision authority 136 via shared fallback; fee
122 satisfied / 5 fallback / 8 N-A / 1 business-configuration-required; SLA 128
satisfied / 8 business-configuration-required.

## 5. Freeze status

F1 protected contracts are **NOT frozen** in this pass. Freeze requires 0
Critical/High product gaps; DEF-F1-C2-01 is HIGH and open. The contracts staged
for freeze once it is closed are unchanged:

- governed configuration writer/registry model (`config_save` / `config_retire` /
  `config_delete`, `config_governed_tables`);
- configuration audit model (`config_change_log`, `config_change_history`);
- public configuration read allowlist (`config_public_read_allowlist`);
- service completeness expectations, view and permanent gate;
- Decision Authority rules, resolver, lifecycle, observations and operator
  configuration surface.

F0 remains frozen and unaffected: all F0 protected gates including `verify:f0c`
are green at this HEAD and no F0 artefact was touched.

## 6. Gap register disposition

| Gap | Disposition |
| --- | --- |
| GAP-F1-01 Decision Authority | CLOSED |
| GAP-F1-02 Anonymous configuration reads | CLOSED for governed registries; DEF-F1-C2-01 open on 2 licence-fee/verification tables |
| GAP-F1-03 Governed configuration writes | CLOSED for row-level DML; TRUNCATE posture open (DEF-F1-C2-01) |
| GAP-F1-04 Service completeness | CLOSED — 9 BUSINESS_CONFIGURATION_REQUIRED recorded |
| GAP-F1-05 … GAP-F1-09 | CLOSED |

## FINAL VERDICT

**F1 NOT CERTIFIED — RETURN TO F1-B**
