# F8A — System Screen / Schema / RPC Runtime Integrity Certification
Date: 2026-08-31

## Heads
- Tested implementation HEAD: `f3aeca3d2e93706b8f6fb4ec7fdd7fbbf64d0eb4`
- Commits after the tested HEAD are evidence/docs only (`route-smoke-results.json`,
  `evidence-route-smoke-final-metadata.json`, this record, gap register).
- Final certification HEAD: recorded in the certification commit for this file.

## Final route census (SR-16)
| Metric | Value |
| --- | --- |
| Routes covered | 347 / 347 |
| Executions | 353 |
| PASS | 299 |
| REDIRECT | 38 |
| EXPECTED_AUTHORIZATION | 6 |
| EXPECTED_NOT_FOUND | 10 |
| ENVIRONMENT_BLOCKED | 0 |
| FAIL | 0 |
| UNKNOWN | 0 |
| PGRST002 | 0 |
| run_verdict | CERTIFICATION_ELIGIBLE |

## Final regression results (SR-20)
All PASS: F8A-B1 (64), B2 (96), B3 (67), B4 (88), B4 runtime (28),
frontend tests 1317/1317 across 144 files, TypeScript typecheck, production build,
`verify:system-runtime-schema` (0 defects), internal-contract verifier + self-test
(7,554 contracts, 0 defects, 0 deferrals), route-harness self-test 9/9,
forms semantics 15/15, notification-health performance (0 timeouts, authorization
intact), prudential-universe performance 5/5, Data API readiness 70/70 with
0 PGRST002 and 0 HTTP 503.

## Major defect closures
- SR-17 authenticated read access to `entity_user_access` (read-only).
- SR-18 ambiguous `sector_id` in `prudential_sector_risk(integer)`.
- SR-19 `/forms/:id` proven correct not-found semantics.
- SR-23 15 internal routine/Edge Function contract repairs.
- SR-24 `prudential_entity_universe` generic-plan timeout → 217–706 ms.
- SR-25 `compliance_audit_logs` RLS helper volatility → ~7.16 s to ~86 ms warm.
- Route failures R-042, R-140/R-155, R-313/R-314, R-174, R-189, R-190 closed.

## Security confirmation
- No new GRANTs beyond the audited read-only additions; no RLS weakening.
- `entity_user_access`: `authenticated` holds `SELECT` only (no INSERT/UPDATE/DELETE).
- `prudential_entity_universe(uuid,text,text)` remains `SECURITY INVOKER`;
  `anon` EXECUTE denied.
- `prudential_sector_risk(integer)` `anon` EXECUTE denied.
- `notification_channel_health()` permission gate intact — unauthenticated calls
  return HTTP 401 `42501`; `anon` EXECUTE denied.
- No statement_timeout increases, no service-role bypass, no error suppression.

## Non-blocking carried debt (unchanged)
3 proposed B4 address usages · 35 intentionally unresolved F&P identities ·
migration replay drift `APPLIED=747 / FAILED=200` · residual linter findings
(~1,502) · error-swallowing conversion backlog (333 sites / 153 files) guarded by
the contract gate.

## Reproduction
```
npm run verify:f8a-b1 && npm run verify:f8a-b2 && npm run verify:f8a-b3
npm run verify:f8a-b4 && npm run verify:f8a-b4-runtime
npm run verify:system-runtime-schema
npm run verify:internal-contracts && npm run verify:internal-contracts-selftest
npm run verify:route-harness-selftest
npm run verify:forms-semantics
npm run verify:notification-health-perf
npm run verify:prudential-universe-perf
npm run verify:dataapi-readiness
npx vitest run && npx tsgo --noEmit && npm run build
node scripts/system-runtime/run-final-census.mjs   # detached; exceeds foreground limit
```

## Verdict
F8A SYSTEM SCREEN / SCHEMA / RPC RUNTIME INTEGRITY — CERTIFIED
