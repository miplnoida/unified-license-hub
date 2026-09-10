# AML-12A — policy activation decision pack

Status: **AWAITING SIGNATURE.** Nothing in this document has been applied to the
live database. No live calculation policy exists, none has been activated, and no
value below has been selected by engineering.

Purpose: convert the eight open decisions already recorded in
`AML-calculation-policy-decision-register.md` into a signable form, and record
the exact governed activation sequence proved by the AML12DRYRUN rehearsal.

Naming: the decision identifiers `DEC-01` … `DEC-08` are used exactly as the
register defines them. No decision has been renamed, merged or split. One
discrepancy against a sibling document is reported in section 5.

## 0. Live facts this pack is built on (measured, not assumed)

| Fact | Value |
|---|---|
| Live calculation policies (`supervisory_calculation_config`) | 0 |
| Live ACTIVE calculation policies | 0 |
| AML/CFT effective-date rules (`supervisory_domain_calculation_rule`) | 0 |
| Live inherent/control band rows | 0 |
| Live residual matrix cells | 0 |
| Live response-score rows | 0 |
| Live materiality rules | 0 |
| `AML-CFT-RBA` v1.0 | ACTIVE / REGULATOR_AUTHORED — 41 active questions, 26 dimensions (6 inherent, 20 control), 0 fact requirements |
| `AML-CFT-RBA` v1.1 | DRAFT / MIPL_REFERENCE — 70 active questions, 26 dimensions (6 inherent, 20 control), 87 fact requirements |
| Published rating scale (both versions) | `LOW`, `MODERATE`, `MEDIUM_HIGH`, `HIGH`, `SEVERE` |
| Published question responses (both versions) | `YES`, `PARTIALLY`, `NO`, `NOT_APPLICABLE` |
| Control-effectiveness scale published in the live methodology | none — `definition->control_scale` is absent on v1.0 and v1.1 |
| Canonical AML risk digest | `8385b6c8f7ba2b4102ab054c8f5ac686` (21 AML/CFT rows) |
| LINK-11 legacy rows | 22 `supervisory_assessment_dimension` rows coded `STR_SAR_GOVERNANCE` |

Consequence of the two zero rows above: **live calculation of an AML/CFT
assessment is impossible today**, and it stays impossible until DEC-01 … DEC-06
are signed. The server returns `NOT_CALCULABLE` and names the missing decision.

Additional blocker discovered while assembling this pack: the live methodology
publishes an inherent rating scale but **no control-effectiveness scale**, and
v1.0 publishes **no fact requirements**. Both are methodology-authority gaps, so
DEC-05 (control bands) and the fact-transformation part of DEC-04 cannot even be
authored against v1.0 until the methodology publishes those objects. This is
recorded, not resolved.

---

## 1. DEC-01 — effective-date rule for AML/CFT

| Field | Content |
|---|---|
| Decision ID | DEC-01 |
| Existing canonical ID | DEC-01 (unchanged) |
| Policy area | Calculation as-of date |
| Exact scope | Domain `AML_CFT`, all assessments, all versions |
| Affected questions / dimensions / facts | All 41 live v1.0 questions and all 26 dimensions — the rule decides which policy version and which recorded values a calculation reads |
| Exact live codes and counts | `supervisory_domain_calculation_rule` rows for `AML_CFT` = 0 |
| Current state | Absent. `supervisory_calc_compute` returns `NOT_CALCULABLE` / `NO_EFFECTIVE_DATE_RULE` |
| Available choices (server vocabulary) | `EXECUTION_DATE`, `ASSESSMENT_DATE`, `PERIOD_END`, `TRIGGER_DATE`, `EXPLICIT_AS_OF` |
| Dependencies | None — first in the chain |
| Validation rules | `supervisory_domain_calc_rule_chk`; rationale ≥ 10 characters; recorded through `supervisory_domain_calculation_rule_set` |
| Consequence | Signed: configuration resolution becomes possible. Unsigned: every AML/CFT calculation stays `NOT_CALCULABLE` and DEC-02 … DEC-06 cannot take effect |
| Existing reference value | The AML06CERT and AML12DRYRUN rehearsals use `EXECUTION_DATE` — **rehearsal fixture only, not adopted, not a recommendation** |
| Decision owner | Regulator / methodology authority |
| Required rationale | The methodology instrument or supervisory manual clause fixing the reference date |
| Approval | `aml_supervision.manage_config`; recorded rationale |
| Selected value | |
| Approved by | |
| Approval date | |

