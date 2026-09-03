# AML/CFT — calculation PRE-POLICY CLOSURE

Verdict: **AML CALCULATION PRE-POLICY CLOSURE — PASS.**
AML FULL MODULE remains **NOT CERTIFIED** (AMLH-09).

No AML/CFT effective-date rule, response score, inherent band, control band,
residual matrix cell, recommendation policy or override threshold was authored,
seeded, approved or activated in this wave.

## Delivered

| Priority | Item | Closure |
| --- | --- | --- |
| P0 | Administration UI/server option contract | Withdrawn options removed from the screens; `AGGREGATION = UNWEIGHTED_MEAN, WORST_RESPONSE`, `CRITICAL_HANDLING = NONE`, `POLICIES = WEIGHTED_SCORE, HIGHEST_DIMENSION, WEIGHTED_WITH_THRESHOLD` — matching what the server accepts (CALCG-10, CALCG-11) |
| P0 | No visual policy defaults | Every policy select opens on “Not decided”; band edges, minimum answered questions and rounding decimals open empty, and undecided parameters are omitted from the save payload rather than substituted |
| P0 | Effective-date fallback copy | The false “falls back to the execution date” copy is replaced: with no recorded rule, no assessment in the domain can be calculated |
| P0 | Persisted calculation status | `supervisory_assessment_calculation.status` and `supervisory_assessment_dimension.calculation_status` are CHECK-constrained to CALCULATED / NOT_CALCULABLE / NO_CONFIGURATION / NO_EFFECTIVE_DATE_RULE / CONFIGURATION_INCOMPLETE, surfaced through `calculationStatusLabel()` |
| P0 | Overall NOT_CALCULABLE semantics | `supervisory_calc_compute` reports CALCULATED only when at least one dimension is calculated |
| P0 | Domain-derived authorization | `supervisory_domain_module()` plus a BEFORE-write trigger on all four calculation tables; the screens derive the module from the methodology's domain and gate every action on `<module>.manage_config` |
| P1 | Rounding semantics | `supervisory_calc_round` implements a genuine HALF_DOWN; a missing mode or decimals raises `rounding_undecided` |
| P1 | Dead response-level controls | `requires_observation`, `requires_rationale`, `requires_evidence`, `is_critical_floor` dropped from the store, the setter, the editor and the approval diff |
| P1 | Half-open effective windows | `effective_to` is exclusive in the label, the payload and the verifier; band ranges are `[from, to)` with the last band closed at 100 |
| P1 | Client calculation contract | `useAssessmentCalculation`, `useCalculateAssessment`, `useCalculationReadiness`; no rating is derived in the browser |
| P1 | Assessment Calculation panel | New “Calculation” tab on the AML assessment workspace: status, configuration version, resolved as-of date, scores, bands, recommendation and the full trace; non-calculable statuses show no value |
| P1 | New-assessment preflight | The dialog states plainly, before creation, that no calculated recommendation will exist and why |
| P1 | Verifier rollup | `scripts/verify-aml-full-module-hardening.sql` now runs CALCG-01…14 and CALC-01…11 as part of the suite |

## Verification executed

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-calculation-governance.sql` | 14 PASS, 0 FAIL |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL — CALC-05, CALC-06, CALC-09, CALC-11, all because no supervisory owner has yet authored, approved and activated a configuration |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL (AMLH-09) |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 70 passed (permission disposition register regenerated for `aml_supervision.edit`) |
| `scripts/generate-nav-snapshot.mjs` / `validate-nav-icons.mjs` | 240 items, all icons approved |
| `scripts/verify-breadcrumb-coverage.mjs` | 362 routes, 0 uncovered |
| Build | OK |
| Security linter | 1603 issues, no new issue type; anon-executable definer functions unchanged at 7 |

## Not executed, therefore not claimed

No driven browser journey, no Playwright AML suite, no scale or performance pass,
no full `src/test` run in this wave.

## Remaining blocker

AMLH-09 and CALC-05 / CALC-06 / CALC-09 / CALC-11 stay open until a supervisory
owner authors an AML/CFT effective-date rule and a complete calculation
configuration in the Administration screens and a second person approves and
activates it. That decision is deliberately not taken here.

## Final authorization & semantics closure

| Defect | Closure |
| --- | --- |
| Assessment calculation authorised through a cross-domain OR-list | `supervisory_assessment_calculate` now derives `domain_code` from the assessment being calculated, resolves the required actions through `supervisory_domain_module` / `supervisory_domain_actions(domain,'edit')` plus `<module>.manage_config`, refuses unmapped domains and retains `supervisory_entity_scope_check` (CALCG-15, CALCG-16) |
| Governed recalculation accepted either domain's `manage_config` | `supervisory_calculation_recalculate` requires `<module>.manage_config` for exactly the supplied domain and refuses unknown domains (CALCG-18, CALCG-19) |
| Engine primitives directly callable by signed-in users | `supervisory_calc_compute`, `supervisory_calc_compute_core`, `supervisory_calc_config_for`, `supervisory_calc_as_of_for`, `supervisory_calc_band_of`, `supervisory_calculation_config_validate_core`, `supervisory_calculation_config_score_problems` are revoked from `PUBLIC`, `anon` and `authenticated`; they are reachable only from the governed `SECURITY DEFINER` operations (CALCG-17) |
| `HIGHEST_MATERIAL_DIMENSION` claimed a materiality that the algorithm never represented | Renamed to `HIGHEST_DIMENSION` (worst residual dimension) in the CHECK constraint, engine, validator, Administration option list, approval view, trace and TypeScript types. No compatibility alias: the old value is refused (CALCG-20) |

Authorization model, before and after:

```text
before  authenticated -> supervisory_assessment_calculate
                         requires ANY OF supervisory_spine.edit|create,
                           prudential_supervision.record_camels_assessment,
                           aml_supervision.create|edit|approve|manage_config,
                           market_conduct.run_conduct_analytics
                      -> supervisory_calc_compute        (executable directly)
                      -> supervisory_calc_materialise    (internal)

after   authenticated -> supervisory_assessment_calculate
                         domain_code := assessment.domain_code
                         module      := supervisory_domain_module(domain_code)   (NULL => refused)
                         requires supervisory_domain_actions(domain_code,'edit')
                                  OR <module>.manage_config
                         entity scope enforced
                      -> supervisory_calc_compute        (internal only)
                      -> supervisory_calc_materialise    (internal only)
```

No AML/CFT effective-date rule, response score, band, matrix cell, aggregation
policy or configuration activation was authored in this wave.
