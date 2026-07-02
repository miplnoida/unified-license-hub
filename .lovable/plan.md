## Problem

`ratnpriyaemp@yopmail.com` is correctly configured in the database as `legal_compliance`:
- `profiles.role = 'legal_compliance'`
- `user_roles.role = 'legal_compliance'` (the DB `app_role` enum includes this value)
- Dynamic role: "Legal/Compliance Reviewer"

But the UI treats them as **Applicant**. The reason:

`src/lib/authHelpers.ts::resolveUserRole` reads `user_roles.role` and then picks the first entry that appears in `ROLE_HIERARCHY` (defined in `src/types/platform.ts`). The frontend `AppRole` type, `ROLE_LABELS`, `ROLE_HIERARCHY`, and `INTERNAL_ROLES` **do not include `legal_compliance`**, so the loop finds no match and returns the safe default `'applicant'`. Every downstream UI check (role-based nav, guards, labels) then acts as if the user is an applicant.

## Fix

Update `src/types/platform.ts` to add `legal_compliance` as a first-class app role:

1. Add `'legal_compliance'` to the `AppRole` union.
2. Add `legal_compliance: 'Legal / Compliance Reviewer'` to `ROLE_LABELS`.
3. Insert `'legal_compliance'` into `ROLE_HIERARCHY` — placed after `analyst` and before `developer`, so `resolveUserRole` picks it above `applicant` fallback.
4. Add `'legal_compliance'` to `INTERNAL_ROLES` (staff, not licensee/applicant).

No other code changes. Existing dynamic-permission checks (`hasModuleAccess`, `is_legal_compliance_user` RPC, workflow legal stage handling) continue to work — they already handle this role through the dynamic-role system. This change simply makes the base-role resolver recognize the value instead of falling back to `applicant`.

## Verification

After the change, this user's UI should reflect internal-staff navigation and the profile chip should show "Legal / Compliance Reviewer" instead of "Applicant".
