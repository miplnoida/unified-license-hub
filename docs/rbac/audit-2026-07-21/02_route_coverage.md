# 02 · Route Coverage

**Total `<Route>` declarations:** 231
**Wrapped in `<M>` / `<ModuleRoute>` / `<AdminRoute>` / `<PortalRoute>`:** 189
**Unwrapped by module guard:** 42 (see `routes-unguarded.txt`)

## Breakdown of the 42 "unwrapped" routes

| Category | Count | Notes |
|----------|-------|-------|
| Public routes (`publicRoutes.tsx`) | 15 | `/`, `/login`, `/register`, `/registry/*`, `/track/complaint`, `/declaration/:token`, `/forgot-password`, `/reset-password`, `/registration/*` |
| External portal (`<EP capability="…">`) | 21 | Uses capability-based guard, not module — see `dashboardRoutes.tsx` |
| Wrapped in `<P>` (authenticated portal) | 5 | `/dashboard`, `/notifications`, `/profile`, `/change-password`, `/preview/:versionId` |
| Wrapped in `<S>` / `<A>` (settings/admin shell) | 1 | `/admin` root — `<AdminHub>` inside AdminRoute shell, no per-module guard on the hub itself |

## Findings

| Severity | Route | Issue | Recommendation |
|----------|-------|-------|----------------|
| **High** | `/admin` (AdminHub) | Reachable by any authenticated user (`<A>` currently only checks the `admin` bit). AdminHub links out to protected pages, but the hub itself leaks module names / KPIs. | Wrap `<AdminHub>` in `<M module="admin_dashboard">` and gate KPIs by `has_permission`. |
| **Medium** | `/preview/:versionId` | Renders any form version by id; no `form_management.view` check. | Wrap in `<M module="form_management">`. |
| **Medium** | `/notifications` | Read-only per-user, but no module gate — an internal reviewer without `notification_management.view` still sees other module's alerts embedded there. | Filter list server-side by `auth.uid()` only (verify), otherwise gate. |
| **Low** | `/dashboard`, `/profile`, `/change-password` | Authenticated-only screens with no per-module data. Acceptable. | No action. |
| **Low** | External-portal `<EP capability="…">` routes | Capability strings are hard-coded (`can_submit`, `can_view_status`) and not mirrored in the RBAC catalog. | Register these capabilities in `permissions` and enforce via `has_permission` so audit tooling covers them. |

## Automated coverage

`src/test/routeCoverage.test.ts` already fails CI if a route declared with `<M module="X">` uses a
module key not present in `ROUTE_MODULE_MAP`. That test is passing today.

**Recommended additions:**
- Fail CI if a new route is added under `src/routes/**` without a `<M>` / `<EP>` / `<P>` / public
  route allow-list entry.
- Snapshot the `<AdminHub>` links and assert each target uses `<M>`.
