# AML-CFT-RBA v1.1 — proposed question catalogue (DESIGN ONLY, NOT APPROVED)

Proposed questions: **75** (21 inherent exposure, 54 control effectiveness) across 26 dimensions. No database object, version, score, band, matrix or effective-date rule is created by this document.

Placeholders in square brackets (e.g. `[LOCAL_STR_DEADLINE_REF]`) are deployment-configured jurisdiction references, not hardcoded law.

## A. Inherent ML/TF exposure

### CUSTOMER_RISK — Customer Risk

#### IR-CUS-01

| Field | Value |
| --- | --- |
| dimension_code | `CUSTOMER_RISK` |
| question_code | `IR-CUS-01` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Higher-risk customer classes represent a material share of the customer base. |
| supervisory_intent | Measure exposure arising from the composition of the customer base, before any control is considered. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1, R.10 |
| sector_classification | CORE |
| sector_notes | All sectors. For DNFBPs assess by engagement type rather than account count. |
| suggested_evidence_types | Enterprise ML/TF risk assessment, customer risk-classification report / segmentation extract, regulatory return customer schedules |
| candidate_data_sources | entity profile, regulatory returns, ownership/person relationships, examination history |
| v1.0_mapping | CUSTOMER_RISK.Q1, CUSTOMER_RISK.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Assess against the classes the entity itself, or supervisory guidance, treats as higher ML/TF risk. Materiality is judged on both share (indicative: >10% of customers or >20% of value) and absolute count for a small entity. Record the figures used. Absence of a customer risk classification is a CONTROL weakness recorded under CDD_KYC / ENTERPRISE_RISK_ASSESSMENT, not a NO here; where the entity cannot quantify, the supervisor estimates from returns and states the basis.

#### IR-CUS-02

| Field | Value |
| --- | --- |
| dimension_code | `CUSTOMER_RISK` |
| question_code | `IR-CUS-02` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Legal persons, trusts, nominee or otherwise complex customer structures are material to the business. |
| supervisory_intent | Measure opacity-of-ownership exposure introduced by the customer mix. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, R.24, R.25 |
| sector_classification | CORE |
| sector_notes | Materially higher for corporate service providers, private banking and trust businesses. |
| suggested_evidence_types | Enterprise ML/TF risk assessment, customer risk-classification report / segmentation extract, regulatory return customer schedules |
| candidate_data_sources | entity profile, regulatory returns, ownership/person relationships, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Consider companies, partnerships, foundations, trusts, nominee shareholdings and multi-layer or multi-jurisdiction structures. Judge on share of relationships and share of value. Bearer-instrument or nominee-director features raise the response.

#### IR-CUS-03

| Field | Value |
| --- | --- |
| dimension_code | `CUSTOMER_RISK` |
| question_code | `IR-CUS-03` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Non-resident or cross-border customers are material to the business. |
| supervisory_intent | Measure exposure from customers outside the domestic supervisory perimeter. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, R.19 |
| sector_classification | CORE |
| sector_notes | Ordinarily low for domestic credit unions; material for international banking, MSBs and VASPs. |
| suggested_evidence_types | Enterprise ML/TF risk assessment, customer risk-classification report / segmentation extract, regulatory return customer schedules |
| candidate_data_sources | entity profile, regulatory returns, ownership/person relationships, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Base on residence/domicile of customers and beneficial owners, not the currency of transactions. Distinguish incidental non-residents from a deliberate non-resident line of business.

#### IR-CUS-04

| Field | Value |
| --- | --- |
| dimension_code | `CUSTOMER_RISK` |
| question_code | `IR-CUS-04` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Politically exposed persons and their close associates are material to the customer base. |
| supervisory_intent | Measure PEP exposure as a risk characteristic, independent of the quality of PEP controls. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity demonstrably serves no natural-person or beneficially-owned relationships in scope for PEP determination. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.12 |
| sector_classification | CORE |
| sector_notes | Judge relative to entity size, not absolute count. |
| suggested_evidence_types | Enterprise ML/TF risk assessment, customer risk-classification report / segmentation extract, regulatory return customer schedules |
| candidate_data_sources | entity profile, regulatory returns, ownership/person relationships, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Include domestic and foreign PEPs, family members and close associates, and PEPs who are beneficial owners rather than account holders. For a small entity a single significant PEP relationship may be material; state the reasoning.

### GEOGRAPHIC_RISK — Geographic Risk

#### IR-GEO-01

| Field | Value |
| --- | --- |
| dimension_code | `GEOGRAPHIC_RISK` |
| question_code | `IR-GEO-01` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | The entity has material exposure to higher-risk or monitored jurisdictions. |
| supervisory_intent | Measure jurisdictional exposure arising from customers, counterparties, beneficial owners and flows. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.19, INR.10 |
| sector_classification | CORE |
| sector_notes | Sector-neutral; measurement source differs (returns vs payment data). |
| suggested_evidence_types | Country exposure report, cross-border flow analysis, correspondent relationship register |
| candidate_data_sources | regulatory returns, entity profile, external intelligence where authorised |
| v1.0_mapping | GEOGRAPHIC_RISK.Q1 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Use the jurisdiction lists applicable in the deployment ([LOCAL_HIGH_RISK_LIST_REF]) together with FATF public identification statements. Consider customer residence, beneficial-owner nationality, counterparty location and transaction corridors. Quantify share of value where possible.

#### IR-GEO-02

| Field | Value |
| --- | --- |
| dimension_code | `GEOGRAPHIC_RISK` |
| question_code | `IR-GEO-02` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Cross-border, correspondent or remittance flows are material to the business. |
| supervisory_intent | Measure exposure from the entity operating across borders, irrespective of destination risk rating. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity conducts no cross-border activity of any kind in the assessment period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.13, R.14, R.16 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | Central for banks, MSBs and VASPs; often not applicable for domestic-only insurers. |
| suggested_evidence_types | Country exposure report, cross-border flow analysis, correspondent relationship register |
| candidate_data_sources | regulatory returns, entity profile, external intelligence where authorised |
| v1.0_mapping | GEOGRAPHIC_RISK.Q2 |
| change_classification | SPLIT |

**Guidance.** Include correspondent and nested relationships, remittance corridors, cross-border card or wallet flows, and cross-border group funding. Report volume and value, and the largest corridors.

#### IR-GEO-03

| Field | Value |
| --- | --- |
| dimension_code | `GEOGRAPHIC_RISK` |
| question_code | `IR-GEO-03` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Geographic exposure is concentrated in a small number of jurisdictions or corridors. |
| supervisory_intent | Measure concentration, which amplifies the consequence of a single jurisdictional weakness. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | NO |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity conducts no cross-border activity of any kind in the assessment period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Country exposure report, cross-border flow analysis, correspondent relationship register |
| candidate_data_sources | regulatory returns, entity profile, external intelligence where authorised |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Indicative: the largest single jurisdiction or corridor exceeds 25% of cross-border value, or the top three exceed 60%. Concentration in a low-risk jurisdiction is still recorded, with the risk rating reflecting the destination profile.

### PRODUCTS_SERVICES_RISK — Products & Services Risk

#### IR-PRD-01

| Field | Value |
| --- | --- |
| dimension_code | `PRODUCTS_SERVICES_RISK` |
| question_code | `IR-PRD-01` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | The entity offers products or services with anonymity, opacity or third-party value-transfer features that are material to the business. |
| supervisory_intent | Measure product-inherent obscuring of identity or of the source and destination of value. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.15, INR.10 |
| sector_classification | CORE |
| sector_notes | Applies across sectors; for insurance consider single-premium and assignable policies. |
| suggested_evidence_types | Product catalogue with ML/TF ratings, new-product approval papers, product volume/value extracts |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | PRODUCTS_SERVICES_RISK.Q1 |
| change_classification | SPLIT |

