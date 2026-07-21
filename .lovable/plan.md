## Goal

Audit every sidebar item, close the gaps where menu visibility drifts from `module.view`, and lock the rules with per-persona UI tests. **No business logic changes** — only navigation config, sidebar visibility predicate, and tests.

## Findings from audit

Verified against `src/config/navigation.tsx`, `src/components/layout/Sidebar.tsx`, `src/hooks/usePermissions.ts`, and `src/lib/permissionModules.ts`.

### Rule violations found

| # | Rule | Item(s) | Current behavior |
|---|------|---------|------------------|
| 1 | Assignment-only regulator: show ONLY Return Queue | **Dashboard** | Currently visible — item has no `module`, `roles=ALL_ROLES` includes `analyst`, and the `enforceDynamic` branch falls back to `effectiveVisible=true` for module-less items. |
| 2 | Menu visible only if `module.view` | Dashboard (all internal users) | Ungated by module → shows regardless of permissions. Rule requires it be hidden for assignment-only users. |
| 3 | Menu module key must match the route's `<M module="…">` | **Correspondence** section (Dashboard / Inbox / Records) | Menu uses `module: 'report_management'`; routes now require `settings`. A `report_management`-only user sees the menu but hits Access Denied. |
| 4 | Menu module key must match route guard | **Prudential Supervision** section items pointing at `/admin/returns/prudential/*` and `/admin/returns/{validations,notifications/*}` | Correct in nav (`returns_management`) and map (`returns_management`). Verified — no change needed. |
| 5 | No orphan / empty parent menus | Fit & Proper children-only groups | Sidebar already hides parents with zero visible children (line 234-235, 307-308). No change needed. |
| 6 | No duplicates | — | None found. |
| 7 | No hidden routes exposed via nav | — | None found. |

Everything else (Returns Admin group hidden for assignment-only, Administration hidden, action-only permissions not opening menus, external audience gating) already works correctly.

## Changes

### 1. `src/components/layout/Sidebar.tsx` — tighten `isItemVisible`

Remove the "module-less item falls back to `effectiveVisible`" branch that lets assignment-only users see Dashboard (and any future ungated internal item).

New rule for internal items with no `module` and no mapped `href`:
- External users (licensee / pre-licensee) with matching audience → visible.
- Internal users → visible only if `hasAnyModuleAccess()` is true.
- Assignment-only regulators (`hasAssignmentReturnQueueAccess && !hasAnyModuleAccess`) → hidden.

This makes Dashboard automatically hidden for assignment-only regulators, matching the audit rule, without touching route guards or business logic.

### 2. `src/config/navigation.tsx` — fix module mismatches

- Correspondence Dashboard / Inbox / Records: `module: 'report_management'` → `module: 'settings'` to match the routes and `ROUTE_MODULE_MAP`.

No other module keys change.

### 3. `src/test/sidebarVisibility.test.tsx` — new persona test suite

Render `<Sidebar />` under `MemoryRouter` with a mocked auth + permissions hook and assert exact visible/hidden menu labels for each persona.

Personas covered:

| Persona | Setup |
|---|---|
| **Super Admin** | `role: super_admin` → `isBypassRole=true` |
| **Legacy Admin** | `role: admin` + dynamic role granting `.view` on every known module |
| **Admin (static, no dynamic role)** | `role: admin`, no dynamic role — expects deny (post-hardening) |
| **Analyst — view-only on returns** | `analyst` + `returns_management.view` |
| **Reviewer — view-only on complaints** | analyst-like + `complaint_management.view` |
| **Supervisor — view on returns + market_conduct** | multi-module view |
| **Assignment-only regulator** | `analyst`, no permissions, has licensee assignment → sees ONLY "Returns Queue" |
| **Edit-only user** | `returns_management.edit` (no view) → sees no returns menu |
| **View-only user** (already covered by Analyst) | same as Analyst |
| **External licensee_primary** | sees My Licenses / My Returns / Payments / Complaints; no admin section |

For each persona the test asserts (a) the expected labels appear, (b) forbidden labels do NOT appear, and (c) no parent group renders with zero visible children.

The assignment-only case explicitly asserts every label in the audit's "Hide" list is absent: Return Types, Configurations, Cutoff, Due Dates, Late Fees, Schedule, Notifications, Analytics, Ratios, Thresholds, Dashboard, Administration.

## Files touched

- `src/components/layout/Sidebar.tsx` — visibility predicate (≈10 lines)
- `src/config/navigation.tsx` — 3 module-key corrections in Correspondence section
- `src/test/sidebarVisibility.test.tsx` — new (persona matrix, ~250 lines)

## Out of scope

- Route guards, RLS, RPCs, storage — untouched.
- Adding new pages, changing groupings, renaming labels.
- Redirecting assignment-only users' landing page.

## Verification

- `bunx vitest run` — full suite must stay green.
- New `sidebarVisibility.test.tsx` provides the test-evidence artifact per persona in lieu of screenshots (test output enumerates the visible menu for each persona).
