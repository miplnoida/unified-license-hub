## Goal

Close the gaps in the existing Regulator Assignment + Return Access implementation. Do not redesign — fix these specific issues:

1. Replace `Select` dropdowns with searchable comboboxes.
2. Filter dropdown source to *active* internal employees only.
3. Restrict "assigned regulator" visibility to submitted-status returns.
4. Extend the same access rule to storage-object downloads and any missing paths.
5. Add automated tests covering the required matrix.

Everything else in the previous migration (`can_view_entity_returns`, columns, permission action, audit trigger, RLS on `returns_filed` / `return_form_data` / `return_documents` / `return_upload_attempts` / `return_consolidated_analysis`, distinct CHECK constraint) is already in place and is preserved unchanged.

## Verified current state

- `licensees.lead_regulator_id / regulator_officer_id / alternate_regulator_id` columns + CHECK for distinctness — present.
- Permission action `returns_management.view_all_entities` — present in DB and `permissionRegistry.ts`.
- `public.can_view_entity_returns(uuid, uuid)` — present; short-circuits on super_admin and `view_all_entities`.
- RLS SELECT policies on the five return tables using `can_view_entity_returns` — present. No pre-existing broader "internal staff read all returns" policy remains, so the new policy is the effective gate for internal users (verified via `pg_policies`).
- Audit trigger `trg_audit_licensee_regulator_assignments` — present.
- `BackgroundInfoTab.tsx` already renders the three fields with disabled-option duplicate prevention using `useInternalUsers()`.
- `useInternalUsers` currently returns anyone with a row in `user_roles` — it does NOT filter by `profiles.is_active`/`status`, so deactivated employees still appear.
- `can_view_entity_returns` does not filter by return status — an assigned regulator can currently see drafts too.

## Changes

### 1. Active-employee filter (hook)

Update `src/hooks/useInternalUsers.ts` to also read `profiles.is_active` (or the equivalent status column — will inspect `profiles` schema first) and drop any user whose profile is inactive/deactivated. Keep the existing external-role exclusion. Add an `activeOnly` option defaulting to `true` for backward safety.

### 2. Searchable comboboxes (UI)

In `src/components/entity-detail/BackgroundInfoTab.tsx`, replace `renderRegulatorSelect` with a new small internal component built on the existing shadcn `Command` + `Popover` primitives (already used elsewhere in the app — will reuse the pattern from `LicenseeSwitcher` / employee approver pickers). Behaviour:

- Type-to-search over name + email.
- Shows only active internal employees (from updated hook).
- Options already assigned to another of the three fields are visually disabled and non-selectable (keeps existing FE duplicate prevention).
- Includes a "Clear / Not assigned" action.
- Keyboard accessible, same width/label styling as siblings.

No change to save payload shape — still writes the three `*_id` columns; DB CHECK constraint continues to enforce distinctness on the server.

### 3. Submitted-status gating (DB)

New migration:

- Redefine `public.can_view_entity_returns(_user_id, _licensee_id, _workflow_status text default null, _status text default null)` — overload-safe by adding a second function signature so existing callers keep compiling. Logic:
  - super_admin → true.
  - `view_all_entities` permission → true (any status).
  - Otherwise: assigned to entity as lead/regulator/alternate AND the return is in a *submitted lifecycle* status (`SUB`, `submitted`, `under_review`, `approved`, `rejected`, `resubmission_required`, `SIGN_OFF`, etc. — final list drawn from `adminReturnFilters.ts` submitted statuses so UI and DB agree). NULL status is treated as non-submitted (denied) for the assignment path.
- Update the RLS SELECT policies on `returns_filed`, `return_form_data`, `return_documents`, `return_upload_attempts`, `return_consolidated_analysis` to pass the return's `workflow_status` (and `status` where relevant) into the function. Preserve every other clause (creator, PPOC, entity user access, external capability gates).
- Keep the old 2-arg function for callers that pass a plain licensee id from non-return contexts (e.g. future licensee-scoped screens); it continues to return true only for super_admin / view_all_entities / assigned — used for `licensees`-level checks, not return rows.

### 4. Storage downloads

Add a storage RLS policy update for the returns attachments bucket (bucket name resolved from `20260713144043_*` migration). Read policy: allow when
`(owner-based existing clauses) OR EXISTS (return_documents rd JOIN returns_filed rf ON rf.id = rd.return_id WHERE rd.storage_path = name AND can_view_entity_returns(auth.uid(), rf.entity_id, rf.workflow_status, rf.status))`. Preserve all existing allow-clauses (owner, PPOC, external capability).

### 5. Server-side RPCs / secured queries

Audit and, where needed, patch RPCs that read returns bypassing RLS (SECURITY DEFINER) so they call `can_view_entity_returns` before returning rows. Targets to inspect:

- `can_view_return_filed` — already delegates to `can_view_entity_returns`; update it to also pass status.
- Any `get_*_return*` / `search_returns_*` / analytics RPCs — will grep `SECURITY DEFINER` + `returns_filed` and add the same guard.

Report the exact list in the completion summary.

### 6. Frontend

- `useReturnsManagement`, `ViewReturns`, `ReturnDetail`, dashboards, reports, exports: no code change needed for restriction (RLS enforces), but confirm no `service_role` / definer path is used for lists. Any `.rpc(...)` or edge function that fetches returns will be inspected and patched to respect the same rule.
- Update return export edge functions (if any) to filter via the same helper.

### 7. Tests

Add:

- **SQL (pgTAP under `supabase/tests/regulator_access/`)**:
  - Active employee filter (deactivated user hidden).
  - Duplicate prevention CHECK rejects same id in two columns.
  - Mapped user + base `returns_management.view` → sees submitted return.
  - Mapped user without base view perm → still sees via RLS (RLS is the gate) but UI hidden; DB test asserts row visible only when both `can_view_entity_returns` returns true AND permission gate in application layer applies — documented.
  - Unmapped internal user → 0 rows.
  - `view_all_entities` grantee → sees all submitted returns.
  - Draft return denied to assigned regulator.
  - Submitted return allowed to assigned regulator.
  - Attachment read denied for unmapped, allowed for mapped (submitted only).
  - Existing external / PPOC / creator access still works (regression).
  - Audit log row inserted on assignment change.
- **Vitest (`src/test/regulatorAssignment.test.tsx`)**:
  - Combobox filters by search input.
  - Deactivated employee absent from options.
  - Selecting an employee in one field disables them in the others.
  - Clearing a field restores availability elsewhere.

Run `vitest run` and the pgTAP suite in CI (existing workflow already runs both).

## Technical details

- Files touched (frontend): `src/hooks/useInternalUsers.ts`, `src/components/entity-detail/BackgroundInfoTab.tsx`, new `src/components/entity-detail/EmployeeCombobox.tsx`, `src/test/regulatorAssignment.test.tsx`.
- DB migration: single new migration that (a) drops+recreates `can_view_entity_returns` with status args, (b) replaces the five RLS policies to pass status, (c) updates `can_view_return_filed`, (d) updates the returns storage read policy, (e) adds pgTAP test file.
- Submitted statuses source of truth: `ADMIN_RETURN_VISIBLE_STATUSES` in `adminReturnFilters.ts`; the migration will hard-code the same list to avoid client<->DB drift and add a note pointing to the TS file.
- No change to super_admin, PPOC, `entity_user_access`, external portal, or creator paths — every existing OR-clause is preserved verbatim in the replacement policies.

## Out of scope

- No redesign of employee/permission model.
- No new permission modules beyond the already-created `view_all_entities`.
- No change to write/update policies on returns.
