## Goal
Add three optional Lead Regulator / Regulator / Alternate Regulator assignments per entity, and gate submitted-return visibility on those assignments (plus an existing/new "View All Entity Returns" override), enforced in both UI and database.

## 1. Database (migration)

Extend `public.licensees` (all nullable — assignments stay optional):
- `lead_regulator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `regulator_officer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `alternate_regulator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`

Add a table-level `CHECK` that any two non-null values among the three columns are distinct (uniqueness within the same entity). Frontend duplicates its own validation.

Indexes on each of the three columns for the RLS lookup.

New permission action on the existing `submitted_returns` (or equivalent) module:
- `view_all_entity_returns` — inserted into `permissions` / mapped through the existing `permission_actions` + `role_permissions` framework. No changes to existing permission rows.

Helper security-definer function:
```
public.can_view_entity_returns(_user uuid, _licensee uuid) returns boolean
```
Returns true when the user is assigned as lead/regulator/alternate on that licensee, OR when the user has the new `view_all_entity_returns` action via `has_permission_action`, OR when they already satisfy today's PPOC/licensee ownership rules (delegates to the existing helpers so current behaviour is preserved).

RLS updates on `returns_filed` and related read paths (`return_form_data`, `return_documents`, `return_upload_attempts`, `return_audit_log` read policies, `return_consolidated_analysis`):
- Add a new SELECT policy for internal staff: `USING (public.can_view_entity_returns(auth.uid(), licensee_id))`.
- Existing licensee/PPOC policies stay untouched — external portal behaviour is preserved.
- Storage read policy for return attachments (bucket-level policy on `returns` bucket) mirrors the same helper.

Audit trigger: `AFTER UPDATE ON public.licensees` that, when any of the three regulator columns changes, writes to `audit_logs` via the existing `log_audit_event` / trigger pattern (action `licensee.regulator_assignment.changed`, before/after JSON, entity_type `licensee`).

Grants: no new tables; only new function → `GRANT EXECUTE ... TO authenticated`.

## 2. Backend hooks / RPCs

- Extend `search_licensees` / any list RPC that already gates visibility (e.g. `list_admin_returns`, applications-return export RPCs) with the same `can_view_entity_returns` check. Reports and exports go through `report_sources` — add the helper into the source SQL for return-based sources so CSV/JSON exports respect the rule.
- Reuse `logAudit` server-side path only if trigger coverage is insufficient; the trigger above is the primary source of truth.

## 3. Frontend — Background Info tab (`src/components/entity-detail/BackgroundInfoTab.tsx`)

Add a new "Regulatory Oversight" card (edit + view modes, matching existing card style):
- Three searchable comboboxes (reuse `Command`/`Popover` pattern already used for licensee search) backed by a new hook `useActiveInternalEmployees` that wraps the existing `useInternalUsers` hook, filtered to `is_active = true` profiles.
- Frontend validation: on change, prevent selecting a user already chosen in another of the three fields; show inline error.
- Save handler updates `licensees` row with the three new columns and calls existing `onUpdate`. Dirty state wired through existing `onDirtyChange`.
- View mode: display assigned names with role labels; "Not assigned" placeholder when null.
- All three fields explicitly optional (clear button).

Audit is written by the DB trigger — no client-side audit call needed, but we keep `logAction('licensee.regulator_assignment.changed', …)` as belt-and-braces (optional; DB trigger is authoritative).

## 4. Frontend — Return access enforcement

Everywhere the UI queries returns for internal users, the RLS change already filters rows. Additional UI touches:
- `useUserPermissions` / `usePermissions`: register the new `view_all_entity_returns` action so `PermissionGate` can hide bulk actions/tabs for users who lack any access.
- Admin returns list, return detail page, attachment download buttons, search, and reports pages: wrap "View" affordances in `PermissionGate` on the `submitted_returns.view` action (unchanged) — no explicit assignment check needed client-side because RLS returns zero rows for unassigned users. Direct-URL navigation to `/admin/returns/:id` naturally 404s when RLS blocks the row (existing "not found" UI handles it).
- Report builder: no code change needed since it reads through report sources; ensure the source-level SQL includes the helper (covered in section 2).

## 5. Admin permission configuration UI

The new `view_all_entity_returns` action appears automatically in the existing Role → Permissions matrix (driven by `permission_actions`). No new UI needed.

## 6. Tests / verification

- Add pgTAP-style SQL test under `supabase/tests/returns/` (mirroring the complaints test layout) covering: assigned lead sees rows, unassigned analyst sees none, `view_all_entity_returns` bypass, external licensee unaffected, uniqueness constraint rejects duplicate assignments.
- Add a Vitest for `BackgroundInfoTab` duplicate-selection validation.
- `tsgo` + full frontend test suite must pass.

## Files touched
- New migration: `supabase/migrations/<ts>_entity_regulator_assignments.sql`
- `src/components/entity-detail/BackgroundInfoTab.tsx`
- New `src/hooks/useActiveInternalEmployees.ts` (thin wrapper)
- `src/lib/permissionRegistry.ts` (register new action key)
- Report source SQL (only the return-related ones)
- New tests under `supabase/tests/returns/` + `src/test/`

## Out of scope
- No changes to complaints, applications, inspections access.
- No changes to existing PPOC or licensee-side external portal behaviour.
- No new modules; reuses employees, permissions, audit frameworks.