## 2. DEC-02 — question participation and response scores

| Field | Content |
|---|---|
| Decision ID | DEC-02 |
| Existing canonical ID | DEC-02 (unchanged) |
| Policy area | Response scores and question participation |
| Exact scope | Every active question of the methodology the policy is written for |
| Affected questions | 41 active v1.0 questions (70 if written for v1.1) |
| Exact live codes and counts | Responses to score: `YES`, `PARTIALLY`, `NO`, `NOT_APPLICABLE`. Live scored responses = 0. Live participation rows = 0 |
| Current state | Absent — no response carries a numeric meaning and no question carries a participation decision |
| Available choices | Participation ∈ `SCORED`, `EXCLUDED`. Score per response: numeric 0–100, or "excluded from denominator" |
| Dependencies | DEC-01 |
| Validation rules | `scqw_participation`; `scqw_weight` (> 0 when present); every permitted response must be scored or explicitly excluded; participation must cover **every** active question, else "every active methodology question needs a participation decision" |
| Consequence | Signed: dimension scores become computable. Unsigned: the policy cannot pass validation and cannot reach REVIEW |
| Existing reference value | v1.1 reference design carries indicative response weights — **reference only, not adopted** |
| Decision owner | Methodology authority |
| Required rationale | The approved scoring schedule per question |
| Approval | Maker `aml_supervision.manage_config`, then a different checker |
| Selected value | |
| Approved by | |
| Approval date | |

## 3. DEC-03 — question and dimension weights

| Field | Content |
|---|---|
| Decision ID | DEC-03 |
| Existing canonical ID | DEC-03 (unchanged) |
| Policy area | Weights and dimension sides |
| Exact scope | Question weight within its dimension; dimension weight and contribution side within the policy |
| Affected dimensions | 26 live dimensions (6 `INHERENT_RISK`, 20 `CONTROL_EFFECTIVENESS`) |
| Exact live codes and counts | Live dimension-weight rows = 0; live question-weight rows = 0; v1.1 dimension weights do not total 100 per group (`DIMENSION_WEIGHT_SUM`) |
| Current state | Absent for calculation. The methodology-level v1.1 weight sum is a separate blocking finding |
| Available choices | Contribution ∈ `INHERENT`, `CONTROL`, `EXCLUDED`; weight = any positive number; the policy may reassign a dimension to a side other than its methodology default |
| Dependencies | DEC-02 |
| Validation rules | `scdw_side`, `scdw_weight` (> 0); contribution must cover every published dimension; neither the inherent nor the control side may end up empty; `supervisory_methodology_validate` separately requires each methodology group to sum to 100 |
| Consequence | Signed: both sides aggregate. Unsigned: the policy fails validation and v1.1 cannot reach REVIEW |
| Existing reference value | v1.1 draft weights exist and do not currently sum to 100 — **reference only, not adopted** |
| Decision owner | Methodology authority |
| Required rationale | The approved weighting schedule |
| Approval | Maker/checker on the methodology and on the calculation policy |
| Selected value | |
| Approved by | |
| Approval date | |

## 4. DEC-04 — aggregation, completeness, N/A handling and fact transformations

