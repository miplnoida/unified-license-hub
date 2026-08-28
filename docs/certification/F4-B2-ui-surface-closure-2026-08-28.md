# F4-B2 — UI / Surface Closure Certification

Scope: close the residual F4-B UI and surface items before F4-C, and re-prove
the frozen F0–F4 gate suite.

## Items closed

| ID | Item | Outcome |
|----|------|---------|
| GAP-F4-15 | `ApplicationQueue.tsx` mis-flagged as dead screen | Corrected — retained as the canonical licensing queue surface (route-reachable) |
| GAP-F4-15b | Genuinely unreachable sample screens | `PreLicense.tsx` and `PostLicense.tsx` deleted; RBAC artifacts regenerated |
| GAP-F4-16 | Applicant withdrawal had no UI | `ApplicationWithdrawalPanel.tsx` wired into `ApplicationDetail.tsx` |
| DRIFT-F0-08 | `PUBLIC` EXECUTE residue on F4 lookups | Revoked on `fp_positive_outcomes()` and `application_status_vocabulary()`; granted to `authenticated`/`service_role` only |
| DRIFT-F1-C | `licensing_gate_configs` exposure | Anon access and direct authenticated DML revoked |

## Governed withdrawal control

- Client calls only `withdraw_application(uuid, text)` via the
  `applicationWithdraw` governed op in `src/lib/applicationGovernedOps.ts`.
- Server-side enforcement: owner-only, non-terminal status only, reason
  mandatory (min 5 characters), `anon` EXECUTE revoked.
- UI enforcement mirrors the server: panel hidden for non-owners, disabled on
  terminal statuses, confirmation dialog gated on a valid reason.
- Action site annotated `data-rbac="application_management.edit"` so the RBAC
  audit records the governed module/action.

## Evidence

Backend gates (all `psql` verification scripts, exit 0):

| Gate | Result |
|------|--------|
| `verify:permission-refs` | PASS |
| `verify:f0c` | 34 TESTED_PASS / 0 FAIL |
| `verify:f1c` | 96 TESTED_PASS / 0 FAIL |
| `verify:f2b` | 63 TESTED_PASS / 0 FAIL |
| `verify:f3b` | 38 TESTED_PASS / 0 FAIL |
| `certify:f3c` | PASS |
| `verify:f4b` | 33 TESTED_PASS / 0 FAIL |
| `verify:hardening` | 31 PASSED / 0 FAILED / 0 SKIPPED |
| `verify:anon-execute` | PASS (0 defects) |
| `verify:definer-guards` | PASS |
| `verify:breadcrumbs` | PASS |
| `verify:service-completeness` | PASS |

Frontend: `141 test files / 1293 tests passed`, including
`src/test/f4b2UiSurfaceClosure.test.tsx` (12 tests) and
`src/test/rbac/actionCoverage.test.ts` at 2045/2045 action sites protected
(100%). TypeScript check clean.

## Status

**F4-B2 CLOSED — F0–F4 regression green. Ready to proceed to F4-C.**
