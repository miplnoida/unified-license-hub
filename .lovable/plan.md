# Fix: Applicant/Licensee Returns menu bounces to /dashboard

## Root cause (verified)

The redirect does not come from the licence-entitlement code, from `PortalRoute`, or from the navigation data. Verified:

- `sec_navigation_items` holds the correct external links: `Reporting Dashboard → /entity/returns/dashboard` and `My Returns → /entity/returns` (both `audience = external`, active, visible).
- `returnsRoutes.tsx` registers both routes with `PortalRoute area="returns" capability="can_view_status"`, which renders `AccessDenied` on failure — it never redirects to `/dashboard`.
- The sidebar entitlement gate only marks items `locked`; it does not rewrite hrefs.

The single redirect to `/dashboard` on these paths lives in `src/routes/routeHelpers.tsx` inside `RegistrationApprovalGate`:

1. Every external user whose resolved role is `pre_licensee` (3 such users in `user_roles`, and every registration-created portal account keeps this role until a licensee profile exists) passes through this gate on every protected route.
2. The gate allows the route only if it is in `PRE_LICENSEE_ALLOWED_ROUTES` (`useUserPermissions.ts`) or if `getModuleForPath(pathname)` maps to a module the user holds.
3. `PRE_LICENSEE_ALLOWED_ROUTES` contains no `/entity/...` entry, and `ROUTE_MODULE_MAP` in `permissionModules.ts` maps only internal returns prefixes (`/admin/returns`, `/returns-management`) — nothing for `/entity/returns`.
4. So `getModuleForPath('/entity/returns')` returns `null` and the gate falls through to `return <Navigate to="/dashboard" replace />` — for menu clicks, direct URLs and refreshes alike, regardless of licence entitlement.

## Fix (smallest targeted change)

1. `src/hooks/useUserPermissions.ts` — add the external regulated-entity returns surface to `PRE_LICENSEE_ALLOWED_ROUTES` (`/entity/returns`, covering `/entity/returns/dashboard`, `/entity/returns/legacy`, `/entity/returns/filings/:id` via the existing prefix match). This mirrors the existing comment pattern: the whitelist only stops the approval gate from bouncing users; `PortalRoute` still performs the capability check and RLS/RPC entitlement predicates still enforce who may open or file anything.
2. `src/lib/permissionModules.ts` — map `/entity/returns` to `returns_management` so path→module resolution is consistent for the gate, sidebar and search. This is additive; the internal `/admin/returns` and `/returns-management` entries stay ahead/unchanged, and the mapping does not grant anything by itself.

Nothing else changes: no edits to `useLicenseEntitlements`, `licenceEntitlementNav.ts`, `Sidebar.tsx` lock behaviour, `PortalRoute`, returns routes, PPOC context, submission authorisation, sector restrictions, or admin Returns Queue.

## Behaviour after the fix

- Eligible licence holder: Returns Dashboard opens `/entity/returns/dashboard`; My Returns opens `/entity/returns`; refresh and direct URL stay put.
- Approved registration without an issued licence: sidebar entries stay visible but locked with the existing eligibility reason (unchanged); if the URL is opened directly, the page renders and server-side entitlement predicates still refuse filing — no silent bounce to `/dashboard`.
- PPOC with an eligible entity selected: entitlement continues to be evaluated for the selected entity; routes open normally.
- Internal staff: unaffected (the gate applies to pre-licensee audience only); `/returns/queue` and admin returns screens unchanged.

## Verification before reporting done

- Playwright run as an external portal user: click both Returns menu items, assert final URL is the expected route (not `/dashboard`), reload each route and re-assert, then open each URL directly.
- Confirm a non-entitled user still sees the locked menu state and is not redirected.
- Confirm an internal user still reaches `/returns/queue`.
- Read `/tmp/observability/build-errors.log` after the edits.
