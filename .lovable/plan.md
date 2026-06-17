## Goal
Improve Role Management UX so external vs internal roles only see relevant permissions, grouped into tabs. Keep one RBAC engine, one `roles` table, one `permissions` table. No changes to route guards, RLS, or existing assignments.

## 1. Schema: add `role_type` to roles
Migration:
- Add column `roles.role_type text not null default 'internal'` with check `('internal','external')`.
- Backfill: set `role_type='external'` for system roles named `Applicant` and `Regulated Entity User`. All other roles stay `internal`.
- Add column `permission_modules.audience text not null default 'internal'` with check `('internal','external','both')`. Used to filter modules in the role editor.
- Backfill `audience`:
  - `external` → modules used by portal users: `licensing` (filtered by action, see below), `returns_management`, `complaint_management`, `fit_and_proper`, `public_complaint_portal`.
  - `internal` → everything else (`application_management`, `license_management`, `registration_management`, `executive_oversight`, `market_conduct*`, `prudential_*`, `fit_and_proper_committee`, `fit_and_proper_initiation`, `fit_and_proper_screening`, `form_management`, `fee_management`, `report_management`, `user_management`, `role_management`, `workflow_management`, `settings`).
- Add column `permission_actions.audience text not null default 'both'`. Backfill so that within shared modules (`licensing`, `returns_management`, `complaint_management`, `fit_and_proper`) only submitter-facing actions are external:
  - external actions: `submit`, `view_status`, `upload_documents`, `respond_rfi`, `view` (only for `complaint_management`, `fit_and_proper`).
  - All other actions (`approve`, `reject`, `edit`, `create`, `add_legal_notes`, etc.) stay `internal`.

No data is deleted; `role_permissions` rows are untouched.

## 2. Tab grouping (UI-only metadata)
Add `src/lib/permissionTabs.ts` mapping module → tab label per audience:

Internal tabs:
- Applications: `application_management`
- Licensing: `licensing`, `license_management`, `registration_management`, `fee_management`
- Workflow: `workflow_management`, `form_management`
- Findings: `market_conduct`, `market_conduct_investigation`, `prudential_supervision`, `prudential_payment_systems`
- Returns Review: `returns_management`
- Complaints Review: `complaint_management`, `public_complaint_portal`
- F&P Review: `fit_and_proper`, `fit_and_proper_committee`, `fit_and_proper_initiation`, `fit_and_proper_screening`
- Reports & Analytics: `report_management`, `executive_oversight`
- Administration: `user_management`, `role_management`, `settings`

External tabs:
- Applications: `licensing` (submit/view_status only)
- Documents: `licensing.upload_documents`
- RFIs: `licensing.respond_rfi`
- Returns Submission: `returns_management`
- Complaints Submission: `complaint_management`
- F&P Declarations: `fit_and_proper`
- License Status: `licensing.view_status` (also surfaced under Applications; tab acts as a read-only summary if no other actions)

The tab file is the single source of truth; it filters by both module audience and action audience.

## 3. UI changes in `src/pages/admin/RoleManagement.tsx`

Create/Edit dialog:
- Add **Role Type** select (Internal Regulatory User / External Portal User). Defaults to Internal. Disabled for system roles.
- Replace the flat permission list with a `Tabs` component whose tabs come from `permissionTabs.ts` filtered by selected `role_type`.
- Each tab renders grouped checkboxes (one card per module within that tab, action checkboxes inside).
- Add a search input (filters action labels within the current tab) and a filter chip (All / Assigned / Unassigned).
- Persist the existing "Uncatalogued permissions" fallback so legacy data still appears.

Detail panel:
- Show **Role Type** badge.
- Render permissions grouped by tab → module → action, using the same tab definitions.
- Show "No permissions" for empty tabs (per the spec example).
- Permission count = sum of catalogued + uncatalogued rows, so the badge always matches the rendered list.

Role list:
- Add Role Type column / badge for quick scanning.

## 4. Seeded defaults (no destructive changes)
After the audience columns exist, run a one-time `INSERT ... ON CONFLICT DO NOTHING` to ensure:
- Applicant role_permissions: `licensing.submit`, `licensing.view_status`, `licensing.upload_documents`, `licensing.respond_rfi`.
- Regulated Entity User role_permissions: above + `returns_management.{submit,view_status}`, `complaint_management.{submit,view_status}`, `fit_and_proper.{submit,view_status}`.

This only **adds** missing rows; nothing is removed.

## 5. Out of scope (explicitly unchanged)
- `usePermissions` / `usePermissionCatalog` query shape (UI filters client-side).
- `permissionRegistry.ts` route↔module mapping.
- Route guards (`RouteGuards.tsx`), sidebar gating, RLS, edge functions.
- Form gating hooks (`useExternalPortalAccess` facade stays as-is).
- External Portal Access page — stays deleted.

## 6. Verification
- `bunx vitest run`.
- Open `/admin/roles`:
  - Applicant → Role Type badge "External Portal User"; tabs Applications/Documents/RFIs/Returns Submission/Complaints Submission/F&P Declarations/License Status; 4 checked permissions surfaced under correct tabs; no admin/approve permissions visible.
  - Licensing Officer → Role Type "Internal Regulatory User"; tabs Applications/Licensing/Workflow/Findings/Returns Review/Complaints Review/F&P Review/Reports & Analytics/Administration; no `submit`/`track_own` external actions visible.
  - Create new role, toggle Role Type → tab set + visible permissions update live.
  - Search + Assigned/Unassigned filter scope to current tab.
- Confirm permission count badge equals rendered permissions for Applicant, Regulated Entity User, and an internal role.

## Files
- New migration: add `roles.role_type`, `permission_modules.audience`, `permission_actions.audience`, backfill.
- New: `src/lib/permissionTabs.ts`.
- Edit: `src/pages/admin/RoleManagement.tsx` (dialog + detail + list column).
- Edit: `src/hooks/useRoles.ts` (include `role_type` in select/insert/update).
- Edit: `src/hooks/usePermissionCatalog.ts` (expose `audience` on modules/actions).
- Data: `INSERT ON CONFLICT DO NOTHING` for Applicant / Regulated Entity User defaults.
