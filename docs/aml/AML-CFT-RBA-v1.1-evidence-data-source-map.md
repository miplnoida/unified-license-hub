# AML-CFT-RBA v1.1 — evidence and data-source map (DESIGN ONLY)

## 1. Principles

- Every proposed question requires an observation and at least one evidence item; assertion alone can never support a favourable response.
- Evidence strength is a **conceptual supervisory category**, not a score: `DIRECT_TESTED` (re-performed or sampled by the supervisor) > `ENTITY_PRODUCED_RECORD` (system output, register, MI) > `THIRD_PARTY_ASSURANCE` (independent testing, external audit) > `ENTITY_ASSERTION` (policy text, self-attestation).
- Design questions may be satisfied by documentation; operating-effectiveness questions require period evidence (samples, ageing, statistics, logs).
- No evidence category produces an automatic response value. The supervisor records the response and the reasoning.

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

## 3. Contradiction advisories (advisory only, never automatic scoring)

| Advisory | Trigger | Supervisory action |
| --- | --- | --- |
| ADV-01 | Monitoring asserted effective (`YES`) while alert ageing shows material backlog | Require reconciliation; response cannot remain `YES` unquantified |
| ADV-02 | CDD asserted complete while overdue-review population is material | Re-examine CT-CDD-02 evidence |
| ADV-03 | Training asserted effective while overdue completion is material | Re-examine CT-TRN-02 |
| ADV-04 | Independent testing reported no findings while remediation register shows recurring issues | Re-examine CT-IT-02 scope |
| ADV-05 | Screening asserted effective while list-update latency exceeds entity standard | Re-examine CT-SANC-02 |
| ADV-06 | STR filings zero while suspicion indicators and alert volumes are material | Re-examine CT-STRI-03 / CT-STRG-02 |
| ADV-07 | Automated monitoring asserted while MODEL_GOVERNANCE answered `NOT_APPLICABLE` on the no-automation ground | Mutually inconsistent; resolve before completion |
| ADV-08 | Data-quality defects open while any automated control asserted fully effective | Re-examine CT-DQ-01/02 |

Advisories are surfaced to the supervisor. They do not change a response, a rating or an outcome.