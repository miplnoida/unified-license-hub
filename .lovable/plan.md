## Problem

Internal users granted dynamic `role_management.*` / `admin_dashboard.*` permissions still see only the Dashboard because several menus, routes, and buttons are gated by static role lists or the wrong module key.

## Verified current state

- `src/config/navigation.tsx`
  - Line 53: `Admin Control Panel` uses `module: 'settings'` (not `admin_dashboard`) and hard-restricts to `ADMIN_ROLES`.
  - Line 67: `Role Management` restricted to `ADMIN_ROLES` (static).
  - Line 71: `Permission Coverage` restricted to `['super_admin']` (static) — never surfaces for non-super-admin even with `role_management.view_coverage`.
  - Rows 54-58 admin items are all statically `ADMIN_ROLES` with `module: 'settings'` — but this ticket only calls out Admin Dashboard, so we leave the others alone.
- `src/routes/adminRoutes.tsx`
  - `/admin` guarded by `<M module="admin_dashboard">` — but `admin_dashboard` is not in `src/lib/rbac/catalog.json`, so no role can hold it.
  - `/admin/permission-coverage` guarded by module `role_management` (any view) — should require exact `view_coverage`.
- `src/lib/permissionModules.ts` has `admin_dashboard` listed but the DB catalog does not, so `has_permission('admin_dashboard','view')` is unreachable.
- `src/pages/admin/RoleManagement.tsx` action buttons: need audit for `create/edit/delete/assign_permissions/reset/manage_catalog` gates (verify during build).
- Sidebar (`src/components/layout/Sidebar.tsx` 122-183) already delegates to `hasModuleAccess` when `enforceDynamic` is on and blocks external users via `pathIsAdminPanel` — good. Static `roles` on the two Internal Access Control items is what blocks non-admin internal staff.
- `src/pages/Dashboard.tsx` renders `SupervisoryDashboard` for every internal user; a user with only admin-console permissions sees the empty "All clear" state — need an admin-only fallback.
- `useUserDynamicPermissions` already unions permissions across all active roles (Slice B) — multi-role support is in place; add a regression test.

## Changes

### 1. Navigation gating (dynamic, no static role lists for these items)
`src/config/navigation.tsx`
- `Admin Control Panel`: `roles: ALL_INTERNAL`, `module: 'admin_dashboard'`, `adminOnly: true`.
- `Role Management`: `roles: ALL_INTERNAL`, `module: 'role_management'`, `adminOnly: true`.
- `Permission Coverage`: `roles: ALL_INTERNAL`, `module: 'role_management'`, `adminOnly: true`, plus a new `requiredAction?: string` field set to `'view_coverage'`. External users stay blocked via `adminOnly` + audience gate in Sidebar.

`src/components/layout/Sidebar.tsx`
- Extend `isItemVisible` to honor `item.requiredAction` by calling `hasPermission(item.module, item.requiredAction)` instead of `hasModuleAccess`.

### 2. Route guards (exact action + audience)
`src/routes/adminRoutes.tsx`
- `/admin`: `<M module="admin_dashboard" allowedRoles={INTERNAL_ROLES}>` (module `view`).
- `/admin/roles`: unchanged (module `role_management` view) but ensure `allowedRoles={INTERNAL_ROLES}`.
- `/admin/permission-coverage`: swap to a new `<PermissionRoute module="role_management" action="view_coverage" allowedRoles={INTERNAL_ROLES}>` guard (added in `RouteGuards.tsx`) so the exact `view_coverage` action is required.

### 3. Permission catalog + DB
`src/lib/rbac/catalog.json`: add `admin_dashboard.view` (and mark enforced by the new route+menu gate).
New migration: seed `permissions` row `admin_dashboard.view` and add it to the Legacy Admin / Super Admin templates so existing admins keep working. Also seed `role_management.view_coverage` for Super Admin only (matches previous behavior); other admins can gain it via role edit.

### 4. RoleManagement action buttons
`src/pages/admin/RoleManagement.tsx`
- Wrap Create / Edit / Delete / Assign Permissions / Reset / Manage Catalog buttons in `<GuardedButton module="role_management" action="…">` with exact actions from the catalog. Remove any residual `if (isAdmin)` conditions in this page.

### 5. Admin-only dashboard state
`src/pages/Dashboard.tsx` + new `src/components/dashboard/AdminOnlyDashboard.tsx`
- When `ctx.isInternal` and the user has `admin_dashboard.view` / `role_management.view` / `user_management.view` but NO supervisory modules (applications, returns, complaints, conduct, prudential, fp), render `AdminOnlyDashboard` — quick-links to Role Management, Employee Management, Permission Coverage, Admin Control Panel — instead of the empty supervisory shell.

### 6. Regenerate coverage & tests
- Run `scripts/generate-permission-coverage.ts` → refresh `docs/rbac/permission-coverage.csv` + `docs/rbac/audit-2026-07-21/01_permission_coverage.md`.
- Extend `src/test/sidebarVisibility.test.tsx` with 4 new personas:
  1. Internal user with only `role_management.view` — sees Dashboard + Role Management (not Permission Coverage, not Admin Control Panel).
  2. Internal user with `admin_dashboard.view` + `role_management.view` + `view_coverage` — sees all three.
  3. Internal user with no admin perms — no Administration/Internal Access Control items.
  4. External licensee with (fabricated) `role_management.view` — sees none of the admin items (audience block).
  5. Multi-role internal user (union of two dynamic roles) — sees union of items.
- New `src/test/rbac/adminDashboardRoute.test.tsx` — asserts `/admin` denies when `admin_dashboard.view` is missing and allows when present.

### 7. CI guardrails
`scripts/verify-authz-centralized.mjs` (extend) or new `scripts/verify-nav-dynamic-gates.mjs`:
- Fail if any nav item under Administration / Internal Access Control declares a non-`ALL_INTERNAL` `roles` array (blocks re-introducing static role restrictions).
- Fail if any nav item declares `module` without `roles` including all internal roles when `adminOnly: true`.
- Fail if `adminRoutes.tsx` uses `<AdminRoute>` for a path whose nav entry has a `module` (must use `<M>` / `<PermissionRoute>` instead).
- Wire into `.github/workflows/ci.yml` alongside existing verify scripts.

## Out of scope

- Other admin nav items (PPOC, Notification Templates, Activity/Audit Logs, Settings) keep their current `settings` module — this ticket names only Admin Dashboard.
- No changes to `usePermissions`/`authorize` — multi-role union already correct.

## Deliverables (reported after implementation)

Final commit SHA, list of files changed, test commands + results (`vitest run`, pgTAP for new seeds, `verify-*` scripts), regenerated coverage report path, and any remaining limitations.
