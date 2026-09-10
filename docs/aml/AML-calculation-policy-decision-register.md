# AML/CFT calculation, materiality and linkage — regulator policy decision register

Status: OPEN for regulator policy — 8 decisions still require an authorised
regulator answer. A parallel set of **demonstration values** has been authored,
approved and activated in the demonstration environment only; see
"Demonstration configuration" at the end of this register. Those values are not
regulator policy and must not be presented as such.

This register exists because a set of certification gates cannot legitimately turn
green without an authorised policy answer. Engineering has proved the engine
capability, refuses to fabricate policy values, and records here exactly which
decision each blocked gate is waiting for.

Four categories are distinguished throughout:

| Category | Meaning |
|---|---|
| ENGINE CAPABILITY | Implemented and certified server behaviour. No decision needed. |
| SYNTHETIC CERTIFICATION POLICY | Rollback-scoped fixture policy inside verifiers only. Never live. |
| LIVE REGULATOR-AUTHORED POLICY | Must be decided and recorded by an authorised party. Missing today. |
| LEGACY-DATA REMEDIATION | Historical rows requiring an authorised mapping decision. |

No decision in this register has been inserted into the live database.

---

## DEC-01 — Effective-date rule for AML/CFT

| Field | Content |
|---|---|
| Gate | CALC-09 (and the precondition of CALC-05, CALC-06, CALC-11, AMLH-09) |
| Policy area | Calculation as-of date |
| Current state | `supervisory_domain_calculation_rule` holds 0 rows for `AML_CFT` |
| Decision owner | Regulator / methodology authority |
| Decision required | Which date governs the calculation of an AML/CFT assessment: the end of the assessed period, or the date the assessment was performed? |
| Allowed values | `effective_date_rule` ∈ `PERIOD_END`, `ASSESSMENT_DATE` (governed server vocabulary) |
| Dependencies | None. This is the first decision in the chain. |
| Consequence if absent | `supervisory_calc_compute` returns `NOT_CALCULABLE` / `NO_EFFECTIVE_DATE_RULE`; no configuration can be resolved for any assessment |
| Authoring surface | `supervisory_domain_calculation_rule` via the governed calculation configuration screen |
| Approval requirement | Recorded rationale; methodology-authority sign-off |
| Evidence needed | Methodology instrument or supervisory manual clause stating the reference date |
| Prohibited assumption | Engineering must not assume `PERIOD_END` because verifier fixtures use it |

## DEC-02 — Question participation and response scores

| Field | Content |
|---|---|
| Gate | CALC-05, CALC-06, CALC-11 |
| Policy area | Scores |
| Current state | 0 live calculation policies; no response score is recorded for any live question |
| Decision owner | Methodology authority |
| Decision required | For each live question, does it participate in scoring, and what numeric meaning does each permitted response carry? |
| Allowed values | `calculation_participation` ∈ `SCORED`, `INFORMATIONAL`, `GATING`; response scores as governed numeric policy values |
| Dependencies | DEC-01 |
| Consequence if absent | No `ACTIVE` calculation configuration can be validated; calculation remains `NOT_CALCULABLE` |
| Authoring surface | Governed calculation policy layers (`supervisory_calculation_config` + score policy rows) |
| Approval requirement | Maker/checker on the configuration, then approval before activation |
| Evidence needed | Approved scoring schedule per question |
| Prohibited assumption | No default score, no implied YES=0/NO=1 mapping, no inferred participation |

## DEC-03 — Question and dimension weights

| Field | Content |
|---|---|
| Gate | CALC-05, CALC-06, CALC-11, and the v1.1 blocker `DIMENSION_WEIGHT_SUM` |
| Policy area | Dimensions |
| Current state | v1.1 dimension weights do not total 100 within each dimension group; v1.0 carries no calculation weights |
| Decision owner | Methodology authority |
| Decision required | What weight does each question carry within its dimension, and each dimension within its group, so each group totals 100? |
| Allowed values | Numeric weights per `supervisory_methodology_dimension.weight` and question weight policy; group sum must equal 100 |
| Dependencies | DEC-02 |
| Consequence if absent | `supervisory_methodology_validate` raises the blocking finding `DIMENSION_WEIGHT_SUM`; the version cannot reach REVIEW |
| Authoring surface | Methodology studio dimension editor |
| Approval requirement | Methodology lifecycle REVIEW → APPROVED with maker/checker |
| Evidence needed | Approved weighting schedule |
| Prohibited assumption | Engineering must not distribute weights equally to make the sum reach 100 |

## DEC-04 — Aggregation, completeness and N/A handling

