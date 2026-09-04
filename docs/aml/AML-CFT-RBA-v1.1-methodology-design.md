# AML-CFT-RBA v1.1 — supervisory methodology content design (DESIGN ONLY, NOT APPROVED)

Baseline: `4dd03f5095ae7fe86af5cc9336324630a1b637b5` (quality closure of 2026-09-04; original design baseline `64dd3ca4173c93809988238f3add7aabbc11a6e6`). No migration, database write, methodology version, calculation configuration, score, band, matrix or effective-date rule is created by this design. No decision below is regulator-approved.

## 1. v1.0 census and classification

Active methodology `AML-CFT-RBA` v1.0 (`1e248dc0-c559-48d7-bcf3-70d6ec5db99a`, domain `AML_CFT`): 26 dimensions, 41 active questions (12 inherent, 29 control), all `guidance` empty, all dimensions `min_evidence_count = 1`, and six control dimensions with no questions: `AML_DATA_QUALITY`, `INDEPENDENT_TESTING`, `MODEL_GOVERNANCE`, `REMEDIATION_TRACKING`, `THIRD_PARTY_OVERSIGHT`, `TRAINING`.

Classification of every v1.0 question, by disposition in v1.1:

| Disposition | Meaning | Count (v1.1 questions carrying it) |
| --- | --- | --- |
| KEEP | see §9 | 5 |
| MERGE | see §9 | 2 |
| MOVE_DIMENSION | see §9 | 6 |
| NEW | see §9 | 26 |
| REWORD | see §9 | 14 |
| SEMANTIC_CORRECTION | see §9 | 9 |
| SPLIT | see §9 | 13 |

Full per-question mapping is in the catalogue document (`v1.0_mapping` and `change_classification` fields).

## 2. Design principles

1. **Exposure is separated from control.** Inherent questions measure exposure before any mitigation; a missing control is never recorded as low exposure.
2. **Policy existence is never proof of effectiveness.** Design and operating effectiveness are separated wherever the operating failure mode is distinct.
3. **Every final supervisory response is reasoned and evidence-based.** A question requires a rationale/observation proportionate to the judgement and a sufficient *governed evidence basis* (§8): `requires_evidence` on a question means a governed evidence basis is required, not a document upload. Evidence basis may be shared across questions or satisfied by governed system facts; it is not a per-question document upload. Assertion alone never supports a favourable conclusion where corroboration is expected.
4. **No automated supervisory outcome.** The methodology produces inputs to judgement; the residual rating, judgement and response remain supervisory acts.
5. **Proportionality is applied through question class, not by weakening a control.** A catalogue question is not automatically mandatory in every assessment: CORE questions form the standard assessment, CONDITIONAL questions are asked only when the entity/sector/activity trigger applies, and ENHANCED questions belong to examination, thematic or elevated-risk work (§4a).
6. **Jurisdiction references are deployment-configured placeholders**, never hardcoded law.

## 3. Assessment chain

```text
INHERENT ML/TF EXPOSURE  ->  CONTROL EFFECTIVENESS  ->  RESIDUAL RISK
        (6 dimensions)            (20 dimensions)          (supervisory)
                                                    ->  SUPERVISORY JUDGEMENT
                                                    ->  SUPERVISORY RESPONSE
```

## 4. Response semantics

### Inherent exposure

- `YES` — The exposure characteristic is present and material to the entity, judged against the materiality criteria in the guidance.
- `PARTIALLY` — The exposure characteristic exists but is limited, bounded or below the materiality criteria (e.g. small share, capped values, single non-recurring corridor).
- `NO` — The exposure characteristic is absent or immaterial for the assessment period.
- `NOT_APPLICABLE` — The underlying activity is genuinely not undertaken by the entity in the assessment period (not: unknown, unevidenced or unanswered).

### Control effectiveness — context-sensitive by effectiveness focus

Semantics follow the question's `effectiveness_focus`. A pure DESIGN question never requires operating evidence.

- `CONTROL_SEM_DESIGN` — `YES` = the control is appropriately designed and proportionate to this entity's risk, nature, size and complexity. Operating evidence is not required.
- `CONTROL_SEM_OPERATING` — `YES` = the control operated effectively over the relevant period or sample, evidenced by period data, samples or system facts.
- `CONTROL_SEM_DESIGN_AND_OPERATING` — `YES` = both of the above.
- `CONTEXT_FACT_SEM` — a contextual fact is recorded (no favourable/adverse polarity, never scored).

Common to all three control semantics:

- `YES` — as defined for the focus above.
- `PARTIALLY` — Material design gaps (DESIGN) or evidenced exceptions in operation (OPERATING) leave residual weakness.
- `NO` — The control is absent, or so weak in design or operation that it cannot be relied upon.
- `NOT_APPLICABLE` — The activity the control addresses is genuinely not undertaken (e.g. no agents at all), so the control cannot exist. Never used because evidence is missing, the entity did not answer, or the control is weak.

`NOT_APPLICABLE` is permitted only where the catalogue states a condition, always requires a rationale, and is never a favourable response.

## 4a. Question classes and standard-assessment burden

A catalogue question is not the same thing as a mandatory question.

