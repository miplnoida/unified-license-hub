
## Problem

Market Conduct, Fit & Proper, and Twin Peaks Coordination menus are gated by the wrong permission modules, so any internal user with unrelated permissions (e.g. `complaint_management`) sees them, and users granted the correct semantic module (e.g. `market_conduct`) don't.

The permission catalog in the DB already has dedicated modules for these areas, but the sidebar/routes still point at legacy keys:

| Menu group | Current key (wrong) | Correct DB module |
|---|---|---|
| Market Conduct (Conduct Dashboard/Alerts/Actions, Thematic Reviews, Risk Taxonomy, Products & Channels, Triage Rules, Monitoring Rules) | `complaint_management` | `market_conduct` |
| Complaint Types admin | `complaint_management` | `complaint_type` |
| FP Screening Configs | `fit_and_proper` | `fit_and_proper_screening` |
| FP Committees | `fit_and_proper` | `fit_and_proper_committee` |
| FP Sector Decision Rules | `fit_and_proper` | `fit_and_proper_screening` |
| Coordination Cases | `coordination` | `coordination` (already OK — verify) |

## Scope

Frontend-only. Three files:
- `src/config/navigation.tsx` — update `module` on Market Conduct, Complaint Types, FP admin items
- `src/routes/dashboardRoutes.tsx` + `src/routes/adminRoutes.tsx` — update `ModuleRoute module=` on the same routes
- `src/lib/permissionModules.ts` — update `ROUTE_MODULE_MAP` entries for these paths and extend `KNOWN_PERMISSION_MODULES`

No DB changes, no edge functions, no changes to `Complaints` (`/complaints`) itself — it stays on `complaint_management` (it's the citizen-facing complaint intake, which matches DB `complaint_management` perms).

## Fixes

### A. Market Conduct — switch to `market_conduct` module

Sidebar (`navigation.tsx` 129–136):
- Conduct Dashboard `/conduct` → `module: 'market_conduct'`
- Conduct Alerts `/conduct/alerts` → `module: 'market_conduct'`
- Conduct Actions `/conduct/actions` → `module: 'market_conduct'`
- Thematic Reviews `/supervision/thematic-reviews` → `module: 'market_conduct'`
- Risk Taxonomy, Products & Channels, Triage Rules, Monitoring Rules (`/admin/conduct/*`) → `module: 'market_conduct'`

Routes:
- `dashboardRoutes.tsx` 165–171: `/conduct`, `/conduct/alerts`, `/conduct/actions`, `/supervision/thematic-reviews`, `/supervision/thematic-reviews/new`, `/supervision/thematic-reviews/:id`, `/admin/conduct/monitoring-rules` → `<M module="market_conduct">`
- `adminRoutes.tsx` 124–126: `/admin/conduct/risk-taxonomy`, `/admin/conduct/products-channels`, `/admin/conduct/triage-rules` → `<M module="market_conduct">`

### B. Complaint Types — switch to `complaint_type` module

- Sidebar 123 (`navigation.tsx`) — `module: 'complaint_type'`
- Route `adminRoutes.tsx` 106 — `<M module="complaint_type">`

### C. Fit & Proper admin — switch to dedicated sub-modules

- Sidebar (`navigation.tsx` 144–145):
  - Screening Configs `/admin/fp-screening-configs` → `module: 'fit_and_proper_screening'`
  - Committees `/admin/fp-committees` → `module: 'fit_and_proper_committee'`
- Routes (`adminRoutes.tsx` 116–118):
  - `/admin/fp-screening-configs` → `<M module="fit_and_proper_screening">`
  - `/admin/fp-committees` → `<M module="fit_and_proper_committee">`
  - `/admin/fp-sector-rules` → `<M module="fit_and_proper_screening">`

Individual Register (`/fit-and-proper*`) keeps the general `fit_and_proper` module — matches DB perms on that module.

### D. ROUTE_MODULE_MAP updates (`permissionModules.ts` 41–104)

Replace/add so `getModuleForPath` matches route guards:
- `['/conduct', 'market_conduct']`
- `['/supervision/thematic-reviews', 'market_conduct']`
- `['/admin/conduct', 'market_conduct']`
- `['/admin/complaint-types', 'complaint_type']`
- `['/admin/fp-screening-configs', 'fit_and_proper_screening']`
- `['/admin/fp-committees', 'fit_and_proper_committee']`
- `['/admin/fp-sector-rules', 'fit_and_proper_screening']`

Also extend `KNOWN_PERMISSION_MODULES` with: `market_conduct`, `market_conduct_investigation`, `complaint_type`, `fit_and_proper_screening`, `fit_and_proper_committee`, `fit_and_proper_initiation` (documentation only; type is already `string`).

### E. Confirm Twin Peaks Coordination

Coordination sidebar already uses `module: 'coordination'` and the route (after previous fix) uses `<M module="coordination">`. Add a smoke check — no code change expected.

## Verification

1. `bunx tsgo --noEmit` clean.
2. Grant a role only `market_conduct.view` — sidebar shows Market Conduct group, hides FP/Coordination/Complaint Types.
3. Grant a role only `complaint_management.view` — sidebar shows citizen Complaints, hides Market Conduct group (regression fix).
4. Grant a role only `fit_and_proper_committee.view` — sidebar hides Individual Register (correct) and shows only Committees; role with just `fit_and_proper.view` sees Individual Register only.
5. Direct-URL access to `/conduct` with `complaint_management`-only role → AccessDenied.

## Out of scope

- Not creating new DB modules or seeding permissions.
- Not refactoring `PortalRoute`, RLS, edge functions.
- Not changing `/complaints`, `/complaints/analytics`, `/complaints/:id` — those remain on `complaint_management`.
