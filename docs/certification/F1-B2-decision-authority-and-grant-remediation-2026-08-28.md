# F1-B2 — F1-C DEFECT REMEDIATION (DEF-F1-C-01, DEF-F1-C-02)

- Track: A (Platform / Configuration Foundation)
- Stage: F1-B2 (targeted defect remediation only)
- Date: 2026-08-28
- Authoritative input: `docs/certification/F1-master-configuration-final-certification-2026-08-28.md`
- Scope: the two F1-C blocking defects only. No F1 remediation was redone, no
  F0 artefact was touched, no RLS policy was added, removed or weakened.

## FINAL VERDICT

**F1-B2 READY TO RETRY F1-C**

| Defect | Status | Proof |
| --- | --- | --- |
| DEF-F1-C-01 — governed-table grant regression | **CLOSED** | `verify:f1c` S1/S2/S5, F1 pgTAP 13–15 |
| DEF-F1-C-02 — Decision Authority lifecycle | **CLOSED** | `verify:f1c` S3 full lifecycle, F1 pgTAP 13–14 |

## 1. DEF-F1-C-01 — Governed-table privilege posture

### What was wrong

`public.service_config_expectations`, `public.config_change_log` and the
`public.service_configuration_completeness` view carried the full default
privilege set (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) for both
`anon` and `authenticated`. Only RLS stood between a signed-in user and direct
writes, and between an anonymous caller and internal configuration data.

### Change applied

Privilege-level fix; RLS and all policies untouched:

| Surface | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `service_config_expectations` | ALL revoked | SELECT only | ALL |
| `config_change_log` | ALL revoked | SELECT only | ALL |
| `service_configuration_completeness` (view) | ALL revoked | SELECT only | ALL |
| `license_fee_process_settings` (residual found by the gate) | ALL revoked | SELECT only | ALL |

`authenticated` retains SELECT because the operator screens read these
surfaces, and because the completeness view runs with `security_invoker = on`
and therefore resolves the caller's privileges on the base table. The existing
internal-staff `SELECT` policies remain the row-level gate, so the effective
read audience is unchanged.

`license_fee_process_settings` was flagged by assertion `S5 I-08`: it is a
governed registry with only an internal-staff SELECT policy and **no** public
surface reading it (no reference anywhere in `src/` or `supabase/functions/`),
so anonymous privileges were removed rather than allowlisted.

### Proof

- `S1 C-16` / `C-17` — signed-in `UPDATE` and `DELETE` on `config_change_log`
  now fail with `42501` (insufficient privilege), i.e. denied **by privilege**,
  not merely a zero-row RLS no-op.
- `S1 C-20` / `C-21` — direct `UPDATE` and `DELETE` on
  `service_config_expectations` fail with `42501`.
- `S1 C-22` — a signed-in user cannot forge an audit entry via direct `INSERT`
  (`42501`).
- `S1 C-19` — the append-only trigger still blocks audit mutation outright as
  the second line of defence.
- `S2 G-*` — `has_table_privilege('anon', …, 'SELECT')` is now `false` for all
  eleven governed configuration tables probed, including
  `service_config_expectations` and `config_change_log`.
- `S5 I-02` — 0 governed registry tables expose direct DML privileges to
  signed-in users.
- `S5 I-08` — 0 governed tables are `anon`-readable outside the public
  allowlist.
- `S5 I-07` — every one of the 10 allowlisted public tables remains genuinely
  `anon`-readable, so the public portal read path is intact.
- Governed operator paths still work end to end: authorized create, update,
  retire, reactivate and delete all succeed through `config_save` /
  `config_retire` / `config_delete` with attributed before/after audit
  (`S1 C-01`…`C-04`, `C-11`…`C-13`, `C-18`), while an unauthorized actor is
  still denied (`S1 C-05`).
