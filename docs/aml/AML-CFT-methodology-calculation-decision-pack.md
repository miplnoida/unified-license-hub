# AML/CFT — Methodology & Calculation Policy Decision Pack

**Baseline (HEAD):** `190db73850453b10171e66cb9d40741ec47cfc98` — "Locked document platform arch."
**Mode:** analysis / policy-decision preparation only. No code, no migrations, no seed changes, no calculation values authored as fact.
**Module status:** AML/CFT **NOT CERTIFIED**. It remains not certified until the decisions below are approved, a calculation configuration is authored, approved and activated, and final verification passes.
**Audience:** AML Supervisor, Head of Supervision, Risk/Policy, System Administrator, Engineering.

This pack does not choose supervisory policy. Every value that determines a
regulatory rating is left blank for approval. Where repository evidence points
clearly in one direction, an **Engineering recommendation** is stated and marked
**NOT APPROVED POLICY**.

---

## 1. Current state (measured, not reported)

### 1.1 Methodologies (`supervisory_methodology`)

| Code | Version | Status | Effective from | Effective to | Domain |
|---|---|---|---|---|---|
| `AML-CFT-RBA` | 1.0 | **ACTIVE** | 2026-01-01 | — | AML_CFT |
| `AML_RBA` | 1.0 | SUPERSEDED | — | 2026-09-02 | AML_CFT |

Active methodology scoring scale: `LOW`(1), `MODERATE`(2), `MEDIUM_HIGH`(3), `HIGH`(4), `SEVERE`(5). The retired `AML_RBA 1.0` has an **empty** scoring scale.

### 1.2 Structure

| Object | Active `AML-CFT-RBA 1.0` | Retired `AML_RBA 1.0` |
|---|---|---|
| Dimensions | **26** (6 inherent, 20 control) | 19 |
| Questions | **41** (12 inherent, 29 control), all active, all mandatory | 0 |
| Dimension weights | populated (inherent 12–20, control 4–9) | all NULL |
| Question weights | **no column exists** | — |
| Question direction/polarity | **no column exists** | — |
| Answer options | uniform `YES, PARTIALLY, NO, NOT_APPLICABLE` on all 41 questions | — |

### 1.3 Assessments and responses

- AML/CFT assessments: **27**.
- Assessment dimensions: **108** in AML/CFT (**86 linked**, **22 unlinked**).
- Question responses recorded: **984** (`NO` 819, `PARTIALLY` 123, `YES` 41, `NOT_APPLICABLE` 1).
- Responses attached to unlinked dimensions: **0**.
- Dimension-level overrides recorded (`is_overridden`): **0** of 109 rows platform-wide.
- Materialised calculations: `supervisory_assessment_calculation` **1** row, history **1** row (both from verifier fixtures, not supervisory data).

### 1.4 Calculation configuration stores

| Table | Rows |
|---|---|
| `supervisory_calculation_config` | **0** |
| `supervisory_calculation_response_score` | **0** |
| `supervisory_calculation_band` | **0** |
| `supervisory_calculation_matrix_cell` | **0** |
| `supervisory_domain_calculation_rule` (effective-date rule) | **0** |

**No calculation policy exists in the system at all.** The engine, the governance
workflow and the verifiers exist; the supervisory content does not.

### 1.5 Live gate evidence (verifiers re-run at this HEAD)

| Verifier | Result |
|---|---|
| `scripts/verify-aml-dimension-linkage.sql` | **11 PASS / 1 FAIL / 12** — LINK-11 |
| `scripts/verify-aml-calculation-integrity.sql` | **7 PASS / 4 FAIL / 11** — CALC-05, CALC-06, CALC-09, CALC-11 |
| `scripts/verify-aml-full-module-hardening.sql` | **15 PASS / 1 FAIL / 16** — AMLH-09; embedded governance block **20 PASS / 0 FAIL** |
| `scripts/verify-aml-calc-outcome-fixtures.sql` | **14 PASS / 0 FAIL / 14** (OUTC-01..OUTC-14) |

Exact failure texts:

- **LINK-11** — `22 dimensions use codes absent from their bound methodology: STR_SAR_GOVERNANCE (a methodology decision, not deterministically repairable)`.
- **CALC-05** — `no ACTIVE calculation configuration is published, so determinism cannot be evidenced`.
- **CALC-06** — `no ACTIVE calculation configuration is published, so stored results cannot be reconciled`.
- **CALC-09** — `recorded AML/CFT effective-date rule decisions = 0`.
- **CALC-11** — `no ACTIVE calculation configuration is published`.
- **AMLH-09** — `approved AML dimensions with no acceptable governed calculation outcome = 80`.

---

## 2. Engineering fact vs policy decision

| Outstanding item | Classification | Note |
|---|---|---|
| Engine, config stores, lifecycle, audit, immutability present | ENGINEERING FACT | 10/10 governed operations, 7/7 configuration stores (CALC-01) |
| 0 configuration rows, 0 effective-date rule rows | ENGINEERING FACT | consequence, not defect |
| CALC-05 / CALC-06 / CALC-11 failing | CALCULATION POLICY DECISION | clears automatically once an approved configuration is activated |
| CALC-09 failing | CALCULATION POLICY DECISION (AML-DEC-02) | the rule is a recorded supervisory decision by design |
| AMLH-09 failing (80 dimensions) | CALCULATION POLICY DECISION | cannot be cleared without fabricating ratings; the correct clearance path is activate configuration → governed recalculation |
| LINK-11 failing (22 rows) | METHODOLOGY DECISION + DATA MIGRATION DECISION (AML-DEC-01) | not an engineering defect; the resolver refuses invented mappings by design |
| No per-question polarity/direction column; single global `inherent_direction` | ENGINEERING FACT, and a **gap** if policy requires per-question polarity | see AML-DEC-03 |
| No per-question weight column; `aggregation_method` limited to `UNWEIGHTED_MEAN` / `WORST_RESPONSE` | ENGINEERING FACT, and a **gap** if policy requires question weights | see AML-DEC-05 |
| 6 distinct residual-rating spellings in live data (`HIGH`/`high`, `MODERATE`/`moderate`, `LOW`, `medium_high`) | ENGINEERING DEFECT (data hygiene) + HISTORICAL-COMPATIBILITY DECISION | see AML-DEC-12 / AML-DEC-15 |
| 20 approved assessments carry a judged `residual_rating` with no calculation provenance | HISTORICAL-COMPATIBILITY DECISION | see AML-DEC-15 |

