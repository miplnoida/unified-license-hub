# AML/CFT demonstration scenario manifest

## Historical baseline (permanent)

24 `DEMO AML …` institutions, 23 canonical licences, 22 AML/CFT risk states, 25 immutable risk
movements, 25 assessments and their consequence / monitoring / outcome history. One institution
(case 21) is a deliberate out-of-perimeter, unlicensed holding company negative control.

These records were created **before** the current governed publication workflow existed. They are
described honestly as *historical officer-recorded demonstration baseline*. They are never edited,
backfilled or retro-approved, and their risk history is immutable by platform design.

## Additive current-workflow scenarios

Created by `scripts/demo/seed-aml-demo-current-workflow.sql` through the live governed operations
only (programmed creation → materialised question plan → responses and workpaper evidence →
submission, return, resubmission). Stable fixture key is carried in each assessment summary.

| Key | Institution | Reference | State | Content |
|-----|-------------|-----------|-------|---------|
| SCEN-01 | DEMO AML 01 Castries Remittance Services Ltd | SUP-AML_CFT-2026-00735 | draft | 41-question governed plan, no responses yet |
| SCEN-02 | DEMO AML 02 Vieux Fort Money Transfer Ltd | SUP-AML_CFT-2026-00736 | submitted | 41 responses incl. one justified Not Applicable, awaiting independent review |
| SCEN-03 | DEMO AML 03 Soufriere Exchange Bureau Ltd | SUP-AML_CFT-2026-00737 | returned_for_revision | one review round returned with a supervisory reason |
| SCEN-04 | DEMO AML 04 Marigot Credit Union | SUP-AML_CFT-2026-00738 | submitted | returned then resubmitted — two review rounds |
| SCEN-05 | DEMO AML 05 Dennery Cooperative Credit Union | SUP-AML_CFT-2026-00739 | draft | partly worked file (12 of 41 questions answered) |

Generated identifiers change on a fresh bootstrap; the fixture keys do not.

## Not present, and why

No additive **approval** or **risk-of-record publication** exists. See the blocker recorded in
`docs/aml/AML-demo-data-integrity-report.md`: with no live AML/CFT calculation policy published, an
approval would carry a NULL rating, and the governed rating-override operation refuses with
`no_calculation`. Fabricating a rating is prohibited.


## SCEN-06 — calculated, approved and published rating

| Field | Value |
|---|---|
| Entity | DEMO AML 06 Rodney Bay Payments Ltd (`aa220000-0000-4000-8000-000000000006`) |
| Assessment | `c3e16863-60d8-4c6e-8650-3f0eefcbc0cf`, periodic, period ending on the activation date |
| Questions | 41 answered (a recurring partial finding among otherwise met requirements) |
| Calculation | 1 recorded run, status CALCULATED, hash `22ef382593b79db559563072bd70fb90`; 20 dimensions calculated, 6 not applicable |
| Rating | residual LOW, driven by the worst residual dimension under the HIGHEST_DIMENSION rule |
| Publication | operative risk of record for the entity, source assessment recorded, previous rating retained in movement history |
| Seed | `scripts/demo/seed-aml-demo-rating-case.sql` (idempotent) |

Preceding scenarios SCEN-01…SCEN-05 are unchanged, and no historical assessment was recalculated.
