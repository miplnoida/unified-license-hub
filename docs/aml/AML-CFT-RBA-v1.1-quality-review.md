# AML-CFT-RBA v1.1 — supervisory methodology quality review (red-team closure)

Mode: design / red-team review only. No migration, no database write, no methodology version creation, no scores, no bands, no matrix, no effective-date rule, no STR relink write, no certification claim.

Baseline reviewed: `4dd03f5095ae7fe86af5cc9336324630a1b637b5` ("Designed AML-CFT-RBA v1.1").
Final micro-closure input baseline: `68ed14448cb24ba71fe34d3da2f29873b2e4bcdb` ("Red-temed AML v1.1 catalogue").
Verification: `python3 scripts/verify-aml-v11-catalogue-design.py` — 50 design gates (DQ-01..DQ-50), every count **parsed** from the catalogue rather than asserted by hand.

## 1. Honest catalogue census (parsed, post-closure)

| Property | Count |
| --- | --- |
| Active questions in catalogue | 70 |
| Retired in this closure (documented, not deleted) | 5 |
| Inherent exposure entries | 17 |
| Control effectiveness entries | 53 |
| Question class CORE | 48 |
| Question class CONDITIONAL | 16 |
| Question class ENHANCED | 6 |
| Standard-assessment burden (CORE only) | 48 |
| `mandatory` YES / NO | 48 / 22 |
| `requires_observation` YES / NO | 69 / 1 (the contextual fact entry) |
| `requires_evidence` YES / NO | 70 / 0 |
| `allow_NA` YES / NO | 26 / 44 |
| `factual_auto_prefill_possible` YES / NO | 40 / 30 |
| `supervisory_judgement_required` YES / NO | 67 / 3 |
| Effectiveness focus: DESIGN | 14 |
| Effectiveness focus: OPERATING | 27 |
| Effectiveness focus: DESIGN_AND_OPERATING | 12 |
| Effectiveness focus: INHERENT_EXPOSURE | 17 |
| Sector: CORE_ALL / CORE_WITH_SECTOR_GUIDANCE / SECTOR_CONDITIONAL / SECTOR_OVERLAY_CANDIDATE | 44 / 4 / 13 / 9 |
| Standards strength: DIRECT_REQUIREMENT / RELATED_RISK_FACTOR / SUPERVISORY_GUIDANCE_CONTEXT | 24 / 16 / 30 |
| Standards mappings flagged and downgraded in this closure | 14 |

**Correction to the previous census.** The earlier version of this document claimed *supervisory judgement required* on all 70 questions. Parsing the catalogue proves otherwise: **supervisory_judgement_required = YES **67** / NO **3**** (`IR-TRX-01`, `CT-ERA-01`, `CT-RK-01`). Earlier stated `allow_NA = YES` 41 and `factual_auto_prefill_possible` 22 were also stale; the parsed values are 26 and 40. The previous claim is corrected: **YES**.

`supervisory_judgement_required = NO` does NOT mean the officer has no responsibility. It means the primary determination is a governed factual or design test — a recorded, provenance-bearing fact or the existence of a documented, board-approved arrangement — rather than a discretionary supervisory judgement. The officer remains responsible for validating provenance, confirming the fact is the right fact for the period and entity, and recording the assessment. Nothing in this class is auto-answered.

**Correction to the previous design pack.** The earlier document claimed *every* question was mandatory. That was untrue: `IR-GEO-03` and `IR-DEL-03` were published with `mandatory = NO`. The correct answer was not to force those two to `YES` so the old statement would hold; it was to introduce the class model. Mandatory now means "CORE — part of the standard assessment": 48 questions, not 70.

## 1A. Contextual versus scored inherent semantics (locked)

- INHERENT CATALOGUE ENTRIES = 17
- SCORED INHERENT = 16
- CONTEXTUAL NOT SCORED = 1 (`IR-GEO-03`, corridor concentration)

`IR-GEO-03` remains `CONTEXTUAL_NOT_SCORED`. For future calculation design, a `CONTEXTUAL_NOT_SCORED` entry must **not** enter a score denominator, must not affect question completeness for scoring, must not receive a response score, and must not change a risk band. It may still require its configured factual evidence, appear in assessment context, support supervisory rationale, trigger an advisory and inform another judgement. No calculation is implemented in this wave.

## 1B. Question-class accounting (confirmed)

CORE **48** / CONDITIONAL **16** / ENHANCED **6** — parsed, matching the published header. CORE is the standard assessment burden. `CONDITIONAL` and `ENHANCED` questions that are not triggered must not be treated as unanswered CORE questions. Three states remain distinct and reserved for the calculation policy: `NOT_TRIGGERED` (in scope, condition absent), `NOT_ASKED` (out of scope for the assessment type), `NOT_APPLICABLE` (in scope, asked, genuinely inapplicable with rationale). No scoring treatment is defined here beyond the invariant that none of the three may silently become a zero score or a full score.

## 1C. Retired draft questions (confirmed outside the active catalogue)