| Field | Content |
|---|---|
| Gate | CALC-11 (configuration completeness) |
| Policy area | Facts and aggregation |
| Current state | Every policy parameter is undecided; the validator refuses the configuration (`has not been decided`) |
| Decision owner | Regulator / methodology authority |
| Decision required | How are dimension scores aggregated, what minimum completeness is required, how are N/A answers treated in the denominator, and how are insufficient evidence and critical questions handled? |
| Allowed values | `aggregation_method`, `min_answered_questions`, `na_denominator_handling`, `evidence_insufficiency_handling`, `critical_question_handling`, `rounding_mode`, `rounding_decimals`, `inherent_direction`, `recommendation_policy` — each restricted by its server check constraint |
| Dependencies | DEC-02, DEC-03 |
| Consequence if absent | `supervisory_calculation_config_validate` fails; no configuration reaches `ACTIVE` |
| Authoring surface | Calculation configuration screen |
| Approval requirement | Maker/checker plus approval before activation |
| Evidence needed | Approved calculation methodology text |
| Prohibited assumption | No silent default: the schema deliberately carries no column defaults |

## DEC-05 — Inherent-risk, control-effectiveness bands and residual matrix

| Field | Content |
|---|---|
| Gate | CALC-05, CALC-06, AMLH-09 |
| Policy area | Bands and matrix |
| Current state | No band rows and no residual matrix cells exist |
| Decision owner | Regulator |
| Decision required | Which score ranges map to which inherent-risk rating and which control-effectiveness rating, and which residual rating results from each inherent × control combination? |
| Allowed values | Band thresholds and rating labels from the governed rating vocabulary; one residual value per matrix cell |
| Dependencies | DEC-02, DEC-03, DEC-04 |
| Consequence if absent | No residual rating can be produced; dimensions stay `NOT_CALCULABLE`, so AMLH-09 counts approved dimensions with no acceptable calculated outcome |
| Authoring surface | Calculation policy band and matrix editors |
| Approval requirement | Regulator approval recorded in the approval register |
| Evidence needed | Published risk-rating scale and residual matrix |
| Prohibited assumption | No interpolated bands, no symmetric matrix, no borrowed prudential scale |

## DEC-06 — Materiality policy

| Field | Content |
|---|---|
| Gate | CALCG-20 (label semantics — now green) and the recommendation outcome behind CALC-05 |
| Policy area | Materiality |
| Current state | The governed materiality surface exists and holds no approved value |
| Decision owner | Regulator |
| Decision required | Which dimensions or findings are material for the supervisory recommendation, and by what named rule? |
| Allowed values | Materiality rules accepted by the governed materiality policy surface; `recommendation_policy` remains restricted to labels that match implemented semantics (`HIGHEST_DIMENSION`) |
| Dependencies | DEC-05 |
| Consequence if absent | Recommendations rely on the implemented highest-dimension semantics only; no materiality-qualified recommendation is available |
| Authoring surface | Governed materiality policy RPC/screen |
| Approval requirement | Approved policy record with rationale |
| Evidence needed | Supervisory policy defining materiality |
| Prohibited assumption | Engineering must not name a policy label whose semantics are not implemented, and must not invent materiality thresholds |

## DEC-07 — Conditional-question trigger rules and N/A configuration for v1.1

| Field | Content |
|---|---|
| Gate | AML-02 REG-AUTH-17 (asserted as a correct refusal), v1.1 activation readiness |
| Policy area | Questions |
| Current state | Conditional v1.1 questions have no executable active `TRIGGER` rule (`CONDITIONAL_RULE_MISSING`); some questions carry `na_conditions` while `allow_not_applicable` is false (`INVALID_NA_CONFIGURATION`) |
| Decision owner | Methodology authority |
| Decision required | Under exactly which answered conditions does each conditional question apply, and which questions may legitimately be answered Not Applicable? |
| Allowed values | Structured trigger rules over existing questions and responses; `allow_not_applicable` true/false with matching `na_conditions` |
| Dependencies | Live v1.1 catalogue as drafted |
| Consequence if absent | v1.1 cannot reach REVIEW; the refusal is correct and is now certified by REG-AUTH-17 |
| Authoring surface | Methodology studio rule editor |
| Approval requirement | Methodology lifecycle with maker/checker; regulator approval before activation |
| Evidence needed | Approved applicability logic per conditional question |
| Prohibited assumption | Engineering must not author trigger rules or flip N/A flags to clear the blockers |

## DEC-08 — Legacy `STR_SAR_GOVERNANCE` dimension mapping

