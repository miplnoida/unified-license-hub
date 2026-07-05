
## Goal

Align sidebar visibility with route guards so every left-panel menu is visible only to roles that can actually open the page, and hide any menu whose permission mapping is wrong or missing. No changes to unrelated working functionality.

## Scope

Frontend-only. Three files touched:
- `src/config/navigation.tsx` (sidebar items)
- `src/routes/dashboardRoutes.tsx` and `src/routes/adminRoutes.tsx` (route guards)
- `src/lib/permissionModules.ts` (route→module map used by both the sidebar and the pre-licensee gate)

No DB, no edge functions, no backend behavior changes.

## Fixes (grouped by category)

### A. Route guard fixes — sidebar shows item but route blocks the same user (or vice-versa)

1. **`/coordination` module mismatch (Critical)** — sidebar and `ROUTE_MODULE_MAP` say `coordination`, but the route guard says `application_management`. Change `dashboardRoutes.tsx` `<M module="application_management">` around `/coordination` and `/coordination/:caseId` to `module="coordination"`.

2. **Form Management vs `developer` role** — sidebar allows `developer` but `ModuleRoute` default `allowedRoles` is `['super_admin','admin']`, so developers hit AccessDenied in legacy mode. Pass `allowedRoles={['super_admin','admin','developer']}` on the three `/admin/forms*` `ModuleRoute` wrappers.

3. **`/change-sector` has no guard** — any authenticated user can open it via URL. Wrap with a licensee capability guard: `<PortalRoute area="licensing" capability="can_view_status">`. Sidebar already limits it to licensees; this brings the route in line.

4. **Stale `'reviewer'` role** in `/complaints` `ExternalPortalOrModule allowedRoles` — remove; it is not a valid `AppRole` and has no effect but is misleading.

5. **`/admin/rfi-auto-rules`, `/admin/supervisory-plan-templates`, `/admin/applications/bulk-intake`** currently use `AdminRoute` (role-only). Wrap each in `ModuleRoute` with the module their sibling routes use (`application_management` for all three) so dynamic-role admins are checked consistently. Sidebar unaffected (not listed there).

### B. `ROUTE_MODULE_MAP` gaps — add missing entries so pre-licensee gate + `getModuleForPath` work correctly

Add to `src/lib/permissionModules.ts` (placed above the broad `/admin` catch-all):
- `['/conduct', 'complaint_management']`
- `['/supervision/thematic-reviews', 'complaint_management']`
- `['/admin/conduct', 'complaint_management']`
- `['/admin/license-action-forms', 'license_management']`
- `['/payments', 'application_management']`
- `['/change-sector', 'license_management']`

These match the modules already declared on the corresponding sidebar items / route guards; the missing prefixes were the only reason `getModuleForPath` returned null.

### C. Sidebar visibility tightening — hide items unauthorized for the current role

1. **Payment History** (`navigation.tsx`) — add `module: 'application_management'` so the item respects dynamic role permissions instead of falling through to the role-only fallback that lets applicants without any granted portal access see it.

2. **Market Conduct group** (Conduct Dashboard, Conduct Alerts, Conduct Actions, Thematic Reviews, Risk Taxonomy, Products & Channels, Triage Rules, Monitoring Rules) — keep `complaint_management` module, but restrict sidebar `roles` to `ALL_INTERNAL` (already the case for four; the four admin ones already have `adminOnly: true`). Verify each item declares `module: 'complaint_management'` — no new module is created (out of scope).

3. **Supervisory / analytics utility routes** (`/inspections`, `/supervision/plans`, `/supervision/risk`, `/executive`, `/alerts`) — these have no sidebar entries (hidden but reachable). Change their route guards from `module="settings"` to a semantically correct module they already share with the rest of the app: `returns_management` for `/supervision/*` and `/alerts`, `report_management` for `/executive`, `application_management` for `/inspections`. This prevents a user granted only "settings" (e.g. email templates) from viewing supervisory analytics.

### D. Deliberately out of scope

- No new permission modules (`market_conduct`, `audit_management`, `supervision`) will be created — that requires DB seeding + admin UI updates and touches "other working functionality". Flagged for follow-up.
- No changes to `PortalRoute` capability semantics, RLS, edge functions, or the permission catalog itself.
- No refactor of `ExternalPortalOrModule` or `RegistrationApprovalGate`.

## Verification

1. Typecheck passes.
2. Log in as each of these roles and confirm sidebar + direct URL agree:
   - `super_admin` — sees everything, opens everything.
   - `admin` — sees admin block, opens all admin routes.
   - `developer` — sees Form Management and can open `/admin/forms` (fix A-2).
   - `supervisor` / `analyst` — see internal items only, cannot open `/change-sector` (fix A-3), cannot open `/coordination` unless granted the `coordination` module (fix A-1).
   - `licensee_primary` — sees My Licenses, Active Sector, Applications, Returns, Payments, Complaints; cannot open any `/admin/*` URL.
   - `applicant` / `pre_licensee` — see only Dashboard + Pre-Licensing Applications + Payments + Complaints; cannot open `/change-sector`, `/admin/*`, `/coordination`, `/conduct*`, `/reports`, `/analytics`.
3. Playwright smoke: unauthenticated user → `/change-sector` redirects to login; `analyst` logged in → typing `/change-sector` shows `AccessDenied`.

## Files to change

- `src/routes/dashboardRoutes.tsx` — coordination module, /change-sector guard, remove 'reviewer', supervisory route modules
- `src/routes/adminRoutes.tsx` — Form Management `allowedRoles`, wrap three admin-only routes in `ModuleRoute`
- `src/config/navigation.tsx` — add `module` to Payment History
- `src/lib/permissionModules.ts` — 6 new `ROUTE_MODULE_MAP` entries