`IR-BUS-03`, `IR-DEL-03`, `IR-TRX-02`, `IR-TRX-03`, `CT-DQ-02` — absent from the 70 active entries (gate DQ-47), documented in catalogue §Z with their retirement reason and the question that now carries their intent. They are not recreated.

## 2. Scored inherent red-team (polarity: `YES` must mean more inherent exposure, before controls)

| Question | Verdict | Reason |
| --- | --- | --- |
| IR-CUS-01 higher-risk customer share | PASS | YES = more higher-risk customers; thresholds parameterised |
| IR-CUS-02 opaque / complex customer structures | PASS | YES = more ownership opacity |
| IR-CUS-03 non-resident and cross-border customers | PASS | YES = larger share outside the domestic perimeter |
| IR-CUS-04 PEP exposure | PASS | Stated as a customer characteristic, explicitly independent of PEP control quality |
| IR-GEO-01 higher-risk / monitored jurisdiction exposure | PASS | YES = more higher-risk jurisdiction exposure |
| IR-GEO-02 cross-border, correspondent, remittance flows | PASS | Absorbs IR-TRX-03; stated by volume and value |
| IR-PRD-01 anonymity / opacity / third-party-payment features | PASS | Product features only; mitigating controls explicitly excluded |
| IR-PRD-02 cash intensity | PASS | Absorbs IR-TRX-02; product design plus actual cash share, before controls |
| IR-PRD-03 speed of value movement | PASS | YES = faster movement of value |
| IR-PRD-04 complex, structured, virtual-asset products | PASS | YES = more product complexity |
| IR-TRX-01 transaction volume and value | PASS | YES = greater scale; factual test |
| IR-TRX-04 velocity, pass-through, concentration | PASS | Observed activity; explicitly not a monitoring-failure finding |
| IR-DEL-01 remote / non-face-to-face onboarding | PASS | YES = more remote onboarding |
| IR-DEL-02 agent, intermediary, third-party distribution | PASS | Distribution distance only; oversight quality sits in `CT-TPO-*` |
| IR-BUS-01 ownership / group structural complexity | PASS | YES = more structural opacity |
| IR-BUS-02 material growth or change in exposure surface | PASS | Rewritten this wave — see §2A |

Contextual entry: `IR-GEO-03` — CONTEXT_ONLY, not scored (concentration alone is not risk-positive; a concentrated low-risk corridor is not greater exposure).

No scored inherent question remains FAIL. Gate DQ-45 scans prompt, supervisory intent, guidance and polarity review of every scored inherent question for language making exposure depend on policy, control, monitoring, CDD, staffing, governance, training, remediation, system performance or mitigation adequacy; explicit deferrals ("assessed in the relevant CONTROL dimensions") are permitted, dependency language is not.

## 2A. IR-BUS-02 inherent purity correction

| | Text |
| --- | --- |
| Prompt before | The entity experienced rapid growth or material change in the assessment period. |
| Intent before | Measure exposure from change **outpacing the control environment**. |
| Polarity before | KEEP — YES = **controls calibrated to a smaller prior scale** = more unmitigated exposure. |
| Guidance before | … Growth raises exposure **because controls are calibrated to the prior scale**. |
| Prompt after | Material growth or material change in the assessment period expanded or materially altered the entity's ML/TF exposure surface. |
| Intent after | Measure the additional ML/TF exposure surface created by material change in scale, customers, transaction activity, products, services, channels, jurisdictions, ownership, group structure or business model, before considering the adequacy of any mitigating control. |
| Polarity after | KEEP — YES = material growth or change expanded or materially altered the exposure surface, measured before controls. |
| Guidance after | Measures the change in exposure surface and records the figures and change events relied on; states explicitly that whether governance, staffing, systems, risk assessment, transaction monitoring, CDD or other controls kept pace is assessed in the relevant CONTROL dimensions and must not influence the answer here. |

`[MAT_GROWTH_RATE]` is preserved as a configurable materiality parameter. No score is authored. Inherent-purity verdict: **PASS**.


## 3. Control duplication / burden review

| Overlap | Resolution |
| --- | --- |
| `CT-DQ-02` reconciliation vs `CT-DQ-01` defect management and `CT-TM-02` data completeness | `CT-DQ-02` retired |
| `CT-IT-03` remediation closure vs `CT-REM-03` closure validation | `CT-IT-03` narrowed to board/audit-committee reporting |
| Sampling-based tests (`CT-CDD-03`, `CT-ALRT-02`, `CT-STRI-03`, `CT-STRG-03`, `CT-TRN-03`, `CT-REM-03`) | Reclassified ENHANCED — examination / thematic work, not every standard cycle |
| Third-party oversight and model governance | Reclassified CONDITIONAL on the presence of third parties / automated detection |
| Training completion vs training effectiveness | Retained as design/operating pair; only completion is CORE |

No duplicate intent remains unresolved (`DQ-27`).

## 4. Structured fact model

