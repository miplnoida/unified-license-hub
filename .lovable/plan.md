# Fix chain: stop the phantom `applicant` role on new employees, then unblock the Analyst queue

Two related issues, fixed in order. Issue A is the root cause; issue B is what the user reported first and gets resolved cleanly once A is in place, plus a data-repair pass and a small RLS safety net.

## Issue A (root cause) — Creating an employee also grants `applicant`

### Why it happens (verified in DB)
When `create-web-user` runs for an employee:

1. `supabase.auth.admin.createUser` fires the `handle_new_user` trigger, which — for any non-`applicant`/`pre_licensee` requested role — silently downgrades to `applicant` and inserts `public.user_roles (user_id, 'applicant')`.
2. The `user_roles_seed_dynamic_role` trigger then fires on that insert and calls `seed_external_portal_defaults(...)`, which writes an `Applicant` row into `public.user_dynamic_roles`.
3. The edge function later upserts the admin-selected dynamic roles (e.g. `Analyst`); the `sync_user_roles_from_dynamic` trigger re-derives `user_roles` from the *full* set of dynamic roles, so `applicant` is put back into `user_roles` alongside `analyst`.
4. The edge function's `delete + insert` reconcile of `user_roles` runs, but it never touches `user_dynamic_roles`, so any later trigger-driven re-sync (or ordering of the above) leaves `applicant` in place. `anisha.emp@yopmail.com` currently has `user_roles = {analyst, applicant}` and `user_dynamic_roles = {Analyst, Applicant}` because of exactly this.

### Fix (single migration + one edge-function edit)

**Migration:**
- Update `public.handle_new_user()` to skip the auto `applicant` seed when the auth user is created by an admin for an internal user type. Detection: `raw_user_meta_data->>'user_type' IN ('employee','internal_employee')`, OR `raw_user_meta_data->>'role'` maps to an internal `app_role` (`admin`, `super_admin`, `supervisor`, `licensing_officer`, `analyst`). In that case:
  - Insert the profile with `role = <requested internal role>` if valid, else `NULL` (never `applicant`).
  - Do NOT insert into `public.user_roles` at all — the edge function is the sole authority for internal role assignment. External signups (`applicant`, `pre_licensee`) keep today's behavior exactly.
- Keep the bootstrap super-admin branch intact.
- Function stays `security definer` with `set search_path = public`.

**Edge function `supabase/functions/create-web-user/index.ts`:**
- After the auth user is created and before the dynamic-role upsert, delete any auto-seeded `Applicant` `user_dynamic_roles` row that the trigger may still add for legacy safety (belt-and-braces).
- After the reconcile block, re-derive `user_roles` from `user_dynamic_roles` explicitly (delete + insert distinct `system_role` values) so the final state is deterministic regardless of trigger ordering.
- No behavior change for licensee primary/secondary flows (they already pass an internal `user_type` guard).

**Data repair (one-off SQL in the same migration):**
- For every profile whose `user_type IN ('employee','internal_employee')` AND has an `applicant` row in `user_roles` AND has at least one non-`applicant` internal role: delete the `applicant` row from `user_roles` and the `Applicant` row from `user_dynamic_roles`.
- Idempotent, scoped by `user_type` so external accounts are untouched.
- Log affected user count via `RAISE NOTICE`.

## Issue B — Analyst sees only her own 39 apps in `/applications/queue`

Once A is applied and the data repair strips Anisha's phantom `applicant`, `has_external_role(auth.uid())` returns `false` for her and the existing RESTRICTIVE gate `external_applications_select_capability_gate` stops filtering her queue. Assigned case `APP-2026-000106` becomes visible immediately, no code change on the Queue page needed.

### RLS safety net (still in the same migration)
To make internal roles resilient against any future duplicate-role bug, also update the three RESTRICTIVE gates on `public.applications` so an internal role is enough to bypass them, even if the account also has an external role:
- Introduce `public.has_any_internal_role(_user_id uuid) returns boolean` — `security definer`, `set search_path = public`, mirrors `has_external_role`.
- Rewrite the leading clause of each gate from `(NOT has_external_role(auth.uid()))` to `(NOT has_external_role(auth.uid()) OR has_any_internal_role(auth.uid()))`. All external capability checks are preserved for pure external users.
- Grant EXECUTE on the helper to `authenticated` and `service_role`.

Pure external users are unchanged; internal reviewers always see what their internal role authorizes.

## Out of scope
- No changes to the Application Queue UI, filters, sorting, or metrics.
- No changes to how licensee primary/secondary users are provisioned.
- Broader rewrite of the trigger stack — only the minimum needed to stop the phantom applicant role.

## Verification
1. In the admin Employee Management, create a brand-new employee with role Analyst only.
   - DB check: `user_roles` for the new user contains `analyst` only.
   - `user_dynamic_roles` contains the `Analyst` dynamic role only.
2. Sign in as that new employee → `/applications/queue` shows the full queue their internal role can see (not filtered to 39/own apps).
3. Re-open `anisha.emp@yopmail.com`'s account → she now has `user_roles = {analyst}`; `/applications/queue` shows her assigned case `APP-2026-000106` and every other application an analyst should see.
4. Sign in as a self-registered applicant (external only) → their visibility is unchanged (only own applications).
5. Create a Licensee Primary user through the Entity flow → still gets `licensee_primary` role and their entity-linked applications, no regression.
6. Re-run any existing employee-creation tests — they should still pass.