| Class | Meaning | Count |
| --- | --- | --- |
| CORE | Normally required for a standard assessment of any regulated entity | 48 |
| CONDITIONAL | Asked only where the stated entity/sector/activity trigger applies (`trigger_condition`) | 16 |
| ENHANCED | Used for elevated-risk, targeted, thematic or examination/deep-dive work | 6 |
| | **Total catalogue** | **70** |

Standard assessment expected burden: **48** questions (of which 16 are quantitatively fact-backed and 12 are inherent). Conditional potential: up to **16** further questions where triggers apply (a full-scope bank typically triggers 10-12; a small DNFBP typically 2-4). Enhanced potential: **6** further questions in examination or thematic work. A standard cycle therefore never requires 70 questions, 70 observations and 70 separate evidence objects.

`NOT_TRIGGERED` (the conditional trigger did not apply), `NOT_ASKED` / `OUT_OF_SCOPE` (the class was not in scope for this assessment type) and `NOT_APPLICABLE` (the activity is genuinely not undertaken) are three different states. None may silently score zero or full; future calculation configuration must handle each explicitly (see AML-DEC-06/07 and AML-METH-02/03).

## 5. Dimensions and question counts

| # | Dimension | Axis | Proposed questions |
| --- | --- | --- | --- |
| 1 | `CUSTOMER_RISK` | INHERENT | 4 |
| 2 | `GEOGRAPHIC_RISK` | INHERENT | 3 |
| 3 | `PRODUCTS_SERVICES_RISK` | INHERENT | 4 |
| 4 | `TRANSACTION_PROFILE_RISK` | INHERENT | 4 |
| 5 | `DELIVERY_CHANNEL_RISK` | INHERENT | 3 |
| 6 | `BUSINESS_MODEL_RISK` | INHERENT | 3 |
| 7 | `GOVERNANCE` | CONTROL | 3 |
| 8 | `ENTERPRISE_RISK_ASSESSMENT` | CONTROL | 3 |
| 9 | `MLRO_FUNCTION` | CONTROL | 2 |
| 10 | `POLICIES_PROCEDURES` | CONTROL | 2 |
| 11 | `CDD_KYC` | CONTROL | 3 |
| 12 | `BENEFICIAL_OWNERSHIP` | CONTROL | 2 |
| 13 | `EDD` | CONTROL | 2 |
| 14 | `PEP_CONTROLS` | CONTROL | 2 |
| 15 | `SANCTIONS_CONTROLS` | CONTROL | 3 |
| 16 | `TRANSACTION_MONITORING` | CONTROL | 3 |
| 17 | `ALERT_INVESTIGATION` | CONTROL | 2 |
| 18 | `STR_IDENTIFICATION` | CONTROL | 3 |
| 19 | `STR_GOVERNANCE` | CONTROL | 4 |
| 20 | `RECORD_KEEPING` | CONTROL | 2 |
| 21 | `TRAINING` | CONTROL | 3 |
| 22 | `INDEPENDENT_TESTING` | CONTROL | 3 |
| 23 | `THIRD_PARTY_OVERSIGHT` | CONTROL | 3 |
| 24 | `AML_DATA_QUALITY` | CONTROL | 3 |
| 25 | `MODEL_GOVERNANCE` | CONTROL | 3 |
| 26 | `REMEDIATION_TRACKING` | CONTROL | 3 |
| | **Total** | | **75** |

Counts above are the pre-closure proposal. After the quality closure of 2026-09-04 (5 retirements, 2 merges, 1 move-to-control, 1 context-only): inherent **17** (12 CORE, 5 CONDITIONAL incl. 1 contextual non-scored), control **53**, total **70** (v1.0: 41). The six previously empty control dimensions receive 18 questions and are no longer empty.

## 6. Design vs operating effectiveness

| Focus | Questions |
| --- | --- |
| DESIGN | 14 |
| OPERATING | 27 |
| DESIGN_AND_OPERATING | 12 |
| INHERENT_EXPOSURE | 17 |

The split is selective: it is applied where a control can be well designed and still fail in operation (CDD, monitoring, screening, training, testing, remediation, STR), and avoided where a single question is sufficient.

## 7. STR identification / governance boundary

- `STR_IDENTIFICATION` covers **detection and internal escalation**: recognition capability, capture of internal reports as investigable cases, and the integrity and timeliness of escalation to the MLRO function.
- `STR_GOVERNANCE` covers **decision, filing and containment**: filing authority, decision record for filed and not-filed cases, external filing timeliness and quality, FIU feedback, confidentiality/tipping-off and retention.
- The boundary is the arrival of the suspicion at the authorised decision-maker.
- Legacy `STR_SAR_GOVERNANCE`: measured fact — **22** assessment-dimension rows across 22 assessments whose **host assessments are bound to active `AML-CFT-RBA` v1.0**; the 22 rows themselves carry **no canonical methodology-dimension link** (`methodology_dimension_id IS NULL`). They hold **0 question responses**, **0 calculated scores** and **0 dependent calculated ratings**; they do carry officer-judged dimension ratings and rationale. Host statuses: 19 approved, 1 superseded, 1 submitted, 1 draft — the population is **not** historical only and remains reachable by active writers.
- Recommended operating decision (AML-METH-08): a **governed, audited relink** of the 22 rows to canonical `STR_GOVERNANCE`, preserving the original code and provenance, assessment status, responses, judged ratings and history. No rating is invented because no responses or calculated results exist. **No write is performed in this wave.**