- F1 pgTAP assertion 3 ("expectations are governed-writer only: no direct DML
  for authenticated") is **green**.

## 2. DEF-F1-C-02 — Decision Authority lifecycle

### Census of the status vocabulary

| Layer | Vocabulary before | Source |
| --- | --- | --- |
| Operator screen | `'active'` / `'retired'` | `src/pages/admin/DecisionAuthorityManager.tsx` |
| Hook types + RPC call | `'active'` / `'retired'` | `src/hooks/useDecisionAuthority.ts` |
| Governed writer | `'active'` / `'retired'` | `public.decision_authority_rule_set_status` |
| Resolver filter | `status = 'active'` | `public.resolve_decision_authority` |
| pgTAP / gates | `status = 'active'` | `supabase/tests/**`, `scripts/verify-*.sql` |
| **Table check constraint** | **`'active'` / `'inactive'`** | `supabase/migrations/20260827032419_*.sql` |

Canonical vocabulary chosen by current product usage: **`'active'` / `'retired'`**.
The constraint was the sole outlier, and it made every retirement fail with
`23514`. No UI, hook, RPC or resolver change was needed.

Data census: 10 rows, all `status = 'active'`, all `OBSERVE_ONLY`; zero rows held
`'inactive'`, so the migration's conversion of legacy `'inactive'` → `'retired'`
was a no-op safety net.

### Change applied

`decision_authority_rules_status_chk` now allows `('active','retired')`; any
legacy `'inactive'` row is converted to `'retired'`. Nothing else changed.

### Report correction

The F1-C report additionally claimed `DecisionAuthorityManager.tsx` contained a
corrupted `'nd'` status identifier. **That claim was false** and has been
corrected in place. It was an artefact of a certification search command that
used ripgrep's `-r` (replace) flag, rewriting the matched text `retire` to `n` in
the printed output. Source truth: the screen has always used `'active'` /
`'retired'`.

### Proof — full lifecycle

Using a temporary certification rule (`decision_type = f1c_certification_decision`),
rolled back at the end of the gate:

1. `S3 D-01` / `D-02` — create an **active** rule through the governed writer;
   audited as `CREATE`.
2. `S3 D-07`…`D-09` — the resolver applies it: `OBSERVE_ONLY` permits the
   decision, still reports the authority verdict, and writes exactly one
   observation.
3. `S3 D-10` / `D-11` — switched to `ENFORCED`, the resolver genuinely
   **denies** an actor lacking the configured authority and **permits** one
   holding it.
4. `S3 D-12a` — **retire** now succeeds (previously `23514`); the rule reads
   `status = 'retired'`.
5. `S3 D-12` — the resolver **no longer applies** the retired rule:
   `mode: OFF`, `allowed: true`.
6. Audit recorded — the retire is written to `config_change_log` as `RETIRE`
   (and `REACTIVATE` on restore); `S1 C-12` proves the retire audit path.
7. `S3 D-13` — **reactivate** succeeds and the rule is `active` again, so the
   resolver governs it once more.
8. `S3 D-04` / `D-05` / `D-06` — conflict validation still works: overlapping
   scope/period is rejected with `decision_authority_conflict`, an invalid
   effective window with `invalid_effective_window`, and an `ENFORCED` rule
   with no real requirement with `enforced_rule_needs_requirement`. Reactivation
   also re-checks for overlap.
9. `S3 D-03` — an unauthorized operator still cannot configure authority.
10. `S3 D-14` — `approval_actions` retains
    `trg_approval_action_decision_authority`, so the product decision path
    evaluates authority on every approval action.
11. `S3 D-18` / `D-19` — the constraint carries the canonical vocabulary and no
    rule holds a legacy status value.

### Production baseline after remediation

- `S3 D-15` — the temporary certification rule and its observations are removed
  (0 remaining). Its `config_change_log` entries deliberately persist: the audit
  log is append-only by design.
- `S3 D-16` — **0 ENFORCED rules** exist; no invented regulator policy remains.
- `S3 D-17` — the **10 OBSERVE_ONLY baseline rules** are preserved untouched.

## 3. Regression results

| Gate | Result |
| --- | --- |
| `scripts/verify-f1c-certification.sql` | **86 TESTED_PASS / 0 TESTED_FAIL / 0 N-A** |
| F1 pgTAP `supabase/tests/config/02_f1b_decision_authority_completeness.sql` | **15/15 ok** (extended from 12 with the two grant/vocabulary assertions) |
| `verify:service-completeness` | PASS |
| Frontend suite | **1277 passed / 139 files** |
| Build | build OK |
| Typecheck (`tsgo --noEmit`) | PASS (0 errors) |
| `verify:f0c` | PASS |
| `verify:hardening` | PASS |
| `verify:anon-execute` | PASS |
| `verify:definer-guards` | PASS |
| `verify:breadcrumbs` | PASS |
| RBAC action coverage | 2047/2047 protected (100.0%) |

The F1-C gate target was 81/81; it now reports **86/86** because four
privilege-level assertions (`C-20`, `C-21`, `C-22`, and the strengthened
`C-16`/`C-17`) and two vocabulary assertions (`D-18`, `D-19`) were added while
proving these defects closed.

Database linter output is unchanged from the pre-remediation baseline (1390
findings, all pre-existing and accepted under the frozen F0 posture: governed
`SECURITY DEFINER` RPCs intentionally callable by signed-in users, extensions in
`public`, and the three legacy reporting views). No new finding class was
introduced.

## 4. Artefacts

- Migration: revoke surplus privileges on `service_config_expectations`,
  `config_change_log`, `service_configuration_completeness`.
- Migration: `decision_authority_rules_status_chk` → `('active','retired')`
  with legacy `'inactive'` conversion.
- Migration: revoke anonymous privileges on `license_fee_process_settings`.
- `scripts/verify-f1c-certification.sql` — strengthened to assert
  privilege-level denial and the canonical status vocabulary (86 assertions).
- `supabase/tests/config/02_f1b_decision_authority_completeness.sql` — extended
  to 15 assertions.
- `docs/certification/F1-master-configuration-final-certification-2026-08-28.md`
  — `'nd'` claim corrected, supersession note added.

**F1-B2 READY TO RETRY F1-C**
