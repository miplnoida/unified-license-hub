# Fix: Internal staff (any role) blocked from Applications Queue

## Root cause

RLS on `public.applications` hard-codes only five internal `app_role` values (`super_admin`, `admin`, `supervisor`, `licensing_officer`, `analyst`). The `legal_compliance` reviewer (`ratnpriyaemp@yopmail.com`) and any other internal role added later (e.g. `developer`, plus any future internal role) are not in that OR-chain, so the permissive SELECT policy `Applicants read own apps` never matches them → the queue returns 0 rows.

The same enumeration mistake exists in three places:

1. `public.has_any_internal_role(uuid)` — the helper that guards the restrictive `external_applications_*_capability_gate` policies. Hardcodes the same five roles.
2. `public.handle_new_user()` — `internal_role_names` array used to skip the phantom-`applicant` auto-seed for admin-created employees. Hardcodes the same five.
3. `public.applications` policies — the permissive SELECT policy `Applicants read own apps` and the UPDATE policy `Update apps` both spell out the five internal roles with individual `has_role(...)` calls.

We want a single source of truth for "internal role" so a new internal role added to the `app_role` enum in future automatically inherits queue access — no more per-role RLS edits. Row-level RLS is still enforced; the frontend `PermissionGate` + `useUserDynamicPermissions` layer continues to gate the Applications module by dynamic permission mapping, so an internal role that a super-admin has not granted the `applications` module to still won't see the sidebar entry or route.

## Fix (single migration)

1. **Rewrite `public.has_any_internal_role(_user_id)`** to derive "internal" from the enum itself, not a hard-coded list. It returns true when the user has any `user_roles.role` that is NOT one of the external roles (`applicant`, `pre_licensee`, `licensee_primary`, `licensee_secondary`, `developer` if we want to keep it non-internal — confirmed as internal in `INTERNAL_ROLES` client-side, so include it). Concretely: `role NOT IN ('applicant','pre_licensee','licensee_primary','licensee_secondary')`. `SECURITY DEFINER`, `SET search_path = public`, `STABLE`.
   - This automatically covers `legal_compliance`, `developer`, and any future internal role added to the enum.

2. **Rewrite the permissive SELECT policy `Applicants read own apps`** on `public.applications` to:

   ```sql
   USING (auth.uid() = applicant_id OR public.has_any_internal_role(auth.uid()))
   ```

   Dropping the five hard-coded `has_role(...)` clauses. Same net effect for the existing five roles; adds coverage for every other internal role.

3. **Rewrite the permissive UPDATE policy `Update apps`** the same way — replace the trailing four `has_role(...)` clauses (super_admin / admin / supervisor / licensing_officer) with `public.has_any_internal_role(auth.uid())`. Applicant + licensee self-edit branches are preserved unchanged.

4. **Rewrite `public.handle_new_user()`** to use the same "not-external" definition instead of the hard-coded `internal_role_names` array. Any employee created with any internal role skips the phantom `applicant` seed. Bootstrap super-admin branch preserved.

5. **One-off data repair** (idempotent, scoped to internal employees): for every `profiles` row where `user_type IN ('employee','internal_employee')` AND `user_roles` still contains `applicant` alongside at least one non-external role, delete the `applicant` row from `user_roles` and the `Applicant` row from `user_dynamic_roles`. Same shape as the previous cleanup, just broadened to cover legal_compliance / developer / future internal roles. Report affected count via `RAISE NOTICE`.

No frontend changes. No changes to restrictive `external_*` gates (they already call `has_any_internal_role`, which is now correct for all internal roles). Licensee, PPOC, applicant, and insert policies untouched.

## Verification

1. Sign in as `ratnpriyaemp@yopmail.com` (Legal/Compliance Reviewer) → `/applications/queue` shows the full internal queue.
2. Sign in as `anisha.emp@yopmail.com` (Analyst) → assigned case `APP-2026-000106` and the rest of the analyst-visible queue appear.
3. Create a fresh employee with role Legal/Compliance Reviewer, then Developer → `user_roles` contains only that role, no `applicant`, and both accounts see the queue when the admin has granted the Applications module in dynamic permissions.
4. Pure applicant user → still sees only own applications (regression check).
5. Licensee primary/secondary and PPOC users → visibility unchanged.