## 8. Evidence, data sources, contradictions and N/A discipline

See `AML-CFT-RBA-v1.1-evidence-data-source-map.md` for evidence categories, per-dimension evidence and source classification, and advisories ADV-01..ADV-08. N/A conditions are enumerated per question in the catalogue; unlisted N/A use is not permitted.

## 9. Sector overlays, FATF mapping, proportionality

Target architecture is a **global AML/CFT core plus sector applicability/overlay capability**, not one 75-question global methodology answered largely `NOT_APPLICABLE`.

| Sector applicability | Meaning | Count |
| --- | --- | --- |
| CORE_ALL | Asked of every sector in the same terms | 44 |
| CORE_WITH_SECTOR_GUIDANCE | Same question, sector-specific interpretation in guidance | 4 |
| SECTOR_CONDITIONAL | Asked only where the sector/activity trigger applies | 13 |
| SECTOR_OVERLAY_CANDIDATE | Belongs in a sector overlay (correspondent/remittance, virtual assets, agent networks, automated detection) | 9 |

Sector reading of the core: banks and credit unions trigger most conditional questions (credit unions with reduced product/geography triggers); insurance triggers PEP/EDD and third-party distribution but rarely cash or corridors; securities triggers complex products and non-resident exposure; MSBs trigger cash, corridors and agents; VASPs trigger virtual-asset products, corridors and automated detection; DNFBPs are assessed engagement-by-engagement with most automated-detection and agent questions untriggered; other populations resolve through the same trigger set.

Future overlay capability (design intent only, not implemented in this wave): overlays should be expressed as sector-scoped **applicability and guidance records over the same canonical question catalogue**, resolved by the existing entity-context methodology resolver, so no question text, evidence contract, document store or storage architecture is duplicated. `standards_reference_strength` distinguishes `DIRECT_REQUIREMENT` (24 questions), `RELATED_RISK_FACTOR` (16) and `SUPERVISORY_GUIDANCE_CONTEXT` (30); 14 mappings were flagged and downgraded in the quality closure. Local legal obligations remain deployment-configured placeholders; no jurisdiction law is hardcoded.
- Proportionality is expressed through question class and guidance, never by exempting a control that applies.

## 10. Non-automated supervisory outcomes

The methodology produces per-question responses, observations and evidence. Residual rating, overall judgement and supervisory response remain supervisory decisions recorded with rationale. No calculation values are proposed in this wave.

## 11. v1.0 → v1.1 transition policy (proposed, not approved)

- **APPROVED / SUPERSEDED v1.0 assessments** — never re-versioned, remain reproducible against the bound v1.0 structure.
- **DRAFT v1.0 assessments** — may be abandoned or superseded and recreated under v1.1 through a governed, audited process where the supervisor decides that is appropriate. Never silently re-versioned.
- **SUBMITTED / UNDER-REVIEW v1.0 assessments** — require an explicit supervisory decision per assessment: finish under v1.0, or return/cancel and restart under v1.1.
- v1.1 is authored as a DRAFT version and applies only to assessments created on or after its approved effective date.
- v1.0 questions not carried forward are retired in v1.1 only, never deleted, preserving historical rendering.
- Legacy `AML_RBA` v1.0 structure is untouched. No migration is performed in this wave.

## 12. Decision register

See AML-METH-01..AML-METH-10 appended to `docs/aml/AML-CFT-methodology-calculation-decision-pack.md`. All are `AWAITING SUPERVISORY APPROVAL`.

## 13. Design-only verification

Verification is executed by `scripts/verify-aml-v11-catalogue-design.py`, which parses the catalogue rather than restating manually entered counts: 36 gates (DQ-01..DQ-36), **36/36 PASS**. It proves the exact question count, mandatory/class counts, unique codes, 26/26 dimension coverage, polarity-review status on every inherent question, response semantics on every scored question, fact requirements or a stated reason on every question, acceptable evidence-basis types on every evidence requirement, N/A conditions, absence of numeric thresholds in question prose and guidance, resolved duplicate intent, corrected STR legacy wording and an unapproved decision register. No database object is read or modified.

## 14. Verdicts

- **METHODOLOGY QUALITY — PASS** (quality closure of 2026-09-04; see `AML-CFT-RBA-v1.1-quality-review.md`)
- **AML-CFT-RBA v1.1 CONTENT DESIGN COMPLETE — YES** (70 questions: 48 CORE, 16 CONDITIONAL, 6 ENHANCED)
- **READY FOR SUPERVISORY REVIEW — YES**
- **REGULATOR-APPROVED — NO** (no decision in AML-METH-01..10 is approved)
- **READY FOR IMPLEMENTATION — NO** (implementation is gated on approval of AML-METH-01..10)
- **AML FULL MODULE HARDENING — NOT CERTIFIED**