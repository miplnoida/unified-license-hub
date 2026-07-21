## Slice: Role Management & Permission Catalog — End-to-End Hardening

Scope is strictly Role Management + Permission Catalog. No catalog-wide orphan cleanup, no 249-table RLS sweep, no 294-function RPC sweep.

### 1. Migration (single new file under `supabase/migrations/`)

**Catalog & flags**
- Ensure the nine `role_management.*` permissions exist in `public.permissions` with `enforced = true`:
  `view, create, edit, delete, reset, assign_permissions, view_catalog, manage_catalog, view_coverage`.
- Add `deprecated boolean NOT NULL DEFAULT false` to `public.permissions` (if missing).
- Extend orphaned-permission trigger on `public.role_permissions` to also reject `deprecated = true`.

**Dependency table + trigger**
- Table `public.permission_dependent_actions(action text primary key)` seeded from `DEPENDENT_ACTIONS`.
- Rewrite `assert_role_permission_dependencies` (BEFORE INSERT + BEFORE DELETE) to read that table so client and DB share one source of truth.
- Data repair: for every existing `role_permissions` row whose action is dependent and whose role is missing `<module>.view`, insert the view row (idempotent).

**Backend enforcement helpers**
- `public.assert_role_management_action(_action text)` — raises SQLSTATE `42501` unless caller is `service_role`, `super_admin`, or has `has_permission(auth.uid(), 'role_management', _action)`.

**Triggers (all bypass service_role + super_admin)**
- `roles`: BEFORE INSERT → `create`; BEFORE UPDATE → `edit`; BEFORE DELETE → `delete`.
- `role_permissions`: BEFORE INSERT/DELETE → `assign_permissions` (runs before existing dependency/orphaned checks).
- `permissions`: BEFORE INSERT/UPDATE/DELETE → `manage_catalog`.
- `permission_modules` / `permission_actions`: BEFORE INSERT/UPDATE/DELETE → `manage_catalog`.
- `user_dynamic_roles`: BEFORE INSERT/DELETE → `assign_permissions`.

**RPC hardening**
- `public.reset_system_role_permissions(text)` — first statement calls `assert_role_management_action('reset')`; keep existing logic; `SECURITY DEFINER` with pinned `search_path = public`.

### 2. Frontend

**`src/pages/admin/RoleManagement.tsx`**
- Add `canViewCatalog`, `canManageCatalog`, `canViewCoverage` via `useCan`.
- Hide "Permission Catalog" tab unless `canViewCatalog`; hide catalog Create/Edit/Delete controls unless `canManageCatalog`.
- When `!canAssign`: disable every checkbox in the permission matrix, disable "Select all in module" / "Clear module" / "Copy from role" quick templates, and short-circuit `applyTemplate` with a toast.
- `handleReset` already gated by `canReset`; ensure the row action is hidden without it.
- `handleSave` runs `resolveDependencies` before submit; if `!canAssign`, submit only role metadata (no permission diff writes).

**`src/pages/admin/PermissionCoverageReport.tsx`** — already gated by `role_management.view_coverage`; verify.

**`src/routes/adminRoutes.tsx`** — ensure `/admin/roles` requires `role_management.view` and `/admin/permission-coverage` requires `role_management.view_coverage` via `<M module=… action=…>`.

### 3. Tests

**Vitest — `src/test/rbac/roleManagementUi.test.tsx`** (new)
- Personas: super_admin, view-only, edit-no-assign, catalog-viewer, catalog-manager, coverage-viewer, no-role.
- Assert visibility/disabled state of: Create button, row Edit/Delete/Reset, permission checkboxes, Select-all/Clear buttons, Catalog tab, Catalog mutation buttons, Coverage page.

**Vitest — extend `src/test/rbac/permissionDependencies.test.ts`**
- `applyTemplate` never returns a selection that violates dependencies.

**pgTAP — `supabase/tests/rbac/11_role_management_authz.sql`** (new)
- As unauthorized user: `INSERT/UPDATE/DELETE` on `roles`, `role_permissions`, `permissions`, `permission_modules`, `permission_actions`, `user_dynamic_roles`, plus `SELECT reset_system_role_permissions(...)` — each expects SQLSTATE `42501`.
- As user with only `role_management.view`: same expectations.
- As `service_role` and as `super_admin`: mutations succeed.

**pgTAP — extend `supabase/tests/rbac/10_permission_dependencies.sql`**
- Inserting dependent action without view → fails.
- Inserting dependent action after view exists → succeeds.
- Deleting view while dependent action remains → fails.
- Deleting dependent then view → succeeds.

### 4. Verification commands to run and report

- `bunx tsgo --noEmit`
- `bun run lint` (or eslint on changed files)
- `bunx vitest run src/test/rbac/`
- pgTAP: `supabase/tests/rbac/10_*.sql`, `11_*.sql` via project runner
- `bunx tsx scripts/generate-permission-coverage.ts` — confirm the 9 role_management permissions are Enforced.

### Final report format

Files changed · migration name · permissions enforced · tests added · commands run with pass/fail · limitations explicitly outside this slice (RLS on 249 tables, 294 SD RPCs, storage rewrite, orphan triage catalog-wide, action sweep across all pages).

### Explicitly out of scope this turn

- Any RLS/RPC/storage work outside the tables and functions listed above.
- Marking non-role-management orphans deprecated.
- Sweeping `<PermissionGate>` across unrelated pages.
