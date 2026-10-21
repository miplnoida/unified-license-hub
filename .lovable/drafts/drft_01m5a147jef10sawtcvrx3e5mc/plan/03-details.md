## Revised execution steps (run only after your explicit go-ahead)
"Script" means a browser script fills in the normal screens. "Authorised user" means that step is a regulatory decision, so it is made by a person signed in with the right role, not by the script.

| # | Step | Screen | Who | Done by |
|---|---|---|---|---|
| 1 | Applicant registers and identifies "Rodney Bay Community Credit Union Ltd" | `/register` → `/register/entity` | new applicant (needs a real inbox for the email code) | Script; you enter the code |
| 2 | Bind the registration to the existing entity `cc331…` ("resolve to existing") | `/licensing/entity-resolution/:caseId` | entity resolution officer, then supervisor if the case needs a checker | Authorised user |
| 2b | Fallback only if step 2 is not offered: add the primary user on the Web Users tab | `/entities/cc331…` (Web Users) | officer with user-creation permission | Authorised user |
| 3 | Approve the membership request | `/admin/entity-memberships` | licensing officer | Authorised user |
| 4 | First sign-in and forced password change | `/` | applicant | Manual |
| 5 | Fill in the Credit Union licence form (21 questions) and upload documents | `/pre-license/new` → `/applications/:id/forms` | applicant | Script |
| 6 | Check Entity 360 and Person 360 | `/entities/cc331…`, `/persons/:partyId` | licensing officer, read-only | Script (screenshots) |
| **STOP** | Submit, payment, review, Fit & Proper, approval, licence and certificate | | | Waits for blockers 1 and 2 |

## Expected records at the stop point
- 1 registration, bound to `cc331…`
- 1 resolution decision with its audit entry
- 1 applicant account
- 1 approved membership
- 1 draft application linked to `cc331…` and form version 2
- document records
- 0 payments
- 0 licences

Entity 360 still says "No licences recorded".

## Verification at the stop point
- Every new record points to `cc331…`, with nothing orphaned.
- Dates follow the order of the steps.
- No one approved their own work.
- No second Rodney Bay entity exists.
- The fingerprint of the other credit unions is unchanged.
- Fee, workflow and form counts are unchanged.

## Not done
- Fee or workflow configuration.
- Changes to code, schema or security.
- Renewal and variation (deferred).
- Activating services or publishing forms.
- Any direct insert of links between records.
