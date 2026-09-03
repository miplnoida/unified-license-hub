# AML/CFT H2B — configurable methodology calculation, implementation status

## What is now in place

| Layer | Delivered |
| --- | --- |
| Configuration schema | `supervisory_calculation_config`, `_response_score`, `_band`, `_matrix_cell`, `_event`, `supervisory_domain_calculation_rule`, `supervisory_assessment_calculation` — RLS + GRANTs, versioned per methodology, one ACTIVE version at a time |
| Governed operations | `..._config_upsert`, `..._response_scores_set`, `..._bands_set`, `..._matrix_set`, `..._config_validate`, `..._config_lifecycle`, `supervisory_domain_calculation_rule_set`, `supervisory_methodology_as_of` |
| Engine | `supervisory_calc_compute` / `supervisory_assessment_calculate` are the only producers of `calculated_*`; `supervisory_assessment_dimension_upsert` discards caller-supplied calculated values |
| Maker/checker | DRAFT → REVIEW → APPROVED → ACTIVE, rationale ≥10 chars per transition, approver must differ from author, completeness validation blocks submission |
| Immutability | `supervisory_assessment_methodology_freeze_trg` refuses a methodology/version change on an approved assessment |
| Screens | `/admin/supervisory-calculation` (parameters, response scoring, bands, residual matrix, history, effective-date rule) and `/admin/supervisory-calculation/approvals`, both gated on `aml_supervision.manage_config`, registered in `sec_routes` / `sec_navigation_items` under Supervision Configuration |
| Verifier | `scripts/verify-aml-calculation-integrity.sql` — 11 gates (CALC-01…CALC-11) |

No scoring value, band boundary or matrix cell is defaulted in code: they are supplied by the supervisory owner in the screens and only take effect once approved and activated.

## Verification executed

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL (CALC-05, CALC-06, CALC-09, CALC-11 — all because no configuration has yet been authored and approved) |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 70 passed (action coverage remains 100%) |
| `scripts/validate-nav-icons.mjs` | OK — 240 items, all icons approved (two pre-existing AML icon defects fixed) |
| `scripts/verify-breadcrumb-coverage.mjs` | 362 routes, 0 uncovered |
| Build | OK |
| Security linter | 1598 issues, no new issue type; anon-executable definer functions reduced to 7 |

## Not executed, therefore not claimed

No driven browser journey, no scale/performance pass, no Playwright AML suite, and no full `src/test` run in this pass.

## Remaining blocker

AMLH-09 / CALC-05, CALC-06, CALC-09, CALC-11 stay open until the supervisory owner authors a calculation configuration in the new screens and a second person approves and activates it. That decision publishes the missing methodology parameters; it is deliberately not fabricated here.