| Field | Content |
|---|---|
| Decision ID | DEC-04 |
| Existing canonical ID | DEC-04 (unchanged) |
| Policy area | Aggregation parameters, minimum completeness, missing-fact handling, fact transformations and thresholds |
| Exact scope | Every parameter of `supervisory_calculation_config`, plus one transformation rule per fact the policy reads |
| Affected facts | v1.0 publishes **0** fact requirements; v1.1 publishes 87 |
| Exact live codes and counts | All parameters NULL; live fact rules = 0; live fact thresholds = 0 |
| Current state | Absent. Validation answers "the … has not been decided" for each NULL parameter |
| Available choices | `aggregation_method` ∈ `UNWEIGHTED_MEAN`, `WORST_RESPONSE` · `completeness_mode` ∈ `MIN_ANSWERED`, `ALL_MANDATORY_APPLICABLE` · `min_answered_questions` ≥ 0 · `na_denominator_handling` ∈ `EXCLUDE`, `INCLUDE_AS_ZERO`, `INCLUDE_AS_FULL` · `evidence_insufficiency_handling` ∈ `FLAG_ONLY`, `NOT_CALCULABLE`, `CAP_AT_MIDPOINT` · `critical_question_handling` = `NONE` (only implemented value) · `rounding_mode` ∈ `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEILING`, `NONE` · `rounding_decimals` 0–4 · `inherent_direction` ∈ `DIRECT`, `INVERTED` · fact `data_type` ∈ `NUMERIC`, `PERCENTAGE`, `RATIO`, `COUNT`, `AMOUNT`, `BOOLEAN` · fact `direction` ∈ `HIGHER_IS_HIGHER_RISK`, `LOWER_IS_HIGHER_RISK` · fact `missing_handling` ∈ `NOT_CALCULABLE`, `EXCLUDE`, `TREAT_AS_HIGHEST_RISK` |
| Dependencies | DEC-02, DEC-03 |
| Validation rules | No column defaults — every parameter must be stated. A ratio, percentage or amount rule must state a unit, and that unit must equal the methodology fact definition. Each fact rule needs at least one threshold band; threshold bands may not overlap or leave a gap. A fact rule that targets a dimension must name a published dimension |
| Consequence | Signed: the engine can aggregate, round and handle gaps deterministically. Unsigned: no configuration reaches `ACTIVE` |
| Existing reference value | Rehearsal fixtures use `UNWEIGHTED_MEAN` / `EXCLUDE` / `FLAG_ONLY` / `HALF_UP` / 2 / `DIRECT` — **rehearsal only, not adopted** |
| Decision owner | Regulator / methodology authority |
| Required rationale | The approved calculation methodology text |
| Approval | Maker/checker, then approval before activation |
| Selected value | |
| Approved by | |
| Approval date | |

## 5. DEC-05 — inherent bands, control bands and the residual matrix

| Field | Content |
|---|---|
| Decision ID | DEC-05 |
| Existing canonical ID | DEC-05 (unchanged) |
| Policy area | Score-to-rating bands and the residual matrix |
| Exact scope | One contiguous band set per side, and one residual rating per inherent × control cell |
| Affected dimensions / facts | All scored dimensions on both sides; the residual rating that AML-07 may later publish |
| Exact live codes and counts | Live band rows = 0; live matrix cells = 0. Inherent vocabulary = `LOW`, `MODERATE`, `MEDIUM_HIGH`, `HIGH`, `SEVERE`. Control vocabulary = **not published by the live methodology** |
| Current state | Absent, and the control side additionally has no published vocabulary to band against |
| Available choices | Band codes restricted to the published scales; ranges within 0–100; residual rating restricted to the published rating scale |
| Dependencies | DEC-02, DEC-03, DEC-04, plus publication of a control-effectiveness scale by the methodology authority |
| Validation rules | Bands must cover every published rating, start at 0, be contiguous with no gap or overlap, reach 100, and respect the configured precision. The matrix must publish **every** inherent × control cell |
| Consequence | Signed: a residual rating can be produced. Unsigned: dimensions stay `NOT_CALCULABLE` and AMLH-09 stays red |
| Existing reference value | The rehearsal uses a 5-band inherent set, a 2-band control set and 10 matrix cells — **rehearsal only, not adopted** |
| Decision owner | Regulator |
| Required rationale | The published risk-rating scale and residual matrix |
| Approval | Regulator approval recorded in the approval register |
| Selected value | |
| Approved by | |
| Approval date | |

## 6. DEC-06 — materiality rules and the recommendation policy

