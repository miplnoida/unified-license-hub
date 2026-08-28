# F5-B3R — Frozen-Contract Revalidation Before Product-Gap Remediation

- **Date:** 2026-08-29
- **Entering HEAD:** 9c808f94b1da0196eb2e6fb1712ea8d8111c0886
- **Scope:** restore frozen F2/F4 proof only. No branch register, no F5-B4, no
  product behaviour change, no authorization/RLS contract weakened.
- **Verdict:** **FROZEN F2/F4 CONTRACTS REVALIDATED — RETURN TO F5-B3 PRODUCT-GAP REMEDIATION**

---

## 1. F2-B P-05 — classification: **ENVIRONMENT** (verification isolation defect)

### Live truth captured before any change

| Probe | Observed |
|---|---|
| `SHOW row_security` (fresh session) | `on` |
| `current_user` / `session_user` | `sandbox_exec` / `sandbox_exec` |
| `rolbypassrls` on execution role | `t` (superuser off) |
| `SELECT` grant to `anon` on `registration_journey_types` | present |
| RLS enabled / forced | `t` / `f` |
| `rjt_public_read` | `{public}`, `SELECT`, `USING (is_enabled AND is_public)` (unchanged) |
| `rjt_internal_read` | `{authenticated}`, staff/super-admin |
| Public rows | `FORM_FIRST` (enabled, public), `ENTITY_FIRST` (enabled, public) |
| Isolated `SET LOCAL ROLE anon; SELECT key FROM registration_journey_types` | **2 rows** — contract correct |

### Root cause (reproduced deterministically)

```
psql -c "SET row_security=off" -c "BEGIN; SET LOCAL ROLE anon; SELECT key FROM registration_journey_types;"
ERROR:  42501 query would be affected by row-level security policy for table "registration_journey_types"
```

Two gates set the flag at **session** level:

- `scripts/verify-hardening.sql:18` — `SET row_security = off;`
- `scripts/certify-f4c.sql:21` — `SET row_security = off;`

The managed pooler reuses backends, so the setting survived the gate (in
particular when the gate aborted on a raised exception) and poisoned the next
verification session. Under `row_security=off` a non-BYPASSRLS role
(`SET ROLE anon`) is *errored* instead of filtered — exactly P-05's `42501`.

**The product contract was correct at all times. `registration_journey_types`
policies, grants and rows were not touched.**

### Permanent isolation fix

| File | Change |
|---|---|
| `scripts/verify-hardening.sql` | header now asserts `SET row_security = on;`; each of the two `DO` blocks takes the bypass **transaction-locally** via `PERFORM set_config('row_security','off',true)` — it cannot outlive the statement, even on abort |
| `scripts/certify-f4c.sql` | `SET LOCAL row_security = off;` moved inside the transaction; reverted by the closing `ROLLBACK` |
| all 16 gate scripts (`verify-f0c/f1c/f2b/f3b/f4b/f4b3/f5b1/f5b2/f5b3`, `certify-f3c`, `verify-anon-execute`, `verify-definer-guards`, `verify-permission-references`, `verify-service-completeness`, `verify-license-terms`, `verify-audit-contract`) | explicit `SET row_security = on;` header so a leaked pooled backend cannot make an RLS probe non-deterministic |

`SHOW row_security` after the whole battery: `on`.

---

## 2. Coordination E2/E3 — classification: **HARNESS** (non-deterministic audit lookup)

### Frozen contract verified intact — no migration issued

| Probe | Observed |
|---|---|
| `Participants can update flags` | `{authenticated}` `UPDATE` `USING (is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(),'super_admin'))` |
| `Participants can view flags` / `create flags` | present, participant-scoped |
| `authenticated` UPDATE grant on `coordination_flags` | present |
| Triggers | `trg_log_coordination_flag_ins`, `trg_log_coordination_flag_upd` → `log_coordination_flag_change()` |
| Canonical participant resolve `open → resolved` | `ROW_COUNT = 1`, row status `resolved`, audit `coordination.flag.resolved` |
| Canonical participant withdraw `open → withdrawn` | `ROW_COUNT = 1`, row status `withdrawn`, audit `coordination.flag.withdrawn` |
| Outsider read / update / raise | 0 rows visible, 0 rows updated, `42501` |

No policy, helper, grant or trigger was modified. Only
`scripts/verify-f4b3-coordination.sql` changed.

### Root cause (DEF-F5-B3R-02)

`pg_temp.aud()` selected the "latest" audit row with
`ORDER BY created_at DESC, ctid DESC`. Every audit row written inside the gate's
single transaction shares `created_at` (`now()` = transaction start), and heap
`ctid` order is **not** insertion order — rolled-back earlier runs leave reusable
free space, so a newer row can occupy a lower `ctid`. The tiebreaker was
therefore arbitrary: B2/B4/C2 intermittently read a *later* transition, and
E2/E3 intermittently read the `raised` row instead of the resolve/withdraw row.
Empirically: 3 failures in run 1, 0 in runs 2–4 of the same unchanged script.