Defined in `AML-CFT-RBA-v1.1-evidence-data-source-map.md` §5: `fact_code`, `label`, `data_type`, `unit`, `numerator`/`denominator` (both sides recorded for every ratio), `period`/`as_of`, `source_type`, `source_reference`, `source_timestamp`, `peer_group`, `materiality_basis`, `required`/`optional`, `auto_prefill_allowed`, `officer_edit_allowed`, `provenance`. Provider-neutral: no vendor, no schema, no ETL assumption. A prefilled fact never answers a question.

## 5. Evidence basis model

`requires_evidence` means a **governed evidence basis**, one of eleven types (`ENTERPRISE_DOCUMENT`, `SYSTEM_FACT`, `REGULATORY_RETURN`, `STRUCTURED_METRIC`, `SUPERVISORY_SAMPLE`, `WORKPAPER`, `PRIOR_EXAMINATION`, `FINDING`, `REMEDIATION_RECORD`, `RFI_RESPONSE`, `AUTHORISED_EXTERNAL_SOURCE`). Evidence may be inherited or shared across questions; one fact may support several questions; system-factual questions are satisfied by structured provenance without an upload; assertion alone never supports a favourable conclusion. AML-METH-06 was rewritten accordingly.

## 6. Evidence quality model

The universal hierarchy `DIRECT_TESTED > ENTITY_PRODUCED_RECORD > THIRD_PARTY_ASSURANCE > ENTITY_ASSERTION` is withdrawn as indefensible in every context. Quality is evaluated across independence, directness, coverage, timeliness, authenticity, completeness and reproducibility, and is recorded and reasoned rather than scored.

## 7. STR legacy fact — corrected: **YES**

Measured: 22 assessment-dimension rows in 22 assessments, `dimension_code = STR_SAR_GOVERNANCE`, `methodology_dimension_id IS NULL`; host assessments **bound to active `AML-CFT-RBA` v1.0**; **0 question responses**, 0 calculated scores, 0 dependent calculated ratings; officer-judged dimension ratings and rationale present. Host status: 19 approved, 1 superseded, 1 submitted, 1 draft. The population is therefore not historical only and remains reachable by active writers. The earlier wording ("bound to the superseded `AML_RBA` v1.0", "historical") was wrong and has been corrected in the design document and decision pack.

## 8. STR decision (AML-METH-08, rewritten)

Recommendation: on methodology-owner confirmation of semantic equivalence, perform a **governed, audited, idempotent relink** of the 22 rows to canonical `STR_GOVERNANCE`, preserving original code and provenance, assessment status, responses, judged ratings and history. Display-only mapping is rejected as a final route because it leaves LINK-11 permanently open. **No write in this wave.**

## 9. STR boundary — final

- `STR_IDENTIFICATION` — detection, internal case capture, internal escalation.
- `STR_GOVERNANCE` — filing decision, timeliness, quality, confidentiality/tipping-off, records, backlog, oversight.

No question straddles both after the closure.

## 10. Sector scalability

Global AML/CFT core plus sector applicability/overlay capability (AML-METH-09): 44 CORE_ALL, 4 CORE_WITH_SECTOR_GUIDANCE, 13 SECTOR_CONDITIONAL, 9 SECTOR_OVERLAY_CANDIDATE. Overlays are to be expressed as sector-scoped applicability and guidance over the same canonical catalogue, resolved through the existing entity-context methodology resolver — no duplicated question text, evidence contract, document store or storage architecture.

## 11. Transition recommendation

APPROVED/SUPERSEDED v1.0 assessments are never re-versioned. DRAFT v1.0 may be abandoned or superseded and recreated under v1.1 through a governed process. SUBMITTED/REVIEWED v1.0 requires an explicit per-assessment supervisory decision. No migration in this wave.

## 12. Advisory model

Eight advisories (ADV-01..ADV-08) with signal source, trigger, false-positive risk and resolving evidence. No advisory changes an answer, a rating or creates a finding automatically. Each requires an officer resolution state: `RESOLVED`, `ACCEPTED_WITH_RATIONALE` or `ESCALATED_FOR_REVIEW`.

## 13. Decision register

`AML-METH-01..10` were rewritten to reflect the reviewed design. Every item remains **AWAITING SUPERVISORY APPROVAL**; none is marked regulator-approved.

## 14. Verdicts

- **METHODOLOGY QUALITY — PASS**
- **INHERENT POLARITY — PASS**
- **EVIDENCE MODEL — PASS**
- **SECTOR SCALABILITY — PASS**
- **STR LEGACY DECISION — READY FOR SUPERVISORY DECISION** (no write performed)
- **READY FOR SUPERVISORY APPROVAL — YES** (design complete and internally consistent; approval itself outstanding)
- **READY TO CREATE v1.1 DRAFT — NO** (blocked on AML-METH-01..10 approval)
- **READY FOR CALCULATION POLICY APPROVAL — NO**
- **AML/CFT FULL MODULE — NOT CERTIFIED**