No policy choice below is presented as an engineering fix.

---

## 3. `STR_SAR_GOVERNANCE` — exact evidence

### 3.1 What the data actually shows

- **22** assessment-dimension rows, in **22 distinct assessments**, all `dimension_code = STR_SAR_GOVERNANCE`, all with `methodology_dimension_id IS NULL`.
- `STR_SAR_GOVERNANCE` exists **only** in the retired `AML_RBA 1.0` (19 dimensions, no questions, no weights).
- The active `AML-CFT-RBA 1.0` uses `STR_GOVERNANCE` (control, weight 6) plus a separate `STR_IDENTIFICATION` (control, weight 7).
- **Critical finding:** every one of the 22 host assessments is bound to the **ACTIVE** methodology `AML-CFT-RBA 1.0` (`methodology_version = 1.0`), not to the retired methodology. These are therefore **code-mismatch rows on current assessments**, not historical rows on a retired methodology.
- Assessment dates: all **2026-09-03**; period 2025-09-03 → 2026-09-02. References `SUP-AML_CFT-2026-00351`…`00375`.
- Status: **19 approved**, **1 superseded** (`00370`), **1 submitted** (`00352`), **1 draft** (`00351`).
- Question codes attached to these rows: **none**. `supervisory_assessment_question_response` rows referencing these dimensions: **0**.
- Scores/outcomes dependent on them: **none**. `score`, `calculated_score`, `calculated_*_rating` are NULL on all 22; `calculation_status` is NULL on 21 and `NO_EFFECTIVE_DATE_RULE` on 1.
- Assessment-level `residual_rating` on the hosts (HIGH ×18, MODERATE, LOW) is **judged**, entered before any calculation existed; it does not derive from these rows.
- Reachability: the draft and submitted assessments are **still reachable by active writers**; the rows are therefore **not historical-only**. The current link guard would refuse a new insert of this code against the active methodology, so no *new* rows of this shape can be created.

### 3.2 Semantic comparison

| Retired `AML_RBA 1.0` | Active `AML-CFT-RBA 1.0` |
|---|---|
| `STR_SAR_GOVERNANCE` — one combined dimension, **no questions defined**, no weight, no scoring scale | `STR_GOVERNANCE` — Q1 "documented, confidential decision trail for both reported and not-reported suspicions", Q2 "tipping-off risks controlled through defined confidentiality arrangements" |
| — | `STR_IDENTIFICATION` — Q1 front-line recognition/escalation, Q2 STRs filed with the FIU without undue delay |

Equivalence **cannot be proven from repository evidence**: the retired dimension carries no questions, so there is no semantic content to compare. The active methodology splits the subject into *identification/filing* and *governance/confidentiality*. Name similarity alone is not evidence.

### 3.3 Policy options

**OPTION A — treat `STR_SAR_GOVERNANCE` as the historical predecessor of `STR_GOVERNANCE`** (relink the 22 rows to the active `STR_GOVERNANCE` dimension).

| Aspect | Effect |
|---|---|
| Data | 22 rows gain a canonical link; LINK-11 clears; no judged value, weight or rationale changes |
| Calculation | rows become visible to the engine; with 0 responses they will resolve to `NOT_CALCULABLE` ("no applicable answered question meets the minimum-answer rule"), not to a rating |
| Historical | 19 approved and 1 superseded assessment are amended after approval |
| Audit | requires a governed, rationale-bearing relink event; `supervisory_assessment_dimension_relink` already records this |
| Migration | one governed dry-run then write run scoped to `AML_CFT` |
| Risk | asserts a semantic equivalence the repository cannot substantiate; if policy later says the retired dimension also covered *identification/filing*, the mapping is wrong and the amendment is on approved records |