### Fix (harness only)

1. New transaction-scoped watermark table `coord_audit_seen`; `aud()` returns the
   newest **unobserved** audit row for the entity and records it. No `ctid`
   dependence.
2. `pg_temp.aud_mark()` watermarks the second flag's `raised` row immediately
   after D3, so E3 can only observe the row produced by the withdraw itself.
3. E2/E3 strengthened per the audit contract: `ROW_COUNT = 1`, post-update row
   status, action key, actor, `old_value.status = 'open'`, `new_value.status`,
   and `case_id` + `linked_application_id` provenance.
4. G1 (no stale `actor_id`/`details` audit writers) unchanged and green.

Also registered the missing `certify:f4c` npm script (it did not exist, so the
"F4-C regression" step was silently a no-op run).

### Determinism proof

`verify:f2b` → `verify:coordination-lifecycle` executed as a pair:

| Before fix | After fix |
|---|---|
| run 1 `23 PASS / 3 FAIL` (B2, B4, C2) | 26/26 |
| runs 2–4 `26 PASS / 0 FAIL` | 26/26 (9 consecutive runs across this pass) |

---

## 3. Ordered regression battery (leakage-detecting order)

| # | Gate | Result |
|---|---|---|
| 1 | `verify:hardening` | 31 PASSED / 0 FAILED / 0 SKIPPED (+ F5-B1 block 4/4) |
| 2 | `verify:f2b` | **63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A** |
| 3 | `verify:coordination-lifecycle` | **26 PASS / 0 FAIL** |
| 4 | `verify:f2b` (again) | **63 / 0 / 0** |
| 5 | `verify:coordination-lifecycle` (again) | **26 / 0** |
| 6 | `certify:f4c` | **87 PASS / 0 FAIL** |
| 7 | `verify:f2b` (after F4-C) | **63 / 0 / 0** |
| 8 | `verify:coordination-lifecycle` (after F4-C) | **26 / 0** |
| 9 | `verify:f5b3` | **52 PASS / 0 FAIL** |
| 10 | `verify:f5b2` | 44 / 0 |
| 11 | `verify:f5b1` | 51 / 0 |
| 12 | `certify:f3c` | PASS |
| 13 | `verify:f3b` | 38 TESTED_PASS / 0 TESTED_FAIL |
| 14 | `verify:f1c` | 96 TESTED_PASS / 0 TESTED_FAIL |
| 15 | `verify:f0c` | 34 TESTED_PASS / 0 TESTED_FAIL |
| 16 | `verify:write-contract` | PASS |
| 17 | `verify:audit-contract` | PASS |
| 18 | `verify:anon-execute` | PASS |
| 19 | `verify:definer-guards` | PASS |
| 20 | `verify:permission-refs` | PASS |
| 21 | `verify:service-completeness` | PASS |
| 22 | `verify:license-terms` | 7/7, 1 allowlisted legacy gap |
| 23 | `verify:breadcrumbs` | PASS (0 uncovered) |
| 24 | Frontend suite | **141 files / 1293 tests passed** |
| 25 | Typecheck (`tsgo -p tsconfig.app.json`) | clean |

Second and third `verify:f2b` / coordination runs remained green **after**
`verify:hardening` and `certify:f4c` — the leakage class is closed.

### One pre-existing frontend gate repaired

`src/test/rbac/catalogueIntegrity.test.ts` failed on stale disposition rows
`entity_structure.apply` / `entity_structure.approve` — both became *referenced*
during F5-B3's entity-change work. Fixed by regenerating the derived registers
(`scripts/generate-permission-disposition.ts`, `generate-permission-coverage.ts`):
169 orphans dispositioned (127 reserved-granular, 42 future-module), 378 coverage
rows. No permission was added, removed or re-scoped.

## 4. Residue

| Check | Result |
|---|---|
| `coordination_cases` titled `CERT-F4B3%` | 0 |
| `coordination_flags` titled `CERT-F4B3%` | 0 |
| Probe audit rows | 0 |
| `SHOW row_security` after battery | `on` |

## 5. Observation carried forward (not changed in this pass)

`anon` still holds table-level `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`
grants on `public.coordination_flags`. They are inert — no RLS policy names
`anon`, and F3 negative probes confirm anonymous writes are denied — but the
grants are wider than the frozen intent. Tightening them is a privilege change
outside this revalidation pass; recorded here for the next lockdown slice.

## 6. Verdict

**FROZEN F2/F4 CONTRACTS REVALIDATED — RETURN TO F5-B3 PRODUCT-GAP REMEDIATION**

Remaining F5-B3 blocker is unchanged and untouched: New Branch / Branch Closure
`PRODUCT_GAP` (no canonical establishment/branch register). F5-B4 not started.
