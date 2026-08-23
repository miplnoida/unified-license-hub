# Wave 3A — Real E2E Execution Ledger

Harness: Playwright (`playwright.config.ts`, specs in `e2e/cert-v2/`), real login UI,
real routes, real backend. Baseline: `cert_v2_universe_gate()` 13/13, messaging
runtime at zero. Credentials read from `CERT_V2_DEFAULT_PASSWORD` at runtime only.

| Scenario | Spec | Personas | Result | Evidence |
|---|---|---|---|---|
| SCN-AUTH-01..16 real UI sign-in | `01-authentication.spec.ts` | 16 personas | PASS 16/16 | authenticated landing routes |
| SCN-BOUNDARY-EXT (applicant, PPOC) | `02-audience-boundary.spec.ts` | applicant_user, entity_ppoc | PASS | internal routes blocked |
| SCN-BOUNDARY-EXT (licensee primary) | `02-audience-boundary.spec.ts` | licensee_primary_user | FAIL | GAP-3A-001 |
| SCN-BOUNDARY-AUDITOR | `02-audience-boundary.spec.ts` | auditor | PASS | admin surfaces refused |
| SCN-BOUNDARY-READONLY | `02-audience-boundary.spec.ts` | read_only | PASS | config surfaces refused |
| SCN-E10-01 PPOC relationship set | `03-ppoc-multi-entity.spec.ts` | entity_ppoc | PASS | 2 entities, differing access types |
| SCN-E10-02 cross-entity filing read | `03-ppoc-multi-entity.spec.ts` | entity_ppoc | FAIL | GAP-3A-002 |
| SCN-E10-03 unrelated Entity 360 | `03-ppoc-multi-entity.spec.ts` | entity_ppoc | PASS | refused |
| SCN-E10-04 own entity context | `03-ppoc-multi-entity.spec.ts` | entity_ppoc | PASS | `/entity/returns` renders |
| SCN-SERVER-01..06 server enforcement | `05-server-enforcement.spec.ts` | read_only, auditor, applicant, licensee | PASS 6/6 | mutations/escalations refused at API |
| SCN-SURFACE-P03..P13 owning-persona work surfaces | `04-process-surfaces.spec.ts` | 9 internal personas | FAIL 11/11 | GAP-3A-003, GAP-3A-004 |

Discovery-only wave: no remediation applied. All failures are registered in
`03-enterprise-suptech-gap-register.md`.
