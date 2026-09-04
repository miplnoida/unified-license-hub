# AML/CFT — calibration simulation report (reference policy candidate)

**Status: MIPL REFERENCE PROPOSAL / CALIBRATION CANDIDATE — NOT REGULATOR-APPROVED POLICY.**
Nothing in this report is authored into `supervisory_calculation_config`. No
calculation outcome was materialised, no assessment rating was changed, and the
module remains **NOT CERTIFIED**.

Reproduce with:

```
psql "$SUPABASE_DB_URL" -f scripts/aml/simulate-reference-policy.sql
```

The script runs wholly inside a transaction that ends in `ROLLBACK`, and
`supervisory_calc_simulate` is declared `STABLE`, so the database refuses any
write reached from it. The script prints a post-run count proving that
configuration, band, matrix and outcome tables are unchanged (0 / 0 / 0, and the
1 outcome + 5 dimension statuses are the pre-existing verifier fixtures).

## 1. Candidate parameters simulated

| Parameter | Candidate value |
| --- | --- |
| `effective_date_rule` | `EXPLICIT_AS_OF` |
| `response_scores` | YES 100, PARTIALLY 50, NO 0, NOT_APPLICABLE excluded from denominator |
| `aggregation_method` | `UNWEIGHTED_MEAN` |
| `dimension_weight_mode` | `METHODOLOGY` (published dimension weights) |
| `completeness_mode` | `ALL_MANDATORY_APPLICABLE` |
| `na_denominator_handling` | `EXCLUDE` |
| `evidence_insufficiency_handling` | `NOT_CALCULABLE` |
| `inherent_direction` | `DIRECT` |
| `rounding` | `HALF_UP`, 2 decimals |
| `recommendation_policy` | `WEIGHTED_SCORE` |
| Inherent bands | LOW 0–20, MODERATE 20–40, MEDIUM_HIGH 40–60, HIGH 60–80, SEVERE 80–100 (half-open) |
| Control bands | INEFFECTIVE / WEAK / ADEQUATE / STRONG / ROBUST on the same 20-point boundaries |
| Residual matrix | complete monotonic 5 × 5 (25 cells), non-decreasing down inherent, non-increasing across control |

## 2. Outcome of the candidate as proposed

Across all 27 AML/CFT assessments:

| Measure | Result |
| --- | --- |
| Assessment status | 26 `CALCULATED`, 1 `NOT_CALCULABLE` |
| Inherent band produced | **0 of 27** |
| Control band produced | 24 of 27 (20 INEFFECTIVE, 3 ADEQUATE, 1 ROBUST) |
| Residual rating produced | **0 of 27** |
| Recommended rating produced | **0 of 27** |

**The candidate policy produces no residual rating for any assessment.** The
cause is the recorded dataset, not the parameters.

## 3. Why: dataset limits, measured

| Finding | Evidence |
| --- | --- |
| Only 4 of 26 active methodology dimensions are ever recorded on an assessment | 108 assessment dimensions / 27 assessments; codes `GEOGRAPHIC_RISK`, `CDD_KYC`, `TRANSACTION_MONITORING`, `STR_SAR_GOVERNANCE` |
| 6 active CONTROL dimensions publish **zero** questions, so completeness can never be established for them | `AML_DATA_QUALITY`, `INDEPENDENT_TESTING`, `MODEL_GOVERNANCE`, `REMEDIATION_TRACKING`, `THIRD_PARTY_OVERSIGHT`, `TRAINING` — 22 recorded dimensions land here and return "the methodology publishes no mandatory question for this dimension" |
| Every dimension carries at least one question with `requires_evidence` and `min_evidence_count ≥ 1`, and 480 of 984 responses carry no evidence reference | 44 dimensions become `NOT_CALCULABLE` under `evidence_insufficiency_handling = NOT_CALCULABLE` |
| 17 dimensions have mandatory questions with no valid response at all | 15 × "2 mandatory applicable question(s) carry no valid response", 2 × "3 …" |
| All 29 recorded INHERENT dimensions fail to score | 22 evidence-insufficient, 7 missing responses → no inherent band → no matrix cell → no residual |
| Recorded responses are dominated by `NO` | NO 819, PARTIALLY 123, YES 41, NOT_APPLICABLE 1 of 984 |

## 4. Sensitivity pass

Residual ratings that changed relative to the candidate, over 27 assessments:

| Variant | Changed residual ratings | Reading |
| --- | --- | --- |
| Inherent + control band boundaries **+5** points | 0 of 27 | not discriminating |
| Band boundaries **−5** points | 0 of 27 | not discriminating |
| `aggregation_method = WORST_RESPONSE` | 0 of 27 | not discriminating |
| `dimension_weight_mode = EQUAL` | 0 of 27 | not discriminating |
| `completeness_mode = MIN_ANSWERED (1)` | 0 of 27 | not discriminating |
| `evidence_insufficiency_handling = FLAG_ONLY` | 22 of 27 gain a rating | **material** |
| `evidence_insufficiency_handling = CAP_AT_MIDPOINT` | 22 of 27 gain a rating, one band higher than FLAG_ONLY | **material** |
| `inherent_direction = INVERTED` | 20 of 22 move LOW → SEVERE residual MODERATE → SEVERE | **most material** |
| `recommendation_policy = HIGHEST_DIMENSION` | 0 vs `WEIGHTED_SCORE` | not discriminating |

Band boundaries, aggregation method and dimension weighting register **zero**
sensitivity because only one scoring dimension per kind carries responses; with a
single dimension, weighting and mean-versus-worst collapse to the same number.
**No evidence in this dataset supports or refutes those three parameters.**

The two parameters the data does discriminate are exactly the two that depend on
undecided policy: question polarity (`inherent_direction`, AML-DEC-04) and the
treatment of insufficient evidence.

### The polarity result, stated plainly

The recorded inherent-risk answers use the same control-positive wording as the
control questions: `NO` reads as "the control is absent". Under
`inherent_direction = DIRECT` those `NO` answers score 0, which the inherent
bands read as **LOW inherent risk** for 20 of 22 calculable assessments, while
the identical answers make control effectiveness `INEFFECTIVE`. That combination
is not supervisorily coherent. Under `INVERTED` the same 20 assessments become
**SEVERE**. The parameter is therefore worth a four-band swing and cannot be
chosen by an implementer.

## 5. Agreement with recorded supervisory judgement

Recorded judged residual ratings: HIGH 19, MODERATE 4, LOW 1, absent 3.

| Variant | Comparable | Exact band | ±1 band | >1 band |
| --- | --- | --- | --- | --- |
| Candidate as proposed | 0 | — | — | — |
| `FLAG_ONLY` | 20 | 0 | 1 | 19 |
| `HIGHEST_DIMENSION` | 20 | 0 | 1 | 19 |
| `INHERENT_INVERTED` | 20 | 1 | 19 | 0 |
| `CAP_AT_MIDPOINT` | 20 | 18 | 1 | 1 |

`CAP_AT_MIDPOINT` reproduces recorded judgement almost exactly, but that
agreement is produced by the hard-coded midpoint cap landing in the HIGH band —
it is an artefact of one gating rule, not evidence that the candidate bands,
weights or matrix are correct. **It must not be read as calibration.**

## 6. Verdicts

- **CALIBRATION EXECUTED — YES** (10 variants, 27 assessments, 108 dimensions, zero writes).
- **CANDIDATE POLICY CALIBRATED AGAINST DATA — NO.** The dataset records 4 of 26
  dimensions, leaves 6 active control dimensions with no questions, and omits
  evidence on 480 of 984 responses; band boundaries, aggregation and weighting
  show zero sensitivity and cannot be evidenced either way.
- **READY FOR POLICY APPROVAL — NO.** AML-DEC-04 (question polarity) and the
  evidence-insufficiency treatment must be decided first; they are worth up to
  four bands of residual rating.
- **AML/CFT FULL MODULE — NOT CERTIFIED.**

## 7. Open blockers unchanged by this wave

| Gate | Status |
| --- | --- |
| LINK-11 | FAIL — 22 `STR_SAR_GOVERNANCE` dimensions use a code absent from the bound methodology (AML-DEC-01) |
| CALC-05, CALC-06, CALC-11 | FAIL — no ACTIVE calculation configuration is published |
| CALC-09 | FAIL — 0 recorded AML/CFT effective-date rule decisions (AML-DEC-10) |
| AMLH-09 | FAIL — 80 approved dimensions carry no acceptable governed calculation outcome |

New defects recorded by this wave, for the methodology owner rather than
engineering:

| Id | Defect |
| --- | --- |
| AML-DEF-C1 | 6 active CONTROL dimensions publish no question, so they can never be assessed or scored. |
| AML-DEF-C2 | 22 of 26 active dimensions are never recorded on any assessment, so aggregation and weighting parameters are unfalsifiable against current data. |
| AML-DEF-C3 | 480 of 984 responses answer a question that requires evidence without recording any, so any evidence-gating policy makes most dimensions not calculable. |

## 8. Regression run in this wave

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-calculation-governance.sql` | 20 PASS, 0 FAIL (CALCG-06 repaired: retirement no longer re-dates a configuration's effective window) |
| `scripts/verify-aml-calc-outcome-fixtures.sql` | 14 PASS, 0 FAIL |
| `scripts/verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL (LINK-11, unchanged) |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL (unchanged, all from absent configuration) |
| `scripts/verify-aml-full-module-hardening.sql` | 20 PASS, 1 FAIL (AMLH-09, unchanged) |
