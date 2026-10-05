# AML-CLOSE-04 — Calculation, scoring and risk-rating authority

All thresholds, weights, scores and matrices used here are **TEST ONLY — technical certification — not FSRA regulatory policy**.

## A. Verdict

**AML-CLOSE-04 = CONDITIONAL PASS.**

Met: one backend engine (AML-06, now `AML06.3`), governed scoring/weights/bands/matrix/rounding, explicit exclusion treatment, fail-closed on unresolved factors, immutable auditable runs, forged-input rejection, legacy caller-chosen rating route closed, override kept separate from the calculated run, browser E2E 4/4, manual reconciliation equal to backend, AML regressions green, protected assessments unchanged, no FSRA values invented.

Not met / conditions:
1. **Two different weights both counting in one inherent result was not shown in the browser.** In the TEST methodology (v8), factor B has no mandatory question, so once it becomes material the engine correctly refuses to calculate. Showing a two-weight result needs a new TEST methodology version that marks factor B's question mandatory. The weighting maths is the same code path, already shown on protected 00830 (numerator 10000 / denominator 100) and in unit tests.
2. **The later-version outcome is time-dependent** (section Q). No effective dates were changed.
3. **Not yet published.** The database changes are live for preview and published. The published screens still show the old "Approve assessment" dialog. For AML/CFT that dialog is now refused by the server (it fails closed), so it is safe, but it is confusing. Publishing is recommended.

## B. Existing calculation architecture

`supervisory_assessment_calculation_run_record` → `supervisory_calc_compute_core` (resolves the pinned config, then evaluates factor applicability and materiality) → `supervisory_calc_compute_policy` (question/fact scoring, dimension weighted mean, inherent and control aggregates, residual matrix, recommendation, materiality floors) → immutable `supervisory_assessment_calculation_run`. Approval goes through `supervisory_assessment_approve`. Overrides go through `supervisory_calculation_override_propose/decide`.

Defects found:
- (a) Inherent and control means silently re-normalised over calculated dimensions only, so an applicable factor that could not be calculated simply dropped out.
- (b) Legacy `supervisory_assessment_transition` accepted a caller-chosen `_residual_rating` and could approve.
- (c) The calculation tables had broad direct write grants.
- (d) The UI read the question and fact traces from the wrong level, so it showed nothing.

## C. Authoritative engine

No parallel engine was added. The migration added `supervisory_calc_explain_internal`, which runs inside `compute_core`. It returns the factor breakdown, the aggregation and the fail-closed status, and stamps `AML06.3`. The browser shows these values verbatim (`AmlCalculationBreakdown`) and does no scoring of its own.

## D. Factor scoring

Response scores come from governed config (TEST: YES 100 / PARTIALLY 50 / NO 0; NOT_APPLICABLE excluded). Fact rules use governed thresholds. The trace records each question's response, score, weight and evidence counts.

## E. Weighting / denominator

Each factor row records its weight, score×weight, share and contribution:
- `INCLUDED`
- `EXCLUDED_FROM_DENOMINATOR`: not applicable, or not material with EXCLUDE treatment.
- `NOT_CALCULABLE_BLOCKS_RESULT`

If any applicable factor is not calculable, the **whole result is withheld**: no scores, bands or residual. There is no silent re-weighting.

## F. Inherent risk

Inherent risk = Σ(score×weight) / Σweight over included factors. The direction is from config (TEST: INVERTED). The result is rounded by config and then banded. TEST run: 2000 / 40 = 50.00 → MEDIUM_HIGH.

## G. Control effectiveness

Same pipeline on the CONTROL side. TEST run: 10000 / 100 = 100.00 → STRONG.

## H. Residual risk

Residual risk is a lookup in the governed matrix using the inherent and control bands. TEST: (MEDIUM_HIGH, STRONG) → MODERATE. When the result is withheld, the UI shows "Result withheld" rather than any matrix value.

## I. Rating scales

Band tables are versioned per calculation config and pinned through the assessment's policy snapshot.

## J. Rounding / boundaries

Bands include the lower bound and exclude the upper bound, except that 100 is included in the top band. Proven against the TEST bands:

| Score | Band |
|---|---|
| 19.99 | LOW |
| 20 | MODERATE |
| 39.99 | MODERATE |
| 40 | MEDIUM_HIGH |
| 59.99 | MEDIUM_HIGH |
| 60 | HIGH |
| 80 | SEVERE |
| 100 | SEVERE |

Control boundaries follow the same rule: 40 → NEEDS_IMPROVEMENT, 80 → STRONG.

Rounding to 2 decimals:

| Value | HALF_UP | HALF_DOWN | FLOOR | CEILING |
|---|---|---|---|---|
| 49.995 | 50.00 | 49.99 | 49.99 | 50.00 |
| 71.428571 | 71.43 | — | — | — |

Results are deterministic.

**Gap (owner decision):** the recommendation's weighted-ordinal step uses built-in `round()` rather than the configured rounding mode. TEST uses HIGHEST_DIMENSION, so it is not affected here.

## K. Calculation-run auditability

Each run is numbered and append-only (an update/delete trigger rejects changes). It stores:
- inputs, policy snapshot and trace
- md5 of the inputs and of the result
- config, methodology, programme and question-plan versions
- engine version, actor and reason