**OPTION B — keep the 22 rows bound only to the retired methodology** (leave unlinked, or move the host assessments' dimension provenance to `AML_RBA 1.0`).

| Aspect | Effect |
|---|---|
| Data | LINK-11 stays FAIL, or the fail is replaced by a cross-methodology exception that the guard is designed to refuse |
| Calculation | rows stay invisible to the engine; AMLH-09 counts them as approved dimensions without a governed outcome |
| Historical | approved records untouched |
| Audit | nothing to record |
| Migration | none |
| Risk | permanently open gate; the draft and submitted assessments remain writable with an orphan dimension; certification cannot complete while LINK-11 fails |

**OPTION C — a genuinely distinct canonical dimension is required** (add an `STR_SAR_GOVERNANCE`-equivalent dimension to the active methodology, or map to `STR_IDENTIFICATION`, or split the 22 rows).

| Aspect | Effect |
|---|---|
| Data | requires a methodology change to `AML-CFT-RBA` — which is frozen after approval — so a **v1.1** is needed |
| Calculation | new dimension needs weight, questions and scoring before it can produce anything |
| Historical | cleanest audit story if the two subjects really differ, but forces version migration of 22 assessments |
| Audit | full methodology-versioning trail |
| Migration | largest: new version, dimension, questions, reassessment of the 22 hosts |
| Risk | disproportionate if the rows carry no responses and no outcomes |

**ENGINEERING RECOMMENDATION (NOT APPROVED POLICY):** Option A, on the evidence that the rows carry no responses, no scores and no dependent outcomes, that the retired dimension defines no questions to contradict, and that all 22 hosts are already bound to the active methodology. Under Option A the outcome is an explicit `NOT_CALCULABLE`, not a fabricated rating, so no rating is invented by the mapping. **Not approved policy** — see AML-DEC-01.

---

## 4. Question polarity / direction

No polarity, direction or score column exists on `supervisory_methodology_question`. Polarity is therefore **entirely undecided** in the system and must be derived from question semantics by supervisory decision, not from ordinal position.

Semantic reading of all 41 active questions (uniform `YES / PARTIALLY / NO / NOT_APPLICABLE`):

| Group | Count | Basis |
|---|---|---|
| `CONTROL_POSITIVE` (YES = stronger control) | **29** | every question on the 20 `CONTROL_EFFECTIVENESS` dimensions is phrased as "is this control in place / performed / validated" |
| `RISK_POSITIVE` (YES = higher risk) | **1** | `BUSINESS_MODEL_RISK Q1` — "Does the growth strategy or ownership structure introduce ML/TF risk not reflected in the entity's risk assessment?" |
| `AMBIGUOUS` | **11** | the remaining `INHERENT_RISK` questions are phrased as *control/assurance* proxies ("Has the entity identified…", "Are exposures proportionate…", "Are unusual concentrations identified and explained…") yet sit on inherent-risk dimensions |
| `BINARY_RISK` / `BINARY_CONTROL` | **0** | no binary questions; all are 3-point ordinal plus N/A |
| `NON_SCORING` | **0** | nothing is designated non-scoring; equally, nothing is designated scoring |

**The 11 ambiguous questions requiring business decision:**

| Dimension | Question | Ambiguity |
|---|---|---|
| CUSTOMER_RISK | Q1 classified customer base by ML/TF risk | measures assessment quality, not exposure |
| CUSTOMER_RISK | Q2 proportion of higher-risk customers quantified/trended/consistent with appetite | conflates exposure with monitoring quality |
| GEOGRAPHIC_RISK | Q1 exposure to higher-risk jurisdictions identified | identification quality, not exposure level |
| GEOGRAPHIC_RISK | Q2 cross-border/correspondent exposures proportionate | YES plausibly = lower risk |
| PRODUCTS_SERVICES_RISK | Q1 products risk-rated for ML/TF vulnerability | rating completeness, not product risk |
| PRODUCTS_SERVICES_RISK | Q2 new products assessed before launch | control gate, not inherent risk |
| DELIVERY_CHANNEL_RISK | Q1 non-face-to-face channels identified and risk-rated | identification, not exposure |
| DELIVERY_CHANNEL_RISK | Q2 introducers/agents subject to proportionate oversight | oversight = control |
| TRANSACTION_PROFILE_RISK | Q1 actual profile consistent with declared model | YES plausibly = lower risk |
| TRANSACTION_PROFILE_RISK | Q2 unusual concentrations identified and explained | detection = control |
| BUSINESS_MODEL_RISK | Q2 group/affiliate dependencies understood and documented | understanding = control |

**Engine constraint that makes this decisive:** the engine supports **one global** `inherent_direction` per configuration (`DIRECT` or `INVERTED`), applied to *all* inherent dimensions. It cannot express per-question or mixed polarity. If policy requires mixed polarity within inherent risk, either the questions must be rephrased in a **v1.1** methodology, or a per-question direction column is a genuine engineering extension. This is the single largest unresolved coupling between methodology wording and calculation policy.

---

## 5–7. What the engine can and cannot express

Measured from `supervisory_calc_compute_core` and the configuration check constraints.

**Supported today**

| Parameter | Supported values | Configured |
|---|---|---|
| `aggregation_method` (within a dimension) | `UNWEIGHTED_MEAN`, `WORST_RESPONSE` | none |
| Answer scores | free numeric 0–100 per response code, with `excluded_from_denominator` | none |
| `na_denominator_handling` | `EXCLUDE`, `INCLUDE_AS_ZERO`, `INCLUDE_AS_FULL` | none |
| `min_answered_questions` | integer ≥ 0 | none |
| `evidence_insufficiency_handling` | `FLAG_ONLY`, `NOT_CALCULABLE`, `CAP_AT_MIDPOINT` (midpoint fixed at 50) | none |
| `critical_question_handling` | `NONE` only | none |
| `inherent_direction` | `DIRECT`, `INVERTED` (global) | none |
| `rounding_mode` / `rounding_decimals` | `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEILING`, `NONE` / 0–4 | none |
| Dimension aggregation | weighted mean of dimension scores, weight = assessment weight → methodology weight → 1 | methodology weights present (inherent 12–20, control 4–9); no configuration to consume them |
| Bands | `INHERENT` and `CONTROL` band tables, `min_score`/`max_score` within 0–100 | none |
| Residual mechanism | **matrix only** — `(inherent_band, control_band) → residual_rating` cell lookup, applied both per dimension and overall | none |
| Overall recommendation | `WEIGHTED_SCORE`, `HIGHEST_DIMENSION`, `WEIGHTED_WITH_THRESHOLD` over the methodology scoring-scale ordinals, weighted by dimension weight | none |

**Not supported today (would be engineering extensions, not configuration)**

- Per-question weights.
- Per-question or mixed polarity/direction.
- Residual risk by subtraction, multiplier or formula — **the matrix is the only residual mechanism**.
- A configurable evidence cap other than the hard-coded midpoint of 50.
- Critical/killer-question handling beyond `NONE`.
- Materiality adjustments (deliberately removed; CALCG-20 refuses a `MATERIAL` policy name).

All schema defaults present (`config_version 1`, `status DRAFT`, `min_evidence_count 0`, `mandatory true`, `is_applicable true`) are **technical defaults**, not supervisory values. Every policy field in `supervisory_calculation_config` is nullable and NULL, and the engine returns `CONFIGURATION_INCOMPLETE` naming each undecided parameter rather than assuming one.

---

## 8. Risk bands / labels actually present

| Label | Where present | Active methodology config? | UI-only? | Threshold defined? |
|---|---|---|---|---|
| `LOW`, `MODERATE`, `MEDIUM_HIGH`, `HIGH`, `SEVERE` | `AML-CFT-RBA 1.0` `scoring_scale` (ordinals 1–5) | yes — the canonical scale | no | **no** (no band rows exist) |
| `HIGH` (18), `MODERATE` (3), `LOW` (1) | judged `supervisory_assessment.residual_rating` | no | no | no |
| `high` (1), `moderate` (1) lower-case | judged assessment ratings — **case-variant legacy data** | no | no | no |
| `medium_high` lower-case | judged dimension `residual_rating` | no | no | no |
| "Very High", "Critical" | **not present anywhere** | — | — | — |

Two facts for policy: the canonical scale has **no threshold definitions** (bands table empty), and live data contains **case-variant labels** that will not match the scale codes. No label is standardised in this wave.

---

## 9. Completeness / NOT_CALCULABLE — actual engine behaviour

Statuses the engine can return:

| Status | Trigger |
|---|---|
| `CALCULATED` | configuration in force, answered questions ≥ `min_answered_questions`, denominator > 0, evidence treatment not blocking |
| `NOT_CALCULABLE` | answered < `min_answered_questions`, or denominator = 0, or evidence insufficient with `NOT_CALCULABLE` treatment |
| `NO_EFFECTIVE_DATE_RULE` | no `supervisory_domain_calculation_rule` row for the domain — **today's state for every AML assessment** |
| `NO_CONFIGURATION` | no `ACTIVE`/`SUPERSEDED` configuration in force on the as-of date |
| `CONFIGURATION_INCOMPLETE` | an in-force configuration leaves a required parameter NULL; the undecided parameters are listed in the trace |

Acceptance (`supervisory_calc_outcome_acceptable`) admits only `CALCULATED` with rating + config id + trace + timestamp, or `NOT_CALCULABLE` with NULL rating and full provenance (reason, config version, as-of, methodology version). `NO_CONFIGURATION`, `NO_EFFECTIVE_DATE_RULE`, `CONFIGURATION_INCOMPLETE` and a NULL status are all refused (OUTC-03..OUTC-06). The system therefore already prefers an explicit non-calculable outcome over a fabricated rating; there is no `BLOCKED_REVIEW_REQUIRED` engine status — that label exists only as a dry-run item label in `supervisory_calculation_recalculate`.

Policy still required for: `min_answered_questions`, N/A denominator treatment, evidence-insufficiency treatment, and whether an unreviewed or missing mandatory response blocks calculation or merely flags it.

---

## 10. Effective-date rule — the current hard blocker

`supervisory_domain_calculation_rule` has **0 rows**, so `supervisory_calc_as_of_for` returns NULL and every AML assessment resolves to `NO_EFFECTIVE_DATE_RULE`. Supported values and their consequences:

| Rule | As-of date used | Consequence |
|---|---|---|
| `EXECUTION_DATE` | `created_at::date` | simplest and always populated; a backdated assessment is governed by today's policy, and reopening does not change governance |
| `ASSESSMENT_DATE` | `assessment_date`, falling back to creation date | matches supervisory intent; NULL on the 2 non-approved assessments today, so those fall back silently |
| `PERIOD_END` | `period_end`, falling back to creation date | ties policy to the reviewed period; a policy activated after period end never applies to that period |
| `TRIGGER_DATE` | trigger date, falling back to creation date | event-driven supervision; no trigger date is populated on current AML rows |
| `EXPLICIT_AS_OF` | caller-supplied, falling back to creation date | maximum control, maximum operator burden and dispute surface |

Consequences to settle alongside the rule:

- **Historical recalculation** — with `ASSESSMENT_DATE` or `PERIOD_END`, the 20 approved 2026-09-03 assessments fall *before* any configuration a future activation gives an `effective_from` after that date, and would remain `NO_CONFIGURATION` unless the configuration is backdated.
- **Backdated assessment** — under `EXECUTION_DATE` it is governed by current policy regardless of the period it examines.
- **Future-effective methodology** — the config window is half-open (`effective_from <= as_of < effective_to`, verified by OUTC-09), so a future-effective configuration correctly does not govern earlier assessments.
- **Reopened assessment** — under all rules except `EXECUTION_DATE` the governing policy is stable across reopening; under `EXECUTION_DATE` it is not, because `created_at` does not change but the policy in force may have.

---

## 11. Override / judgement — architecture present, policy absent

Present in the schema and enforced: `calculated_inherent_rating`, `calculated_control_rating`, `calculated_residual_rating`, `calculated_score` (server-only), separate judged `inherent_rating`/`control_rating`/`residual_rating`, `is_overridden`, `override_reason`, `overridden_by`, `overridden_at`; original calculations preserved in `supervisory_assessment_calculation` plus an immutable `supervisory_assessment_calculation_history` (`supervisory_calc_history_immutable` trigger). CALC-02 confirms no caller authority over calculated values; CALC-03 and CALC-04 confirm override discipline (reason ≥ 10 chars, actor, timestamp); AMLH-10 confirms no self-approved assessments. Recorded overrides today: **0**.

**Gaps — policy, not engineering:** who may *propose* an override; who may *approve* it (and the explicit decision that Super Admin does **not** hold routine override authority — `is_super_admin` currently satisfies the supervisory permission checks); permitted movement (number of scale notches, direction, whether a downgrade needs stronger justification); whether evidence or a materiality test is mandatory in addition to the rationale; and whether an override expires or forces reassessment at the next review date. There is no separate maker-checker workflow *for the override itself* distinct from assessment approval — if policy requires one, that is an **engineering gap**.

---

## 12. Versioning / reproducibility

Pinned per calculation: `methodology_id`, `methodology_version`, `config_id`, `config_version`, `as_of`, full `trace`, `calculated_at`. Pinned per response: `methodology_id`, `methodology_version`, `methodology_question_id`, `question_version`, `question_text` snapshot. Methodology is frozen after approval (CALC-08). Configuration windows are half-open and superseded configurations are retained, so a historical calculation still resolves its governing configuration (CALC-07, OUTC-09).

**Verdict: reproducibility PASS, with one residual gap** — reproducibility is only evidenced for *materialised* calculations. The 20 approved assessments carry judged ratings with no calculation row, so their ratings are not reproducible against any configuration. That is a historical-compatibility decision (AML-DEC-15), not a schema gap. A future `AML-CFT-RBA v1.1` is supported by `supervisory_methodology_new_version` and does not disturb pinned history.

---

## 13. Maker-checker / activation

`supervisory_calculation_config_lifecycle` enforces: DRAFT → REVIEW (validation must pass) → APPROVED (**approver must differ from author/submitter**) → ACTIVE (requires `effective_from`; successor must take effect after its predecessor, which is auto-superseded with `effective_to` set) → RETIRED, with RETURNED/DRAFT rework. Authority is server-side via `supervisory_spine_require` on `aml_supervision.manage_config` / `supervisory_spine.manage_config` / `prudential_supervision.manage_config`, a rationale of ≥ 10 characters is mandatory, and every transition writes `supervisory_calculation_event`. Domain-authority guards (`supervisory_calc_domain_authority_guard`) protect band, matrix and response-score writes; CALC-10 passes.

**Verdict: PASS.** Two items to note for policy, not defects: `is_super_admin` bypasses the permission predicate (so a super admin could act as both maker and checker only by using two accounts — the identity check still blocks self-approval), and `RETIRED` is reachable from any status without a state precondition. Nothing is activated in this wave.

---

## 14–15. Decision register

Each decision is left unapproved. `APPROVED VALUE`, `APPROVED BY`, `APPROVED DATE` and `RATIONALE` are deliberately blank.

---

### AML-DEC-01 — `STR_SAR_GOVERNANCE` historical mapping

**Question requiring approval:** How should the 22 `STR_SAR_GOVERNANCE` assessment dimensions be treated?
**Why it matters:** LINK-11 fails while they are unresolved; 2 of the 22 host assessments are still writable; certification cannot complete.
**Current system state:** 22 rows, 22 assessments, all bound to the active methodology, 0 responses, 0 scores, 0 dependent outcomes; the code exists only in the retired `AML_RBA 1.0`.
**Choices:** Option A predecessor of `STR_GOVERNANCE` | Option B leave bound to the retired methodology | Option C distinct dimension via methodology v1.1.
**Impact:** see section 3.3.
**Engineering recommendation:** Option A (**NOT APPROVED POLICY**).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-02 — Assessment effective/as-of date rule

**Question requiring approval:** What date determines which methodology and calculation configuration governs an AML/CFT assessment?
**Why it matters:** Nothing can be calculated until this is recorded; CALC-09 fails and every assessment returns `NO_EFFECTIVE_DATE_RULE`.
**Current system state:** `supervisory_domain_calculation_rule` = 0 rows.
**Choices:** `EXECUTION_DATE` | `ASSESSMENT_DATE` | `PERIOD_END` | `TRIGGER_DATE` | `EXPLICIT_AS_OF`.
**Impact:** see section 10, including historical recalculation, backdating, future-effective policy and reopening.
**Engineering recommendation:** none — this is a supervisory determination. Evidence note: `assessment_date` is NULL on the draft and submitted assessments and no trigger dates are populated, so `ASSESSMENT_DATE` and `TRIGGER_DATE` will fall back to creation date for in-flight work.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-03 — Question polarity / direction

**Question requiring approval:** For each of the 11 ambiguous inherent-risk questions, does a higher answer mean higher risk or stronger control — and is a single global inherent direction acceptable?
**Why it matters:** Direction inverts inherent scores; a wrong direction produces a confidently inverted regulatory rating.
**Current system state:** no polarity metadata exists; the engine offers one global `DIRECT`/`INVERTED` flag; semantic reading gives 29 control-positive, 1 risk-positive, 11 ambiguous.
**Choices:** (a) declare all inherent questions control-positive and set `inherent_direction = INVERTED`; (b) declare them risk-positive and set `DIRECT`; (c) rephrase the ambiguous questions in a v1.1 methodology so one global direction is truthful; (d) commission a per-question direction column (engineering extension).
**Impact:** (a) and (b) are configuration-only but mis-state at least one question either way; (c) is correct and slower; (d) changes the engine.
**Engineering recommendation:** none on polarity itself. Evidence note: `BUSINESS_MODEL_RISK Q1` is the only unambiguously risk-positive question, so **no single global direction is truthful for all 12 inherent questions as currently worded** (**NOT APPROVED POLICY**).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-04 — Answer scoring values

**Question requiring approval:** What score does each of `YES`, `PARTIALLY`, `NO`, `NOT_APPLICABLE` carry?
**Why it matters:** These four numbers drive every dimension score, band and residual rating.
**Current system state:** `supervisory_calculation_response_score` = 0 rows; scores are free numerics 0–100.
**Choices:** any 0–100 set, plus whether `NOT_APPLICABLE` is `excluded_from_denominator`.
**Impact:** the gap between `PARTIALLY` and `NO` determines how much partial compliance is credited; live responses are 819 `NO`, 123 `PARTIALLY`, 41 `YES`, so the `NO` score dominates outcomes.
**Engineering recommendation:** none — no value may be invented.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-05 — Question and dimension weights

**Question requiring approval:** Are the 26 existing dimension weights approved supervisory policy, and are per-question weights required?
**Why it matters:** Weights decide which dimensions move the rating.
**Current system state:** dimension weights populated (inherent 12–20 summing to 100, control 4–9 summing to 111) but never approved through the configuration workflow; per-question weights are **not supported** — within a dimension the engine offers only unweighted mean or worst response.
**Choices:** ratify the existing dimension weights | replace them | require question weights (engineering extension).
**Impact:** control weights do not sum to 100, which is harmless for a weighted mean but must be an accepted presentation.
**Engineering recommendation:** ratify or replace dimension weights through the configuration workflow so they carry provenance (**NOT APPROVED POLICY**).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-06 — N/A treatment

**Question requiring approval:** How is `NOT_APPLICABLE` treated in the denominator?
**Why it matters:** It decides whether an inapplicable requirement dilutes, penalises or rewards the entity.
**Current system state:** undecided; engine supports `EXCLUDE`, `INCLUDE_AS_ZERO`, `INCLUDE_AS_FULL`; questions default `allow_not_applicable = true` and `na_requires_rationale = true` (technical defaults); 1 `NOT_APPLICABLE` response exists in live data.
**Choices:** as above.
**Impact:** `EXCLUDE` is neutral; `INCLUDE_AS_ZERO` penalises; `INCLUDE_AS_FULL` rewards.
**Engineering recommendation:** none.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-07 — Minimum completeness

**Question requiring approval:** How many answered questions must a dimension carry before it is calculable, and does missing evidence block calculation?
**Why it matters:** Sets the boundary between a rating and an explicit `NOT_CALCULABLE`.
**Current system state:** `min_answered_questions` NULL; `evidence_insufficiency_handling` NULL; all 26 dimensions require evidence with `min_evidence_count = 1`; all 41 questions are mandatory.
**Choices:** any integer ≥ 0; evidence treatment `FLAG_ONLY` | `NOT_CALCULABLE` | `CAP_AT_MIDPOINT` (midpoint fixed at 50).
**Impact:** dimensions have 2–3 questions each, so a threshold above 2 makes most dimensions non-calculable; `NOT_CALCULABLE` on evidence will make many current dimensions non-calculable given evidence is required everywhere.
**Engineering recommendation:** none.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-08 — Dimension aggregation

**Question requiring approval:** How are question scores combined within a dimension?
**Why it matters:** `WORST_RESPONSE` makes a single `NO` decisive; `UNWEIGHTED_MEAN` averages it away.
**Current system state:** `aggregation_method` NULL; only those two values are supported; `critical_question_handling` supports only `NONE`.
**Choices:** `UNWEIGHTED_MEAN` | `WORST_RESPONSE`.
**Impact:** given 819 `NO` responses, `WORST_RESPONSE` will drive most dimensions to the `NO` score.
**Engineering recommendation:** none.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-09 — Overall inherent-risk aggregation

**Question requiring approval:** How are the 6 inherent dimension scores combined into an overall inherent score and band?
**Why it matters:** Drives one axis of the residual matrix.
**Current system state:** engine computes a weight-weighted mean of inherent dimension scores; the weight source is assessment weight → methodology weight → 1; inherent bands are undefined.
**Choices:** ratify the weighted mean with the existing weights | supply different weights | (any other aggregation is an engineering extension).
**Impact:** if inherent bands are undefined the overall residual matrix lookup cannot resolve and the outcome is non-calculable.
**Engineering recommendation:** none.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-10 — Control-effectiveness aggregation

**Question requiring approval:** How are the 20 control dimension scores combined into an overall control score and band?
**Why it matters:** Drives the other axis of the residual matrix.
**Current system state:** same weighted-mean mechanism; control weights 4–9 summing to 111; control bands undefined.
**Choices:** ratify | reweight.
**Impact:** control dimensions outnumber inherent 20:6, so control granularity dominates the number of inputs even though inherent weights are individually larger.
**Engineering recommendation:** none.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-11 — Residual-risk mechanism

**Question requiring approval:** Approve the inherent × control → residual matrix, cell by cell.
**Why it matters:** This is the published supervisory rating.
**Current system state:** `supervisory_calculation_matrix_cell` = 0 rows. **The matrix is the only mechanism the engine supports** — no subtraction, multiplier or formula. Every `(inherent_band, control_band)` combination that can occur must have a cell, or the result is non-calculable.
**Choices:** a complete matrix over the approved inherent and control bands, with residual codes drawn from `LOW / MODERATE / MEDIUM_HIGH / HIGH / SEVERE`.
**Impact:** missing cells silently produce `NOT_CALCULABLE` rather than a wrong rating — safe, but it will look like a system failure to users if the matrix is incomplete.
**Engineering recommendation:** define the matrix exhaustively over the approved band sets (**NOT APPROVED POLICY** as to its content).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-12 — Risk band thresholds

**Question requiring approval:** What score ranges define each inherent band and each control band?
**Why it matters:** Thresholds convert scores into the published scale.
**Current system state:** `supervisory_calculation_band` = 0 rows; the methodology scale has 5 codes with ordinals but no ranges; bands must lie within 0–100 and are stored per kind (`INHERENT`, `CONTROL`).
**Choices:** any non-overlapping, exhaustive 0–100 partition per kind; the number of bands per kind need not equal 5.
**Impact:** gaps in coverage produce non-calculable outcomes; also settle whether the case-variant legacy labels (`high`, `moderate`, `medium_high`) are normalised to the scale codes.
**Engineering recommendation:** none on thresholds; normalise the case-variant legacy labels as a data-hygiene action once AML-DEC-15 is settled (**NOT APPROVED POLICY**).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-13 — Rounding and precision

**Question requiring approval:** What rounding mode and decimal precision apply?
**Why it matters:** Rounding decides borderline band membership and therefore borderline ratings.
**Current system state:** `rounding_mode` and `rounding_decimals` NULL; modes `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEILING`, `NONE`; decimals 0–4. Rounding is applied twice — to each dimension score and to each overall score — and the overall recommendation ordinal is always `round()`ed independently of this setting.
**Choices:** as above.
**Impact:** `FLOOR` systematically favours the entity on control scores and disfavours it on inverted inherent scores.
**Engineering recommendation:** none.
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-14 — Override / judgement policy

**Question requiring approval:** Who may propose and who may approve a departure from the calculated rating, and under what constraints?
**Why it matters:** Override authority is the difference between a governed judgement and an unaccountable one.
**Current system state:** calculated vs judged separation, rationale, actor, timestamp and immutable calculation history are all enforced; 0 overrides recorded; no notch limit, no evidence requirement, no separate override approver, and `is_super_admin` satisfies the permission predicate.
**Choices:** define proposer role(s); define approver role(s) distinct from the proposer; permitted movement (e.g. ±1 notch without escalation); mandatory evidence; expiry or next-review consequence; explicit exclusion of Super Admin from routine override authority.
**Impact:** if policy requires a dedicated override maker-checker step separate from assessment approval, that is an engineering gap to schedule.
**Engineering recommendation:** state explicitly that Super Admin does not hold routine override authority, since the permission predicate currently admits it (**NOT APPROVED POLICY**).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

### AML-DEC-15 — Historical recalculation policy

**Question requiring approval:** What happens to the 20 already-approved AML assessments once a configuration is activated?
**Why it matters:** AMLH-09 counts 80 approved dimensions with no governed calculation outcome; they cannot be cleared without either recalculating them or accepting a governed non-calculable state.
**Current system state:** 27 assessments (19 approved + 1 superseded + 1 submitted + 1 draft among the 22 STR hosts); judged residual ratings present with no calculation provenance; `supervisory_calculation_recalculate` supports a governed, audited, idempotent dry-run then write run scoped by domain and entity.
**Choices:** (a) recalculate all historical assessments under the new configuration, preserving judged ratings as overrides where they diverge; (b) recalculate prospectively only and accept a recorded `NOT_CALCULABLE` with full provenance for history; (c) backdate the configuration's `effective_from` so history is governed by it.
**Impact:** (a) may change published ratings on approved records; (b) leaves history explicitly non-calculable but honest and clears AMLH-09 under the corrected acceptance semantics; (c) asserts that today's policy always applied.
**Engineering recommendation:** none — this determines whether published regulatory ratings change. Evidence note: option (b) is the only choice that clears AMLH-09 without altering an approved rating (**NOT APPROVED POLICY**).
**APPROVED VALUE:**
**APPROVED BY:**
**APPROVED DATE:**
**RATIONALE:**

---

## 16. What can proceed without policy

**CAN PROCEED NOW**
- Normalising the case-variant legacy rating labels is *not* included here — it depends on AML-DEC-12/15.
- Administration UI polish for the existing methodology and calculation-configuration screens (presentation only, no values authored).
- Read-model, listing, paging and export work on AML registers (no calculation dependency).
- Verifier and fixture hardening that does not assert a policy value.
- Documentation, training material and the approval routing of this pack.

**BLOCKED BY DECISION**
- Authoring, approving or activating any calculation configuration — AML-DEC-04..13.
- Recording the effective-date rule — AML-DEC-02 (blocks *all* calculation).
- Relinking the 22 `STR_SAR_GOVERNANCE` rows — AML-DEC-01.
- Clearing LINK-11, CALC-05, CALC-06, CALC-09, CALC-11, AMLH-09.
- Any historical recalculation — AML-DEC-15.
- Per-question polarity or question-weight engine extensions — AML-DEC-03, AML-DEC-05.

**SHOULD WAIT TO AVOID REWORK**
- Rating-band presentation, colour and label mapping in the UI (depends on AML-DEC-12).
- Residual-rating explainers and calculation-trace UI (depends on AML-DEC-11 and AML-DEC-13).
- Override workflow UI (depends on AML-DEC-14, which may add an approval step).
- Any `AML-CFT-RBA v1.1` question rewording (depends on AML-DEC-03).

No work above has been started in this wave.

---

## 17. Status

AML/CFT is **NOT CERTIFIED** and the roadmap status is unchanged. Certification requires: the decisions above approved; the effective-date rule recorded; a configuration authored, approved and activated through maker-checker; a governed recalculation run; and LINK-11, CALC-05, CALC-06, CALC-09, CALC-11 and AMLH-09 clearing on re-verification.

---

## AML-METH decision register — AML-CFT-RBA v1.1 content design (rewritten by the quality closure of 2026-09-04)

Design-only. No item below is approved. Implementation of v1.1 is blocked until all are decided. Recommendations were rewritten — not retained — after the quality review (`docs/aml/AML-CFT-RBA-v1.1-quality-review.md`).

### AML-METH-01 — Adopt the exposure -> control -> residual -> judgement -> response chain, with question classes

- **Recommendation:** Adopt the chain, and adopt the CORE / CONDITIONAL / ENHANCED question-class model so that a catalogue question is not automatically mandatory in every assessment.
- **Alternatives:** Retain v1.0 undifferentiated model; or adopt the chain with a single mandatory question set.
- **Impact:** Determines whether policy existence can count as control effectiveness, and whether standard-cycle burden is proportionate (48 questions rather than 70).
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-02 — Inherent question set: 17 questions across 6 dimensions (12 CORE, 4 CONDITIONAL, 1 contextual non-scored)

- **Recommendation:** Adopt the red-teamed set. `IR-BUS-03` (outsourced/intragroup AML operations) is moved to control effectiveness (`THIRD_PARTY_OVERSIGHT`); `IR-TRX-02` merges into `IR-PRD-02` (cash) and `IR-TRX-03` into `IR-GEO-02` (cross-border); `IR-DEL-03` merges into `IR-DEL-01`/`IR-PRD-03`; `IR-GEO-03` (corridor concentration) becomes a contextual, non-scored fact because concentration in lower-risk corridors is not higher inherent exposure. Every remaining scored inherent question satisfies: `YES` = more inherent ML/TF exposure before controls.
- **Alternatives:** Retain the 21-question proposal (accepts one non-risk-positive question and three double counts); retain 12 v1.0 questions.
- **Impact:** Sets the exposure measurement basis and removes double counting between customer, geographic, transaction and channel exposure.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-03 — Control question set: 53 questions across 20 dimensions (36 CORE, 11 CONDITIONAL, 6 ENHANCED)

- **Recommendation:** Adopt with the closure changes: `CT-DQ-02` retired (reconciliation absorbed by `CT-DQ-01` and `CT-TM-02`); `CT-IT-03` narrowed to board reporting so closure validation is assessed once, in `CT-REM-03`; file/alert/report sampling and training-effectiveness testing (`CT-CDD-03`, `CT-ALRT-02`, `CT-STRI-03`, `CT-STRG-03`, `CT-TRN-03`, `CT-REM-03`) classified ENHANCED (examination/thematic); third-party oversight and model governance classified CONDITIONAL on the presence of third parties or automated detection.
- **Alternatives:** Adopt all 54 as mandatory (checklist effect, 70-question standard cycle); reduce further by retiring model governance or data quality (loses supervisory expectation coverage).
- **Impact:** Sets control burden. Standard cycle = 36 control questions; deep-dive work adds the ENHANCED set.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-04 — Context-sensitive response semantics per axis and effectiveness focus

- **Recommendation:** Adopt `INHERENT_SEM`, `CONTROL_SEM_DESIGN`, `CONTROL_SEM_OPERATING`, `CONTROL_SEM_DESIGN_AND_OPERATING` and `CONTEXT_FACT_SEM`. A pure DESIGN question must not require operating evidence merely because a global control definition demanded it.
- **Alternatives:** Retain one global control definition requiring design *and* operation on every control question (internally inconsistent with the DESIGN/OPERATING split).
- **Impact:** Determines what `YES` means, and what evidence is sufficient, on 53 control questions.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-05 — Selective design vs operating-effectiveness split (14 DESIGN / 27 OPERATING / 12 DESIGN_AND_OPERATING)

- **Recommendation:** Adopt as catalogued; split only where the operating failure mode is distinct.
- **Alternatives:** Split every control (doubles burden); split none (policy existence becomes proof of effectiveness).
- **Impact:** Assessment effort and the ability to say a control is well designed but failing.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-06 — Evidence basis (replaces the "observation + one evidence item per question" mandate)

- **Recommendation:** Every **final supervisory response** must carry (A) a rationale/observation appropriate to the judgement and (B) a sufficient **governed evidence basis**. An evidence basis may be an `ENTERPRISE_DOCUMENT`, `SYSTEM_FACT`, `REGULATORY_RETURN`, `STRUCTURED_METRIC`, `SUPERVISORY_SAMPLE`, `WORKPAPER`, `PRIOR_EXAMINATION`, `FINDING`, `REMEDIATION_RECORD`, `RFI_RESPONSE` or `AUTHORISED_EXTERNAL_SOURCE`. One document or governed fact may support several questions; a question need not create a duplicate evidence object. For purely system-factual questions, structured provenance (source, period, timestamp, extraction reference) satisfies the evidence requirement. No assertion-only favourable conclusion. No AML-local document store; references are governed references into existing platform records.
- **Alternatives:** Retain one uploaded artefact per question (70 uploads per cycle, duplicated evidence, no provenance gain); permit assertion-only for design questions (undermines defensibility).
- **Impact:** Determines assessment effort, evidence duplication and defensibility.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-07 — N/A discipline: enumerated conditions only, rationale always required; N/A distinguished from NOT_TRIGGERED and NOT_ASKED

- **Recommendation:** Adopt. `NOT_APPLICABLE` (activity genuinely not undertaken), `NOT_TRIGGERED` (conditional trigger absent) and `NOT_ASKED` / `OUT_OF_SCOPE` (enhanced question outside this assessment's scope) are three distinct states; none may silently score zero or full, and none is a favourable response.
- **Alternatives:** Free N/A with rationale; or treat untriggered questions as N/A (loses the distinction between "not applicable" and "not in scope").
- **Impact:** Comparability, calculability and honest completeness reporting.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-08 — Legacy `STR_SAR_GOVERNANCE`: governed audited relink to `STR_GOVERNANCE` (supersedes the display-only recommendation)

- **Measured fact:** 22 assessment-dimension rows across 22 assessments whose **host assessments are bound to active `AML-CFT-RBA` v1.0**; the rows themselves have **no canonical methodology-dimension link**. 0 question responses, 0 calculated scores, 0 dependent calculated ratings; officer-judged dimension ratings and rationale are present. Host statuses: 19 approved, 1 superseded, 1 submitted, 1 draft — not historical-only.
- **Recommendation:** If the methodology owner confirms that `STR_SAR_GOVERNANCE` is the semantic predecessor of `STR_GOVERNANCE`, execute a **governed, audited, idempotent relink** of the 22 rows to canonical `STR_GOVERNANCE`, preserving the original dimension code and provenance, assessment status, responses, judged ratings and history. Because the rows hold no responses and no calculated results, no rating is invented. Display/lineage-only mapping is rejected as a final route: it leaves LINK-11 permanently open and is therefore not an acceptable certification path.
- **Future governed write plan (no write in this wave):** (1) methodology-owner confirmation of semantic equivalence recorded as the approval of this decision; (2) execute the existing governed `supervisory_assessment_structure_backfill`/relink operation under `aml_supervision.manage_config` with `_dry_run := true` and review the per-row export; (3) re-run with `_dry_run := false` and a supervisory rationale, emitting one `STRUCTURE_REPAIRED` event and audit row per repaired row, retaining `legacy_dimension_code = STR_SAR_GOVERNANCE` as provenance; (4) re-run LINK-01..LINK-11 and the structural, outcome and calculation-governance suites; (5) no recalculation is triggered, since no calculated result exists.
- **Alternatives:** Display/lineage mapping only (LINK-11 stays open); leave unmapped; delete the rows (rejected — destroys judged supervisory record).
- **Impact:** Closes LINK-11; makes the STR dimension of 22 live assessments canonically linked and reportable.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-09 — Global AML/CFT core plus sector applicability/overlay capability (supersedes the single-catalogue-with-N/A approach)

- **Recommendation:** Adopt a **global core** (44 CORE_ALL, 4 CORE_WITH_SECTOR_GUIDANCE) with **13 SECTOR_CONDITIONAL** questions resolved by trigger and **9 SECTOR_OVERLAY_CANDIDATE** questions (correspondent/remittance corridors, virtual-asset and complex products, agent networks, automated detection and model governance) earmarked for sector overlays. Overlays should later be expressed as sector-scoped applicability and guidance records over the same canonical question catalogue, resolved through the existing entity-context methodology resolver — duplicating no question text, evidence contract, document or storage architecture. Sectors analysed: banks, credit unions, insurance, securities, MSBs, VASPs, DNFBPs, other.
- **Alternatives:** Single 70-question global methodology answered largely `NOT_APPLICABLE` (previous recommendation — produces a large false N/A population and defeats comparability); separate sector variants of the whole methodology (duplicates maintenance and breaks cross-sector comparison).
- **Impact:** Determines whether the product scales across sectors without a checklist effect or duplicated architecture.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### AML-METH-10 — v1.0 -> v1.1 transition, by assessment status

- **Recommendation:** APPROVED / SUPERSEDED v1.0 assessments are never re-versioned and remain reproducible. DRAFT v1.0 assessments may be abandoned or superseded and recreated under v1.1 through a governed, audited process where the supervisor decides that is appropriate. SUBMITTED / REVIEWED v1.0 assessments require an explicit supervisory decision per assessment: finish under v1.0, or return/cancel and restart under v1.1. Never silently re-version. No migration in this wave.
- **Alternatives:** Freeze all in-flight work under v1.0 regardless of supervisory preference; re-version in-flight assessments automatically (destroys reproducibility).
- **Impact:** Affects in-flight supervisory work and reproducibility of completed judgements.
- **STATUS:** AWAITING SUPERVISORY APPROVAL
- **APPROVED VALUE:** ______________________
- **APPROVED BY:** ______________________
- **DATE:** ______________________

### Materiality thresholds withdrawn from question prose

The quality closure removed every numeric threshold from question wording and guidance. Each is now a named configuration parameter awaiting supervisory calibration; none is implemented.

| Parameter | Previously embedded as | Question | Classification |
| --- | --- | --- | --- |
| `[MAT_HIGH_RISK_CUSTOMER_SHARE]` | ">10% of customers" | `IR-CUS-01` | CONFIGURABLE_MATERIALITY_PARAMETER |
| `[MAT_HIGH_RISK_VALUE_SHARE]` | ">20% of value" | `IR-CUS-01` | CONFIGURABLE_MATERIALITY_PARAMETER |
| `[MAT_CORRIDOR_TOP1_SHARE]` | "largest corridor exceeds 25%" | `IR-GEO-03` | CONFIGURABLE_MATERIALITY_PARAMETER (contextual question) |
| `[MAT_CORRIDOR_TOP3_SHARE]` | "top three exceed 60%" | `IR-GEO-03` | CONFIGURABLE_MATERIALITY_PARAMETER (contextual question) |
| `[MAT_GROWTH_RATE]` | ">25% growth" | `IR-BUS-02` | CONFIGURABLE_MATERIALITY_PARAMETER |
| `[MAT_CASH_VALUE_SHARE]` | (implied by merged cash questions) | `IR-PRD-02` | CONFIGURABLE_MATERIALITY_PARAMETER |
| `[MAT_XBORDER_VALUE_SHARE]` | (implied by merged cross-border questions) | `IR-GEO-02` | CONFIGURABLE_MATERIALITY_PARAMETER |
| `[MAT_CDE_DEFECT_RATE]` | (implied by data-quality wording) | `CT-DQ-01` | CONFIGURABLE_MATERIALITY_PARAMETER |
| Qualitative materiality wording ("material share", "without undue delay") | retained as prose | multiple | ILLUSTRATIVE_ONLY — no numeric effect on YES/PARTIALLY/NO |

No threshold is implemented, defaulted or activated by this document.
