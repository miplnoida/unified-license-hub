## RBAC Phase 2 — Unified Authorization Model

Continuation of the hardening already in place. Frontend hook + backend `has_permission()` are now strict; this phase fixes the remaining gaps: route coverage, view-only menu gating, an authoritative route map, tests that fail on drift, and a small cleanup of implicit permission sources.

### 1. Permission source cleanup (`src/hooks/usePermissions.ts`)

- Keep the exact public API listed by the user:
  - `hasPermission(module, action)`
  - `hasModuleAccess(module)` — always view-gated
  - `canAccessPath(pathname)`
  - `hasAssignmentReturnQueueAccess` (already a boolean capability — keep as-is; assignment never synthesizes a permission)
  - `canViewAssignedReturn({ licenseeId, status })`
- Remove `hasAnyModuleAccess`'s "any `view` permission OR any assignment" fallback that some dashboard code may rely on to render a landing page — replace with `hasModuleAccess` checks at call sites.
- Remove the `enforceDynamic` flag entirely (it always equals `!isBypassRole` and is a legacy branch that invites regressions).
- Only `super_admin` bypasses. No other implicit source.

### 2. Route map — single source of truth (`src/lib/permissionModules.ts`)

Rebuild `ROUTE_MODULE_MAP` so every protected internal route (from `src/routes/adminRoutes.tsx`, `dashboardRoutes.tsx`, `settingsRoutes.tsx`, `fpaRoutes.tsx`, `returnsRoutes.tsx`) is covered. Currently unmapped protected paths that must be added:

| Path prefix | Module |
|---|---|
| `/admin/api-keys` | `settings` |
| `/admin/audit-export` | `settings` |
| `/admin/security-events` | `settings` |
| `/admin/correspondence-routing` | `settings` |
| `/admin/correspondence-templates` | `settings` |
| `/admin/document-intelligence` | `settings` |
| `/admin/conduct/monitoring-rules` | `market_conduct` |
| `/admin/overrides` | `settings` |
| `/admin/case-audit` | `settings` |
| `/admin/rfi-auto-rules` | `application_management` |
| `/admin/supervisory-plan-templates` | `application_management` |
| `/admin/applications/bulk-intake` | `application_management` |
| `/admin/sufficiency-rules`, `/admin/sufficiency-rule-sets`, `/admin/decision-options` | `license_management` |
| `/admin/integration-logs` | `settings` |
| `/alerts` | `report_management` |
| `/executive` | `report_management` |
| `/billing/penalties` | `fee_management` |
| `/documents` | `application_management` |
| `/correspondence*` | `application_management` |
| `/enforcement*` | `market_conduct` |
| `/inspections*` | `market_conduct` |
| `/supervision/breaches`, `/supervision/plans`, `/supervision/risk`, `/supervision/early-warnings` | `prudential_supervision` |
| `/supervision/thematic-reviews` | `market_conduct` (already there — verify) |
| `/prudential/*` (all sub-paths) | `prudential_supervision` (verify existing entry covers) |
| `/fpa/*` (all sub-paths) | `fit_and_proper` |
| `/fit-and-proper/*` | `fit_and_proper` |
| `/conduct/*` sub-paths | `market_conduct` |
| `/coordination/*` | `coordination` |
| `/forms/:formId`, `/preview/:versionId` | `form_management` |
| `/returns-management*` | `returns_management` |

Order the array most-specific-first. De-duplicate any overlapping prefixes.

Add `PROTECTED_INTERNAL_PATH_PREFIXES` entries for prefixes not yet listed: `/alerts`, `/executive`, `/billing`, `/documents`, `/correspondence`, `/enforcement`, `/inspections`, `/returns-management`, `/forms`, `/preview`, `/applications/queue`.

`getModuleForPath` and `canAccessPath` stay unchanged — the fix is data, not logic.

### 3. Route guards (`src/routes/*.tsx`, `src/components/auth/RouteGuards.tsx`)

- `ModuleRoute` already checks `hasPermission(module, 'view')` + the narrow assignment allow-list. No logic change; keep as the sole internal-route guard.
- Sweep the four route files so every internal `<Route>` is wrapped in `ModuleRoute` with a `module` that matches its entry in `ROUTE_MODULE_MAP`. Any route currently using `AdminRoute` without a module (e.g. `/admin`) stays on `AdminRoute` (audience-only landing).
- Menus visible only when `hasModuleAccess(module)` is true — audit `src/components/layout/Sidebar.tsx` and remove any branch that reads `hasPermission(module, 'create'|'edit'|'approve'|'reject')` to decide visibility. Menu = `view` only.

### 4. Tests (`src/test/permissionsRbac.test.tsx` + new `src/test/routeCoverage.test.ts`)

- New test file scans `src/routes/*.tsx` for every `path="…"`, ignores public paths, dynamic segments (`:id`) collapsed to prefix, and asserts each remaining path resolves via `getModuleForPath` OR is on an explicit `PUBLIC_ROUTES` allow-list. Fails on drift.
- Existing RBAC test additions:
  - View-only user for module X can see menu X; user with only `edit` cannot.
  - Unknown protected path (`/admin/does-not-exist`) → denied.
  - Assignment-only user: can hit `/admin/returns/queue` but not `/admin/returns/types`, `/admin/return-config`, `/admin/returns/prudential/*`, or any non-returns admin path.
  - `super_admin` passes all above.

### 5. Out of scope this phase

- Backend `has_permission()` + `can_view_entity_returns` already aligned in previous migrations. No SQL in this phase unless a route audit exposes a mismatch.
- Storage policies, `PermissionGate` button audit, and RLS re-verification stay for Phase 3 as the user directed ("Do not continue to Phase 2 until every protected route is correctly mapped" — this plan IS the route-mapping phase).

### Deliverables at the end

- Files changed: `src/lib/permissionModules.ts`, `src/hooks/usePermissions.ts`, `src/components/layout/Sidebar.tsx` (visibility-only), `src/routes/*.tsx` (only where a `ModuleRoute`/module is missing), `src/test/permissionsRbac.test.tsx`, `src/test/routeCoverage.test.ts` (new).
- Generated route report printed by the new test on failure: mapped / missing / duplicate.
- Architecture diagram:

```text
        ┌──────────────┐
        │   super_admin│──── bypass ────┐
        └──────────────┘                │
                                        ▼
User ─► user_dynamic_roles ─► role_permissions ─► permissions(module, action)
                                        │
                ┌───────────────────────┼───────────────────────┐
                ▼                       ▼                       ▼
      hasPermission(m,a)      hasModuleAccess(m)         canAccessPath(p)
       (button gate)           (menu / landing)          (route guard)
                                        │
                                        │  narrow, path-scoped exception
                                        ▼
                       hasAssignmentReturnQueueAccess
                          + canViewAssignedReturn(row)
                       (only /admin/returns/queue* + /entity/returns*)
```