## L. Recalculation behaviour

Each recalculation adds a new run, and history is kept. Assessment e66173d8 went from a withheld run (STR_COUNT = 60, factor B blocks) to a calculated run after the TEST fact was corrected to 12 (factor B excluded). Both runs are retained.

## M. Client manipulation tests

All of these are in `e2e/cert-v2/10-aml-calculation-authority.spec.ts`:
- A dimension upsert with a forged weight of 999, score 1 and calculated LOW/STRONG/LOW left the authoritative result unchanged.
- `supervisory_assessment_transition` with a caller-chosen rating was refused.
- The legacy `approved` transition for AML/CFT was refused.
- complaints_officer, licensee_primary_user and read_only were refused calculation. Anonymous got 401.
- Direct writes to the calculation-setting tables were revoked from anon and authenticated (reads kept, service_role ALL).

## N. Override/judgement boundary

An override is a separate proposal that records the calculated values, the result hash and the lineage. It needs an independent decision and cannot be self-approved. The calculated run is never changed. The old UI approval dialog that let the user pick a rating was removed; approval now happens only from the Review tab. The UI now also recognises `PENDING_APPROVAL` as pending.

## O. Browser E2E

New assessment e66173d8-c874-4b13-ab64-846f858f4c31 on the TEST VAB entity, created through the UI under TEST profile v7. Steps:
1. Recorded facts in the UI.
2. Factor B became material and was shown as "Not calculable — blocks result". The result was withheld.
3. Corrected the TEST fact; factor B was then excluded from the denominator.
4. Recalculated; the result was MODERATE.

4/4 passed. Screenshots: `/tmp/e2e-artifacts/aml-close-04-*.png`.

## P. Manual reconciliation

An independent recomputation in the test, using a separately written copy of the TEST bands and matrix, matched the backend:

- numerator 2000, denominator 40 → 50 → MEDIUM_HIGH
- control 100 → STRONG
- residual MODERATE

Factors B and C were excluded from the denominator.

## Q. Version integrity

The pinned-snapshot architecture is unchanged. From AML-CLOSE-03/03A, the original assessment recalculated identically after later settings, and settings that were approved but not yet effective were not used. Demonstrating a future-effective successor is **time-dependent**, and dates were not changed.

## R. TEST artifact cleanup

00915–00922 were inspected read-only. All are drafts on the TEST entity. What refers to them:

| Record type | Count |
|---|---|
| Events | 47 |
| Dimensions | 32 |
| Question-plan rows | 32 |
| Question responses | 13 |
| Facts | 15 |
| Policy snapshots | 8 |
| Calculation runs | 2 |
| Legacy calculation | 1 |

There is no evidence, approval, risk state, finding or plan.

There is **no supported cancel/retire route for draft assessments**, so they were left untouched and nothing was hard-deleted. The AML-CLOSE-04 assessment e66173d8 is in the same position. The owner should decide whether to add a governed withdraw-draft action.

TEST profile v7 (`9b38261a…`) went through maker/checker (officer → REVIEW, supervisor → APPROVED/ACTIVE) and was **RETIRED** after the run.

## S. Security

The migration linter reported no new findings: all 1796 findings predate this work. The two new routines are SECURITY DEFINER with internal role checks; the internal explain helper is not exposed. The 41 critical scanner findings are baseline. AML-CLOSE-04 adds none that are unexplained.

## T. Regression results

- **Vitest:** 1759/1759. Two old trace tests were rewritten for the corrected contract, and one withheld-result test was added.
- **Playwright full suite:** 61 passed, 4 failed.
  - P09 Complaints and P10 Inspection: baseline exceptions.
  - Two 02-audience-boundary tests failed under load. Re-runs gave different failing cases, and a third run passed 5/5. This is flakiness, not a regression; no route or guard code was touched.
- **AML specs 06–10:** all green. Spec 09 now accepts engine AML06.2 or AML06.3.

## U. FSRA non-impact

FSRA policies and values are unchanged. STR_SAR_GOVERNANCE was not touched. The six historical exceptions were not backfilled. Protected assessments are unchanged:

| Assessment | Status | Rating | Runs | updated_at |
|---|---|---|---|---|
| 00830 | approved | HIGH | 1 | 2026-09-12 |
| 00836 | draft | — | 0 | 2026-09-28 |
| 00838 | draft | — | 0 | 2026-10-03 17:35 |

No external communications were sent.

## V. Remaining owner/regulator decisions

- Real FSRA weights, bands, matrix and rounding.
- A governed withdraw-draft route for TEST drafts.
- Whether recommendation ordinal rounding should follow the configured mode.
- A TEST methodology version with a mandatory question for factor B, to show two weights both counting in the browser.
- Publish timing.

## W. Final certification answers

### Calculation authority
YES — calculated server-side from governed, pinned configuration.

### Explainability
YES for AML06.3 runs (breakdown, weights, settings and versions are recorded). Runs from earlier engines lack the aggregation block, and the UI says so.

### Missing data
NO — a pending or uncalculable applicable factor withholds the whole result.

### Client manipulation
NO.

### Version integrity
NO (the future-effective demonstration is time-dependent).

### Judgement
YES.

### Real FSRA policy
NO.
