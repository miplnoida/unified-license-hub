# New Credit Union test institution: register, license, then test post-licence and renewal

## Goal
Create one new fictional institution in **Credit Union → Credit Union → Credit Union** using the normal screens. Take it through registration, the pre-licence application and approval, so you have a fresh active licence and a primary user. You can then check every post-licence service and the renewal flow. No code, permissions or other features will change.

## Steps (all through the normal app screens)
1. **Check first (read-only).** Confirm the sector, sub-sector and category exist under the intended regulator, plus a published registration form, pre-licence application form, fee, approval workflow and Credit Union renewal service. Any gap gets reported to you before I go further.
2. **Registration.** Register a fictional institution (for example "Grenadine Test Credit Union Ltd", made-up contacts on a yopmail address) on the public registration page, including email OTP and uploads.
3. **Approve the registration** as a regulator officer, so the applicant can sign in.
4. **Pre-licence application.** As the applicant: fill every form section with fictional, consistent data, pay the fee through the test payment screen and submit.
5. **Workflow approval.** Complete each configured step in order, using the role assigned to that step and separate reviewer and approver accounts. This covers fit-and-proper checks and any information requests along the way. No steps are skipped.
6. **Licence and primary user.** Confirm the licence is issued, the certificate can be downloaded and the primary web user is created and can sign in.
7. **Post-licence readiness.** As the primary user, confirm each Credit Union post-licence service opens from New Post-Licence Request. I'll list which ones open and which don't.
8. **Renewal readiness.** A new licence won't be due for renewal yet, so renewal can't be tested straight away. With your approval, I'll move only this test licence's end date past its grace period, as we did for LIC-2026-000034. Then I'll check that Renew starts.
9. **Hand-over note.** You'll get the institution name, application and licence numbers, login emails and the undo steps for the date change. It will be saved in the demo folder.

## What stays untouched
Existing institutions, Rodney Bay, the protected AML and FSRA records, permissions, forms, workflows and code. If a step is blocked by setup (for example a missing renewal service or a workflow with no one assigned), I'll stop and ask you rather than change the setup.

## Technical notes
- Only the browser user journey is used to create data. Read-only database queries are used only to check results.
- The renewal date change is the only direct data edit. It applies to this one test licence and is recorded with undo values.
- Any OTP comes from the yopmail inbox; no real people are emailed.
