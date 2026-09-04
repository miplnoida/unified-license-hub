# AML/CFT supervisory calculation policy — decision pack

Status: **NOT READY FOR SUPERVISORY APPROVAL — blocked on decision I (inherent
question polarity is mixed) and on the assessment→methodology dimension link
defect in section 5.**
Wave type: **policy design / documentation + verifier correctness only.**

Baseline: HEAD `550a208fc528a7e0d42a32429897bedd0ead269a` ("Rebased AML
calculation policy"). Migration head at publication:
`20260904_aml_calc_outcome_contract` (canonical calculation-outcome contract and
non-calculable provenance retention; no policy content).

Nothing in this document has been written to the database as AML/CFT policy. In
this wave **no** AML/CFT effective-date rule was recorded, **no** calculation
configuration was created, **no** response score, band or residual matrix cell
was entered, **no** configuration was submitted, approved or activated, **no**
backfill was run, **no** approved assessment or judged rating was modified, and
the AML full module is **not** marked certified.


This document **supersedes and replaces** the previous version of itself
(the "configuration decision table" that predated the final calculation
contract). Obsolete terminology from that version is listed and retired in
section B rather than silently carried forward.

---

## A. Current methodology factual baseline

Read from the live database, unaltered.

### A.1 Methodology record

| Item | Value |
| --- | --- |
| Id | `1e248dc0-c559-48d7-bcf3-70d6ec5db99a` |
| Code | `AML-CFT-RBA` |
| Version | `1.0` |
| Status | `ACTIVE` |
| Effective window | `effective_from = 2026-01-01`, `effective_to = NULL` (open) |
| `definition` | `{"control_scale":["STRONG","SATISFACTORY","NEEDS_IMPROVEMENT","WEAK"],"residual_matrix":"inherent x control","rating_scale_ref":"supervisory_rating_scale"}` |
| `scoring_scale` | LOW(1), MODERATE(2), MEDIUM_HIGH(3), HIGH(4), SEVERE(5) |
| `override_threshold` | `MEDIUM_HIGH` |
| `calculation_guidance` | "Weighted inherent risk is combined with weighted control effectiveness to recommend residual ML/TF risk. The recommendation is advisory only; the approved supervisory judgment is authoritative." |

A second, non-current record exists and is **not** the active methodology:
`AML_RBA` v1.0, id `e7d52276-d3b1-4c86-b2d7-ffc0909a42e0`, status `SUPERSEDED`,
`effective_to = 2026-09-02`, scale `LOW / MEDIUM / HIGH / CRITICAL`. Its
vocabulary must not be mixed into any configuration.

### A.2 Dimensions

26 active dimensions, no duplicate codes.

**Inherent — 6 dimensions, weights total 100.**

| Code | Label | Weight | Active questions |
| --- | --- | --- | --- |
| `CUSTOMER_RISK` | Customer Risk | 20 | 2 |
| `GEOGRAPHIC_RISK` | Geographic Risk | 18 | 2 |
| `PRODUCTS_SERVICES_RISK` | Products and Services Risk | 18 | 2 |
| `TRANSACTION_PROFILE_RISK` | Transaction and Activity Profile Risk | 18 | 2 |
| `DELIVERY_CHANNEL_RISK` | Delivery Channel Risk | 14 | 2 |
| `BUSINESS_MODEL_RISK` | Ownership and Business Model Risk | 12 | 2 |

**Control — 20 dimensions, weights total 117 (not 100).**

| Code | Label | Weight | Active questions |
| --- | --- | --- | --- |
| `TRANSACTION_MONITORING` | Transaction Monitoring | 9 | 3 |
| `GOVERNANCE` | Governance, Board and Senior Management | 8 | 2 |
| `CDD_KYC` | Customer Due Diligence / KYC | 8 | 2 |
| `ENTERPRISE_RISK_ASSESSMENT` | Enterprise ML/TF Risk Assessment | 7 | 2 |
| `MLRO_FUNCTION` | MLRO and Compliance Function | 7 | 2 |
| `STR_IDENTIFICATION` | STR/SAR Identification and Escalation | 7 | 2 |
| `POLICIES_PROCEDURES` | Policies, Procedures and Internal Controls | 6 | 2 |
| `BENEFICIAL_OWNERSHIP` | Beneficial Ownership Identification | 6 | 2 |
| `EDD` | Enhanced Due Diligence | 6 | 2 |
| `ALERT_INVESTIGATION` | Alert Investigation and Disposition | 6 | 2 |
| `STR_GOVERNANCE` | STR/SAR Governance, Quality and Timeliness | 6 | 2 |
| `PEP_CONTROLS` | PEP Identification and Controls | 5 | 2 |
| `SANCTIONS_CONTROLS` | Sanctions Screening Controls | 5 | 2 |
| `RECORD_KEEPING` | Record Keeping | 4 | 2 |
| `INDEPENDENT_TESTING` | Independent Testing / Internal Audit | 6 | **0** |
| `THIRD_PARTY_OVERSIGHT` | Agent, Intermediary and Third-Party Oversight | 5 | **0** |
| `TRAINING` | Employee Training and Awareness | 4 | **0** |
| `AML_DATA_QUALITY` | AML Data Quality | 4 | **0** |
| `MODEL_GOVERNANCE` | Monitoring Technology and Model Governance | 4 | **0** |
| `REMEDIATION_TRACKING` | Remediation and Issue Management | 4 | **0** |

Two facts here are decision-relevant and were absent from the superseded
document:

1. **Control weights sum to 117, not 100.** Any weighted policy must state how
   the denominator is formed.
2. **Six control dimensions carry no active questions** (combined weight 27 of
   117 = 23.1%). Under any response-driven calculation they are structurally
   **not calculable** until questions are added — which is a methodology content
   change, not a calculation-configuration change (see section 4 / D.3).

Dimension-level scoring configuration on all 26: `scoring_guidance` NULL,
`mandatory_questions` `[]`, `min_evidence_count` 1, `evidence_required` true.

### A.3 Questions

| Item | Value |
| --- | --- |
| Active questions | 41 (12 inherent, 29 control) |
| Response vocabulary | single vocabulary on all 41: `{YES, PARTIALLY, NO, NOT_APPLICABLE}` |
| `mandatory` | 41 of 41 |
| `requires_observation` | 41 of 41 |
| `requires_evidence` | 21 of 41 |
| `min_evidence_count` | 0 or 1 |
| `allow_not_applicable` | 41 of 41 |
| `na_requires_rationale` | 41 of 41 |
| Scoring | **none** — no score is published by the methodology for any response |

### A.4 Rating vocabularies (`supervisory_rating_scale`)

| Purpose | Codes (ordinal) |
| --- | --- |
| Risk rating (inherent, residual) | LOW(1), MODERATE(2), MEDIUM_HIGH(3), HIGH(4), SEVERE(5) |
| Control effectiveness | STRONG(11), SATISFACTORY(12), NEEDS_IMPROVEMENT(13), WEAK(14) |

### A.5 Calculation governance state

| Item | Value |
| --- | --- |
| `supervisory_domain_calculation_rule` | **0 rows** — no domain has a recorded effective-date rule |
| `supervisory_calculation_config` | **0 rows** — no configuration exists in any status |
| `supervisory_calculation_response_score` / `_band` / `_matrix_cell` | empty (no parent configuration) |
| Consequence | with no rule and no configuration, no AML/CFT assessment can be calculated at all; this is reported as `NO_EFFECTIVE_DATE_RULE` / `NO_CONFIGURATION`, never as a default rating |

### A.6 Recorded question responses (whole AML domain)

| Response | Count |
| --- | --- |
| `NO` | 820 |
| `PARTIALLY` | 123 |
| `YES` | 41 |
| `NOT_APPLICABLE` | **0** |

984 responses in total. No `NOT_APPLICABLE` response exists anywhere in the AML
domain today, so decision C has no effect on the current population — it is
still required because the vocabulary permits it and future assessments will use
it.

---

## B. Contradictions in the superseded decision document

Each item is now **obsolete** and must not be reused.

| # | Obsolete content | Status and replacement |
| --- | --- | --- |
| B1 | `HIGHEST_MATERIAL_DIMENSION` (and the phrase "highest material dimension") | **Retired.** Not a platform value. The only values accepted by `supervisory_calculation_config_policy_chk` are `WEIGHTED_SCORE`, `HIGHEST_DIMENSION`, `WEIGHTED_WITH_THRESHOLD`. `HIGHEST_DIMENSION` means: the **highest (worst) residual rating among calculable dimensions**. No materiality is computed or implied. The old string is actively refused (gate CALCG-20 asserts the rejection, which is why it still appears in `scripts/verify-aml-calculation-governance.sql` as a negative fixture). |
| B2 | "Weighted score with critical floor" / `WEIGHTED_WITH_CRITICAL_FLOOR`, recommended as option 3 | **Withdrawn.** No such policy value exists. |
| B3 | Critical-question floor assumptions ("whether `NO` on a designated critical question floors the dimension", "whether critical-question overrides apply") | **Withdrawn.** `supervisory_calculation_config_crit_chk` permits only `critical_question_handling = 'NONE'`. No question-level criticality metadata is published by the methodology, so no floor can be honestly evaluated. Decision G therefore has exactly one lawful value. |
| B4 | `WORST_OF_N` aggregation / recommendation | **Withdrawn.** Aggregation accepts only `UNWEIGHTED_MEAN` and `WORST_RESPONSE`. |
| B5 | "unweighted mean vs per-question weights" as an open decision | **Not an option.** No per-question weight exists in the schema and none was added. Weighting is dimension-level only. |
| B6 | "20 CONTROL (weights sum to 100)" | **Factually wrong.** Control weights sum to **117** (section A.2). |
| B7 | §4 "New `AML-CFT-RBA v1.1` created via `supervisory_methodology_new_version`" | **Obsolete instruction.** Calculation parameters are no longer stored on the methodology version. They live in `supervisory_calculation_config`, versioned by `config_version` against the existing approved methodology. See section 4. |
| B8 | Response-level requirement columns configured per response code ("observation required", "evidence required", "rationale required" in the scoring table) | **Removed.** `requires_observation`, `requires_evidence`, `requires_rationale` and `is_critical_floor` were dropped from the response-score store, setter, editor and approval diff. Those requirements are published by the **question**, not by the score row. A response score row now carries only `response_code`, `score`, `meaning`, `excluded_from_denominator`, `sort_order`. |
| B9 | Band ranges written as closed inclusive ranges (`0–19`, `20–39`, `85–100`, …) | **Obsolete notation.** Bands are stored and evaluated as **half-open `[min_score, max_score)`**, with the final band closing at 100. |
| B10 | "`NOT_APPLICABLE` excluded from numerator **and** denominator" stated as a fixed rule | **Now configurable.** `na_denominator_handling` ∈ `EXCLUDE`, `INCLUDE_AS_ZERO`, `INCLUDE_AS_FULL`. Decision C. |
| B11 | "`residual_matrix` replaces the descriptive string" in `methodology.definition` | **Obsolete.** The matrix lives in `supervisory_calculation_matrix_cell` (one row per inherent band × control band). `definition.residual_matrix` remains the descriptive label `"inherent x control"` and is not the calculation source. |
| B12 | Rounding described only as "half-up to one decimal" | **Now configurable.** `rounding_mode` ∈ `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEILING`, `NONE`; `rounding_decimals` 0–4. A missing mode or decimals raises `rounding_undecided` rather than defaulting. |
| B13 | Evidence insufficiency described only as "flagged in the trace" | **Now configurable.** `evidence_insufficiency_handling` ∈ `FLAG_ONLY`, `NOT_CALCULABLE`, `CAP_AT_MIDPOINT`. Decision F. |
| B14 | "AMLH-03 will be hardened…" written as future work | **Already delivered** in earlier waves; not an open item of this pack. |
| B15 | Statement that the effective-date rule is settled as execution date, "option E constrained to option A/B" | **Reopened as decision A.** No rule row exists in the database; the earlier text described intended behaviour of `supervisory_methodology_resolve`, not a recorded governed rule. The rule is now an explicit stored value in `supervisory_domain_calculation_rule`. |
| B16 | Silence on the six control dimensions with zero questions | **Corrected** in section A.2; it materially changes the backfill expectation. |

---

## C. Supervisory decision table

Every row below is **DECISION REQUIRED = YES**. Options listed are exactly the
values the platform accepts today; nothing else may be entered.

### A. Effective-date rule
- **Current platform options:** `EXECUTION_DATE`, `ASSESSMENT_DATE`, `PERIOD_END`, `TRIGGER_DATE`, `EXPLICIT_AS_OF` (one row per domain in `supervisory_domain_calculation_rule`; `supervisory_calc_as_of_for` coalesces any null source date to the execution date).
- **Recommended:** `ASSESSMENT_DATE`.
- **Rationale:** the calculation must be governed by the configuration in force when the supervisory decision was taken, which is the date the regulator can defend in an appeal. `assessment_date` is populated on all 21 approved AML assessments, and the function already coalesces to the execution date where it is null, so the rule cannot produce a null as-of date.
- **Alternative:** `EXECUTION_DATE` — simpler and never null, but ties the methodology parameters to record-creation mechanics rather than to the supervisory act. `PERIOD_END` is **not recommended**: it points at the reviewed period, so a 2026-executed reassessment of a 2025 period would resolve to 2025 and, with any configuration effective from 2026-01-01, would have **no in-force configuration** (see E.4).
- **Operational consequence:** one row, platform-wide per domain; every screen and the engine read the same value. Changing it later re-resolves which configuration applies to future calculations.

### B. Response scoring
Applies to the response codes actually published by `AML-CFT-RBA` v1.0 — and only those four.

| Response code | Options | Recommended |
| --- | --- | --- |
| `YES` | score 0–100, or `excluded_from_denominator` | **100** |
| `PARTIALLY` | score 0–100, or `excluded_from_denominator` | **50** |
| `NO` | score 0–100, or `excluded_from_denominator` | **0** |
| `NOT_APPLICABLE` | score 0–100, or `excluded_from_denominator` | **excluded** (see C) |

- **Rationale:** the questions are phrased as control-presence assertions, so a monotone 100 / 50 / 0 scale is the smallest defensible mapping, keeps `PARTIALLY` exactly midway (no hidden severity bias), and needs no per-question weighting the schema does not support.
- **Alternative:** `PARTIALLY = 40` (or lower), which treats a partially implemented control as closer to absent. This is a genuine supervisory severity choice, not a technical one; it shifts every control dimension score downward and will move band outcomes.
- **Operational consequence:** with the current population (820 `NO`, 123 `PARTIALLY`, 41 `YES`) the recommended scale produces low control scores across the estate, i.e. mostly weak control bands. The supervisory owner must be willing to accept that outcome, or revisit the demonstration answers — not the scale.

### C. N/A denominator treatment
- **Options:** `EXCLUDE`, `INCLUDE_AS_ZERO`, `INCLUDE_AS_FULL`.
- **Recommended:** `EXCLUDE`.
- **Rationale:** a control that does not apply to the entity's business is neither a failure nor an achievement; excluding it keeps the score comparable across differently shaped entities, and `na_requires_rationale` is already true on all 41 questions so each exclusion is justified on the record.
- **Alternative:** `INCLUDE_AS_ZERO` penalises non-applicability and would systematically understate narrow-business entities; `INCLUDE_AS_FULL` rewards it and can be gamed by over-claiming non-applicability.
- **Operational consequence:** none on the current population (0 `NOT_APPLICABLE` responses recorded); fully material for future assessments.

### D. Dimension aggregation
- **Options:** `UNWEIGHTED_MEAN`, `WORST_RESPONSE`.
- **Recommended:** `UNWEIGHTED_MEAN`.
- **Rationale:** dimensions hold 2–3 questions; the mean uses all published evidence and keeps the dimension score continuous, which is what banding needs. There is no per-question weight in the schema, so a weighted mean is not available.
- **Alternative:** `WORST_RESPONSE` — maximally conservative, but with only 2–3 questions per dimension a single `NO` collapses the whole dimension to 0 and destroys the ability to distinguish entities.
- **Operational consequence:** with 2-question dimensions the mean yields only a small set of possible values (0 / 25 / 50 / 75 / 100 under the recommended scores), so band edges must be chosen with those discrete values in mind (see J / K).

### E. Minimum answered questions
- **Options:** any integer ≥ 0 (`min_answered_questions`).
- **Recommended:** `1`.
- **Rationale:** the honest minimum — one applicable answered question is the least that can support a rating; anything lower would mean calculating from nothing.
- **Alternative:** `2` — raises confidence but makes the 2-question dimensions all-or-nothing and increases the not-calculable population.
- **Operational consequence:** at `1`, 58 of the 77 uncalculated approved dimensions become calculable and 19 remain `NOT_CALCULABLE` (no answers at all). No rating is invented for the 19.

### F. Insufficient-evidence treatment
- **Options:** `FLAG_ONLY`, `NOT_CALCULABLE`, `CAP_AT_MIDPOINT`.
- **Recommended:** `FLAG_ONLY`.
- **Rationale:** evidence sufficiency is a quality signal about the file, not a statement about the entity's risk. Flagging preserves the recommendation while making the weakness visible to the checker, and the judged rating remains authoritative.
- **Alternative:** `NOT_CALCULABLE` — defensible if the regulator wants an evidence-first discipline, but with `min_evidence_count = 1` on every dimension it would suppress recommendations broadly. `CAP_AT_MIDPOINT` is **not recommended**: it produces a number that no response actually supports.
- **Operational consequence:** under `FLAG_ONLY`, expect the flag on a large share of the backfilled cohort; the checker must be told the flag is expected and is not a calculation failure.

### G. Critical-question handling
- **Options:** `NONE` — and nothing else (`supervisory_calculation_config_crit_chk`).
- **Recommended:** `NONE`.
- **Rationale:** the methodology publishes no question-level criticality, so no floor could be applied without inventing metadata. The previously proposed critical-floor behaviour is withdrawn (B3) and is not on offer.
- **Alternative:** none available. If the regulator wants critical-question floors, that is a **methodology content change** (adding criticality to questions), which requires a new methodology version and re-approval — see section 4.
- **Operational consequence:** a single severe control failure influences the result only through the mean and the residual matrix.

### H. Rounding mode / decimal precision
- **Options:** `rounding_mode` ∈ `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEILING`, `NONE`; `rounding_decimals` 0–4.
- **Recommended:** `HALF_UP`, `1` decimal.
- **Rationale:** the conventional, explainable rule; one decimal is enough to separate the discrete means produced by 2–3-question dimensions without implying false precision. Banding is applied to the rounded value, so the rule must be recorded, not assumed.
- **Alternative:** `FLOOR` with 0 decimals is more conservative and simpler to explain to a licensee, at the cost of nudging every score toward the lower band.
- **Operational consequence:** the mode is mandatory — a missing mode or decimals raises `rounding_undecided` and blocks calculation rather than defaulting.

### I. Inherent-risk score direction — **BLOCKED, NOT RECOMMENDABLE**
- **Options:** `DIRECT`, `INVERTED` (one global value per configuration; there is no per-question polarity column).
- **Recommendation: none. Decision I cannot be taken as configured.** The polarity of the 12 published inherent questions is **mixed** (evidence: section 5A). Eleven questions read `YES` = the entity has identified / documented / kept proportionate its exposure — a *protective* condition, i.e. **less** inherent risk. One question, `BUSINESS_MODEL_RISK / Q1` ("Does the growth strategy or ownership structure introduce ML/TF risk not reflected in the entity's risk assessment?"), reads `YES` = a risk factor is **present**, i.e. **more** inherent risk.
- **Mathematical contract with the proposed scores (B: `YES`=100, `PARTIALLY`=50, `NO`=0):** `DIRECT` maps `YES`→100 and `NO`→0; `INVERTED` maps `YES`→0 and `NO`→100. `DIRECT` is consistent only where `YES` means more risk; `INVERTED` only where `YES` means a protective condition.
- **Consequence of the mix:** either global value mis-scores at least one question. `INVERTED` mis-scores `BUSINESS_MODEL_RISK / Q1` (a candid admission of unassessed structural risk would *reduce* the computed inherent score); `DIRECT` mis-scores the other eleven. No global value is truthful.
- **Resolution required before any configuration is approved — one of:**
  1. **Normalise the question wording through a new methodology version.** Re-word `BUSINESS_MODEL_RISK / Q1` so that `YES` is protective, consistent with the other eleven, then `INVERTED` is truthful. This is governed methodology *content*: it requires a new methodology version, maker/checker approval, and it changes what supervisors are asked. Existing assessments stay bound to their own version.
  2. **Introduce per-question polarity** in the calculation configuration (a schema and engine change: a polarity column on the response-score or question-scoring store, read per question instead of one `inherent_direction`). This keeps methodology content untouched but is a platform change, not a configuration decision.
- **Not acceptable:** selecting a global direction and accepting known mis-scoring on one question, or silently excluding that question from the calculation.


### J. Inherent-risk bands
- **Options:** any set of half-open `[min_score, max_score)` rows over the risk vocabulary LOW / MODERATE / MEDIUM_HIGH / HIGH / SEVERE, contiguous, non-overlapping, final band closing at 100.
- **Recommended** (assuming `INVERTED`, higher score = higher inherent risk):

| `[from, to)` | Band |
| --- | --- |
| `[0, 20)` | `LOW` |
| `[20, 40)` | `MODERATE` |
| `[40, 60)` | `MEDIUM_HIGH` |
| `[60, 80)` | `HIGH` |
| `[80, 100]` | `SEVERE` (final band closes at 100) |

- **Rationale:** five equal 20-point bands make the mapping explainable and audit-defensible; equal widths avoid the appearance of tuning edges to produce a desired estate distribution.
- **Alternative:** narrower `SEVERE` and `LOW` tails (e.g. `[0,15)` and `[85,100]`) reserve the extreme ratings for genuinely exceptional cases, at the cost of crowding the middle bands.
- **Operational consequence:** with 2-question inherent dimensions the achievable scores are 0 / 25 / 50 / 75 / 100, so under the recommended edges every inherent dimension lands in exactly one of LOW / MODERATE / MEDIUM_HIGH / HIGH / SEVERE with no dead band. Edge choices that fall inside those five values would make bands unreachable.

### K. Control-effectiveness bands
- **Options:** half-open `[min_score, max_score)` rows over the control vocabulary fixed by `definition.control_scale` — STRONG / SATISFACTORY / NEEDS_IMPROVEMENT / WEAK. No mixed vocabulary.
- **Recommended** (higher score = stronger control):

| `[from, to)` | Band |
| --- | --- |
| `[0, 50)` | `WEAK` |
| `[50, 70)` | `NEEDS_IMPROVEMENT` |
| `[70, 85)` | `SATISFACTORY` |
| `[85, 100]` | `STRONG` (final band closes at 100) |

- **Rationale:** `STRONG` requires materially all controls answered `YES`; a dimension that is at best half-implemented (score < 50) is `WEAK`. The 70 and 85 edges keep `SATISFACTORY` demanding rather than a default landing zone.
- **Alternative:** shifting the edges down (`WEAK` below 40, `STRONG` from 80) produces a more forgiving estate picture; shifting up produces a harsher one. This is a supervisory tolerance decision.
- **Operational consequence:** with 2-question control dimensions the achievable scores are 0 / 25 / 50 / 75 / 100 — so under the recommended edges `STRONG` requires 100 and 75 maps to `SATISFACTORY`. The 3-question dimension (`TRANSACTION_MONITORING`) also reaches 33.3 / 66.7 / 83.3. The owner should confirm that "both questions `YES`" is the intended bar for `STRONG`.

### L. Residual risk matrix
- **Options:** every inherent band × control band cell must be present and explicit — 5 × 4 = **20 rows** in `supervisory_calculation_matrix_cell`, each naming a residual rating from the risk vocabulary. The configuration cannot be submitted with a missing cell.
- **Recommended:**

| Inherent ↓ / Control → | `STRONG` | `SATISFACTORY` | `NEEDS_IMPROVEMENT` | `WEAK` |
| --- | --- | --- | --- | --- |
| `LOW` | `LOW` | `LOW` | `MODERATE` | `MEDIUM_HIGH` |
| `MODERATE` | `LOW` | `MODERATE` | `MEDIUM_HIGH` | `HIGH` |
| `MEDIUM_HIGH` | `MODERATE` | `MEDIUM_HIGH` | `HIGH` | `HIGH` |
| `HIGH` | `MEDIUM_HIGH` | `HIGH` | `HIGH` | `SEVERE` |
| `SEVERE` | `HIGH` | `HIGH` | `SEVERE` | `SEVERE` |

- **Rationale:** monotone in both directions (residual never improves as inherent rises or as control weakens); strong controls mitigate by at most one band and never below the risk-based floor implied by inherent risk; weak controls escalate but cannot exceed `SEVERE`.
- **Alternative:** allowing `STRONG` controls to mitigate by two bands (a more credit-giving stance), or refusing any mitigation of `SEVERE` inherent risk (a stricter stance). Both are legitimate; both change supervisory intensity allocation.
- **Operational consequence:** this grid, not the scores, is what most licensees will contest. Every cell is stored and shown in the calculation trace, so each one must be a conscious decision.

### M. Overall recommendation policy
- **Current platform options:** `WEIGHTED_SCORE`, `HIGHEST_DIMENSION`, `WEIGHTED_WITH_THRESHOLD` — and nothing else.
- **Recommended:** `HIGHEST_DIMENSION`.
- **Truthful description of `HIGHEST_DIMENSION`:** the overall recommendation is the **highest (worst) residual rating among the calculable dimensions**. No materiality or significance test is applied, and dimensions that are not calculable are simply absent from the comparison. The word "material" must not be used to describe it.
- **Weights are NOT irrelevant under `HIGHEST_DIMENSION`.** The earlier claim that this policy "does not depend on the dimension weights" is withdrawn as false. `HIGHEST_DIMENSION` applies no weights in the **final max/worst selection only**. The residual ratings it compares are produced by the matrix from the **overall weighted inherent band and the overall weighted control band** (section 5B), and those overall bands are weighted means of the calculable dimension scores. Changing dimension weights therefore changes the overall bands, the per-dimension residual cells and hence the selected worst rating. Weights still affect the outcome.
- **Rationale:** it is the prudentially conservative reading — an AML programme is not adequate because most dimensions are adequate — and it does not add a second weighted layer on top of the already weighted overall bands.
- **Alternative:** `WEIGHTED_SCORE` — closer to the methodology's own `calculation_guidance` wording, and it applies the dimension weights a second time, over the residual ordinals. `WEIGHTED_WITH_THRESHOLD` additionally requires decision N.
- **Operational consequence:** with the current answer population `HIGHEST_DIMENSION` will drive most entities to a high residual recommendation; expect a large override-review population (see E.5) and ensure supervisors understand the recommendation is advisory and the judged rating remains authoritative.


### N. Recommendation threshold
- **Options:** a rating code from the risk vocabulary — **required only if `WEIGHTED_WITH_THRESHOLD` is selected in M.**
- **Recommended:** **not applicable** under the recommended policy (`HIGHEST_DIMENSION`); leave `recommendation_threshold` unset.
- **Rationale:** recording a threshold that the selected policy never reads would be misleading configuration.
- **Alternative:** if the owner selects `WEIGHTED_WITH_THRESHOLD`, `MEDIUM_HIGH` is the natural starting value because it aligns with the threshold already recorded on the methodology.
- **Operational consequence:** decision N is conditional on M and must be revisited if M changes.

### O. Override notification / sign-off threshold
- **Options:** a rating code from the risk vocabulary (`override_threshold` on the configuration).
- **Recommended:** `MEDIUM_HIGH`.
- **Rationale:** it matches the `override_threshold` already recorded on the active methodology, so the configuration does not contradict approved methodology content. It is the point at which departing from the calculated recommendation carries real supervisory consequence.
- **Alternative:** `HIGH` — fewer sign-offs, lighter process, less scrutiny of downward overrides. `MODERATE` — more scrutiny, materially more review load.
- **Operational consequence:** every dimension where the judged rating differs from the server-calculated rating at or above this threshold requires a reason, `overridden_by`, `overridden_at` and an audit event. Given the expected backfill outcome, this drives the review queue size.

---

## 4. Does a new methodology version have to be created?

**No. A new methodology version is not required for this work.**

- Calculation parameters are no longer stored on the methodology. They live in
  `supervisory_calculation_config` (plus its response-score, band and matrix-cell
  children), keyed by `methodology_id` and versioned independently by
  `config_version` with its own `DRAFT → REVIEW → APPROVED → ACTIVE` lifecycle
  and effective window.
- Supplying decisions A–O therefore means creating **calculation configuration
  version 1 against the existing approved `AML-CFT-RBA` v1.0**. The methodology
  record is not edited, and existing assessments keep their `methodology_version`
  binding.
- Creating `AML-CFT-RBA v1.1` merely because a calculation configuration is being
  authored is **explicitly not justified** and must not be done.

A methodology version change becomes necessary only if governed **methodology
content** itself changes. Two candidate triggers exist in the current baseline,
and neither is part of this pack:

1. **The six control dimensions with zero questions** (`INDEPENDENT_TESTING`,
   `THIRD_PARTY_OVERSIGHT`, `TRAINING`, `AML_DATA_QUALITY`, `MODEL_GOVERNANCE`,
   `REMEDIATION_TRACKING`, combined weight 27/117). They can never be calculated
   from responses. Making them calculable requires adding questions → new
   methodology version.
2. **The control weight total of 117.** If the owner selects `WEIGHTED_SCORE` in M
   and wants the weights to sum to 100, that is a weight change → new methodology
   version. If instead the engine's stated normalisation over the actual weight
   total is accepted, no version change is needed.

Adding question-level criticality (to enable any critical-question behaviour)
would likewise be a methodology content change. It is not proposed.

---

## 5. Backfill impact analysis — read only

Nothing below was persisted. All figures are counts read from the live database.

### E.1 AML assessment population

| Status | Assessments | Dimensions | Dimensions with no calculated residual |
| --- | --- | --- | --- |
| `approved` | 21 | 80 | **77** |
| `superseded` | 3 | 19 | 5 |
| `submitted` | 1 | 4 | 4 |
| `draft` | 1 | 4 | 4 |

The governed backfill population is the **21 approved assessments / 80
dimensions**, of which **77 dimensions** carry no calculated residual rating —
this is exactly the AMLH-09 blocker. The 3 dimensions that already hold a
calculated residual all belong to `SUP-AML_CFT-2026-00130`
(`TRANSACTION_MONITORING` → moderate, `STR_GOVERNANCE` → moderate,
`CUSTOMER_RISK` → medium_high, none overridden, `calculation_status` NULL,
i.e. produced before the governed engine existed). They must be recalculated by
the engine, not trusted.

### E.2 Calculability of the 77

| Cohort | Dimensions | Expected calculation status |
| --- | --- | --- |
| Has at least one recorded question response | **58** | `CALCULATED` (assuming E = 1) |
| Has no recorded question response at all | **19** | `NOT_CALCULABLE` — no rating produced, no default invented |

(22 of the 80 approved dimensions have no responses; 3 of those are the legacy
pre-engine rows in E.1.)

Independently of the answer data, the six question-less control dimensions in
section A.2 are structurally not calculable wherever they appear on an
assessment; no configuration choice changes that.

### E.3 Which date resolves for each cohort

| Cohort | Assessments | `assessment_date` | `period_end` | As-of under `ASSESSMENT_DATE` | As-of under `EXECUTION_DATE` | As-of under `PERIOD_END` |
| --- | --- | --- | --- | --- | --- | --- |
| Approved, current review cycle | 21 | 2026-09-02 / 2026-09-03 (all populated) | all ≥ 2026-01-01 | 2026-09-02/03 | 2026-09-02/03 | 2026-01-01 … 2026-09-02 |
| Superseded 2025-period reassessment (`SUP-AML_CFT-2026-00356`) | 1 | 2026-09-03 | 2025-09-02 | 2026-09-03 | 2026-09-03 | **2025-09-02** |
| Draft without an assessment date (`…-00351`, `…-00131`) | 2 | NULL | 2026-09-02 | falls back to creation date 2026-09-03 | 2026-09-03 | 2026-09-02 |

### E.4 Would the recommended rule leave any assessment without an in-force configuration?

- Under the recommended `ASSESSMENT_DATE` rule, with a configuration effective
  from `2026-01-01` (or any date ≤ 2026-09-02): **no. All 21 approved
  assessments resolve to an in-force configuration.** The two drafts with a null
  assessment date coalesce to their creation date and also resolve.
- Under `EXECUTION_DATE`: same outcome — no gap.
- Under `PERIOD_END`: **one gap.** `SUP-AML_CFT-2026-00356` (period ending
  2025-09-02, status `superseded`) would resolve to 2025 and find no
  configuration, reporting `NO_CONFIGURATION`. It is not in the approved
  backfill population, but the gap is real and is a reason to avoid `PERIOD_END`.
- If the configuration's `effective_from` is set later than 2026-09-02, approved
  assessments dated 2026-09-02/03 will fall outside it and remain uncalculated.
  **The configuration effective date must not be later than the earliest
  assessment it is meant to cover.**

### E.5 Expected override-review population

Cannot be stated as a number before decisions B, I, J, K, L and O are made — the
calculated rating does not exist yet, and no figure will be estimated here.
What can be stated factually:

- The judged ratings already recorded on the 80 approved dimensions are
  unchanged by this wave and remain authoritative.
- The review population is every calculable dimension (up to **58**) whose judged
  rating differs from the server-calculated rating at or above the decision-O
  threshold.
- Given the recorded answer distribution (820 `NO` of 984 responses) and the
  recommended scoring, calculated control bands will skew to `WEAK` /
  `NEEDS_IMPROVEMENT` and calculated residual ratings will skew high. Where the
  existing judged ratings are more favourable, an override with a recorded reason
  will be required. The owner should plan for a **substantial** override-review
  workload on first activation, and should decide whether the demonstration
  answer data is fit to be the basis of that review.
- The 19 `NOT_CALCULABLE` dimensions generate no override review, because no
  calculated value is produced to diverge from.

---

## 6. Approval and execution checklists

### F. Maker entry checklist

Administration → Supervisory methodology → Calculation configuration. Every
step is an RPC through the screen; no direct table write.

1. Record the AML_CFT **effective-date rule** (decision A) — one row per domain.
2. Create calculation configuration **version 1 against `AML-CFT-RBA` v1.0**
   (`methodology_id = 1e248dc0-c559-48d7-bcf3-70d6ec5db99a`). Do **not** create a
   methodology version.
3. Set the configuration **effective window** — `effective_from` no later than the
   earliest assessment date to be covered (see E.4); `effective_to` is exclusive.
4. Enter **response scores** for all four published codes (decision B), marking
   `NOT_APPLICABLE` per decision C.
5. Set `na_denominator_handling` (C), `aggregation_method` (D),
   `min_answered_questions` (E), `evidence_insufficiency_handling` (F),
   `critical_question_handling = NONE` (G), `rounding_mode` and
   `rounding_decimals` (H), `inherent_direction` (I).
6. Enter **inherent bands** (J) — contiguous half-open `[from, to)` rows over
   LOW / MODERATE / MEDIUM_HIGH / HIGH / SEVERE, final band closing at 100.
7. Enter **control bands** (K) — same rules over STRONG / SATISFACTORY /
   NEEDS_IMPROVEMENT / WEAK only.
8. Enter **all 20 residual matrix cells** (L). The configuration cannot be
   submitted while any cell is missing.
9. Set `recommendation_policy` (M), `recommendation_threshold` only if M requires
   it (N), and `override_threshold` (O).
10. Run the built-in validation and clear every reported problem.
11. Record the rationale in `notes`, then **submit for approval** (`DRAFT →
    REVIEW`). Do not approve your own submission.

### G. Independent checker checklist

Administration → Supervisory methodology → Calculation approvals.

1. Confirm the checker identity **differs** from `submitted_by`.
2. Confirm the configuration is attached to `AML-CFT-RBA` v1.0 and that **no new
   methodology version** was created.
3. Confirm the effective window and that it covers the intended assessment
   population (E.4).
4. Confirm all four response codes are scored, and that no response-level
   requirement flags were expected (they no longer exist — B8).
5. Confirm the inherent and control bands are contiguous, non-overlapping,
   half-open, and close at 100; confirm the control bands use **only** the four
   control-scale codes and the inherent bands **only** the five risk codes.
6. Confirm all 20 matrix cells are present and that the grid is monotone in both
   directions, or that any non-monotone cell is deliberate and justified.
7. Confirm `critical_question_handling = NONE` and that no critical-floor
   behaviour is implied anywhere in the notes.
8. Confirm `recommendation_policy` is one of the three accepted values, that
   `HIGHEST_DIMENSION` (if chosen) is understood as worst residual among
   calculable dimensions, and that `recommendation_threshold` is present if and
   only if the policy requires it.
9. If `WEIGHTED_SCORE` is chosen, confirm the control weight total of 117 has an
   explicitly approved treatment.
10. Confirm `inherent_direction` against the actual inherent question wording —
    this is the highest-consequence single field (decision I).
11. Confirm `override_threshold` does not contradict the methodology's recorded
    `MEDIUM_HIGH`.
12. Approve with rationale, or return with reasons. Approval and activation are
    separate acts; every transition is written to
    `supervisory_calculation_event` with actor, timestamp and rationale.

### H. Dry-run backfill checklist

Before recalculating the approved population:

1. Confirm exactly one `ACTIVE` configuration resolves for AML_CFT at the as-of
   date produced by the approved rule.
2. Recalculate **one** approved assessment first and read its Calculation tab:
   status, configuration version, resolved as-of date, per-dimension scores,
   bands, matrix cell hit, recommendation and full trace.
3. Verify the trace explains the outcome without reading code, and contains no
   confidential evidence content.
4. Verify a `NOT_CALCULABLE` dimension shows **no value**, not a default.
5. Verify the judged ratings were not altered by the calculation.
6. Confirm the expected split — 58 calculable, 19 not calculable — before any
   wider run.
7. Only then run the governed recalculation across the approved population, and
   reconcile the resulting counts against E.1 / E.2.

### I. Certification steps after activation

1. `scripts/verify-aml-calculation-governance.sql` — expect 20 PASS / 0 FAIL.
2. `scripts/verify-aml-calculation-integrity.sql` — CALC-05, CALC-06, CALC-09 and
   CALC-11 must clear (they fail today solely because no `ACTIVE` configuration
   exists).
3. `scripts/verify-aml-full-module-hardening.sql` — AMLH-09 must clear; expect
   16 PASS / 0 FAIL.
4. Confirm override discipline on every divergent dimension: reason,
   `overridden_by`, `overridden_at`, audit event.
5. Full regression: Epic 2, Epic 3, W3, W4, AML, W5, W6 24/24, PFMI / payment
   systems, DMS, RBAC coverage, `bunx tsgo --noEmit`, build, security baseline.
6. Re-publish the module verdict only after all of the above.

---

## Items needing explicit human approval

Decisions **A through O** in section C, without exception. In addition:

| # | Question | Why it cannot be settled here |
| --- | --- | --- |
| 1 | Is `inherent_direction` `INVERTED` correct for the actual inherent question wording? | Reversing it inverts the entire estate's inherent risk picture. |
| 2 | Is the control weight total of **117** intended, or should the weights be corrected to 100? | Correcting them is a methodology content change requiring a new methodology version. |
| 3 | Should the six question-less control dimensions receive questions? | Methodology content change; until then they are permanently not calculable. |
| 4 | Is the recorded demonstration answer data (820 `NO` of 984) an acceptable basis for the first override review? | It will drive a large adverse calculated population. |
| 5 | Is `PARTIALLY = 50` the intended severity, or lower? | Pure supervisory severity judgement. |
| 6 | Is "both questions `YES`" the intended bar for `STRONG` control effectiveness? | Consequence of 2-question dimensions meeting the recommended band edges. |

---

## Verdict

**AML/CFT CALCULATION POLICY DECISION PACK — READY FOR SUPERVISORY APPROVAL**

The baseline is factual and read from the live database, the superseded
document's obsolete terminology is retired in section B, every decision in
section C is restricted to values the platform actually accepts, the methodology
version question is answered (no new version required), and the backfill impact
is quantified without persisting anything.

**AML FULL MODULE remains NOT CERTIFIED** — AMLH-09 plus CALC-05, CALC-06,
CALC-09 and CALC-11 stay open until a supervisory owner records decisions A–O,
a second person approves and activates the configuration, and the backfill and
certification steps in H and I are completed.

Work stops at this wave.
