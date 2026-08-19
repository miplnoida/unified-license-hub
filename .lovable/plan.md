# One Canonical Security Model: DB-driven RBAC + DB-driven Navigation

Converge the fragmented RBAC (DB tables + hard-coded frontend maps) and the hard-coded navigation tree into a single `sec_*` source of truth, additively, with parity verification before any cutover.

## What exists today

- DB-backed: `roles`, `permissions`, `permission_actions`, `permission_modules`, `role_permissions`, `user_dynamic_roles`, `permission_module_routes`, `rbac_module_scopes`, `roles.scope_config`; helpers `has_permission`, `has_any_permission`, `has_scoped_permission`, `user_scope_for`, `has_portal_capability`.
- Hard-coded in frontend: `mainNavSections` (`src/config/navigation.tsx`), `ROUTE_MODULE_MAP` + `KNOWN_PERMISSION_MODULES` (`src/lib/permissionModules.ts`), `EXTERNAL_ROLE_DEFAULTS` (`src/lib/portalAccess.ts`), quick role templates (`src/lib/rbac/roleTemplates.ts`), access levels/scope capabilities helpers.
- Frontend permission load is 3 chained client queries in `useUserDynamicPermissions`.

## Old -> new mapping

| Legacy | New |
| --- | --- |
| `permission_modules` | `sec_modules` (same ids/keys) |
| `permissions` + `permission_actions` | `sec_permissions` (module_id + key) |
| `roles` | `sec_roles` (+ role_type, dashboard_tier, is_break_glass) |
| `role_permissions` | `sec_role_permissions` |
| `user_dynamic_roles` (+ `profiles.role_id` gaps) | `sec_user_roles` |
| `roles.scope_config`, `rbac_module_scopes` | `sec_scope_types`, `sec_module_scopes`, `sec_role_scopes`, `sec_role_scope_values` |
| `permission_module_routes` + `ROUTE_MODULE_MAP` | `sec_routes` |
| `mainNavSections` | `sec_navigation_items` |
| `roleTemplates.ts` | `sec_role_templates`, `sec_role_template_permissions` |
| `EXTERNAL_ROLE_DEFAULTS` | external `sec_roles` + grants |
| `src/lib/rbac/permissionDependencies.ts` | `sec_permission_dependencies` |

## Delivery phases

Each phase ends with typecheck + tests; nothing legacy is dropped in this program.

1. **Schema** — all `sec_*` tables, UUID PKs, stable keys, `is_system`, timestamps, indexes (AK list), strict RLS (read via context RPC; writes only through RPCs).
2. **Backfill** — copy modules, permissions, roles, grants, user assignments (incl. `profiles.role_id` gaps), normalized scopes, permission dependencies. IDs preserved where practical. Every custom role migrated.
3. **Route registry** — seed `sec_routes` from `permission_module_routes` + `ROUTE_MODULE_MAP` with exact/prefix/pattern match types; route→permission bindings restricted to break-glass super_admin.
4. **Navigation seed** — new simplified IA in `sec_navigation_items`: Home, Licensing, Supervision, Returns, Correspondence, Insights, Administration (with the admin sub-groups); external audience tree separately. No `sec_role_menu_items` — links inherit security from their route; groups render only with an authorized child.
5. **Context RPC** — `sec_get_user_context()` returning roles, permissions, scopes, dashboard tier, assignment-only status, authorized navigation.
6. **Parity verifier** — script + pgTAP comparing legacy vs `sec_*` effective access per user × module × action, plus role assignments, grants, scopes, portal capabilities, assignment-only behaviour. CI fails on any unexplained diff.
7. **Compatibility cutover** — reimplement `has_permission`, `has_any_permission`, `has_scoped_permission`, `user_scope_for`, `has_portal_capability` over `sec_*`, same signatures, so RLS/RPC/Edge/storage policies are untouched.
8. **Frontend context** — `usePermissions` and friends fed by `sec_get_user_context()`; `authorize`, `useCan`, `PermissionGate`, `RouteGuards`, `PortalRoute` keep their APIs and fail closed while loading. Route guards resolve from `sec_routes`.
9. **Sidebar + Header Search** — render from authorized navigation; icon_key mapped to an allow-listed Lucide map; active-route resolution handles detail/nested/query routes; collapsed desktop flyouts and mobile drawer retained; group state persisted by key.
10. **Admin UIs** — Role Management, Permission Catalog, DB-backed Role Templates, new Navigation Builder (rename/reorder/move/icon/keywords/visibility only — never permission bindings), categorised AdminHub with "Find an admin tool..." search over authorized tools.
11. **External portal roles** — Applicant, Pre-Licensee, Licensee Primary/Secondary as `sec_roles` with grants equal to today's defaults; RLS tenant isolation untouched.
12. **Write RPCs + audit** — `sec_save_role`, `sec_delete_role`, `sec_assign_user_roles`, `sec_save_module`, `sec_save_permission`, `sec_save_navigation_item`, `sec_reorder_navigation`, `sec_save_role_scopes`; each validates caller permission and invariants, transactional, audited (`security.*` actions), pinned `search_path`, restricted EXECUTE. Break-glass super_admin protected from removal.
13. **Tests + integrity gates** — persona matrix (all 15 personas listed), pgTAP for permissions/dependencies/expiry/union/scopes/portal/navigation RLS, structural CI checks (orphan routes/permissions, dup keys, nav cycles, protected route without permission, admin mutating system route security), updated permission-coverage tooling.
14. **Legacy freeze** — legacy tables marked read-only, retirement path documented; `ROUTE_MODULE_MAP`, `KNOWN_PERMISSION_MODULES`, `EXTERNAL_ROLE_DEFAULTS`, `mainNavSections`, hard-coded templates removed as authorization/navigation sources (thin types may remain).

## Non-goals / guardrails

- No React route or component is created from DB rows; DB drives security metadata, labels, grouping, order, visibility only.
- Menu visibility never grants access; backend RLS remains the authority.
- Assignment-only regulators get no synthetic `returns_management.view`.
- Allow-only grants; multi-role union; no deny precedence.

## Final report

Delivered at the end: tables and purpose, old→new mapping, migrated roles, assignment counts, permission/external/assignment-only parity results, old vs new menu, hard-coded sources removed, remaining compatibility code, legacy tables retained, tests added, decisions left code-controlled.

## Sizing note

This is a large program (14 phases, ~40+ files, many migrations). I will execute it in order and report progress per phase; expect several turns rather than a single change.
