# AML-CFT-RBA v1.1 — supervisory methodology content design (DESIGN ONLY, NOT APPROVED)

Baseline: `64dd3ca4173c93809988238f3add7aabbc11a6e6`. No migration, database write, methodology version, calculation configuration, score, band, matrix or effective-date rule is created by this design. No decision below is regulator-approved.

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
3. **Every question is evidence-backed and observation-backed.**
4. **No automated supervisory outcome.** The methodology produces inputs to judgement; the residual rating, judgement and response remain supervisory acts.
5. **Proportionality is applied in the assessment of a control, not by removing the control.**
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

### Control effectiveness

- `YES` — The control is appropriately designed for this entity AND there is evidence it operated effectively throughout the assessment period.
- `PARTIALLY` — The control exists but has material design gaps or evidenced operating exceptions that leave residual weakness.
- `NO` — The control is absent, or so weak in design or operation that it cannot be relied upon.
- `NOT_APPLICABLE` — The activity the control addresses is genuinely not undertaken (e.g. no agents at all), so the control cannot exist. Never used because evidence is missing, the entity did not answer, or the control is weak.

`NOT_APPLICABLE` is permitted only where the catalogue states a condition, always requires a rationale, and is never a favourable response.

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

Inherent 21 (v1.0: 12), control 54 (v1.0: 29), total 75 (v1.0: 41). The six previously empty control dimensions receive 18 questions and are no longer empty.

## 6. Design vs operating effectiveness

| Focus | Questions |
| --- | --- |
| DESIGN | 14 |
| OPERATING | 28 |
| DESIGN_AND_OPERATING | 12 |

The split is selective: it is applied where a control can be well designed and still fail in operation (CDD, monitoring, screening, training, testing, remediation, STR), and avoided where a single question is sufficient.

## 7. STR identification / governance boundary

- `STR_IDENTIFICATION` covers **detection and internal escalation**: recognition capability, capture of internal reports as investigable cases, and the integrity and timeliness of escalation to the MLRO function.
- `STR_GOVERNANCE` covers **decision, filing and containment**: filing authority, decision record for filed and not-filed cases, external filing timeliness and quality, FIU feedback, confidentiality/tipping-off and retention.
- The boundary is the arrival of the suspicion at the authorised decision-maker.
- Legacy `STR_SAR_GOVERNANCE` (22 assessment-dimension rows bound to the superseded `AML_RBA` v1.0) is **recommended for display/lineage mapping only** to `STR_GOVERNANCE`. No historical repair, response reinterpretation or write mapping is proposed here — see AML-METH-08.

## 8. Evidence, data sources, contradictions and N/A discipline

See `AML-CFT-RBA-v1.1-evidence-data-source-map.md` for evidence categories, per-dimension evidence and source classification, and advisories ADV-01..ADV-08. N/A conditions are enumerated per question in the catalogue; unlisted N/A use is not permitted.

## 9. Sector overlays, FATF mapping, proportionality

- Sector classification: `CORE` (applies to all regulated populations) vs `SECTOR_SENSITIVE` (13 questions, applied through the N/A conditions and sector notes rather than by removing the question).
- Every question carries a `standards_reference` to the relevant FATF Recommendation / Interpretive Note.
- Proportionality is expressed in guidance (what adequate looks like for a small entity), never by exempting a control.

## 10. Non-automated supervisory outcomes

The methodology produces per-question responses, observations and evidence. Residual rating, overall judgement and supervisory response remain supervisory decisions recorded with rationale. No calculation values are proposed in this wave.

## 11. v1.0 → v1.1 transition policy (proposed, not approved)

- v1.0 remains the bound methodology for every existing assessment; no in-flight assessment is re-versioned.
- v1.1 is authored as a DRAFT version and takes effect only for assessments created on or after its approved effective date.
- v1.0 questions not carried forward are retired in v1.1 only, never deleted, preserving historical rendering.
- Legacy `AML_RBA` v1.0 rows are untouched.

## 12. Decision register

See AML-METH-01..AML-METH-10 appended to `docs/aml/AML-CFT-methodology-calculation-decision-pack.md`. All are `AWAITING SUPERVISORY APPROVAL`.

## 13. Design-only verification

| Check | Result |
| --- | --- |
| Unique question codes | PASS (75 codes) |
| Every question mandatory, observation-required, evidence-required (min >= 1) | PASS (minimum normalised to 1 where unset) |
| Every dimension has at least one question | PASS (26/26) |
| Six previously empty control dimensions populated | PASS |
| Every question carries a standards reference | PASS |
| Every question carries a v1.0 mapping or is classified NEW | PASS (26 NEW) |
| N/A permitted only with an enumerated condition | PASS |
| No score, band, matrix, weight or effective-date value authored | PASS |
| No database write, migration or methodology version created | PASS |

## 14. Verdicts

- **AML-CFT-RBA v1.1 CONTENT DESIGN COMPLETE — YES**
- **READY FOR SUPERVISORY REVIEW — YES**
- **REGULATOR-APPROVED — NO** (no decision in AML-METH-01..10 is approved)
- **READY FOR IMPLEMENTATION — NO** (implementation is gated on approval of AML-METH-01..10)
- **AML FULL MODULE HARDENING — NOT CERTIFIED**