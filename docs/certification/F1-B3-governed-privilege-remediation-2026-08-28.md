# F1-B3 — Governed Configuration Privilege Closure

Date: 2026-08-28
Scope: DEF-F1-C2-01 and the same privilege class wherever it occurs on governed
configuration surfaces. No F1 remediation or Decision Authority work was redone.

Authoritative input:
`docs/certification/F1-master-configuration-final-certification-2026-08-28.md`

---

## 1. Canonical privilege contract

Derived from `public.config_governed_tables` (governed registry) and
`public.config_public_read_allowlist` (public read allowlist). No table names are
hard-coded in the contract.

| Role | Allowed | Forbidden |
|---|---|---|
| `anon` | `SELECT` only, and only on tables present in `config_public_read_allowlist` | every other privilege, on every governed surface |
| `authenticated` | minimum `SELECT` for internal operator/read surfaces | `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` |
| `service_role` | full privileged backend access | — |
| `PUBLIC` | nothing (no inherited grants) | all privileges |

All configuration mutations continue to run through the governed writer RPCs.
RLS was not weakened: no policy was added, altered or dropped in this pass.

## 2. Census result before remediation

Effective-privilege census (`has_table_privilege`, so PUBLIC-inherited grants are
detected) over all governed tables × `SELECT / INSERT / UPDATE / DELETE /
TRUNCATE / REFERENCES / TRIGGER / MAINTAIN` × `anon / authenticated`:

- `license_fee_bindings` — `anon`: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN; `authenticated`: TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
- `license_verification_templates` — identical posture to the above
- `license_fee_process_settings` — `authenticated`: TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
- 28 further governed registries — residual `REFERENCES`, `TRIGGER`, `MAINTAIN`
  for `anon` and/or `authenticated` (same defect class, not previously reported)

No off-allowlist `anon SELECT` existed at census time.

## 3. Remediation applied

One migration, driven entirely by the governed registry (loop over
`config_governed_tables`):

- `REVOKE ALL ... FROM anon`
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ... FROM authenticated`
- `REVOKE ALL ... FROM PUBLIC`
- re-`GRANT SELECT TO anon` only where the table is allowlisted
- re-`GRANT SELECT TO authenticated` only where it already held `SELECT`
- `GRANT ALL TO service_role`

Post-remediation census returns **zero** violations for all governed surfaces.

## 4. Permanent gate strengthening

### `scripts/verify-f1c-certification.sql` — new stage S6 (registry-derived)

| ID | Assertion | Result |
|---|---|---|
| P-01 | anon holds no privilege outside allowlisted SELECT | TESTED_PASS (violations=0) |
| P-02 | authenticated holds no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | TESTED_PASS (violations=0) |
| P-03 | no governed privilege inherited through PUBLIC | TESTED_PASS (violations=0) |
| P-04 | service_role retains privileged access on every registry | TESTED_PASS (missing=0) |
| P-05 | anon `TRUNCATE` on a governed registry → 42501 | TESTED_PASS |
| P-06 | authenticated `TRUNCATE` on a governed registry → 42501 | TESTED_PASS |
| P-07 | anon direct `DELETE` → 42501 | TESTED_PASS |
| P-08 | anon direct `UPDATE` → 42501 | TESTED_PASS |
| P-09 | DEF-F1-C2-01 registries carry no destructive anon privilege and no authenticated TRUNCATE | TESTED_PASS |
| P-10 | operator read surfaces retain SELECT (31 registries) | TESTED_PASS |

Empirical probes pick their target table from the governed registry at runtime,
so new registries are covered automatically.

### `supabase/tests/config/02_f1b_decision_authority_completeness.sql`

Plan raised 15 → 18 with three registry-derived privilege-contract assertions
(anon outside allowlist, authenticated write/structural, PUBLIC inheritance).

### `package.json`

`verify:f1c` registered as a first-class gate script alongside `verify:f0c`.

## 5. Regression evidence

| Gate | Result |
|---|---|
| `verify:f1c` (strengthened) | 96 TESTED_PASS / 0 FAIL / 0 N-A |
| F1 pgTAP (`02_f1b_decision_authority_completeness.sql`) | 18/18 ok |
| `verify:service-completeness` | GATE PASSED, 0 unexplained gaps |
| Frontend suite (`vitest run`) | 139 files, 1277 tests passed |
| Typecheck / build | clean |
| `verify:f0c` | 34 TESTED_PASS / 0 FAIL |
| `verify:hardening` | 31 passed / 0 failed |
| `verify:anon-execute` | PASS (0 defects) |
| `verify:definer-guards` | PASS |
| `verify:breadcrumbs` | 0 uncovered |

### Invariants confirmed unchanged

- Service configuration completeness: **9** `MISSING_REQUIRED`
  (BUSINESS_CONFIGURATION_REQUIRED) items
- Decision Authority: **0** active `ENFORCED` rules, **10** active
  `OBSERVE_ONLY` rules
- Decision Authority lifecycle (create → observe → enforce → retire → reactivate,
  with audit) green in F1-C stage S3 (D-01 … D-15 all TESTED_PASS)

---

## Verdict

**F1-B3 READY TO RETRY F1-C**
