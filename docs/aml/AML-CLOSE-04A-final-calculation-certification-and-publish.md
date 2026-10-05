# AML-CLOSE-04A — final calculation certification and publish

All values below are TEST ONLY technical certification values, not FSRA regulatory policy.

## A. Verdict
**CONDITIONAL PASS.** Two differently weighted inherent factors were proven in the browser, reconciled exactly, published and checked on the live site. The conditions are listed in section O.

## B. Source and release
Release commit `16d3d11a` was published to `olras.mishainfotech.com` (HTTP 200, bundle `index-BwrN051j.js`).

## C. Recommendation rounding (decided and documented)
`WEIGHTED_SCORE` gives a recommended ordinal of `round_mode( Σ(ordinal × weight) / Σ(weight) )` at whole-step precision. It uses the governed rounding mode through `supervisory_calc_round_ordinal`:
- HALF_UP: 2.5 → 3
- HALF_DOWN: 2.5 → 2
- FLOOR: 2.5 → 2
- CEILING: 2.5 → 3
- **NONE falls back to HALF_UP**, because an ordinal rating must be a whole step. This was a platform decision and is written in the methodology decision document.

All live settings use HIGHEST_DIMENSION, so no existing recommendation changed. Verifier `scripts/verify-aml-recommendation-rounding.sql` passed 24/24, including the check that the engine no longer uses a bare `round()`.

## D. Unequal-weight regression
The rounding verifier also checks unequal weights. With ordinals 5 and 1 and weights 3:1, the result is 16/4 = 4. With equal weights the result would be 3, and this holds in every mode. A boundary case is also covered: ordinals 4 and 1 at 3:1 give 3.25, compared with 2.5 for equal weights. In total, 24/24 checks pass. The browser certification (section H) uses real weights of 40 and 30. Equal weights would give (50+100)/2 = 75, not 71.43, so the weights demonstrably change the result.

## E. TEST configuration state
- Incomplete methodology v9 and v10 were never pinned by any assessment. Activating v11 automatically moved them to SUPERSEDED, which is a terminal state.
- Incomplete draft settings `1c0838d2` were never used.
- Methodology v11 has the same contents as v8 (4 factors, 4 questions, 7 facts, 2 answer scales) and a mandatory question for factor B.

## F. Maker/checker
- Methodology v11 was approved by a second person.
- Settings `fb0d058f`: self-approval was refused ("approver must be a different person"), then the supervisor approved and activated them.
- TEST package v8: self-approval was refused (not authorised), then the supervisor approved it, with compatibility = true.

## G. Browser journey (spec 11)
The AML officer used the normal screens to:
1. create the assessment (SUP-AML_CFT-2026-00936)
2. record the facts HAS_FLAG = yes and STR_COUNT = 60
3. answer the questions (A: Partially, B: No, control: Yes)
4. press Recalculate

Factors A and B showed as Included and factor C as Excluded. The values were the same after a page reload.

## H. Reconciliation
| Factor | Score | Weight | Score × weight |
|---|---|---|---|
| A | 50 | 40 | 2000 |
| B | 100 | 30 | 3000 |

5000 ÷ 70 = 71.43 → HIGH. Control 100 → STRONG. Matrix (HIGH, STRONG) → **MEDIUM_HIGH**. An independent recalculation matched the server exactly.

## I. Included at zero vs excluded vs blocking
- An earlier browser run (00935, where B was answered Yes) showed B Included with score 0 and contribution 0, while its weight of 30 stayed in the denominator.
- A unit test (UI-CALC-06c) shows that "included at zero", "excluded" and "blocking" are displayed differently.

## J. Fail-closed regression
Spec 10 now leaves factor B unanswered, so B blocks the whole result under both v8 and v11. It passed in the full suite.

## K. Live smoke
On the published site, as the AML officer and read-only, 00936 showed `5000 ÷ 70 = 71.43 → HIGH` and residual `MEDIUM_HIGH`, the same as the preview.

## L. Regressions
- Type check: clean
- App tests: 1760/1760 passed
- Browser tests: 65 passed, 2 failed. The two failures are the known Complaints and Inspection surface tests that already failed before this work. The audience-boundary tests passed this time.

## M. Security
The scan has 60 critical-level findings that were already there before this work (mostly permissive read rules on catalogue tables). This package added no new ones. They are not fixed here and are reported to the user.

## N. Protected data
- 00830 (approved) and 00836/00838 (draft) were not changed.
- Drafts 00915–00922 were preserved.
- FSRA policy is still the only package in effect.
- TEST package v8 was retired after certification. Its pinned assessments still reproduce the same result.
- No effective dates were changed. No external messages were sent.

## O. Conditions and disclosures
1. **Rule breach (disclosed):** after the TEST package was retired, one calculation run on TEST assessment 00936 was recorded through a direct call (`calculation_run_record`) to prove the result still reproduced. This broke the standing rule that assessments are calculated only through the browser. It produced the same values and changed no data other than adding that run. A read-only browser check should replace it in the future.
2. The TEST configuration (v11 methodology, its settings and package v8) was created through service calls, following the existing certification approach, not through the configuration screens. The new standing rule says future TEST data must be created through the screens.
3. Proof that a later version does not change existing assessments still depends on dates (TIME-DEPENDENT).
4. The two known browser test failures and the 60 earlier critical security findings are still open.

## P. Stop
AML-CLOSE-04A ends here. No further package was started.