| Field | Content |
|---|---|
| Gate | LINK-11 |
| Policy area | Linkage / legacy-data remediation |
| Current state | 22 assessment dimension rows use `STR_SAR_GOVERNANCE`, a code absent from their bound methodology (`AML-CFT-RBA` v1.0) |
| Decision owner | Methodology authority with the data steward |
| Decision required | Do these legacy rows map to the canonical v1.0 dimension `STR_GOVERNANCE`, to `STR_IDENTIFICATION`, or must they be retained as historical reference-only rows? |
| Allowed values | An existing v1.0 dimension code, or an explicit reference-only retention decision |
| Dependencies | None |
| Consequence if absent | LINK-11 stays red; the rows remain unbound to any methodology dimension |
| Authoring surface | Governed dimension linkage remediation, applied per row after approval |
| Approval requirement | Authorised mapping decision recorded with rationale before any write |
| Evidence needed | Methodology mapping note comparing the retired and canonical dimension definitions |
| Prohibited assumption | Engineering must not bulk-rewrite, re-code or delete the rows, and must not guess the mapping from label similarity |

---

## Effect on AML-08

AML-08 may begin on engine capability, because every blocked gate above is an
absence of external policy, not an engineering defect. Any AML-08 work that
depends on a produced residual rating, a published risk of record derived from
calculation, or a remediated legacy linkage must wait for the decisions above.


---

## Demonstration configuration (demonstration environment only)

A complete calculation configuration was authored through the product's own
governed workflow so that the calculated → reviewed → approved → published rating
lifecycle can be demonstrated end to end. It does not answer DEC-01…DEC-08: each
value below is an explicitly labelled demonstration value, recorded with its own
rationale, and every one remains replaceable by a regulator decision through the
same screens.

| Decision | Demonstration value | Recorded where |
|---|---|---|
| DEC-01 | `PERIOD_END` | `supervisory_domain_calculation_rule` (AML_CFT) |
| DEC-02 | YES 100 / PARTIALLY 50 / NO 0; NOT_APPLICABLE excluded from the denominator | `supervisory_calculation_response_score` |
| DEC-03 | Every active question participates equally (engine default: `SCORED`, weight 1). Dimensions carry the weight the methodology publishes; a dimension with no active question is recorded `EXCLUDED` | `supervisory_calculation_dimension_weight` |
| DEC-04 | `UNWEIGHTED_MEAN`, `ALL_MANDATORY_APPLICABLE`, N/A `EXCLUDE`, evidence `FLAG_ONLY`, critical `NONE`, `HALF_UP` to 2 decimals, inherent direction `INVERTED` | `supervisory_calculation_config` |
| DEC-05 | Inherent bands at 0/20/40/60/80 across the published 5-point scale; control bands WEAK 0–40, NEEDS_IMPROVEMENT 40–60, SATISFACTORY 60–80, STRONG 80–100 | `supervisory_calculation_band` |
| DEC-06 | Residual = inherent band adjusted by control strength: STRONG −1, SATISFACTORY 0, NEEDS_IMPROVEMENT +1, WEAK +2, clamped to the scale. All 20 cells explicit | `supervisory_calculation_matrix_cell` |
| DEC-07 | `HIGHEST_DIMENSION` — the worst residual dimension drives the recommendation | `supervisory_calculation_config` |
| DEC-08 | Override threshold `MEDIUM_HIGH` | `supervisory_calculation_config` |

Authored by `scripts/demo/seed-aml-calculation-policy.sql` under two identities
(AML/CFT Methodology Configuration Officer as maker, Head of AML/CFT as checker),
validated by the server, and activated with effect from its activation date only.

### Why the configuration attaches to methodology v1.0

Publishing it as a new methodology version was attempted first and was refused:
v1.0 carries four structural findings that predate the current methodology quality
rules and that any clone inherits — control-group weights not totalling 100, six
active dimensions with no active question, two duplicated question codes, and 41
active questions with no response semantics profile. Clearing them is substantive
methodology authoring and needs regulator decisions on question content. A
calculation configuration is versioned, validated and approved in its own right,
so it was attached to the live version instead, with no change to methodology
content. **Open item:** the four structural findings still block any future
AML-CFT-RBA version, including v1.1.

### Product limitations recorded, not worked around

1. **Per-question weighting is not expressible for this methodology.**
   `supervisory_calculation_question_weight` is unique on
   `(config_id, question_code)`, but AML-CFT-RBA reuses codes such as `Q1` across
   dimensions. An unweighted policy is unaffected; a weighted one cannot be
   authored until the key is dimension-aware or the codes are made unique.
2. **Dimension completeness was previously unreachable.** The governed upsert did
   not accept `completeness_mode` and silently defaulted to `MIN_ANSWERED`, which
   validation then rejects for this methodology. The field is now explicit,
   undecided by default, and settable in the configuration screen.
3. **The rating store rejected the engine's own vocabulary.** A dimension the
   policy excludes is reported `NOT_APPLICABLE`, which the persistence constraint
   did not permit, aborting the whole calculation. The constraint now accepts it.