| Field | Content |
|---|---|
| Decision ID | DEC-06 |
| Existing canonical ID | DEC-06 (unchanged) |
| Policy area | Materiality and recommendation semantics |
| Exact scope | Named materiality rules over facts or dimensions, and the recommendation label |
| Affected facts / reports | Any fact a materiality rule reads; the recommended rating shown to reviewers and counted in portfolio reporting |
| Exact live codes and counts | Live materiality rules = 0; `recommendation_policy` NULL |
| Current state | The governed surface exists and holds no approved value |
| Available choices | `comparator` ∈ `GTE`, `GT`, `LTE`, `LT` · `adjustment_kind` ∈ `FLOOR_AT_BAND`, `NO_ADJUSTMENT` · `recommendation_policy` ∈ `WEIGHTED_SCORE`, `HIGHEST_DIMENSION`, `WEIGHTED_WITH_THRESHOLD` (labels whose semantics are implemented) |
| Dependencies | DEC-05 |
| Validation rules | Rationale ≥ 10 characters; a `FLOOR_AT_BAND` rule must name the band to floor at; a rule that reads a fact requires a transformation rule for that fact; `WEIGHTED_WITH_THRESHOLD` requires a threshold rating |
| Consequence | Signed: materiality-qualified recommendations become available. Unsigned: only the implemented default semantics apply and no materiality qualification exists |
| Existing reference value | Rehearsal rule `GTE 95% → FLOOR_AT_BAND SEVERE` — **rehearsal only, not adopted** |
| Decision owner | Regulator |
| Required rationale | The supervisory policy defining materiality |
| Approval | Approved policy record with rationale |
| Selected value | |
| Approved by | |
| Approval date | |

## 7. DEC-07 — conditional-question triggers and N/A configuration for v1.1

| Field | Content |
|---|---|
| Decision ID | DEC-07 |
| Existing canonical ID | DEC-07 (unchanged) |
| Policy area | Question applicability |
| Exact scope | Conditional questions of `AML-CFT-RBA` v1.1 and their Not-Applicable configuration |
| Affected questions | Conditional questions within the 70 active v1.1 questions |
| Exact live codes and counts | Findings `CONDITIONAL_RULE_MISSING` and `INVALID_NA_CONFIGURATION` are raised by `supervisory_methodology_validate` |
| Current state | No executable active `TRIGGER` rule; some questions carry `na_conditions` while `allow_not_applicable` is false |
| Available choices | Structured trigger rules over existing questions and their published responses; `allow_not_applicable` true/false with matching `na_conditions` |
| Dependencies | The v1.1 catalogue as drafted |
| Validation rules | Every conditional question needs an active `TRIGGER` rule; `na_conditions` are only valid when `allow_not_applicable` is true |
| Consequence | Signed: v1.1 can reach REVIEW. Unsigned: the refusal stands and is certified as correct by AML-02 REG-AUTH-17 |
| Existing reference value | The v1.1 reference design describes intended applicability logic — **reference only, not adopted** |
| Decision owner | Methodology authority |
| Required rationale | Approved applicability logic per conditional question |
| Approval | Methodology maker/checker, then regulator approval before activation |
| Selected value | |
| Approved by | |
| Approval date | |

## 8. DEC-08 — legacy `STR_SAR_GOVERNANCE` dimension mapping

| Field | Content |
|---|---|
| Decision ID | DEC-08 |
| Existing canonical ID | DEC-08 (unchanged) |
| Policy area | Linkage / legacy-data remediation |
| Exact scope | 22 `supervisory_assessment_dimension` rows coded `STR_SAR_GOVERNANCE` |
| Affected questions / facts / reports | 0 question responses, 0 weights; dimension-coverage reporting shows an unbound code |
| Exact live codes and counts | 22 rows, all with `methodology_dimension_id` NULL, all in group `CONTROL_EFFECTIVENESS`, all bound to `AML-CFT-RBA` v1.0 |
| Current state | Orphaned: the code exists in neither v1.0 nor v1.1 |
| Available choices | An existing v1.0 dimension code, or an authorised reference-only retention decision |
| Dependencies | None |
| Validation rules | Remediation applied per row after approval; no bulk rewrite, no inference from label similarity |
| Consequence | Signed: LINK-11 can close. Unsigned: LINK-11 stays red and the rows stay unbound |
| Existing reference value | `STR_GOVERNANCE` and `STR_IDENTIFICATION` exist in both versions and are the only technically valid targets — **candidates only, not adopted** |
| Decision owner | Methodology authority with the data steward |
| Required rationale | A mapping note comparing the retired and canonical dimension definitions |
| Approval | Authorised mapping decision recorded before any write |
| Selected value | |
| Approved by | |
| Approval date | |

