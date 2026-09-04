# AML-CFT-RBA v1.1 — evidence and data-source map (DESIGN ONLY)

## 1. Principles — evidence basis, not document attachment

`requires_evidence` means **requires a governed evidence basis**. It does not mean "upload one PDF per question", and there is no AML-local document store.

Acceptable evidence-basis types:

| Type | Meaning |
| --- | --- |
| `ENTERPRISE_DOCUMENT` | A registered document in the central document register (governed reference, version, access control) |
| `SYSTEM_FACT` | A governed value read from a platform record (entity profile, licence, register) with provenance |
| `REGULATORY_RETURN` | A filed return or schedule, identified by filing reference and period |
| `STRUCTURED_METRIC` | A structured fact under the fact model in §5, with numerator/denominator, period and source |
| `SUPERVISORY_SAMPLE` | A sample selected and tested by the supervisor, with population, method and result |
| `WORKPAPER` | A governed supervisory workpaper recording the test performed |
| `PRIOR_EXAMINATION` | A prior examination record or its finding set |
| `FINDING` | A recorded supervisory finding |
| `REMEDIATION_RECORD` | A remediation action and its closure validation record |
| `RFI_RESPONSE` | A governed request-for-information response |
| `AUTHORISED_EXTERNAL_SOURCE` | An external source the supervisor is authorised to rely on, with citation and retrieval date |

Rules:

- Every **final supervisory response** requires (A) a rationale/observation appropriate to the judgement and (B) a sufficient governed evidence basis (AML-METH-06).
- **Evidence may be shared.** One document, return or governed fact may support several questions; a question never has to create a duplicate evidence object. Implementation must therefore link evidence by governed reference plus provenance, not by copying artefacts.
- For **purely system-factual** questions, structured provenance (source, period/as-of, timestamp, extraction reference) satisfies the evidence requirement without any attachment.
- **DESIGN** questions may be satisfied by documentation; **OPERATING** questions require period evidence (samples, ageing, statistics, logs, structured metrics).
- **Assertion alone is never sufficient for a favourable final conclusion** where corroboration is expected.
- No evidence type produces an automatic response value, rating or finding. The supervisor records the response and the reasoning.

## 1a. Evidence quality model (attributes, not a universal hierarchy)

The previous universal ranking (`DIRECT_TESTED > ENTITY_PRODUCED_RECORD > THIRD_PARTY_ASSURANCE > ENTITY_ASSERTION`) is **withdrawn**: it is not defensible in every context — a complete system extract can be stronger evidence of population coverage than a small supervisory sample, and an independent audit can be stronger on design than either. Provenance categories are retained as descriptive labels; quality is evaluated across attributes:

| Attribute | Question it answers |
| --- | --- |
| independence | How far is the evidence from the party being assessed? |
| directness | Does it evidence the control operating, or something adjacent? |
| coverage | Whole population, statistically valid sample, or anecdote? |
| timeliness | Does it cover the assessment period, and how current is it? |
| authenticity | Is the source and integrity of the artefact established? |
| completeness | Are all in-scope products, channels and entities included? |
| reproducibility | Could another supervisor re-derive the same result? |

Evidence quality is **not scored** in this design. It is recorded and reasoned. Entity assertion alone remains insufficient for a favourable final conclusion where corroboration is expected.

## 2. Dimension evidence and source classification

