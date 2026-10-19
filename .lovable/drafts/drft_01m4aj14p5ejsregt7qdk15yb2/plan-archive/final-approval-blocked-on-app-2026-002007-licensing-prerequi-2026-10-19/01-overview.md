# Final approval blocked on APP-2026-002007: "Licensing prerequisites are not satisfied"

## What is actually happening
I read the last three blocked approval attempts today (14:08, 14:09, 14:13 UTC). They all show the same result. The sufficiency issue from before is fixed. Only one check is still failing:

| Check | Result |
|---|---|
| Registration handoff | Pass |
| Workflow (Pre License Approval Workflow) | Pass |
| Fees (150.00) | Pass |
| Coordination | Pass |
| Fit & Proper, Conditions | Not applicable |
| **Forms / documents** | **Blocked: "No form/document requirements are bound to this application"** |

The applicant did submit their form. But when the application was submitted (12:47 UTC today), the system never created the list of required forms that this check reads. That list has 0 entries. With nothing to check against, the system blocks the approval instead of passing it. It does this on purpose, so an application with no forms on record can't slip through.

So the form is filed. The approval is blocked only because the required-forms list is missing.

## How you can approve it without a code change
There's no button that fixes this. Every option needs either a data correction or a settings change:

- **A. Data correction for this one application (quickest).** I add one entry to the required-forms list for this application, linked to the form the applicant already submitted. Then you click Approve again. This writes to the live database, so I need your go-ahead first.
- **B. Settings fix.** An administrator links the licence type to its required forms, and the list is rebuilt for this application. One problem: this application's licence type is saved as "Money Services Business - Money Services Business - Money Services Business" (the name repeated three times), so the settings may not match it.
- **C. Leave it blocked** while the missing list on submission is fixed as a separate task (that would be a code change).
