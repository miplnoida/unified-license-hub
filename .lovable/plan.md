## Plan: Lock complaint tracking to the real owner/contact

### Confirmed issue
- The current tracking RPC allows access when the signed-in caller has `complaint_management.view`.
- The Applicant role has complaint permissions (`submit`, `upload_documents`, `view_status`), but some external/customer-style roles also have broader complaint `view` permission.
- The signed-in tracking page passes the current user’s email, but backend access must be the final authority.

### Fix
1. **Harden the tracking RPC**
   - Update `public.get_public_complaint_tracking` so external users/applicants can only view a complaint when:
     - they are the complaint `complainant_id`, or
     - their authenticated email exactly matches the complaint contact email.
   - Only internal staff should be allowed through the broader `complaint_management.view` permission.
   - Do not trust typed/caller-supplied email for signed-in users as a way to bypass identity.

2. **Tighten public/anonymous tracking behavior**
   - Since anonymous complaint intake is disabled, make tracking require an authenticated user unless there is a deliberate public tracking route requirement.
   - If keeping `/track/complaint`, it should not reveal another person’s complaint by reference + guessed email.

3. **Add regression checks**
   - Add/adjust complaint security tests to cover:
     - owner/applicant can track their own complaint.
     - unrelated applicant cannot track by reference.
     - unrelated applicant cannot bypass by supplying someone else’s email.
     - internal staff with complaint `view` can still track for operational review.

4. **Verify end-to-end**
   - Test the RPC directly for owner vs unrelated applicant behavior.
   - Check the tracking page route still shows valid owner details and shows “not found”/access denied for unrelated applicants.

### Scope control
- No changes to complaint workflow, status labels, history rendering, or unrelated business logic.
- This is a targeted access-control fix for complaint tracking only.