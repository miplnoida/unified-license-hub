## Service mapping (proposed)
| # | Service | Reuses | Type | Pattern |
|---|---|---|---|---|
| 1 | Licence Renewal | Renew | Approval | Standard |
| 2 | Change of Registered Address | Change of Registered Address | Approval | Standard |
| 3 | Change of Business or Contact Details | new | Notification | Notification |
| 4 | Appointment of Director | Director Appointment | Approval | Fit and Proper |
| 5 | Resignation or Removal of Director | Director Resignation | Notification | Notification |
| 6 | Appointment or Change of Senior Management | Key Function Holder Change | Approval | Fit and Proper |
| 7 | Change of Compliance Officer / MLRO | new | Approval | Fit and Proper |
| 8 | Amendment of Bye-Laws | new | Approval | Standard |
| 9 | Change of Credit Union Name | Change of Legal Name | Approval | Standard |
| 10 | Change in Authorized Activities | Licence Variation | Approval | Enhanced |
| 11 | Opening or Relocation of Branch | New Branch | Approval | Standard |
| 12 | Closure of Branch | Branch Closure | Approval | Standard |
| 13 | Merger or Amalgamation | Group Restructure | Approval | Enhanced |
| 14 | Voluntary Surrender of Licence | Voluntary Surrender | Approval | Enhanced |
| 15 | Variation of Licence Conditions | Licence Variation | Approval | Enhanced |
| 16 | Change in Governance Structure | new | Approval | Enhanced |

Every "Type" value is a proposal that needs regulatory confirmation.

## Report
The report goes to `docs/product/credit-union-post-licensing-configuration.md` and covers sections 1–6 of the brief:
- the status of each service: Existing, Created as Draft, Blocked, or Requires Approval
- the fields and documents in each form
- manual verification steps
- before and after counts showing that other sectors are unaffected

## Technical details
- Rows are added only to `services`, `form_templates`, and the form section and field tables, plus a draft form version. Nothing is published. No fee configurations are added, and no workflow, role, or schema changes are made.
- Inserts are idempotent on (sub_sector_id, name). They never update existing rows.
- A guardrail snapshot of counts for services, forms, fees, workflows, and applications is taken before and after the inserts.
- These inserts write to the shared live database. Approving this plan counts as your confirmation.
- Out of scope: Credit Union League (it can be added later the same way), publishing, and fees.