**Guidance.** Consider bearer or pooled arrangements, omnibus and client accounts, prepaid or stored-value instruments, third-party payments and payments to or from unrelated parties. Existence of mitigating controls is not considered here.

#### IR-PRD-02

| Field | Value |
| --- | --- |
| dimension_code | `PRODUCTS_SERVICES_RISK` |
| question_code | `IR-PRD-02` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Cash-intensive products or services are material to the business. |
| supervisory_intent | Measure exposure arising from physical cash handling. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity handles no physical cash in any product or channel. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1, R.10 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | Material for MSBs, casinos and retail banking; often not applicable for securities and life insurance. |
| suggested_evidence_types | Product catalogue with ML/TF ratings, new-product approval papers, product volume/value extracts |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Assess cash as a proportion of transaction value and the presence of high-denomination or third-party cash deposits. Cash-in-transit and agent cash collection count.

#### IR-PRD-03

| Field | Value |
| --- | --- |
| dimension_code | `PRODUCTS_SERVICES_RISK` |
| question_code | `IR-PRD-03` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Products permit rapid or immediate movement of value, including across borders. |
| supervisory_intent | Measure velocity risk designed into the product, which shortens the window for detection and intervention. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.15, R.16 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Product catalogue with ML/TF ratings, new-product approval papers, product volume/value extracts |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Consider instant payments, same-day remittance, virtual-asset transfers, early surrender or redemption features and rapid pass-through capability.

#### IR-PRD-04

| Field | Value |
| --- | --- |
| dimension_code | `PRODUCTS_SERVICES_RISK` |
| question_code | `IR-PRD-04` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | The entity offers complex, structured, or virtual-asset related products that are material to the business. |
| supervisory_intent | Measure exposure from products whose economics or technology make purpose and beneficial interest hard to establish. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.15 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | Primary for VASPs and investment firms. |
| suggested_evidence_types | Product catalogue with ML/TF ratings, new-product approval papers, product volume/value extracts |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | PRODUCTS_SERVICES_RISK.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Include virtual assets and related services, structured or derivative products, trade finance, and multi-party arrangements. New or materially changed products in the period raise the response where launched at scale; the adequacy of the pre-launch assessment is a CONTROL matter under ENTERPRISE_RISK_ASSESSMENT.

### TRANSACTION_PROFILE_RISK — Transaction Profile Risk

#### IR-TRX-01

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_PROFILE_RISK` |
| question_code | `IR-TRX-01` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Transaction volume or value is material in absolute terms and relative to comparable entities. |
| supervisory_intent | Measure the scale of the flow that the AML framework must cover. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | NO |
| standards_reference | FATF R.1 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Transaction volume/value MI, cash activity report, cross-border payment statistics |
| candidate_data_sources | regulatory returns, prudential data, examination history |
| v1.0_mapping | TRANSACTION_PROFILE_RISK.Q1 |
| change_classification | SPLIT |

**Guidance.** Use the entity return data for the period, with peer comparison where a peer group exists. Scale alone is exposure, not a deficiency.

#### IR-TRX-02

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_PROFILE_RISK` |
| question_code | `IR-TRX-02` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Cash transaction activity is material. |
| supervisory_intent | Measure realised cash flow, distinct from the existence of cash-capable products. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity executes no cash transactions. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Transaction volume/value MI, cash activity report, cross-border payment statistics |
| candidate_data_sources | regulatory returns, prudential data, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Report cash value and count, share of total value, and any threshold-adjacent structuring pattern observed. Assess the observed profile, not the entity assertion.

#### IR-TRX-03

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_PROFILE_RISK` |
| question_code | `IR-TRX-03` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Cross-border transaction flows are material. |
| supervisory_intent | Measure realised cross-border flow, distinct from geographic customer exposure. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity executes no cross-border transactions. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.13, R.16 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Transaction volume/value MI, cash activity report, cross-border payment statistics |
| candidate_data_sources | regulatory returns, prudential data, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Report value, count and principal corridors, and any material intermediated or correspondent-cleared flow.

#### IR-TRX-04

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_PROFILE_RISK` |
| question_code | `IR-TRX-04` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Observed activity shows high velocity, pass-through behaviour, or unusual concentration of value, counterparties or corridors. |
| supervisory_intent | Measure behavioural exposure visible in the data, before considering whether the entity detected it. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1, R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Transaction volume/value MI, cash activity report, cross-border payment statistics |
| candidate_data_sources | regulatory returns, prudential data, examination history |
| v1.0_mapping | TRANSACTION_PROFILE_RISK.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Consider funds in and out within short periods, balances turned over many times, single counterparties dominating volume, or activity inconsistent with the declared business model. A supervisory observation here does not by itself imply a monitoring failure; that judgement belongs to TRANSACTION_MONITORING.

### DELIVERY_CHANNEL_RISK — Delivery Channel Risk

#### IR-DEL-01

| Field | Value |
| --- | --- |
| dimension_code | `DELIVERY_CHANNEL_RISK` |
| question_code | `IR-DEL-01` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Non-face-to-face or fully remote onboarding is material to the business. |
| supervisory_intent | Measure identity-assurance exposure created by the onboarding channel. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, R.15 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Channel mix MI, agent/intermediary register, digital onboarding statistics |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | DELIVERY_CHANNEL_RISK.Q1 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Report the share of relationships onboarded remotely. The quality of remote identity verification is a CONTROL matter under CDD_KYC and is excluded here.

#### IR-DEL-02

| Field | Value |
| --- | --- |
| dimension_code | `DELIVERY_CHANNEL_RISK` |
| question_code | `IR-DEL-02` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Business is materially placed or serviced through agents, intermediaries, introducers or other third parties. |
| supervisory_intent | Measure exposure from distance between the entity and the customer. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity uses no agents, intermediaries or introducers. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.14, R.17 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | Central for MSBs, insurance intermediation and agent banking. |
| suggested_evidence_types | Channel mix MI, agent/intermediary register, digital onboarding statistics |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | DELIVERY_CHANNEL_RISK.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Report count of active third parties and the share of relationships or value they originate or service. Whether they are supervised by the entity is assessed under THIRD_PARTY_OVERSIGHT.

#### IR-DEL-03

| Field | Value |
| --- | --- |
| dimension_code | `DELIVERY_CHANNEL_RISK` |
| question_code | `IR-DEL-03` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | Digital or self-service channels give customers high-speed, low-friction access to services. |
| supervisory_intent | Measure exposure from channel automation and immediacy. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | NO |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.15 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Channel mix MI, agent/intermediary register, digital onboarding statistics |
| candidate_data_sources | licensing/application data, entity profile, regulatory returns |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Consider mobile/web self-service, API access, straight-through processing and absence of human review points before value moves.

### BUSINESS_MODEL_RISK — Business Model Risk

#### IR-BUS-01

| Field | Value |
| --- | --- |
| dimension_code | `BUSINESS_MODEL_RISK` |
| question_code | `IR-BUS-01` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | The ownership or group structure is complex, multi-jurisdictional or otherwise difficult to trace. |
| supervisory_intent | Measure exposure from the entity own structure, distinct from its customers structures. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18, R.24 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Group structure chart, ownership and control register, strategy/board growth papers, outsourcing register |
| candidate_data_sources | ownership/person relationships, licensing/application data, prudential data |
| v1.0_mapping | BUSINESS_MODEL_RISK.Q1 |
| change_classification | SPLIT |

