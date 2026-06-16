## Root cause

The reviewer did add the correct remarks. The database has both rows, for example:

- Reviewer action: `request_resubmission` with remarks like `Testing request resubmission 1`
- Later applicant audit action: `resubmit` with `Applicant resubmitted registration`

The display is wrong because the registered-user side reads `approval_actions` directly:

1. Applicants are only allowed by current RLS to read their own `approval_actions` rows (`actor_id = auth.uid()`), not reviewer rows.
2. One remaining frontend path, `src/lib/registrationUpdateFlow.ts`, still selects the latest action without excluding `resubmit`, so the applicant-visible latest row becomes `Applicant resubmitted registration`.
3. The status hook also has a session cache that can keep an already-wrong remark visible after a reload.

## Minimal fix plan

1. **Add one secure backend helper**
   - Create `public.get_registration_reviewer_remarks(_registration_id uuid)`.
   - It will return only the latest applicant-facing reviewer comment for that registration.
   - It will only work when the caller owns the registration or is internal staff.
   - It will explicitly exclude applicant-authored/resubmit audit rows.
   - It will not expose secrets or broad workflow internals to the frontend.

2. **Update all registered-user remark displays to use that helper**
   - `src/hooks/useRegistrationApprovalStatus.ts`
   - `src/lib/registrationUpdateFlow.ts`
   - `src/lib/registrationAccess.ts`

3. **Prevent stale incorrect remarks from surviving**
   - Bump the registration approval cache key/version.
   - Make cached initial data refetch immediately in the background instead of staying fresh for 30 seconds.

4. **Do not change workflow behavior**
   - No changes to reviewer action execution.
   - No changes to approval/resubmission transitions.
   - No changes to email sending/preview behavior.
   - Keep the applicant resubmit audit row as an audit row; just never show it as reviewer remarks.

5. **Verification before claiming fixed**
   - Run targeted tests for registration access/gating.
   - Query the affected registration records through the new helper and confirm it returns the reviewer remark, not `Applicant resubmitted registration`.
   - Confirm frontend code has no remaining registered-user path that selects the latest `approval_actions.comments` blindly.