**Reported discrepancy.** `AML-legacy-dimension-link-remediation-proposal.md`
records "Residual ratings recorded: 0" for these rows. Re-measured today, all 22
rows **do** carry an officer-recorded `residual_rating` (approved: 17 HIGH, 1 LOW,
1 MODERATE; draft 1 HIGH; submitted 1 HIGH; superseded 1 HIGH). They still carry
no question responses and no weights, and none of these ratings was produced by
the calculation engine. The disposition options are unaffected, but the sign-off
must be taken on the corrected facts, so DEC-08 is treated as touching rated
historical rows rather than wholly unrated ones.

---

## 9. Neutral validation summary — what each decision means in plain language

**DEC-01.** The regulator decides which date a calculation speaks as of. The
system uses it to pick which approved policy and which recorded values apply.
Engineering cannot choose it because it changes which supervisory period a rating
belongs to. Unanswered: nothing calculates at all.

**DEC-02.** The regulator decides which questions count and what each answer is
worth. The system turns answers into dimension scores with it. Engineering cannot
choose it because a score is a supervisory judgement, not arithmetic. Unanswered:
the policy fails validation.

**DEC-03.** The regulator decides how much each question and each dimension
counts, and whether a dimension describes inherent risk or control strength. The
system aggregates both sides with it. Engineering cannot choose it because
weighting *is* the methodology. Unanswered: no side can be aggregated, and v1.1
cannot progress.

**DEC-04.** The regulator decides how scores combine, how much completeness is
enough, and what happens when an answer is Not Applicable, evidence is thin, or a
figure is missing. The system needs every one of these to be deterministic and
reproducible. Engineering cannot choose them because each one is a tolerance for
supervisory uncertainty. Unanswered: no policy can be activated.

**DEC-05.** The regulator decides which score ranges are which rating, and which
residual rating follows from each inherent-and-control pairing. The system
converts numbers into the rating of record with it. Engineering cannot choose it
because it sets the regulatory consequence of a score. Unanswered: no residual
rating can ever be produced.

**DEC-06.** The regulator decides what counts as material and how the overall
recommendation is framed. The system applies it after banding. Engineering cannot
choose it because materiality is a supervisory threshold. Unanswered: only the
implemented default recommendation semantics apply.

**DEC-07.** The methodology authority decides when each conditional question
applies and which questions may be answered Not Applicable. The system uses it to
build each assessment's question set. Engineering cannot author the rules because
they define scope of supervision. Unanswered: v1.1 stays a draft, correctly.

**DEC-08.** The methodology authority and data steward decide what to do with 22
historical rows carrying a retired dimension code. The system either rebinds them
to a published dimension or records them as reference-only. Engineering cannot
choose because a mapping restates historical supervisory findings. Unanswered:
LINK-11 stays red; nothing else breaks.

No rehearsal or reference value in this pack is presented as a recommendation. No
v1.1 reference value has been copied into live policy.

---

## 10. LINK-11 sign-off — 22 orphaned `STR_SAR_GOVERNANCE` links

Treated separately from DEC-01 … DEC-08. No option has been selected and no row
has been changed.