**Guidance.** Consider layers between the entity and its ultimate beneficial owners, offshore holding vehicles, nominee arrangements and cross-border group entities relevant to AML operations.

#### IR-BUS-02

| Field | Value |
| --- | --- |
| dimension_code | `BUSINESS_MODEL_RISK` |
| question_code | `IR-BUS-02` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | The entity experienced rapid growth or material change in the assessment period. |
| supervisory_intent | Measure exposure from change outpacing the control environment. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Group structure chart, ownership and control register, strategy/board growth papers, outsourcing register |
| candidate_data_sources | ownership/person relationships, licensing/application data, prudential data |
| v1.0_mapping | BUSINESS_MODEL_RISK.Q1 |
| change_classification | SPLIT |

**Guidance.** Consider growth in customers, volume or value, acquisitions and portfolio transfers, entry to new markets, new channels and material restructuring. Indicative: >25% growth in customers or transaction value.

#### IR-BUS-03

| Field | Value |
| --- | --- |
| dimension_code | `BUSINESS_MODEL_RISK` |
| question_code | `IR-BUS-03` |
| question_version | 1 |
| axis | INHERENT_EXPOSURE |
| effectiveness_focus | INHERENT_EXPOSURE |
| prompt | The entity relies materially on outsourced, intragroup or third-party provision of AML-relevant operations. |
| supervisory_intent | Measure exposure from AML-relevant capability sitting outside the entity direct operational control. |
| response_semantics | `INHERENT_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No AML-relevant activity is performed outside the entity. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.17, R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Group structure chart, ownership and control register, strategy/board growth papers, outsourcing register |
| candidate_data_sources | ownership/person relationships, licensing/application data, prudential data |
| v1.0_mapping | BUSINESS_MODEL_RISK.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Include outsourced screening, monitoring, alert triage, KYC operations and shared group compliance functions. The quality of oversight is assessed under THIRD_PARTY_OVERSIGHT.

## B. Control effectiveness

### GOVERNANCE — Governance

#### CT-GOV-01

| Field | Value |
| --- | --- |
| dimension_code | `GOVERNANCE` |
| question_code | `CT-GOV-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | The board has approved an AML/CFT framework appropriate to the nature, size and complexity of the entity, with documented accountability for each element. |
| supervisory_intent | Establish whether governance design places explicit, owned accountability for AML/CFT at board level. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18, INR.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Board-approved AML/CFT framework, board and committee minutes, AML management information pack |
| candidate_data_sources | document metadata, examination history, findings |
| v1.0_mapping | GOVERNANCE.Q1 |
| change_classification | SPLIT |

**Guidance.** Test the framework document, its approval, and whether the accountability map reaches named roles (not individuals in the methodology) for risk assessment, CDD, monitoring, reporting, testing and remediation. A generic policy adopted without tailoring to the business is at best PARTIALLY.

#### CT-GOV-02

| Field | Value |
| --- | --- |
| dimension_code | `GOVERNANCE` |
| question_code | `CT-GOV-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | The board and senior management receive AML/CFT management information sufficient in content, quality and frequency to oversee the framework, and there is evidence of challenge. |
| supervisory_intent | Test whether oversight is informed and active rather than nominal. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | Proportionate: a small entity may evidence this in a single monthly report. |
| suggested_evidence_types | Board-approved AML/CFT framework, board and committee minutes, AML management information pack |
| candidate_data_sources | document metadata, examination history, findings |
| v1.0_mapping | GOVERNANCE.Q1 |
| change_classification | SPLIT |

**Guidance.** Look for coverage of risk-assessment outcomes, CDD backlogs, alert and case ageing, STR volumes and timeliness, screening exceptions, training completion, audit findings and overdue remediation. Evidence of challenge means recorded questions, requests and decisions, not receipt of a pack.

#### CT-GOV-03

| Field | Value |
| --- | --- |
| dimension_code | `GOVERNANCE` |
| question_code | `CT-GOV-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | AML/CFT issues escalated to the board or senior management resulted in decisions that were implemented and followed through within the period. |
| supervisory_intent | Test whether governance produces effect, not merely visibility. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No AML/CFT matter was escalated in the period and the supervisor is satisfied none should have been. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Board-approved AML/CFT framework, board and committee minutes, AML management information pack |
| candidate_data_sources | document metadata, examination history, findings |
| v1.0_mapping | GOVERNANCE.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Trace a sample of escalated issues to decision, action, resource allocation and completion. Repeated escalation of the same issue without resolution is at best PARTIALLY.

### ENTERPRISE_RISK_ASSESSMENT — Enterprise Risk Assessment

#### CT-ERA-01

| Field | Value |
| --- | --- |
| dimension_code | `ENTERPRISE_RISK_ASSESSMENT` |
| question_code | `CT-ERA-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | A documented enterprise-wide ML/TF risk assessment is current and formally approved. |
| supervisory_intent | Establish existence, currency and authority of the risk assessment. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | NO |
| standards_reference | FATF R.1, INR.1 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Enterprise ML/TF risk assessment and methodology, approval minute, linkage paper to control intensity |
| candidate_data_sources | document metadata, examination history |
| v1.0_mapping | ENTERPRISE_RISK_ASSESSMENT.Q1 |
| change_classification | KEEP |

**Guidance.** Currency means updated within the entity own defined cycle and after material change. Approval must be by the body with authority under the framework. A draft or unapproved update is at best PARTIALLY.

#### CT-ERA-02

| Field | Value |
| --- | --- |
| dimension_code | `ENTERPRISE_RISK_ASSESSMENT` |
| question_code | `CT-ERA-02` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | The risk-assessment methodology addresses the relevant risk factors and the entity own business drivers, with a documented rating basis. |
| supervisory_intent | Test the quality of the assessment method, not only its existence. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1, INR.1 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Enterprise ML/TF risk assessment and methodology, approval minute, linkage paper to control intensity |
| candidate_data_sources | document metadata, examination history |
| v1.0_mapping | ENTERPRISE_RISK_ASSESSMENT.Q1 |
| change_classification | SPLIT |

**Guidance.** Expect coverage of customer, geographic, product, channel and transaction factors, treatment of inherent versus residual risk, data used, and a rating basis that can be re-performed. Unexplained ratings, or a template with no entity-specific analysis, indicate a design gap.

#### CT-ERA-03

| Field | Value |
| --- | --- |
| dimension_code | `ENTERPRISE_RISK_ASSESSMENT` |
| question_code | `CT-ERA-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Risk-assessment outputs demonstrably drive the intensity of due diligence, monitoring and resourcing. |
| supervisory_intent | Test whether the risk assessment is used, which is the operating-effectiveness test for this control. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.1, R.15 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Enterprise ML/TF risk assessment and methodology, approval minute, linkage paper to control intensity |
| candidate_data_sources | document metadata, examination history |
| v1.0_mapping | ENTERPRISE_RISK_ASSESSMENT.Q2, PRODUCTS_SERVICES_RISK.Q2 |
| change_classification | MOVE_DIMENSION |

**Guidance.** Trace at least two specific higher-risk conclusions into a control consequence (review frequency, EDD trigger, monitoring scenario, resourcing or training). Also test whether new or materially changed products were risk-assessed before launch.

### MLRO_FUNCTION — Mlro Function

#### CT-MLRO-01

