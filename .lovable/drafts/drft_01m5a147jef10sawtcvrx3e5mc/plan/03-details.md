## 16-service configuration matrix
Every Approval/Notification value is **provisional**, pending regulatory confirmation. Every fee is **Not configured: requires regulatory confirmation**.

| # | Service | Legacy equivalent | Status | Approval/Notif. | Existing workflow reused |
|---|---|---|---|---|---|
| 1 | Licence Renewal | Renew | Existing (Licence Details), no new record | Approval | existing renewal |
| 2 | Change of Registered Address | Change of Registered Address | New (copy) | Approval | Standard Post-License Approval |
| 3 | Change of Business or Contact Details | none | New | Notification | Post-License Notification |
| 4 | Appointment of Director | Director Appointment | New (copy) | Approval | Fit & Proper Post-License Approval |
| 5 | Resignation or Removal of Director | Director Resignation | New (copy) | Notification | Post-License Notification |
| 6 | Appointment or Change of Senior Management | Key Function Holder Change | New (copy) | Approval | Fit & Proper |
| 7 | Change of Compliance Officer / MLRO | none | New | Approval | Fit & Proper |
| 8 | Amendment of Bye-Laws | none | New | Approval | Standard |
| 9 | Change of Credit Union Name | Change of Legal Name | New (copy) | Approval | Standard |
| 10 | Change in Authorized Activities | Licence Variation | New (copy) | Approval | Enhanced Post-License Approval |
| 11 | Opening or Relocation of Branch | New Branch | New (copy) | Approval | Standard |
| 12 | Closure of Branch | Branch Closure | New (copy) | Approval | Standard |
| 13 | Merger or Amalgamation | Group Restructure | New (copy) | Approval | Enhanced |
| 14 | Voluntary Surrender of Licence | Voluntary Surrender | New (copy) | Approval | Enhanced |
| 15 | Variation of Licence Conditions | Licence Variation | New (copy) | Approval | Enhanced |
| 16 | Change in Governance Structure | none | New | Approval | Enhanced |

Duplicate check: #10 and #15 both copy *Licence Variation*. They are kept as two services because the brief lists them separately, but this needs regulator confirmation. The alternative is to merge them into one. No legacy post-approval effects are bound, so approval never changes licence or entity data automatically. Those changes stay with the existing authorised process.

## Forms (Draft)
Each of the 15 forms has the same core layout:
- a read-only Licence and Credit Union block
- Proposed Change
- Reason
- Effective Date
- service-specific fields, such as person details for #4–7, branch address for #11–12, merger counterparty for #13 and the bye-law clause text for #8
- Supporting Documents, using the legacy checklist where one exists
- Declaration

Each form is linked to sector Credit Unions, sub-sector Credit Union, its own service, and one draft version.

## Verification: what Draft allows vs what needs publishing
- **Possible now (Draft):** form preview in Form Builder; field, validation and document settings; correct sector, sub-sector, service and workflow links; before-and-after counts.
- **Needs publishing, service activation and fee confirmation:**
  - the services appearing at `/post-license/new`
  - draft saving and submission
  - document upload
  - linking to the entity and licence
  - the applicant list
  - the `/applications/queue` review
  - workflow steps, notifications and audit
  These are listed as manual steps in the report and are not claimed as verified.

## Technical details (proposed records, nothing executed)
- **Tables written (insert only):**
  - `services`: 15 rows. sector = Credit Unions, sub-sector = Credit Union, `lifecycle_stage='post_license'`, `status='inactive'`, `workflow_id` = an existing workflow, `document_checklist` copied from the legacy equivalent.
  - `form_templates`: 15 rows, Draft, named `CU - <Service>`.
  - `form_fields`: about 15 × 12 = 180 rows.
  - `form_versions`: 15 draft rows.
  - Total: about 225 rows.
- **Not touched:** `fee_configurations`, `approval_workflows`, roles, effect bindings, applications, licences, returns, Credit Union League, and the legacy Micro-credit and other sector rows.
- **Why services start inactive:** the three Credit Union demo licences have no sub-sector, and inactive services keep them from seeing incomplete services.
- **Expected count changes:** only the table counts above, all scoped to the Credit Union sub-sector. Every other count stays identical in the before-and-after snapshot.
- **Rollback:** every new row carries the tag `CU-POSTLIC-2026-10`, in `services.code` and the form description. Rollback deletes only the tagged rows, in reverse order: versions, then fields, then templates, then services. There are no foreign keys from other data while they are unused.
- **Approval gate:** after this plan is approved, the exact INSERT script is shared for review. It runs only after you explicitly say so.
- The report goes to `docs/product/credit-union-post-licensing-configuration.md`.