| Dimension | Axis | Suggested evidence types | Candidate data sources |
| --- | --- | --- | --- |
| `CUSTOMER_RISK` | INHERENT_EXPOSURE | Enterprise ML/TF risk assessment, customer risk-classification report / segmentation extract, regulatory return customer schedules | entity profile, regulatory returns, ownership/person relationships, examination history |
| `GEOGRAPHIC_RISK` | INHERENT_EXPOSURE | Country exposure report, cross-border flow analysis, correspondent relationship register | regulatory returns, entity profile, external intelligence where authorised |
| `PRODUCTS_SERVICES_RISK` | INHERENT_EXPOSURE | Product catalogue with ML/TF ratings, new-product approval papers, product volume/value extracts | licensing/application data, entity profile, regulatory returns |
| `TRANSACTION_PROFILE_RISK` | INHERENT_EXPOSURE | Transaction volume/value MI, cash activity report, cross-border payment statistics | regulatory returns, prudential data, examination history |
| `DELIVERY_CHANNEL_RISK` | INHERENT_EXPOSURE | Channel mix MI, agent/intermediary register, digital onboarding statistics | licensing/application data, entity profile, regulatory returns |
| `BUSINESS_MODEL_RISK` | INHERENT_EXPOSURE | Group structure chart, ownership and control register, strategy/board growth papers, outsourcing register | ownership/person relationships, licensing/application data, prudential data |
| `GOVERNANCE` | CONTROL_EFFECTIVENESS | Board-approved AML/CFT framework, board and committee minutes, AML management information pack | document metadata, examination history, findings |
| `ENTERPRISE_RISK_ASSESSMENT` | CONTROL_EFFECTIVENESS | Enterprise ML/TF risk assessment and methodology, approval minute, linkage paper to control intensity | document metadata, examination history |
| `MLRO_FUNCTION` | CONTROL_EFFECTIVENESS | MLRO appointment letter and job description, fit-and-proper record, compliance resourcing plan, MLRO reports to board | fit-and-proper records, ownership/person relationships, correspondence/RFIs |
| `POLICIES_PROCEDURES` | CONTROL_EFFECTIVENESS | Board-approved AML/CFT policy, operating procedures/manuals, version and approval history | document metadata, findings |
| `CDD_KYC` | CONTROL_EFFECTIVENESS | CDD/KYC sample files, onboarding procedure, periodic-review ageing report | examination history, findings, RFI responses |
| `BENEFICIAL_OWNERSHIP` | CONTROL_EFFECTIVENESS | Beneficial ownership evidence in sample files, ownership structure charts, reverification trigger log | ownership/person relationships, examination history |
| `EDD` | CONTROL_EFFECTIVENESS | Higher-risk relationship register, EDD sample files, senior-management approval records | examination history, findings |
| `PEP_CONTROLS` | CONTROL_EFFECTIVENESS | PEP register, screening configuration and match evidence, PEP periodic review records | ownership/person relationships, examination history |
| `SANCTIONS_CONTROLS` | CONTROL_EFFECTIVENESS | Screening system configuration, list-update logs, match investigation and escalation records | examination history, enforcement, external intelligence where authorised |
| `TRANSACTION_MONITORING` | CONTROL_EFFECTIVENESS | Monitoring scenario/rule inventory, coverage mapping to products and channels, alert ageing and disposition reports | regulatory returns, examination history, findings |
| `ALERT_INVESTIGATION` | CONTROL_EFFECTIVENESS | Alert case samples, ageing and disposition MI, quality-assurance review reports | regulatory returns, examination history, findings |
| `STR_IDENTIFICATION` | CONTROL_EFFECTIVENESS | Internal suspicion report log, escalation procedure, staff awareness and case-creation evidence | STR/SAR statistics where legally available, examination history |
| `STR_GOVERNANCE` | CONTROL_EFFECTIVENESS | STR/SAR log with filing dates, timeliness statistics, not-reported decision records, confidentiality controls evidence | STR/SAR statistics where legally available, enforcement, examination history |
| `RECORD_KEEPING` | CONTROL_EFFECTIVENESS | Retention schedule, retrieval test evidence, supervisory request response history | correspondence/RFIs, examination history |
| `TRAINING` | CONTROL_EFFECTIVENESS | Training plan and curriculum, completion and overdue reports, assessment/test results | examination history, RFI responses, document metadata |
| `INDEPENDENT_TESTING` | CONTROL_EFFECTIVENESS | Independent testing / internal audit charter, AML audit plan and reports, finding tracker | examination history, findings, document metadata |
| `THIRD_PARTY_OVERSIGHT` | CONTROL_EFFECTIVENESS | Third-party/agent due diligence files, contract AML clauses, ongoing monitoring and review reports | licensing/application data, examination history, complaints/conduct |
| `AML_DATA_QUALITY` | CONTROL_EFFECTIVENESS | Critical data element definitions, data-quality and reconciliation reports, defect remediation register | regulatory returns, findings |
| `MODEL_GOVERNANCE` | CONTROL_EFFECTIVENESS | Rule/scenario/model inventory, validation or independent review reports, tuning and threshold change records | examination history, findings, document metadata |
| `REMEDIATION_TRACKING` | CONTROL_EFFECTIVENESS | Issue and action register, overdue action MI, closure validation evidence | findings, remediation, enforcement, examination history |

## 3. Contradiction advisories (advisory only, never automatic)

No advisory changes an answer, a rating or creates a finding automatically. Every advisory is raised to the officer, who must record one resolution state: `RESOLVED`, `ACCEPTED_WITH_RATIONALE` or `ESCALATED_FOR_REVIEW`. An unresolved advisory does not block a response; it is visible on the working file and in review.