| Field | Value |
| --- | --- |
| dimension_code | `MLRO_FUNCTION` |
| question_code | `CT-MLRO-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | A named compliance officer / MLRO is appointed at sufficient seniority, is fit and proper for the role, and is free from duties that conflict with the AML/CFT mandate. |
| supervisory_intent | Establish the mandate, standing and independence of the AML function. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18, INR.18 |
| sector_classification | CORE |
| sector_notes | A smaller entity may combine roles; assess whether the combination creates a conflict, not the combination itself. |
| suggested_evidence_types | MLRO appointment letter and job description, fit-and-proper record, compliance resourcing plan, MLRO reports to board |
| candidate_data_sources | fit-and-proper records, ownership/person relationships, correspondence/RFIs |
| v1.0_mapping | MLRO_FUNCTION.Q1 |
| change_classification | REWORD |

**Guidance.** Test appointment record, reporting line, authority to escalate directly, and whether revenue-generating or operational duties compromise independence. Deputy arrangements and continuity cover are in scope.

#### CT-MLRO-02

| Field | Value |
| --- | --- |
| dimension_code | `MLRO_FUNCTION` |
| question_code | `CT-MLRO-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | The AML/CFT function has resources, skills, data access and systems adequate for the entity risk profile, evidenced by the work actually completed in the period. |
| supervisory_intent | Test operating capacity against demand rather than headcount alone. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | MLRO appointment letter and job description, fit-and-proper record, compliance resourcing plan, MLRO reports to board |
| candidate_data_sources | fit-and-proper records, ownership/person relationships, correspondence/RFIs |
| v1.0_mapping | MLRO_FUNCTION.Q2 |
| change_classification | SEMANTIC_CORRECTION |

**Guidance.** Compare planned versus completed AML activity: periodic reviews due and done, alerts and cases handled, backlogs, unfilled vacancies, reliance on overtime or deferral. Chronic backlog is evidence of inadequate resourcing regardless of assertions.

### POLICIES_PROCEDURES — Policies Procedures

#### CT-POL-01

| Field | Value |
| --- | --- |
| dimension_code | `POLICIES_PROCEDURES` |
| question_code | `CT-POL-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | AML/CFT policies are current, approved and consistent with the applicable legal and regulatory requirements of the jurisdiction. |
| supervisory_intent | Establish policy adequacy against the local obligations configured for the deployment. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Board-approved AML/CFT policy, operating procedures/manuals, version and approval history |
| candidate_data_sources | document metadata, findings |
| v1.0_mapping | POLICIES_PROCEDURES.Q1 |
| change_classification | KEEP |

**Guidance.** Map policy content to [LOCAL_AML_LEGISLATION_REF] and any supervisory rules or guidance in force. Gaps, superseded references or obligations not addressed reduce the response. Do not test against any jurisdiction not configured.

#### CT-POL-02

| Field | Value |
| --- | --- |
| dimension_code | `POLICIES_PROCEDURES` |
| question_code | `CT-POL-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Policies are translated into operable procedures that staff actually use, and material changes are communicated and implemented. |
| supervisory_intent | Test whether policy reaches the point of execution. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Board-approved AML/CFT policy, operating procedures/manuals, version and approval history |
| candidate_data_sources | document metadata, findings |
| v1.0_mapping | POLICIES_PROCEDURES.Q1 |
| change_classification | SPLIT |

**Guidance.** Compare procedures with observed practice in a sample of files or cases. Look for version control, communication of change, and whether the procedure describes the system and steps in use rather than an aspiration.

### CDD_KYC — Cdd Kyc

#### CT-CDD-01

| Field | Value |
| --- | --- |
| dimension_code | `CDD_KYC` |
| question_code | `CT-CDD-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Customer due diligence is completed and verified before the business relationship is established or the occasional transaction is executed, with defined and controlled exceptions. |
| supervisory_intent | Test the front gate of the control environment. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, INR.10 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | CDD/KYC sample files, onboarding procedure, periodic-review ageing report |
| candidate_data_sources | examination history, findings, RFI responses |
| v1.0_mapping | CDD_KYC.Q1 |
| change_classification | REWORD |

**Guidance.** Test a risk-weighted sample. Where deferred verification is permitted, test whether the legal conditions, time limits and restrictions on activity are enforced systemically rather than by discretion.

#### CT-CDD-02

| Field | Value |
| --- | --- |
| dimension_code | `CDD_KYC` |
| question_code | `CT-CDD-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Ongoing due diligence and periodic refresh are executed to the risk-based schedule, with overdue populations controlled. |
| supervisory_intent | Test continuity of knowledge of the customer over the life of the relationship. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | CDD/KYC sample files, onboarding procedure, periodic-review ageing report |
| candidate_data_sources | examination history, findings, RFI responses |
| v1.0_mapping | CDD_KYC.Q2 |
| change_classification | REWORD |

**Guidance.** Obtain the ageing of due reviews by risk band. A material overdue population, or refresh driven by capacity rather than risk, reduces the response. Confirm trigger-event review as well as calendar review.

#### CT-CDD-03

| Field | Value |
| --- | --- |
| dimension_code | `CDD_KYC` |
| question_code | `CT-CDD-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Sample testing shows customer files are complete, accurate and current, including purpose and intended nature of the relationship and source of funds where required. |
| supervisory_intent | Test the substantive quality of the CDD record, not the completion flag. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 2 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | CDD/KYC sample files, onboarding procedure, periodic-review ageing report |
| candidate_data_sources | examination history, findings, RFI responses |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Sample across risk bands, channels and vintages. Record sample size, defects found and defect types. Systemic identical defects indicate a design failure and should be recorded as such in the observation.

### BENEFICIAL_OWNERSHIP — Beneficial Ownership

#### CT-BO-01

| Field | Value |
| --- | --- |
| dimension_code | `BENEFICIAL_OWNERSHIP` |
| question_code | `CT-BO-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Beneficial ownership and control are identified and verified to the required threshold, including for layered, cross-border and trust structures. |
| supervisory_intent | Test the entity ability to see through structures to natural persons. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity has no legal-person or legal-arrangement customers. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, R.24, R.25 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Beneficial ownership evidence in sample files, ownership structure charts, reverification trigger log |
| candidate_data_sources | ownership/person relationships, examination history |
| v1.0_mapping | BENEFICIAL_OWNERSHIP.Q1 |
| change_classification | REWORD |

**Guidance.** Test whether verification goes beyond self-declaration where risk requires, whether control not evidenced by shareholding is considered, and whether the entity records the point at which it stopped and why.

#### CT-BO-02

| Field | Value |
| --- | --- |
| dimension_code | `BENEFICIAL_OWNERSHIP` |
| question_code | `CT-BO-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Beneficial ownership information is kept current and is reverified on defined trigger events. |
| supervisory_intent | Test maintenance of ownership knowledge over time. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity has no legal-person or legal-arrangement customers. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Beneficial ownership evidence in sample files, ownership structure charts, reverification trigger log |
| candidate_data_sources | ownership/person relationships, examination history |
| v1.0_mapping | BENEFICIAL_OWNERSHIP.Q2 |
| change_classification | KEEP |

**Guidance.** Confirm triggers are defined (ownership change, adverse information, periodic review, transaction inconsistency) and evidence that they operated in the period.

### EDD — Edd

#### CT-EDD-01

| Field | Value |
| --- | --- |
| dimension_code | `EDD` |
| question_code | `CT-EDD-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Enhanced due diligence is applied to every relationship that the risk framework identifies as higher risk, with measures that are genuinely enhanced. |
| supervisory_intent | Test coverage and substance of EDD. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity has no relationships classified as higher risk and the supervisor accepts that classification. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, INR.10 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Higher-risk relationship register, EDD sample files, senior-management approval records |
| candidate_data_sources | examination history, findings |
| v1.0_mapping | EDD.Q1 |
| change_classification | REWORD |

