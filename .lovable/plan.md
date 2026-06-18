## Root cause

The built-in "Applicant" dynamic role row in `public.roles` has `system_role = 'analyst'`. When a pre-licensee account is created, `seed_external_portal_defaults` inserts the Applicant dynamic role, and the existing trigger `trg_sync_user_roles_from_dynamic` mirrors that role's `system_role` into `public.user_roles`. Result: every pre-licensee/applicant ends up with both `pre_licensee` and `analyst` static roles, so the UI labels them "Analyst" and they inherit internal-analyst privileges.

(Regulated Entity User is correctly mapped to `licensee_primary`; only Applicant — and similarly Consumer/Complainant — were left with the catch-all `analyst` default from migration `20260618142619`.)

## Plan

Single database migration:

1. **Re-map external built-in roles** in `public.roles`:
   - `Applicant` → `system_role = 'applicant'`
   - `Consumer / Complainant` → `system_role = 'applicant'` (also an external submitter, same bug)
2. **Clean up wrongly-granted `analyst` rows** in `public.user_roles`: delete `(user_id, 'analyst')` for every user whose only source of `analyst` was one of the re-mapped dynamic roles and who has no other dynamic role currently mapped to `system_role = 'analyst'`.
3. **Re-run the sync** for affected users by touching their `user_dynamic_roles` rows so `trg_sync_user_roles_from_dynamic` inserts the correct `applicant` static role.
4. **Tighten the create-user default** in `supabase/functions/create-web-user/index.ts` so it does not silently fall back to `'analyst'` when the caller passes a dynamic role whose `system_role` resolves to an external value — use that resolved value instead of the hard-coded `'analyst'`. (Defence in depth; the sync trigger already does the right thing once the role table is correct.)

## Verification

- Re-check `user_roles` for `anisha.k2@yopmail.com`: should be `{pre_licensee, applicant}` only, no `analyst`.
- New pre-licensee signup → `user_roles` has `pre_licensee` + `applicant`, never `analyst`.
- Internal staff (Analyst, Licensing Analyst, etc.) keep their `analyst` static role because their dynamic roles still resolve to `system_role='analyst'`.
- The previous fix (RLS gate + dynamic-role backfill + registration prefill) is unchanged.