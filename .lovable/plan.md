## Goal

Simplify the admin-facing RBAC UI so business admins only manage **Modules, Actions, Roles, and Role-Permission assignments**. Remove every mention of routes, URLs, route prefixes, page paths, and developer-declared route lists from the admin UI. Keep route mapping alive internally for route guards, but treat it strictly as developer-owned configuration.

No DB changes, no rebuild — only UI/code adjustments to the two admin pages and the catalog hook surface.

## Scope of changes

### 1. `src/pages/admin/PermissionCatalogTab.tsx`
- Remove the entire "Routes attached to …" card (the `RouteIcon` block, ~lines 175–205).
- Remove route-related imports: `Route as RouteIcon`, `Checkbox` (if no longer used), `useCatalogRoutes`, `useUpsertRoute`, `useDeleteRoute`, `DECLARED_ROUTES`.
- Remove `routesFor`, `routes`, `upsertRoute`, `deleteRoute` from component body.
- Update top-of-page Alert copy: drop the routes sentence — only describe Modules → Sub-modules → Actions.
- Update delete-module confirm text: drop "and route attachments".
- Empty-state copy: "Select a module to edit its actions" (drop "and routes").
- Rename file-level JSDoc to drop route mentions.

### 2. `src/pages/admin/RoleManagement.tsx`
- Line 522 helper text: replace "Users with this role will not see any menus or routes." with "Users with this role will not see any menus." (or similar — no "routes" word).
- No structural change otherwise; role list + permission matrix grouped by module is already the pattern.
- Quick polish to match the spec where cheap: make sure each module row in the matrix has "Select all" / "Clear" affordances and a module/action search box. If these already exist, leave them; if not, add minimally.

### 3. `src/hooks/usePermissionCatalog.ts`
- Keep the file (other code may import types), but no longer used by the admin UI for routes.
- Leave `useCatalogRoutes / useUpsertRoute / useDeleteRoute / DECLARED_ROUTES` exported for developer/internal use (route guards, navigation config). Add a short JSDoc note: "Internal/developer-only — do not surface in admin UI."

### 4. Database / migrations
- None. `permission_module_routes` table stays as-is for internal use.
- No data migration; existing roles, permissions, and assignments are preserved.

### 5. Runtime authorization
- Unchanged: `useUserDynamicPermissions`, `hasPermission(module, action)`, `hasModuleAccess(module)`, `PermissionGate`, `ModuleGate`, sidebar module-based visibility, and developer-owned route guards all continue to work exactly as today.

## Out of scope

- No changes to the permission model, DB schema, or seeded system roles.
- No changes to route-guard logic or navigation config.
- No new modules/actions added by this change.

## Acceptance check (manual)

1. `/admin/roles` → Permission Catalog tab shows only Modules list + Actions panel — no Routes card, no URL strings, no "route prefix" text anywhere.
2. `/admin/roles` → Roles tab still lets admins assign module/action permissions via the matrix.
3. Sidebar visibility and action-button gating continue to work for existing users.
4. Build and lint pass.