**Guidance.** Reconcile the higher-risk population from the risk framework against the population that actually received EDD. Enhanced means additional verification, source of wealth or funds, adverse-media enquiry and increased monitoring, not merely an extra approval box.

#### CT-EDD-02

| Field | Value |
| --- | --- |
| dimension_code | `EDD` |
| question_code | `CT-EDD-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Higher-risk relationships receive documented senior-management approval at inception and enhanced ongoing monitoring thereafter. |
| supervisory_intent | Test authority and continuing scrutiny for higher-risk business. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity has no relationships classified as higher risk and the supervisor accepts that classification. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, R.12 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Higher-risk relationship register, EDD sample files, senior-management approval records |
| candidate_data_sources | examination history, findings |
| v1.0_mapping | EDD.Q2 |
| change_classification | MERGE |

**Guidance.** Check that approval precedes the relationship or the escalation to higher risk, is given by an authorised role, and that enhanced monitoring is evidenced in the period rather than assumed.

### PEP_CONTROLS — Pep Controls

#### CT-PEP-01

| Field | Value |
| --- | --- |
| dimension_code | `PEP_CONTROLS` |
| question_code | `CT-PEP-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Domestic and foreign PEPs, their family members and close associates are identified at onboarding and on an ongoing basis, including where the PEP is a beneficial owner. |
| supervisory_intent | Test detection capability for PEP status. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity serves no natural persons and no beneficially-owned relationships in scope for PEP determination. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.12 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | PEP register, screening configuration and match evidence, PEP periodic review records |
| candidate_data_sources | ownership/person relationships, examination history |
| v1.0_mapping | PEP_CONTROLS.Q1 |
| change_classification | REWORD |

**Guidance.** Test screening scope, data source currency, name-matching tolerance, and rescreening on list or status change. Self-declaration alone is insufficient where risk is material.

#### CT-PEP-02

| Field | Value |
| --- | --- |
| dimension_code | `PEP_CONTROLS` |
| question_code | `CT-PEP-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | PEP relationships are subject to senior approval, source-of-wealth enquiry, enhanced monitoring and periodic review, evidenced in the period. |
| supervisory_intent | Test the treatment applied once PEP status is known. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No PEP relationship was identified in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.12 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | PEP register, screening configuration and match evidence, PEP periodic review records |
| candidate_data_sources | ownership/person relationships, examination history |
| v1.0_mapping | PEP_CONTROLS.Q2 |
| change_classification | REWORD |

**Guidance.** Trace identified PEPs to approval, source-of-wealth evidence, monitoring treatment and the most recent review. Also test de-classification decisions where the person ceased to be a PEP.

### SANCTIONS_CONTROLS — Sanctions Controls

#### CT-SANC-01

| Field | Value |
| --- | --- |
| dimension_code | `SANCTIONS_CONTROLS` |
| question_code | `CT-SANC-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | Sanctions screening covers customers, beneficial owners, related parties and, where relevant, counterparties and payment fields, against the lists applicable in the jurisdiction. |
| supervisory_intent | Test screening coverage and scope. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.6, R.7 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Screening system configuration, list-update logs, match investigation and escalation records |
| candidate_data_sources | examination history, enforcement, external intelligence where authorised |
| v1.0_mapping | SANCTIONS_CONTROLS.Q1 |
| change_classification | REWORD |

**Guidance.** Confirm which populations and data fields are screened, at what points (onboarding, ongoing, transaction), and against which lists ([LOCAL_SANCTIONS_LIST_REF]). Unscreened populations are a coverage gap even if screening quality is otherwise good.

#### CT-SANC-02

| Field | Value |
| --- | --- |
| dimension_code | `SANCTIONS_CONTROLS` |
| question_code | `CT-SANC-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Sanctions lists are updated and the customer base rescreened without undue delay after a list change. |
| supervisory_intent | Test latency between designation and detection. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.6, INR.6 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Screening system configuration, list-update logs, match investigation and escalation records |
| candidate_data_sources | examination history, enforcement, external intelligence where authorised |
| v1.0_mapping | SANCTIONS_CONTROLS.Q2 |
| change_classification | SPLIT |

**Guidance.** Obtain list-update logs and measure the interval from publication to load and to completed rescreening. Manual-only update processes require evidence of timeliness.

#### CT-SANC-03

| Field | Value |
| --- | --- |
| dimension_code | `SANCTIONS_CONTROLS` |
| question_code | `CT-SANC-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Potential matches are investigated, escalated and resolved within defined timeframes, and the entity can give effect to a freezing or blocking obligation. |
| supervisory_intent | Test the response path once a hit occurs. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No potential match arose in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.6 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Screening system configuration, list-update logs, match investigation and escalation records |
| candidate_data_sources | examination history, enforcement, external intelligence where authorised |
| v1.0_mapping | SANCTIONS_CONTROLS.Q2 |
| change_classification | SPLIT |

**Guidance.** Sample match cases for timeliness, documented rationale for discounting, and escalation to the required authority. Test the operational ability to block or freeze, including where a third party executes the transaction.

### TRANSACTION_MONITORING — Transaction Monitoring

#### CT-TM-01

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_MONITORING` |
| question_code | `CT-TM-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | The monitoring framework is designed to cover the entity products, customers, channels and geographies, with scenarios or rules traceable to identified risks. |
| supervisory_intent | Test design coverage of monitoring against the entity own risk profile. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20, INR.10 |
| sector_classification | CORE |
| sector_notes | Automated monitoring is not mandated by the methodology; proportionality applies. |
| suggested_evidence_types | Monitoring scenario/rule inventory, coverage mapping to products and channels, alert ageing and disposition reports |
| candidate_data_sources | regulatory returns, examination history, findings |
| v1.0_mapping | TRANSACTION_MONITORING.Q1 |
| change_classification | REWORD |

**Guidance.** Map monitoring scenarios or rules to the risks in the enterprise risk assessment and identify uncovered risks. Manual monitoring is acceptable where proportionate, but must be defined, allocated and evidenced.

#### CT-TM-02

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_MONITORING` |
| question_code | `CT-TM-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Monitoring operates over complete and timely data for all in-scope products, channels and entities. |
| supervisory_intent | Test operating completeness, the most common silent monitoring failure. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Monitoring scenario/rule inventory, coverage mapping to products and channels, alert ageing and disposition reports |
| candidate_data_sources | regulatory returns, examination history, findings |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Reconcile transaction populations in source systems to what monitoring actually consumed, including agent, group and third-party channels. Exclusions must be documented, risk-assessed and approved.

#### CT-TM-03

