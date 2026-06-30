## Root cause

When any auth user is created, the database trigger `public.handle_new_user` always inserts a row into `public.user_roles` with role `'applicant'` (it intentionally downgrades any non-public role for safety against self-signup).

The `create-web-user` edge function (used by Admin → Employee Management → Create) only writes the selected dynamic roles into `user_dynamic_roles`. It never reconciles `user_roles`. So after creation, the new employee ends up with:

- `user_roles`: `applicant` (from the trigger)
- `user_dynamic_roles`: the role(s) the admin picked

On login, the UI reads both sources and shows the selected role **plus** "Applicant".

Verified in DB for `ratnpriyaemp@yopmail.com` (`67ef83ff-…`): `user_roles` contains both `applicant` and `admin`. The `admin` entry was added later when the record was edited — the edit handler in `UserManagement.tsx` already reconciles `user_roles` correctly. Only the create path is broken.

## Fix (single edge function change)

Update `supabase/functions/create-web-user/index.ts` so that, after the auth user is created and `user_dynamic_roles` rows are inserted, it reconciles `user_roles` the same way the edit handler does:

1. After inserting `user_dynamic_roles`, fetch `roles.system_role` for all `dynamicRoleIds`.
2. Build a de-duplicated list of valid `app_role` values from those `system_role`s (fallback to the existing `effectiveRole` baseline if a role has no `system_role`).
3. `DELETE FROM user_roles WHERE user_id = <new_user_id>` (removes the trigger's auto-inserted `applicant`).
4. `INSERT` one row per unique system role into `user_roles`.
5. Skip step 3–4 only when no dynamic roles were provided (e.g. licensee primary/secondary creation paths that already rely on `effectiveRole` — for those, also delete the trigger row and insert the single `effectiveRole` so behavior is consistent and never leaves a stray `applicant`).

## Out of scope

- No change to the DB trigger (kept as the safe default for self-signup).
- No change to `UserManagement.tsx`, the edit flow, or any UI.
- No change to `user_dynamic_roles` schema, RLS, or the role-display logic.

## Acceptance

- A newly created employee has **no** `applicant` row in `user_roles` unless that was actually the selected role.
- The user's displayed roles after first login match exactly what the admin selected.
- Existing edit/update behavior is unchanged.
- Existing affected user (`ratnpriyaemp@yopmail.com`) can be cleaned up manually via a one-off SQL `DELETE FROM user_roles WHERE user_id = '67ef83ff-3502-473a-9200-c4eb11f7426d' AND role = 'applicant';` after the fix is deployed (optional, mention to user).
