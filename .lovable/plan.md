The error is caused by the backend authorization function, not the renew button itself.

**Root cause**
- `anisha.k2@yopmail.com` exists in `pre_license_users`, not `profiles`.
- Her license `LIC-2026-000014` is correctly linked to licensee `8e3ffcec-8270-478d-861e-da60f025e3b3` and `licenses.holder_id` is her user id.
- But `can_current_user_access_licensee()` only authorizes:
  - users whose `profiles.licensee_id` matches the licensee, or
  - active PPOC mappings.
- It does **not** authorize the original license holder from `pre_license_users`, so the renewal flow returns: `You are not authorized to renew this license.`

**Plan**
1. Update the backend authorization function `can_user_access_licensee` to also allow the primary license holder when:
   - `licensees.id = target_licensee_id`
   - `licensees.license_id = licenses.id`
   - `licenses.holder_id = current user id`
   - and, when a sector is provided, it matches the license/licensee sector.
2. Keep the existing `profiles.licensee_id` and PPOC authorization paths unchanged.
3. Re-test the specific Anisha record by checking that the function authorizes her for licensee `8e3ffcec-8270-478d-861e-da60f025e3b3` / license `LIC-2026-000014`.
4. Then verify the frontend renewal path no longer shows the authorization error and can create the renewal draft.

**Files / backend affected**
- Backend migration only: replace `public.can_user_access_licensee(...)` logic.
- No unrelated records will be changed.