Shared facts for all 22 rows: source methodology `AML-CFT-RBA` v1.0 (ACTIVE,
REGULATOR_AUTHORED) · source code `STR_SAR_GOVERNANCE` · current target: none
(`methodology_dimension_id` IS NULL — invalid/orphaned) · dimension group
`CONTROL_EFFECTIVENESS` · affected questions: 0 · affected facts: 0 · affected
reports: dimension-coverage listings only · possible canonical targets (both
technically valid, both published in v1.0 and v1.1): `STR_GOVERNANCE` (STR/SAR
Governance, Quality and Timeliness) or `STR_IDENTIFICATION` (STR/SAR
Identification and Escalation) · disposition options for every row: `MAP`,
`RETAIN_AS_LEGACY`, `RETIRE`, `REQUIRES_METHODOLOGY_REDESIGN`.

| # | Assessment status | Unanswered? | Unrated? | Recorded rating | Selected disposition | Target code | Approved by | Date |
|---|---|---|---|---|---|---|---|---|
| 1 | approved | yes (0 responses) | no | HIGH | | | | |
| 2 | approved | yes | no | HIGH | | | | |
| 3 | approved | yes | no | HIGH | | | | |
| 4 | approved | yes | no | HIGH | | | | |
| 5 | approved | yes | no | HIGH | | | | |
| 6 | approved | yes | no | HIGH | | | | |
| 7 | approved | yes | no | HIGH | | | | |
| 8 | approved | yes | no | HIGH | | | | |
| 9 | approved | yes | no | HIGH | | | | |
| 10 | approved | yes | no | HIGH | | | | |
| 11 | approved | yes | no | HIGH | | | | |
| 12 | approved | yes | no | HIGH | | | | |
| 13 | approved | yes | no | HIGH | | | | |
| 14 | approved | yes | no | HIGH | | | | |
| 15 | approved | yes | no | HIGH | | | | |
| 16 | approved | yes | no | HIGH | | | | |
| 17 | approved | yes | no | HIGH | | | | |
| 18 | approved | yes | no | LOW | | | | |
| 19 | approved | yes | no | MODERATE | | | | |
| 20 | draft | yes | no | HIGH | | | | |
| 21 | submitted | yes | no | HIGH | | | | |
| 22 | superseded | yes | no | HIGH | | | | |

Row identity is deliberately not printed here: remediation is applied per row
through the governed linkage operation, which resolves the row from the approved
mapping decision, so no assessment or entity identifier needs to circulate in a
sign-off document.

---

## 11. Governed activation order (actual operation names and permissions)

Every step below runs under `aml_supervision.manage_config` (or the equivalent
`supervisory_spine.manage_config` / `prudential_supervision.manage_config`),
except where a second person is named. All were exercised by the rehearsal.

| # | Step | Operation |
|---|---|---|
| 0 | Record the domain effective-date rule (DEC-01) | `supervisory_domain_calculation_rule_set(domain, rule, rationale)` |
| 1 | Create the draft policy for the methodology | `supervisory_calculation_config_upsert(methodology_id, payload)` — new rows are always `DRAFT` |
| 2 | Record response scores (DEC-02) | `supervisory_calculation_response_scores_set(config_id, rows)` |
| 3 | Record question participation and weights (DEC-02, DEC-03) | `supervisory_calculation_question_weights_set(config_id, rows)` |
| 4 | Record dimension sides, weights and minimum completeness (DEC-03, DEC-04) | `supervisory_calculation_dimension_weights_set(config_id, rows)` |
| 5 | Record aggregation, completeness, N/A, evidence, rounding and direction parameters (DEC-04) | `supervisory_calculation_config_upsert(..., config_id)` |
| 6 | Record fact transformations and threshold bands (DEC-04) | `supervisory_calculation_fact_rules_set(config_id, rows)` |
| 7 | Record inherent and control bands (DEC-05) | `supervisory_calculation_bands_set(config_id, 'INHERENT'|'CONTROL', rows)` |
| 8 | Record the residual matrix (DEC-05) | `supervisory_calculation_matrix_set(config_id, cells)` |
| 9 | Record materiality rules (DEC-06) | `supervisory_calculation_materiality_set(config_id, rows)` |
| 10 | Validate the complete policy | `supervisory_calculation_config_validate(config_id)` → `{ok, problems}`; `supervisory_calculation_policy_problems(config_id)` for detail |
| 11 | Submit for review | `supervisory_calculation_config_lifecycle(config_id,'REVIEW', rationale)` — refused unless validation is clean |
| 12 | Maker-checker approval | `supervisory_calculation_config_lifecycle(config_id,'APPROVED', rationale)` — **must be a different person** from the submitter |
| 13 | Activate | `supervisory_calculation_config_lifecycle(config_id,'ACTIVE', rationale)` — requires `APPROVED` and an effective-from date; supersedes any predecessor |
| 14 | Calculate a controlled assessment | `supervisory_calc_compute(assessment_id)` (read-only) |
| 15 | Record the run and its trace | `supervisory_assessment_calculation_run_record(assessment_id, reason)` — append-only |
| 16 | Verify the trace | inspect the recorded run: `config_id`, `inputs`, `policy_snapshot`, `inputs_hash`, `result_hash`, `engine_version`, `as_of`, per-question scores, per-fact bands, parameters, materiality |
| 17 | Publication remains a separate AML-07 decision | `supervisory_assessment_publish_risk_of_record(assessment_id, reason)` — only after AML-07 review and approval; calculation never publishes |
| 18 | Rollback / recovery path | Before activation: `…_lifecycle(config_id,'RETURNED', rationale)` returns the policy to DRAFT. After activation: the policy is immutable — issue a successor version with a later effective-from, or `RETIRED` only while it has produced no outcomes |

