# AML-CFT-RBA v1.1 — supervisory methodology quality review (red-team closure)

Mode: design / red-team review only. No migration, no database write, no methodology version creation, no scores, no bands, no matrix, no effective-date rule, no STR relink write, no certification claim.

Baseline reviewed: `4dd03f5095ae7fe86af5cc9336324630a1b637b5` ("Designed AML-CFT-RBA v1.1").
Verification: `python3 scripts/verify-aml-v11-catalogue-design.py` — 36 design gates (DQ-01..DQ-36), parsed from the catalogue and documents rather than asserted by hand.

## 1. Honest catalogue census (post-closure)

| Property | Count |
| --- | --- |
| Questions in catalogue | 70 |
| Retired in this closure (documented, not deleted) | 5 |
| Inherent exposure | 17 |
| Control effectiveness | 53 |
| Question class CORE | 48 |
| Question class CONDITIONAL | 16 |
| Question class ENHANCED | 6 |
| Standard-assessment burden (CORE only) | 48 |
| `requires_observation = YES` | 69 (the contextual fact question excepted) |
| `requires_evidence = YES` | 69 |
| `allow_NA = YES` | 41 |
| Effectiveness focus: DESIGN | 14 |
| Effectiveness focus: OPERATING | 27 |
| Effectiveness focus: DESIGN_AND_OPERATING | 12 |
| Effectiveness focus: INHERENT_EXPOSURE | 17 |
| Sector: CORE_ALL / CORE_WITH_SECTOR_GUIDANCE / SECTOR_CONDITIONAL / SECTOR_OVERLAY_CANDIDATE | 44 / 4 / 13 / 9 |
| Standards strength: DIRECT_REQUIREMENT / RELATED_RISK_FACTOR / SUPERVISORY_GUIDANCE_CONTEXT | 24 / 16 / 30 |
| Standards mappings flagged and downgraded in this closure | 14 |
| Factual auto-prefill possible | 22 |
| Supervisory judgement required | 70 |

**Correction to the previous design pack.** The earlier document claimed *every* question was mandatory. That was untrue: `IR-GEO-03` and `IR-DEL-03` were published with `mandatory = NO`. The correct answer was not to force those two to `YES` so the old statement would hold; it was to introduce the class model. Mandatory now means "CORE — part of the standard assessment": 48 questions, not 70. The design document and decision pack were corrected accordingly.

## 2. Inherent question red-team (polarity: `YES` must mean more inherent exposure)

| Question | Verdict | Reason |
| --- | --- | --- |
| IR-CUS-01 high-risk customer share | REWORD | Numeric thresholds removed; now `[MAT_HIGH_RISK_CUSTOMER_SHARE]` / `[MAT_HIGH_RISK_VALUE_SHARE]` |
| IR-CUS-02 PEP exposure | KEEP | Polarity correct |
| IR-CUS-03 non-resident / non-face-to-face onboarding | KEEP | Polarity correct |
| IR-GEO-01 higher-risk jurisdiction exposure | KEEP | Polarity correct |
| IR-GEO-02 cross-border volume/value | REWORD | Absorbs IR-TRX-03; materiality parameterised |
| IR-GEO-03 corridor concentration | CONTEXT_ONLY | Concentration in *lower*-risk corridors is not greater exposure; recorded as a contextual, non-scored fact |
| IR-PRD-02 cash intensity | REWORD | Absorbs IR-TRX-02; materiality parameterised |
| IR-PRD-03 anonymity/complexity-enabling products | KEEP | Polarity correct |
| IR-BUS-02 growth / new market entry | REWORD | `[MAT_GROWTH_RATE]` placeholder; growth alone framed as exposure change, not weak control |
| IR-BUS-03 outsourced / intragroup AML operations | MOVE_TO_CONTROL | This is a control-dependency question; moved to `THIRD_PARTY_OVERSIGHT` |
| IR-DEL-01 agent / intermediary distribution | KEEP | Polarity correct |
| IR-DEL-03 non-face-to-face channel reliance | RETIRE (merge) | Duplicated IR-DEL-01 and IR-PRD-03 intent |
| IR-TRX-02 cash transaction share | RETIRE (merge into IR-PRD-02) | Double counting |
| IR-TRX-03 cross-border transaction share | RETIRE (merge into IR-GEO-02) | Double counting |
| remaining inherent questions | KEEP | Polarity confirmed on review |

Every scored inherent question now satisfies: `YES` = more inherent ML/TF exposure **before** controls. No control-quality language remains on the inherent axis.

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