| Field | Value |
| --- | --- |
| dimension_code | `TRANSACTION_MONITORING` |
| question_code | `CT-TM-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Alert volumes, ageing and disposition are within approved thresholds, with no material backlog. |
| supervisory_intent | Test whether monitoring output is actually processed. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Monitoring scenario/rule inventory, coverage mapping to products and channels, alert ageing and disposition reports |
| candidate_data_sources | regulatory returns, examination history, findings |
| v1.0_mapping | TRANSACTION_MONITORING.Q3 |
| change_classification | KEEP |

**Guidance.** Obtain ageing by scenario and severity. Compare unclosed alerts to capacity. A backlog contradicts an assertion of effectiveness and must be recorded as a data contradiction where the entity asserts otherwise.

### ALERT_INVESTIGATION — Alert Investigation

#### CT-ALRT-01

| Field | Value |
| --- | --- |
| dimension_code | `ALERT_INVESTIGATION` |
| question_code | `CT-ALRT-01` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Alerts and cases are investigated within defined timeframes with a documented, reasoned disposition supported by the information reviewed. |
| supervisory_intent | Test the quality and timeliness of investigative work. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No alert or case arose in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Alert case samples, ageing and disposition MI, quality-assurance review reports |
| candidate_data_sources | regulatory returns, examination history, findings |
| v1.0_mapping | ALERT_INVESTIGATION.Q1 |
| change_classification | REWORD |

**Guidance.** Sample closed alerts across scenarios and analysts. Reject template rationales that do not address the triggering behaviour. Record timeliness against the entity own standard.

#### CT-ALRT-02

| Field | Value |
| --- | --- |
| dimension_code | `ALERT_INVESTIGATION` |
| question_code | `CT-ALRT-02` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Investigation quality is subject to independent quality assurance, and identified defects are corrected. |
| supervisory_intent | Test the assurance layer over investigative judgement. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18, R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Alert case samples, ageing and disposition MI, quality-assurance review reports |
| candidate_data_sources | regulatory returns, examination history, findings |
| v1.0_mapping | ALERT_INVESTIGATION.Q2 |
| change_classification | KEEP |

**Guidance.** QA must be performed by someone other than the investigator, cover a risk-based sample, and produce corrective action. QA that only counts timeliness is at best PARTIALLY.

### STR_IDENTIFICATION — Str Identification

#### CT-STRI-01

| Field | Value |
| --- | --- |
| dimension_code | `STR_IDENTIFICATION` |
| question_code | `CT-STRI-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Staff in customer-facing and processing roles are able to recognise indicators of suspicion relevant to the entity business and know the internal reporting channel. |
| supervisory_intent | Test detection capability at the point of contact. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20, R.21 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Internal suspicion report log, escalation procedure, staff awareness and case-creation evidence |
| candidate_data_sources | STR/SAR statistics where legally available, examination history |
| v1.0_mapping | STR_IDENTIFICATION.Q1 |
| change_classification | REWORD |

**Guidance.** Test through discussion, scenario questioning and the internal report record, not solely through training completion figures. Sector-relevant typologies should be reflected in the indicators used.

#### CT-STRI-02

| Field | Value |
| --- | --- |
| dimension_code | `STR_IDENTIFICATION` |
| question_code | `CT-STRI-02` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Every internally reported suspicion creates a recorded, investigable case, and defined escalation triggers exist for identifying suspicion from monitoring, screening and external information. |
| supervisory_intent | Test that suspicion is captured and converted into work rather than lost. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Internal suspicion report log, escalation procedure, staff awareness and case-creation evidence |
| candidate_data_sources | STR/SAR statistics where legally available, examination history |
| v1.0_mapping | STR_IDENTIFICATION.Q1 |
| change_classification | SPLIT |

**Guidance.** Reconcile internal reports to cases created, and cases to decisions. Confirm triggers from alerts, adverse media, law-enforcement enquiries and customer behaviour are defined.

#### CT-STRI-03

| Field | Value |
| --- | --- |
| dimension_code | `STR_IDENTIFICATION` |
| question_code | `CT-STRI-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Internal escalation of suspicion occurs promptly and cannot be suppressed by line management or commercial considerations. |
| supervisory_intent | Test the integrity and timeliness of the escalation path prior to any filing decision. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No suspicion was internally reported in the period and the supervisor is satisfied none should have been. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20, R.21 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Internal suspicion report log, escalation procedure, staff awareness and case-creation evidence |
| candidate_data_sources | STR/SAR statistics where legally available, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Measure the interval from detection to receipt by the MLRO function. Test whether any intermediate approval can terminate a report, and whether staff can report directly. Filing itself is assessed under STR_GOVERNANCE.

### STR_GOVERNANCE — Str Governance

#### CT-STRG-01

| Field | Value |
| --- | --- |
| dimension_code | `STR_GOVERNANCE` |
| question_code | `CT-STRG-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Authority to decide whether to file a suspicious transaction report is defined and exercised only by the authorised role, with the decision and its basis recorded for filed and not-filed cases alike. |
| supervisory_intent | Test decision authority and the completeness of the decision trail. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | STR/SAR log with filing dates, timeliness statistics, not-reported decision records, confidentiality controls evidence |
| candidate_data_sources | STR/SAR statistics where legally available, enforcement, examination history |
| v1.0_mapping | STR_GOVERNANCE.Q1 |
| change_classification | REWORD |

**Guidance.** Confirm the role, delegation and continuity arrangements. Not-filed decisions require the same rigour of record as filed ones.

#### CT-STRG-02

| Field | Value |
| --- | --- |
| dimension_code | `STR_GOVERNANCE` |
| question_code | `CT-STRG-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Reports are filed with the financial intelligence unit within the applicable deadline, evidenced by timeliness statistics for the period. |
| supervisory_intent | Test filing timeliness as an operating outcome. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No report was filed and none was required in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | STR/SAR log with filing dates, timeliness statistics, not-reported decision records, confidentiality controls evidence |
| candidate_data_sources | STR/SAR statistics where legally available, enforcement, examination history |
| v1.0_mapping | STR_IDENTIFICATION.Q2 |
| change_classification | MOVE_DIMENSION |

**Guidance.** Measure decision-to-filing and detection-to-filing intervals against [LOCAL_STR_DEADLINE_REF]. Late filings require explanation and corrective action.

#### CT-STRG-03

| Field | Value |
| --- | --- |
| dimension_code | `STR_GOVERNANCE` |
| question_code | `CT-STRG-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Filed reports are complete and of sufficient quality, subject to quality assurance, and feedback from the FIU or supervisor is acted upon. |
| supervisory_intent | Test the usefulness of the output, not the count. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No report was filed in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | STR/SAR log with filing dates, timeliness statistics, not-reported decision records, confidentiality controls evidence |
| candidate_data_sources | STR/SAR statistics where legally available, enforcement, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Review a sample of filings for narrative quality, inclusion of relevant parties and transactions, and attachments. Check whether feedback received led to change.

#### CT-STRG-04

| Field | Value |
| --- | --- |
| dimension_code | `STR_GOVERNANCE` |
| question_code | `CT-STRG-04` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Confidentiality and tipping-off controls operate, records of suspicion are securely retained, and there is no material backlog of undecided cases. |
| supervisory_intent | Test containment, retention and throughput of the reporting function. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.21 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | STR/SAR log with filing dates, timeliness statistics, not-reported decision records, confidentiality controls evidence |
| candidate_data_sources | STR/SAR statistics where legally available, enforcement, examination history |
| v1.0_mapping | STR_GOVERNANCE.Q2 |
| change_classification | MERGE |

**Guidance.** Test access restriction to STR records, staff understanding of the prohibition on disclosure, retention against [LOCAL_RETENTION_REF], and the ageing of undecided suspicions.

### RECORD_KEEPING — Record Keeping

#### CT-RK-01

