# LINK-11 — legacy `STR_SAR_GOVERNANCE` link remediation proposal

Status: PROPOSAL ONLY. No live row has been changed, re-coded or deleted.
Applying any part of this proposal requires the authorised mapping decision
DEC-08 in `AML-calculation-policy-decision-register.md`.

## Inspection result

| Observation | Value |
|---|---|
| Rows using the code | 22 `supervisory_assessment_dimension` rows |
| Distinct assessments | 22 (one row per assessment) |
| Distinct entities | 22 |
| Owning methodology of the bound assessments | `AML-CFT-RBA` v1.0 (`ACTIVE`, regulator-authored) |
| Source dimension code on the rows | `STR_SAR_GOVERNANCE` |
| Target dimension in the bound methodology | none — the code does not exist in v1.0 or v1.1 |
| Methodology dimension binding | `methodology_dimension_id` is NULL on all 22 rows |
| Dimension group recorded on the rows | `CONTROL_EFFECTIVENESS` |
| Period coverage | 2025-09-03 … 2026-09-02 |
| Assessment statuses | approved, submitted, draft, superseded |
| Question responses attached | 0 |
| Residual ratings recorded | 0 |
| Weights recorded | 0 |
| Calculation status | 21 never calculated, 1 `NO_EFFECTIVE_DATE_RULE` |

## Classification

`LEGACY_DATA_REMEDIATION_REQUIRED`. The rows are **orphaned and reference-only**:
they carry no responses, no weight and no rating, so they contribute nothing to
any current calculation or published risk of record. They are historical residue
of a retired dimension code, not operational data.

## Candidate canonical replacements in `AML-CFT-RBA` v1.0

| Code | Group | Label |
|---|---|---|
| `STR_GOVERNANCE` | CONTROL_EFFECTIVENESS | STR/SAR Governance, Quality and Timeliness |
| `STR_IDENTIFICATION` | CONTROL_EFFECTIVENESS | STR/SAR Identification and Escalation |

Both codes also exist in the v1.1 draft, so a mapping decision remains valid
across the version transition. `STR_GOVERNANCE` is the closest match by label and
group, but label similarity is not an authorisation to rebind.

## Proposed remediation options

1. **Rebind (requires DEC-08 naming the target code).** For each of the 22 rows,
   set `dimension_code` and `methodology_dimension_id` to the approved v1.0
   dimension, one row at a time, with the mapping decision recorded per row. No
   response, rating or weight changes, because none exist.
2. **Retain as reference-only.** Record an authorised statement that the rows are
   historical, exclude them from linkage assertions by an explicit governed
   exception, and leave the data untouched.
3. **No action.** LINK-11 stays red and is reported as an accepted external
   dependency.

## Downstream impact of each option

- Calculation: none today under any option — the rows are unanswered and unrated.
- Published risk of record and risk history: unaffected; no publication derives
  from these rows.
- Reporting and dimension coverage: option 1 makes 22 historical assessments show
  a bound control dimension where they previously showed an unbound code; option 2
  and 3 leave reports exactly as they are.
- Assessment lifecycle: unchanged under all options.

## Prohibited actions

- No bulk `UPDATE` or `DELETE` across the 22 rows.
- No mapping inferred from label or group similarity.
- No new methodology dimension created to absorb the retired code.