---

## 12. Rollback-only activation rehearsal (AML12DRYRUN)

Script: `scripts/verify-aml12-activation-rehearsal.sql` — `ON_ERROR_STOP`, one
transaction, final `ROLLBACK`, plus a post-rollback survivor check. Result:
**18 gates, 18 passed, 0 failed.**

| Gate | Proves |
|---|---|
| DRY-01 | A policy is created only through the governed operation, and starts as DRAFT |
| DRY-02 | An incomplete policy is reported (4 problems) and refused for submission |
| DRY-03 | Zero and negative weights are refused (3/3) |
| DRY-04 | A band code outside the published rating vocabulary is refused |
| DRY-05 | Band gaps and overlaps are both refused |
| DRY-06 | Scores, bands, participation, dimension sides, fact rules and materiality are authored through governed setters |
| DRY-07 | A policy with no residual matrix cannot be submitted |
| DRY-08 | A fact-rule unit that disagrees with the methodology definition is refused |
| DRY-09 | Fact threshold gaps and overlaps are both refused |
| DRY-10 | A complete policy validates, reaches REVIEW, and self-approval is refused |
| DRY-11 | Approval and activation are refused without configuration authority (2/2) |
| DRY-12 | A second person approves and activates, with a recorded rationale and lifecycle event |
| DRY-13 | An activated policy is immutable (3/3 edit attempts refused) |
| DRY-14 | The synthetic assessment calculates reproducibly: inherent SEVERE / control WEAK → residual HIGH, identical on repeat |
| DRY-15 | The recorded run names the policy, snapshots inputs and policy, and traces every question, fact, parameter and materiality decision |
| DRY-16 | Calculation publishes nothing; publishing an unapproved assessment is refused — the risk of record stays an AML-07 decision |
| DRY-17 | The canonical risk digest, v1.0/v1.1 state, live policy count and the 22 LINK-11 rows are untouched |
| DRY-18 | Zero AML12DRYRUN rows survive the rollback; live calculation policies remain 0 and no AML/CFT effective-date rule exists |

Every value used by the rehearsal is synthetic. The rehearsal proves capability
only and defines no live policy.

Regression run alongside: `scripts/verify-aml-calculation-policy-engine.sql` —
50 gates, 50 passed, 0 failed.

## 13. Preservation

| Claim | Value |
|---|---|
| Live policy created | NO |
| Live policy activated | NO |
| Live calculation run created | NO |
| Risk rating changed | NO |
| Risk history changed | NO |
| Assessment changed | NO |
| v1.0 changed | NO |
| v1.1 changed or activated | NO |
| LINK-11 changed | NO |
| AML data deleted | NO |
| Regulator record changed | NO |
| Canonical risk digest | `8385b6c8f7ba2b4102ab054c8f5ac686` (unchanged) |
