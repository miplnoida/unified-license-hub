# AML/CFT — assessment structural integrity closure

Baseline HEAD `8c5d3ff334ed447ce4c16a46641ff9551d8e9539`. Engineering integrity only:
no effective-date rule decision, no calculation configuration, no score, band,
matrix cell, `inherent_direction`, no methodology version change, no question
change, no judged rating change, no certification claim. DMS remains frozen.

## 1. Structural defect closed

Assessment dimensions were not materialised when an assessment was created, so the
working file held whatever rows a caller happened to write. The methodology
dimension universe is now materialised inside the creation transaction.

| Change | Object |
| --- | --- |
| Materialisation | `supervisory_assessment_dimension_materialise_internal(assessment, actor)` — internal, `service_role` only; returns `status` / `expected` / `existing` / `created` / `created_codes`; `NO_METHODOLOGY` when nothing is bound |
| Creation | `supervisory_assessment_create` calls it in the same transaction, returns `structure`, and records `dimensions_materialised` in the audit entry |
| Answer writer | `supervisory_assessment_question_upsert` resolves the dimension row server-side, creates it when missing, writes and returns `assessment_dimension_id` |
| Answer guard | `supervisory_assessment_response_link_guard_trg` refuses cross-assessment links, code mismatches, and unbound answers where a dimension row exists |
| Governed repair | `supervisory_assessment_structure_backfill(_domain_code, _dry_run default true, _rationale)` — `<module>.manage_config`, rationale ≥10 chars, idempotent, `STRUCTURE_REPAIRED` event plus audit per repair, dry-run returns the plan and conflicts |
| Engine honesty | `supervisory_calc_compute_policy` emits `reason_code` on every outcome (`NO_DIMENSIONS`, `NO_CALCULABLE_DIMENSION`, `NO_MATRIX_CELL`, `INCOMPLETE_DIMENSION_SIDES`, `NO_RECOMMENDATION`, `DIMENSION_NOT_IN_METHODOLOGY`), adds `published_questions`, treats an unlinked dimension as `NOT_CALCULABLE`, and reports `CALCULATED` only when a recommendation exists |

## 2. State after repair

| Measure | Value |
| --- | --- |
| AML/CFT assessments | 27, all methodology-bound |
| Assessment dimensions | 724 (702 expected from the active methodology's 26 active dimensions, plus 22 legacy rows) |
| Unlinked dimensions | 22, all `STR_SAR_GOVERNANCE` — a code the bound methodology does not publish |
| Question responses | 984, 0 unbound, 0 mis-bound |

## 3. Verification (exact counts)

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-assessment-structural-integrity.sql` | STRUCT-01…STRUCT-14 — 14 PASS, 0 FAIL |
| `scripts/verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL — LINK-11 (22 `STR_SAR_GOVERNANCE` rows) |
| `scripts/verify-aml-calc-outcome-fixtures.sql` | OUTC-01…OUTC-14 — 14 PASS, 0 FAIL |
| `scripts/verify-aml-calculation-governance.sql` | CALCG-01…CALCG-20 — 20 PASS, 0 FAIL |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL — CALC-05, CALC-06, CALC-09, CALC-11 |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL — AMLH-09 |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 70 passed, action coverage 100% (two document-upload action sites re-marked) |
| `scripts/validate-nav-icons.mjs` | OK — 240 items |
| `scripts/verify-breadcrumb-coverage.mjs` | 362 routes, 0 uncovered |
| Build | OK |
| Security linter | 1611 issues, unchanged baseline, no new issue type |

OUTC-11 was failing because its "calculable" fixture answered only the inherent
side; under the corrected contract a residual rating needs both sides. The
fixture now carries a fourth assessment (`ZZ-OUTC-CALC`) answered on both sides,
so the gate proves the distinction instead of tolerating it.

Not executed, therefore not claimed: driven browser journeys, Playwright AML
suite, scale/performance and accessibility passes, full `src/test` run.

## 4. Remaining blockers (policy, not engineering)

1. LINK-11 — whether the 22 `STR_SAR_GOVERNANCE` dimensions map to
   `STR_GOVERNANCE` or belong to a retired methodology is a methodology decision.
2. CALC-05, CALC-06, CALC-09, CALC-11 and AMLH-09 — no ACTIVE calculation
   configuration and no recorded AML/CFT effective-date rule exist. Both must be
   authored in the Administration screens and approved by a second identity.

## 5. Verdicts

- ASSESSMENT STRUCTURAL INTEGRITY — **PASS** (14/14)
- DECISION PACK — **NOT READY**
- AML FULL MODULE HARDENING — **NOT CERTIFIED**
