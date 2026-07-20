## Scope

Close the three specific gaps left in the existing regulator-assignment / return-access implementation. No redesign, no new permission keys, no duplicate logic.

Base permission key already registered and used elsewhere: **`returns_management.view`**. Bypass permission (already registered): **`returns_management.view_all_entities`**.

## Verified current state

- `public.can_view_entity_returns(uuid, uuid, text, text)` (migration `20260720095919_…`) already gates on super_admin, `view_all_entities`, entity assignment, and submitted-lifecycle statuses. **It does NOT currently require the base `returns_management.view` permission for assigned regulators** — this is the security gap the user is calling out.
- The 2-arg overload `can_view_entity_returns(uuid, uuid)` from `20260720091329_…` is still present and used by `can_view_return_filed`'s fallback branches and by the earlier `licensees`-level policies. It has the same missing base-permission check.
- `can_view_return_filed` (redefined in `20260720095919_…`) delegates to the 4-arg overload and preserves creator / PPOC / entity-user / external branches — those stay untouched.
- RLS SELECT policies on `returns_filed`, `return_form_data`, `return_documents`, `return_upload_attempts`, `return_consolidated_analysis` already pass status into the 4-arg function — they inherit the fix automatically once the function is patched.
- Storage read policy for the returns bucket already routes through `can_view_entity_returns` with status — also inherits the fix.
- `useInternalUsers.ts` currently treats `null`/blank `profiles.status` as active (comment: "Treat null/empty status as active for legacy rows"). User wants explicit `active` only, but legacy assignees already saved on an entity must still render in read-only view.
- `BackgroundInfoTab.tsx` builds combobox options solely from `useInternalUsers()` output — a legacy assignee who is now inactive would disappear from the label display, showing a raw UUID or "Not assigned".
- No pgTAP suite exists yet under `supabase/tests/regulator_access/`. Vitest suite `src/test/regulatorAssignment.test.tsx` covers the combobox UI only.

## Changes

### 1. DB: enforce base `returns_management.view` for assigned regulators

Single new migration that redefines both overloads of `can_view_entity_returns`:

- `can_view_entity_returns(_user_id uuid, _licensee_id uuid, _workflow_status text, _status text)`:
  1. Short-circuit `true` for `super_admin`.
  2. Short-circuit `true` for `user_has_permission(_user_id, 'returns_management', 'view_all_entities')`.
  3. Otherwise require **both**:
     - `user_has_permission(_user_id, 'returns_management', 'view')` AND
     - assignment as lead/regulator/alternate on `licensees` AND
     - submitted-lifecycle status (same list as today).
  4. Any missing condition → `false`.
- `can_view_entity_returns(_user_id uuid, _licensee_id uuid)` (2-arg overload, used by non-return contexts like the `licensees`-level policy): same rules minus the status gate — still requires base `view` perm for the assignment branch. Super-admin and `view_all_entities` still bypass.

Nothing else in the function signatures changes, so all existing callers (RLS policies, `can_view_return_filed`, storage policy, RPCs) inherit the fix without edits.

Also re-verify and, if needed, patch these SECURITY DEFINER paths to route through the updated helper (grep list to run in migration prep, patch only if they bypass RLS on returns):
- `can_view_return_filed` — already delegates, no change needed.
- Any `get_*return*` / `search_returns*` / analytics RPC that currently reads `returns_filed` with `SECURITY DEFINER`. If found bypassing RLS, add an explicit `can_view_entity_returns(...)` guard using the return's `entity_id`, `workflow_status`, `status`.

Preserve verbatim: super-admin branch, `view_all_entities` branch, creator, PPOC, `entity_user_access`, external-portal, and workflow-approver clauses in every touched policy.

### 2. Frontend: tighten active-employee filter, preserve legacy assignees

`src/hooks/useInternalUsers.ts`:

- Change filter to require `profiles.status === 'active'` (case-insensitive). Drop the "treat null/blank as active" fallback. `activeOnly` option stays with default `true`.
- Add optional parameter `alwaysIncludeIds?: string[]`. When provided, users whose id is in that set are returned even if inactive, but each such row is annotated with `is_active: false` so the UI can render them read-only.
- Extend `InternalUser` type with `is_active: boolean` (derived from status).

`src/components/entity-detail/BackgroundInfoTab.tsx`:

- Pass the currently-persisted `lead_regulator_id`, `regulator_officer_id`, `alternate_regulator_id` (whichever are non-null) as `alwaysIncludeIds` to `useInternalUsers`, so legacy inactive assignees resolve to a human-readable name.
- In the `EmployeeCombobox` options list, mark legacy inactive users (option.is_active === false) as disabled for new selection but still selectable-as-current (i.e. shown as the selected label). A small "Inactive" pill next to the sublabel makes state obvious. Clearing the field is allowed; re-selecting an inactive user is not.
- View-mode display (read-only) shows the resolved name plus the "Inactive" pill when applicable.

No change to the save payload or DB CHECK — three-field distinctness is still enforced by the existing constraint.

### 3. Tests

**pgTAP (`supabase/tests/regulator_access/01_visibility.sql`)** — added and wired into CI's existing pgTAP job:

- Setup: super_admin, unmapped internal user, mapped internal user WITHOUT `returns_management.view`, mapped internal user WITH `returns_management.view`, user with `view_all_entities`, external licensee user, PPOC user, creator; one licensee, one draft return, one submitted return, one attachment row + storage object.
- Assertions:
  1. Mapped + base view perm + submitted return → visible in `returns_filed`, `return_form_data`, `return_documents`, `return_upload_attempts`, `return_consolidated_analysis`.
  2. Mapped + base view perm + draft return → denied on all five tables.
  3. Mapped WITHOUT base view perm + submitted return → denied.
  4. Unmapped internal user → denied.
  5. `view_all_entities` grantee → sees all submitted returns, still denied on drafts (documenting current behaviour; state explicitly if we choose to allow drafts here — plan choice: keep drafts denied since existing helper does not gate view_all_entities on status; will confirm in the test comment and match current behaviour).
  6. Super admin → sees drafts and submitted.
  7. Storage read for the attachment path: denied for unmapped, allowed for mapped+base view+submitted, denied for mapped on draft.
  8. `can_view_return_filed` returns matching booleans for each persona.
  9. Regression: creator still sees own draft; PPOC still sees mapped licensee's returns; external licensee user still sees own entity's returns; workflow approver path unaffected.
  10. Audit trigger: updating any of the three assignment columns writes a row to `audit_logs`.

**Vitest (`src/test/regulatorAssignment.test.tsx` — extend existing)**:

- New tests using a mocked `useInternalUsers`:
  - Inactive employee absent from the picker when `alwaysIncludeIds` doesn't include them.
  - Legacy inactive assignee: appears as selected label with an "Inactive" indicator and its combobox row is disabled.
  - Selecting a different active user then re-opening: inactive user still visible only if still persisted.
- Combobox filter / duplicate-prevention / clear tests remain.

Run `bunx vitest run` and the pgTAP job locally / in CI; block completion until both pass.

## Direct URL / RPC / report / export paths

All these read through `returns_filed` (or its child tables) via the client with RLS on, or via `can_view_return_filed` inside SECURITY DEFINER functions. Since both overloads of `can_view_entity_returns` are the single choke point and their signatures don't change, every path is fixed by the migration:

- Return list / detail views (`useReturnsManagement`, `ReturnDetail`, admin queue) — RLS.
- Attachments listing + storage download — RLS + storage policy.
- Upload history, consolidated analysis — RLS.
- Search / dashboards / reports / exports (Recharts, CSV) — all go through the same tables or `can_view_return_filed`.
- Direct URLs — same RLS enforcement.

## Out of scope

- No new permission modules/actions.
- No changes to write policies on returns.
- No refactor of the combobox or the assignment UI beyond the inactive-annotation change.
- No changes to super-admin, `view_all_entities`, PPOC, creator, external-user, workflow-approver logic.

## Deliverables in the completion summary

- Files changed (frontend + migration path).
- Functions/policies updated (`can_view_entity_returns` 2-arg and 4-arg; downstream RLS unchanged in text, refreshed only if signatures shifted).
- Permission key used: `returns_management.view` (base), `returns_management.view_all_entities` (bypass).
- Return statuses treated as submitted (unchanged list).
- Tests added (paths + count) and pass/fail results from `vitest run` and pgTAP.
- Any limitations (e.g. `view_all_entities` currently NOT gated on submitted status — flagged as by-design bypass).