| Field | Value |
| --- | --- |
| dimension_code | `RECORD_KEEPING` |
| question_code | `CT-RK-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | Records of due diligence, transactions, internal and external suspicion reports and training are retained for the required period in a usable form. |
| supervisory_intent | Test retention design and scope. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | NO |
| standards_reference | FATF R.11 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Retention schedule, retrieval test evidence, supervisory request response history |
| candidate_data_sources | correspondence/RFIs, examination history |
| v1.0_mapping | RECORD_KEEPING.Q1 |
| change_classification | REWORD |

**Guidance.** Confirm the retention schedule covers each record class, applies to records held by third parties, and matches [LOCAL_RETENTION_REF]. Verify safeguards against premature deletion.

#### CT-RK-02

| Field | Value |
| --- | --- |
| dimension_code | `RECORD_KEEPING` |
| question_code | `CT-RK-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Records can be retrieved completely and promptly on supervisory or competent-authority request, demonstrated in the period. |
| supervisory_intent | Test retrieval as an operating capability. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.11 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Retention schedule, retrieval test evidence, supervisory request response history |
| candidate_data_sources | correspondence/RFIs, examination history |
| v1.0_mapping | RECORD_KEEPING.Q2 |
| change_classification | REWORD |

**Guidance.** Use actual request history or a live retrieval test. Include archived, migrated and third-party-held records.

### TRAINING — Training

#### CT-TRN-01

| Field | Value |
| --- | --- |
| dimension_code | `TRAINING` |
| question_code | `CT-TRN-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | A role-based AML/CFT training programme exists, covering the board, senior management, customer-facing staff, operations and the AML function, at a defined frequency. |
| supervisory_intent | Establish design adequacy and differentiation of training. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18, INR.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Training plan and curriculum, completion and overdue reports, assessment/test results |
| candidate_data_sources | examination history, RFI responses, document metadata |
| v1.0_mapping | POLICIES_PROCEDURES.Q2 |
| change_classification | MOVE_DIMENSION |

**Guidance.** Uniform generic training for all roles is at best PARTIALLY where the business has materially different role exposures. Confirm board and senior-management coverage explicitly.

#### CT-TRN-02

| Field | Value |
| --- | --- |
| dimension_code | `TRAINING` |
| question_code | `CT-TRN-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Training was delivered as planned in the period, new joiners were trained before or on commencement of relevant duties, and the overdue population is immaterial. |
| supervisory_intent | Test delivery and timeliness. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Training plan and curriculum, completion and overdue reports, assessment/test results |
| candidate_data_sources | examination history, RFI responses, document metadata |
| v1.0_mapping | POLICIES_PROCEDURES.Q2 |
| change_classification | SPLIT |

**Guidance.** Obtain completion and overdue reports by role and business unit. Identify staff performing AML-relevant duties without current training. Quantify rather than accept an assertion.

#### CT-TRN-03

| Field | Value |
| --- | --- |
| dimension_code | `TRAINING` |
| question_code | `CT-TRN-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Training effectiveness is tested, and failures or knowledge gaps lead to remedial action. |
| supervisory_intent | Distinguish awareness from attendance. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | Proportionate: a small entity may evidence this through supervised discussion and file review. |
| suggested_evidence_types | Training plan and curriculum, completion and overdue reports, assessment/test results |
| candidate_data_sources | examination history, RFI responses, document metadata |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Look for assessment results, pass thresholds, retesting, and targeted remediation where staff performance or incidents indicate gaps.

### INDEPENDENT_TESTING — Independent Testing

#### CT-IT-01

| Field | Value |
| --- | --- |
| dimension_code | `INDEPENDENT_TESTING` |
| question_code | `CT-IT-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | AML/CFT independent testing is performed by a function or party independent of AML operations, with a mandate and unrestricted scope. |
| supervisory_intent | Establish independence and authority of the assurance function. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18, INR.18 |
| sector_classification | CORE |
| sector_notes | A very small entity may use an external party; the requirement is independence, not an internal department. |
| suggested_evidence_types | Independent testing / internal audit charter, AML audit plan and reports, finding tracker |
| candidate_data_sources | examination history, findings, document metadata |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Independence means not designing or operating the controls tested. Internal audit, group audit or a qualified external party are all acceptable. Self-assessment by the AML function is not independent testing.

#### CT-IT-02

| Field | Value |
| --- | --- |
| dimension_code | `INDEPENDENT_TESTING` |
| question_code | `CT-IT-02` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | The testing scope, frequency and depth are risk-based and include substantive sample testing rather than policy review alone. |
| supervisory_intent | Test the sufficiency of the assurance work performed. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Independent testing / internal audit charter, AML audit plan and reports, finding tracker |
| candidate_data_sources | examination history, findings, document metadata |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Review the plan and completed work for coverage of higher-risk areas, sample sizes, re-performance, and periods since each area was last tested. Consecutive years with no coverage of a high-risk control is a gap.

#### CT-IT-03

| Field | Value |
| --- | --- |
| dimension_code | `INDEPENDENT_TESTING` |
| question_code | `CT-IT-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Testing results are reported to the board or audit committee and findings are tracked to validated closure. |
| supervisory_intent | Test reporting and consequence. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No testing was due or performed in the period under an approved risk-based cycle. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Independent testing / internal audit charter, AML audit plan and reports, finding tracker |
| candidate_data_sources | examination history, findings, document metadata |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Confirm unfiltered reporting, agreed management responses, and validation of closure by the testing function. Findings closed without validation reduce the response.

### THIRD_PARTY_OVERSIGHT — Third Party Oversight

#### CT-TPO-01

| Field | Value |
| --- | --- |
| dimension_code | `THIRD_PARTY_OVERSIGHT` |
| question_code | `CT-TPO-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | AML/CFT due diligence is performed on agents, intermediaries, introducers and outsourced providers before appointment. |
| supervisory_intent | Test entry control over the extended enterprise. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity uses no agents, intermediaries, introducers or AML-relevant outsourced providers. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.14, R.17 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Third-party/agent due diligence files, contract AML clauses, ongoing monitoring and review reports |
| candidate_data_sources | licensing/application data, examination history, complaints/conduct |
| v1.0_mapping | DELIVERY_CHANNEL_RISK.Q2 |
| change_classification | MOVE_DIMENSION |

**Guidance.** Expect assessment of ownership and control, licensing, AML capability, adverse information and jurisdiction. Reliance on group membership alone is insufficient where the provider performs AML-relevant work.

#### CT-TPO-02

| Field | Value |
| --- | --- |
| dimension_code | `THIRD_PARTY_OVERSIGHT` |
| question_code | `CT-TPO-02` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | Contracts impose AML/CFT obligations, data and record access, audit rights, breach notification and termination rights. |
| supervisory_intent | Test the enforceability of AML expectations on third parties. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity uses no agents, intermediaries, introducers or AML-relevant outsourced providers. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.17 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Third-party/agent due diligence files, contract AML clauses, ongoing monitoring and review reports |
| candidate_data_sources | licensing/application data, examination history, complaints/conduct |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Sample agreements for these clauses and for the entity right to obtain underlying CDD records without delay. Ultimate responsibility remaining with the entity must be reflected.

#### CT-TPO-03

