# AML/CFT assessment-dimension linkage & outcome materialisation — closure report

Engineering-integrity wave only. No supervisory policy value was authored: no
effective-date rule decision, no calculation configuration, no scores, bands,
matrix cells, `inherent_direction`, no v1.1 methodology, no judged rating change,
no certification claim.

## 1. Census (pre-repair, 107 AML_CFT assessment dimensions)

| Category | Rows | Notes |
| --- | --- | --- |
| EXACT_MATCH | 0 | none was linked before this wave |
| MISSING_LINK_EXACTLY_RESOLVABLE | 85 | one canonical `methodology_dimension` per (methodology_id, dimension_code) |
| AMBIGUOUS | 0 | `supervisory_methodology_dimension` is UNIQUE on (methodology_id, dimension_code) |
| NO_MATCH | 22 | all `STR_SAR_GOVERNANCE`, a code of the retired `AML_RBA 1.0` methodology; `AML-CFT-RBA 1.0` uses `STR_GOVERNANCE` |
| CROSS_METHODOLOGY_MISMATCH | 0 | |
| CODE_MISMATCH | 0 | |

Question responses: 160 already carried a correct link, 0 conflicting, 824 carry
no `assessment_dimension_id` (they belong to assessments with no dimension row of
that code — not a repairable link, recorded as `responses_without_assessment_dimension`).

## 2. Writer no longer trusts the caller

`supervisory_assessment_dimension_upsert` resolves the canonical dimension itself
from `methodology_id + dimension_code` via
`supervisory_methodology_dimension_resolve`. A caller-supplied id is accepted only
as a cross-check and refused as `dimension_link_invalid`,
`dimension_link_cross_methodology`, `dimension_link_code_mismatch`,
`dimension_link_not_canonical` or `dimension_not_in_methodology`.

## 3. Database guard

`supervisory_assessment_dimension_link_guard_trg` (BEFORE INSERT/UPDATE) refuses
cross-methodology and wrong-code links outside the RPC, and requires the link on
insert whenever a canonical dimension exists.

## 4. Governed repair

`supervisory_assessment_dimension_relink(_domain_code, _dry_run, _rationale)` —
`<module>.manage_config`, rationale ≥10 characters, idempotent, writes
`methodology_dimension_id` only, one immutable audit entry per repaired row plus a
summary entry. Executed for `AML_CFT`: **85 rows repaired**, 22 left untouched
(the `STR_SAR_GOVERNANCE` methodology question), nothing else changed.

Post-repair census: 107 dimensions, 85 linked, 22 unlinked, 68 with answered
questions, 68 calculable candidates once a configuration is published.

## 5. Outcome materialisation

`supervisory_calc_outcome_acceptable` now requires, for `NOT_CALCULABLE`, a
configuration id and `trace.reason` / `trace.config_version` / `trace.as_of` /
`trace.methodology_version`. `supervisory_calculation_recalculate` distinguishes
`WOULD_CALCULATE`, `WOULD_RECORD_NOT_CALCULABLE` / `RECORDED_NOT_CALCULABLE`,
`BLOCKED_REVIEW_REQUIRED`, `NO_CONFIGURATION`, `NO_EFFECTIVE_DATE_RULE`,
`CONFIGURATION_INCOMPLETE`, `OTHER_CONFIGURATION`, and refuses an unrecognised
status (`unknown_calculation_status`). No rating is ever fabricated.

## 6. Verification

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL — LINK-11 (22 `STR_SAR_GOVERNANCE` rows) |
| `scripts/verify-aml-calc-outcome-fixtures.sql` | 14 PASS, 0 FAIL (OUTC-01…14) |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL — CALC-05, CALC-06, CALC-09, CALC-11 (no configuration authored/approved) |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL — AMLH-09 (80 approved dimensions, no governed outcome) |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 70 passed, action coverage 100% |
| `scripts/verify-breadcrumb-coverage.mjs` | 362 routes, 0 uncovered |
| Security linter | 1597 issues, unchanged baseline, no new issue type |

Not executed, therefore not claimed: driven browser journeys, Playwright AML
suite, scale/performance and accessibility passes, full `src/test` run.

## 7. Remaining blockers (policy, not engineering)

1. LINK-11 — whether the 22 `STR_SAR_GOVERNANCE` dimensions map to
   `STR_GOVERNANCE` or belong to a retired methodology is a methodology decision.
2. AMLH-09 / CALC-05, CALC-06, CALC-09, CALC-11 — an effective-date rule and a
   calculation configuration must be authored, approved by a second identity and
   activated in the Administration screens.
