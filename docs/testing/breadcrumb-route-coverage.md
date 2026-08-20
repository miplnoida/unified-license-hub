# Breadcrumb Route Coverage

Platform-wide breadcrumbs are **derived**, never hand-written per page.

## Sources of truth

| Layer | File | Role |
|-------|------|------|
| Live navigation tree | `sec_get_user_context()` → `useSecurityContext()` | Canonical ancestry for menu routes |
| Frozen fallback | `src/lib/breadcrumbs/navigationSnapshot.ts` | Deterministic ancestry while the context loads, in tests and in CI |
| Route registry | `src/lib/breadcrumbs/breadcrumbRouteRegistry.ts` | Detail views, wizards, sub-workspaces and non-menu surfaces |
| Label resolvers | `src/lib/breadcrumbs/dynamicLabelResolvers.ts` | Business labels for id-bearing routes (never a UUID) |
| Pure builder | `src/lib/breadcrumbs/buildBreadcrumbs.ts` | Trail derivation, duplicate collapsing, id suppression |
| Hook | `src/hooks/useBreadcrumbs.ts` | Wires the router, security context and label queries |
| UI | `src/components/layout/ApplicationBreadcrumbs.tsx` | `nav aria-label="breadcrumb"`, `aria-current="page"`, mobile collapsing |

## Integration points (single mount each)

- Authenticated shell: `src/components/layout/AppShell.tsx` (`<ApplicationBreadcrumbs />`, root `Home → /dashboard`).
- Public surfaces: `src/components/landing/LandingNav.tsx` (`<PublicBreadcrumbBar />`, root `Home → /`), which every public page already renders.

Pages may refine only their own (last) crumb via `PageHeader breadcrumbLabel="..."`. Ancestry is never page-owned.

## Resolution order

1. exact registry rule (supports `:params`, parent may reuse the same params),
2. exact navigation href → full nav ancestry,
3. longest navigation href prefix + humanised trailing segments,
4. humanised segments only.

Opaque segments (UUIDs, numeric ids, long tokens) are dropped or replaced by a
resolver label — a raw id can never become a breadcrumb label.

## Regression guards

| Guard | Command |
|-------|---------|
| Route coverage | `node scripts/verify-breadcrumb-coverage.mjs` |
| Unit behaviour | `bunx vitest run src/test/breadcrumbs.test.ts` |
| Snapshot refresh | `node scripts/generate-nav-snapshot.mjs` |

Latest coverage run:

```text
Routes checked:      280
Registry rules:      214
Navigation hrefs:    153
Covered:             280
Uncovered:           0
```

The coverage script exits non-zero when a new route has no breadcrumb source and
lists registry rules whose route no longer exists (stale rules).

## Adding a new route

1. Add the route in `src/routes/*.tsx`.
2. If it is a sidebar entry, add it to `sec_navigation_items` and regenerate the snapshot.
3. Otherwise add one line to `breadcrumbRouteRegistry` (with `resolver`/`param` for detail routes).
4. Add a resolver descriptor only if the record type is new.
5. Run the coverage script.

## Security note

Breadcrumbs are discoverability only. A crumb link is still subject to
`PortalRoute`, `PermissionGate`, RLS and edge-function authorization; label
resolution failures degrade silently to a neutral fallback ("Entity",
"Application") rather than leaking record data.
