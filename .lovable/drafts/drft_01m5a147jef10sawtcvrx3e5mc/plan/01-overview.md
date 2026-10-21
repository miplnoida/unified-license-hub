# Stage B, Session 2: Licensing & Entity 360 for Rodney Bay Community Credit Union Ltd

This is a plan only. Nothing runs until you approve it. Five blockers have to be decided first (see the end of this plan), and two of them stop the journey from starting at all.

## Journey through the normal screens
All test accounts use the `@mishainfotech.com` domain. "Auto" means I drive the normal screens with a browser script, signed in as that test account. "Manual" means a person has to do the step.

| # | Step | Screen | Who | Auto / Manual |
|---|---|---|---|---|
| 1 | Applicant account and registration | `/register` → `/register/entity` → `/register/account` | new applicant (email inbox needed for the code) | Manual (emailed one-time code) |
| 2 | Registration review and approval | `/admin/registration-review/:id` | `licensing_officer`, then `licensing_supervisor` | Auto |
| 3 | First sign-in and forced password change | `/` | applicant | Manual (temporary password arrives by email) |
| 4 | Create the licence application | `/pre-license/new` → `/applications/:id/forms` | applicant (`pre_licensee`) | Auto |
| 5 | Upload documents | same form, document fields | applicant | Auto |
| 6 | Fee assessment and payment | `/applications/:id` → payment step, `/payments/:id` | applicant | Auto (sandbox gateway), **blocked: no fee set up** |
| 7 | Submit | `/applications/:id` | applicant | Auto |
| 8 | Intake and sufficiency review | `/applications/queue` → `/applications/:id` | `licensing_officer` | Auto |
| 9 | Fit & Proper on each director | `/fpa/entity/application/:id` | `fit_proper_officer` → `fit_proper_supervisor` | Auto (screening sandbox) |
| 10 | Approval through the workflow steps | `/applications/:id` | `licensing_officer` → `licensing_supervisor` | Auto |
| 11 | Licence issue, conditions, certificate | `/licenses/:id` | system after approval; `licensing_officer` adds conditions | Auto, **certificate step at risk** |
| 12 | Renewal and variation | `/licenses/:id` (renewal), `/post-license/new` | licensee primary user | **Blocked: the new Credit Union services are inactive** |
| 13 | Check Entity 360 and Person 360 | `/entities/cc331000-…-000000000001/360`, `/persons/:partyId` | `licensing_officer`, `read_only` | Auto |