| Field | Value |
| --- | --- |
| dimension_code | `THIRD_PARTY_OVERSIGHT` |
| question_code | `CT-TPO-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Third parties are monitored on a risk-based basis during the relationship, and identified breaches lead to escalation, remediation or termination. |
| supervisory_intent | Test ongoing oversight and consequence. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity uses no agents, intermediaries, introducers or AML-relevant outsourced providers. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.14, R.17 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Third-party/agent due diligence files, contract AML clauses, ongoing monitoring and review reports |
| candidate_data_sources | licensing/application data, examination history, complaints/conduct |
| v1.0_mapping | DELIVERY_CHANNEL_RISK.Q2 |
| change_classification | MOVE_DIMENSION |

**Guidance.** Look for risk-rated review cycles, file or transaction sampling of third-party originated business, performance and exception MI, and evidence of action taken where standards were not met.

### AML_DATA_QUALITY — Aml Data Quality

#### CT-DQ-01

| Field | Value |
| --- | --- |
| dimension_code | `AML_DATA_QUALITY` |
| question_code | `CT-DQ-01` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Critical AML data elements are defined, and the data held in source systems is materially complete and accurate for those elements. |
| supervisory_intent | Establish the data foundation on which every automated control depends. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.10, R.11 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Critical data element definitions, data-quality and reconciliation reports, defect remediation register |
| candidate_data_sources | regulatory returns, findings |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Expect a defined list of critical elements (identity, address, date of birth, nationality, beneficial owner, occupation, risk rating, country, transaction party and purpose fields) with measured completeness and accuracy. Free-text substitution for structured fields is a defect.

#### CT-DQ-02

| Field | Value |
| --- | --- |
| dimension_code | `AML_DATA_QUALITY` |
| question_code | `CT-DQ-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Data flowing between source systems and AML screening or monitoring systems is reconciled, with exceptions monitored and resolved. |
| supervisory_intent | Test lineage integrity between capture and control. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity operates no automated screening or monitoring system and monitoring is wholly manual and evidenced as such. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Critical data element definitions, data-quality and reconciliation reports, defect remediation register |
| candidate_data_sources | regulatory returns, findings |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Expect record-count and value reconciliation, rejected-record handling, and monitoring of feeds that failed or arrived late. Silent feed failure is a serious control weakness.

#### CT-DQ-03

| Field | Value |
| --- | --- |
| dimension_code | `AML_DATA_QUALITY` |
| question_code | `CT-DQ-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Data-quality defects affecting AML controls are recorded with an owner and due date and are remediated. |
| supervisory_intent | Test whether known data weaknesses are managed. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Critical data element definitions, data-quality and reconciliation reports, defect remediation register |
| candidate_data_sources | regulatory returns, findings |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Confirm defects are logged, prioritised by AML impact, and remediated; check for long-standing accepted defects with no compensating control.

### MODEL_GOVERNANCE — Model Governance

#### CT-MG-01

| Field | Value |
| --- | --- |
| dimension_code | `MODEL_GOVERNANCE` |
| question_code | `CT-MG-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | Monitoring and screening rules, scenarios, thresholds and models are inventoried, with a named owner and documented purpose for each. |
| supervisory_intent | Establish control over the detection logic, whether statistical or rule-based. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity performs no automated or rule-based monitoring or screening; monitoring is wholly manual and evidenced as such. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.15, R.20 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | Wording is technology-neutral; no statistical model is assumed. |
| suggested_evidence_types | Rule/scenario/model inventory, validation or independent review reports, tuning and threshold change records |
| candidate_data_sources | examination history, findings, document metadata |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Applies equally to spreadsheet or manual rule sets. Undocumented or orphaned rules, and rules disabled without approval, reduce the response.

#### CT-MG-02

| Field | Value |
| --- | --- |
| dimension_code | `MODEL_GOVERNANCE` |
| question_code | `CT-MG-02` |
| question_version | 1 |
| axis | DESIGN_AND_OPERATING |
| effectiveness_focus | DESIGN_AND_OPERATING |
| prompt | Detection logic is independently reviewed or validated before deployment and periodically thereafter, proportionate to its complexity and reliance. |
| supervisory_intent | Test independent challenge of the logic the entity relies on. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity performs no automated or rule-based monitoring or screening; monitoring is wholly manual and evidenced as such. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.15, R.20 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Rule/scenario/model inventory, validation or independent review reports, tuning and threshold change records |
| candidate_data_sources | examination history, findings, document metadata |
| v1.0_mapping | TRANSACTION_MONITORING.Q2 |
| change_classification | MOVE_DIMENSION |

**Guidance.** For statistical models expect validation; for rule or scenario systems expect documented independent review of logic, coverage and data. Vendor certification alone is not entity-specific validation.

#### CT-MG-03

| Field | Value |
| --- | --- |
| dimension_code | `MODEL_GOVERNANCE` |
| question_code | `CT-MG-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Changes to rules, scenarios and thresholds follow change control, are supported by tuning analysis, and performance is monitored with limitations documented. |
| supervisory_intent | Test discipline over change and ongoing performance. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The entity performs no automated or rule-based monitoring or screening; monitoring is wholly manual and evidenced as such. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.20 |
| sector_classification | SECTOR_SENSITIVE |
| sector_notes | — |
| suggested_evidence_types | Rule/scenario/model inventory, validation or independent review reports, tuning and threshold change records |
| candidate_data_sources | examination history, findings, document metadata |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Expect approval of changes by an authorised role, above and below-the-line testing for threshold changes, false-positive and productivity monitoring, and a record of known limitations and compensating measures.

### REMEDIATION_TRACKING — Remediation Tracking

#### CT-REM-01

| Field | Value |
| --- | --- |
| dimension_code | `REMEDIATION_TRACKING` |
| question_code | `CT-REM-01` |
| question_version | 1 |
| axis | DESIGN |
| effectiveness_focus | DESIGN |
| prompt | AML/CFT issues from all sources are captured in a single register with severity, named owner, agreed action and due date. |
| supervisory_intent | Establish a complete and accountable issue population. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | NO |
| NA_conditions | Not permitted |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Issue and action register, overdue action MI, closure validation evidence |
| candidate_data_sources | findings, remediation, enforcement, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Sources include self-identified issues, QA and data-quality defects, independent testing, external audit, supervisory findings and enforcement conditions. A register missing a source is incomplete.

#### CT-REM-02

| Field | Value |
| --- | --- |
| dimension_code | `REMEDIATION_TRACKING` |
| question_code | `CT-REM-02` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Progress is tracked, and overdue or at-risk actions are escalated to the accountable governance forum. |
| supervisory_intent | Test that the register drives action rather than recording it. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | The register contained no open action in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | YES |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Issue and action register, overdue action MI, closure validation evidence |
| candidate_data_sources | findings, remediation, enforcement, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Obtain overdue and extension statistics. Repeated extension without escalation, or re-dating of due dates, reduces the response and should be recorded with figures.

#### CT-REM-03

| Field | Value |
| --- | --- |
| dimension_code | `REMEDIATION_TRACKING` |
| question_code | `CT-REM-03` |
| question_version | 1 |
| axis | OPERATING |
| effectiveness_focus | OPERATING |
| prompt | Closure is supported by validation evidence, and repeat or recurring findings are analysed for root cause. |
| supervisory_intent | Test the durability of remediation. |
| response_semantics | `CONTROL_SEM` (see design document §4) |
| mandatory | YES |
| requires_observation | YES |
| requires_evidence | YES |
| minimum_evidence | 1 |
| allow_NA | YES |
| NA_conditions | No action was closed in the period. |
| NA_rationale_required | YES |
| factual_auto_prefill_possible | NO |
| supervisory_judgement_required | YES |
| standards_reference | FATF R.18 |
| sector_classification | CORE |
| sector_notes | — |
| suggested_evidence_types | Issue and action register, overdue action MI, closure validation evidence |
| candidate_data_sources | findings, remediation, enforcement, examination history |
| v1.0_mapping | None (new in v1.1) |
| change_classification | NEW |

**Guidance.** Confirm an independent or second-line check before closure and look for the same issue recurring across periods, which indicates root cause was not addressed.