| Advisory | Source of signal | Trigger | False-positive risk | Evidence needed to resolve | Officer resolution |
| --- | --- | --- | --- | --- | --- |
| ADV-01 | `FACT-ALERT-BACKLOG`, `FACT-ALERT-AGEING-BANDS` vs `CT-TM-03` | Monitoring/alerting asserted effective while alert ageing shows material backlog | Medium — a backlog may be a known, funded, time-bound remediation | Backlog quantification plus remediation record | RESOLVED / ACCEPTED_WITH_RATIONALE / ESCALATED_FOR_REVIEW |
| ADV-02 | `FACT-CDD-OVERDUE-SHARE` vs `CT-CDD-02` | CDD asserted current while overdue-review population is material | Low | Overdue ageing extract and risk-tiering of the overdue population | as above |
| ADV-03 | `FACT-TRAINING-COMPLETION-SHARE` vs `CT-TRN-02` | Training asserted effective while completion is materially incomplete | Medium — long-leave and new-joiner timing | Completion report with exclusion basis | as above |
| ADV-04 | `FACT-REPEAT-FINDING-COUNT` vs `CT-IT-02` | Independent testing reported no findings while remediation shows recurring issues | Medium — scope may legitimately exclude the recurring area | Testing scope and plan versus the recurring issue population | as above |
| ADV-05 | `FACT-LIST-UPDATE-LAG-DAYS` vs `CT-SANC-02` | Screening asserted effective while list-update latency exceeds the entity standard | Low | Update logs and rescreening completion evidence | as above |
| ADV-06 | `FACT-STR-FILED-COUNT`, `FACT-ALERT-VOLUME` vs `CT-STRI-03` / `CT-STRG-02` | Zero filings while suspicion indicators and alert volumes are material | Medium — a genuinely low-risk small entity may legitimately file none | Internal report log and case dispositions | as above |
| ADV-07 | `CT-MG-*` trigger vs monitoring answers | Automated monitoring asserted while model-governance questions are recorded `NOT_TRIGGERED` on the no-automation ground | Low | Confirmation of whether detection is automated | as above (mutually inconsistent; resolve before completion) |
| ADV-08 | `FACT-DQ-DEFECTS-OPEN` vs `CT-DQ-01` | Data-quality defects open while an automated control is asserted fully effective | Medium — defects may not touch AML-critical elements | Defect register mapped to critical data elements | as above |

## 4. Evidence-basis defaults by question type

| Question type | Default acceptable evidence bases |
| --- | --- |
| Inherent exposure | `STRUCTURED_METRIC`, `SYSTEM_FACT`, `REGULATORY_RETURN`, `ENTERPRISE_DOCUMENT`, `AUTHORISED_EXTERNAL_SOURCE`, `RFI_RESPONSE` |
| Control — DESIGN | `ENTERPRISE_DOCUMENT`, `WORKPAPER`, `PRIOR_EXAMINATION`, `RFI_RESPONSE` |
| Control — OPERATING | `SUPERVISORY_SAMPLE`, `WORKPAPER`, `SYSTEM_FACT`, `STRUCTURED_METRIC`, `ENTERPRISE_DOCUMENT`, `FINDING`, `REMEDIATION_RECORD`, `RFI_RESPONSE` |
| Control — DESIGN_AND_OPERATING | `ENTERPRISE_DOCUMENT`, `SUPERVISORY_SAMPLE`, `WORKPAPER`, `STRUCTURED_METRIC`, `PRIOR_EXAMINATION`, `RFI_RESPONSE` |

Per-question acceptable types are recorded on every question in the catalogue (`evidence_basis_types`).

## 5. Structured fact model (provider-neutral, design only)

Questions that depend on quantitative facts carry `fact_requirements` naming `FACT-*` codes. A fact is a governed record, not free text:

| Field | Purpose |
| --- | --- |
| `fact_code` | Stable identifier (e.g. `FACT-CDD-OVERDUE-SHARE`) |
| `label` | Human-readable name |
| `data_type` | integer / decimal / percentage / currency / date / boolean |
| `unit` | count, %, currency code |
| `numerator` / `denominator` | For any ratio, both sides are recorded — never a bare percentage |
| `period` / `as_of` | Period covered or point-in-time date |
| `source_type` | One of the evidence-basis types (`REGULATORY_RETURN`, `SYSTEM_FACT`, `ENTERPRISE_DOCUMENT`, `RFI_RESPONSE`, …) |
| `source_reference` | Governed reference into that record |
| `source_timestamp` | When the value was extracted or filed |
| `peer_group` | Where comparison is relevant (e.g. `FACT-PEER-GROUP-MEDIAN-VALUE`) |
| `materiality_basis` | Which configuration parameter the officer judged against (`[MAT_*]`) |
| `required` / `optional` | Whether the question can be answered without it |
| `auto_prefill_allowed` | Whether the platform may propose the value |
| `officer_edit_allowed` | Whether the officer may override, always with rationale |
| `provenance` | Retained on every value: who/what produced it, from where, when |

Illustrative fact families: high-risk customer count/share, non-resident share, PEP count/share, cash value/share, cross-border volume/value, transaction scale and peer median, CDD overdue count/share/ageing, alert volume/backlog/ageing, STR filing timeliness, training completion, open and overdue remediation actions, data-quality defect rate.

**No rating, score, band or threshold is derived from these facts by this design.** Facts support supervisory judgement and are the input surface for a future, separately approved configurable calculation policy. A prefilled fact never answers a question; the officer records the response.
