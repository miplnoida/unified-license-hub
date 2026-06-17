
# Dynamic Roles & Permissions

Today only **roles** are dynamic. The **module list** (12 keys) and **action list** (view/create/edit/approve/reject) are hardcoded in `src/lib/permissionModules.ts` and `src/lib/permissionRegistry.ts`, and routes/menus are tied to those fixed keys. We will move the catalog into the database so admins can add modules, sub-modules and actions, while keeping route/menu *declarations* in code (admin-selectable, not admin-invented — so no orphan routes).

## Outcome
- Admins manage a tree of **Modules → Sub-modules → Actions** in Admin → Role Management.
- For each module/sub-module, admins pick from a developer-declared list of routes and sidebar menu items to attach.
- Roles (already dynamic) grant any combination of these actions; the Role editor renders the live catalog.
- Sidebar, route guards, and `useUserDynamicPermissions` switch from the hardcoded registry to DB-driven data.
- BRD roles R-01…R-14 (Bank of Jamaica & FSC SupTech BRD v3.0) are seeded as editable non-system roles with the modules/sub-modules/actions implied by the doc.

## Data model (new tables)
- `permission_modules` — `key`, `label`, `description`, `parent_id` (nullable, self-FK → sub-modules), `sort_order`, `is_system`.
- `permission_actions` — `module_id` FK, `key` (e.g. `view`, `override_ai`, `sign_enforcement_order`), `label`, `description`, `sort_order`. Unique on (`module_id`, `key`).
- `permission_module_routes` — `module_id` FK, `route_prefix` (string from a code-declared registry), `menu_label` (nullable). Lets admins attach/detach dev-declared routes/menus.
- `permissions` (existing) — repurpose: each row links to one `permission_actions` row (add `action_id` FK; keep legacy `module`+`name` columns populated from the catalog for backward compat during transition).
- `roles` / `role_permissions` / `user_dynamic_roles` — unchanged.

All new tables: `GRANT` + RLS (read for `authenticated`, write only via `has_role(auth.uid(),'super_admin'|'admin')`).

## Code changes
- **`src/lib/permissionModules.ts`**: remove the static `PermissionModule` union and `ROUTE_MODULE_MAP`. Replace with:
  - `DECLARED_ROUTES`: dev-curated array of `{ route_prefix, default_label }` covering every gated admin/internal route (extracted from current map + missing ones). This is the *menu* admins choose from.
  - `getModuleForPath(pathname)` becomes async/cached → resolves via `permission_module_routes` (TanStack query).
- **`src/lib/permissionRegistry.ts`**: delete the hardcoded `MODULE_REGISTRY`. Export hooks `useModuleCatalog()` and `useModuleEntry(moduleId)` that read from DB and return the same `ModuleRegistryEntry` shape (label, description, actions, menus, routes) so existing UI keeps working.
- **`src/hooks/useRoles.ts`**: add `useModules`, `useActions`, `useModuleRoutes`, plus `useUpsertModule`, `useDeleteModule`, `useUpsertAction`, `useDeleteAction`, `useSetModuleRoutes` mutations.
- **`src/hooks/usePermissions.ts`** (`useUserDynamicPermissions`): swap `getModuleForPath` for the async DB-backed resolver; cache resolved (path → module_id) map in the same query.
- **`src/pages/admin/RoleManagement.tsx`**: add a top-level **"Catalog"** tab alongside **"Roles"**:
  - *Catalog tab*: tree of modules → sub-modules, with inline add/edit/delete; right pane shows action list editor and route/menu attachment picker (multi-select from `DECLARED_ROUTES`).
  - *Roles tab*: existing UI, now rendered from `useModuleCatalog()`. Keep the external-role-name guard.
- **`src/config/navigation.tsx`**: unchanged structurally; each leaf `item.module` becomes a *suggested* default that the catalog migration uses for seeding — runtime menu visibility is then driven by `permission_module_routes`.
- **Route guards** (`RouteGuards.tsx`): use the new async resolver; while loading, render existing auth-loading screen.

## Migrations
1. Create the 4 catalog tables with grants, RLS, and `updated_at` triggers.
2. Seed catalog from current hardcoded data so nothing regresses:
   - 12 existing modules → `permission_modules` (is_system=false so admins can edit; key preserved).
   - Existing `permissions` rows → backfill `action_id` by matching `(module, name)` against newly-seeded actions.
   - Current `ROUTE_MODULE_MAP` entries → `permission_module_routes`.
3. Seed BRD roles R-01…R-14 as non-system rows in `roles`, with `role_permissions` linking to the seeded actions. New modules/sub-modules and actions implied by the BRD are added in the same migration:
   - Modules: *Licensing (Module 1)*, *Fit & Proper (Module 2)* with sub-modules *Initiation*, *Screening*, *Committee*; *Prudential Supervision (Module 3)* with sub-module *Payment Systems*; *Market Conduct (Module 4)* with sub-module *Investigation*; *Public Complaint Portal*.
   - Actions added: `flag_concern`, `recommend_conditions`, `override_ai_recommendation`, `sign_enforcement_order`, `cast_weighted_vote`, `record_camels_assessment`, `set_ewi_rules`, `initiate_thematic_review`, `access_investigation_workspace`, `submit_complaint_public`, etc. (one row per capability column in the BRD tables).

## Acceptance
- Admin can create a new module ("Inspection Workspace"), give it an action ("conduct_onsite_examination"), attach `/inspections` route, and assign it to a role — that role's users immediately get the sidebar item and route access.
- Admin can rename or delete admin-created modules/actions (system rows protected).
- Existing roles and permissions keep working (no menu disappears post-migration).
- External Portal Access remains separate; external role-name guard still blocks creating `Applicant`/`Licensee` here.
- All 14 BRD roles appear in the Roles list, each pre-populated with the capabilities described.
- Build, lint, and existing tests pass; `useUserDynamicPermissions` tests updated for async resolver.

## Out of scope
- External portal capabilities (kept in `external_portal_access`).
- Field-level permissions inside a page.
- Per-record (row-level) overrides beyond what RLS already enforces.
