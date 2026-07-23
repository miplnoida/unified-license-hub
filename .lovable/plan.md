## Goal
Stop the applicant-panel “Proceed to Forms” draft creation failure for `fincorp@yopmail.com` without changing unrelated application workflow behaviour.

## Confirmed current state
- The frontend insert in `src/pages/NewApplication.tsx` already uses `supabase.auth.getUser()` immediately before creating the row.
- The active backend policy on `applications` allows creation only for authenticated users when one of these is true:
  - internal user has `application_management.create`, or
  - `applicant_id = auth.uid()` and the user has an external role such as `applicant` / `pre_licensee`.
- `fincorp@yopmail.com` has `applicant` and `pre_licensee` roles, so a direct policy mismatch is unlikely.
- Because the error still appears after sign-out/sign-in guidance, the safest fix is to remove any remaining dependency on client-supplied ownership and make the backend derive ownership from the current authenticated session.

## Implementation plan
1. **Create an atomic backend draft-create function**
   - Add a secure database function, e.g. `create_application_draft`, that:
     - Requires a valid signed-in user.
     - Sets `applicant_id` from `auth.uid()` server-side.
     - Accepts only the draft fields needed by the existing page: license type, regulator, and draft data.
     - Keeps existing duplicate/re-application triggers in place.
     - Returns the created application id and row data.
   - Grant execution only to authenticated users.

2. **Update the frontend insert path only**
   - Change `NewApplication.tsx` so “Proceed to Forms” calls the new function instead of directly inserting into `applications`.
   - Preserve the existing update path for continuing drafts.
   - Keep the current duplicate guard and all existing navigation/form logic unchanged.
   - Show a clearer message if backend auth is missing versus a business-rule block.

3. **Add a regression test for ownership derivation**
   - Add/extend RBAC/application tests so the function verifies ownership server-side.
   - Cover an external applicant/pre-licensee creating a draft.
   - Cover a spoof attempt where caller-supplied alternate owner cannot be used, because the function never accepts one.

4. **Verify with the real session path**
   - Use the injected preview session to exercise the actual UI flow as far as possible.
   - Inspect the created draft row and confirm `applicant_id` equals the authenticated user.
   - If the injected session is not `fincorp@yopmail.com`, report that the exact `fincorp` authenticated path remains unverified and only the generic signed-in path was verified.

## Files expected to change
- `src/pages/NewApplication.tsx`
- A new database migration under `supabase/migrations/`
- A focused test file or existing RBAC/application test file

## Out of scope
- No changes to role assignments, unrelated RLS policies, form-template matching, payment flow, or application workflow status logic.