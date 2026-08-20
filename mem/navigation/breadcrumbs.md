---
name: Platform-wide breadcrumbs
description: Derived breadcrumb system — nav tree + route registry, business labels instead of UUIDs, single shell mount
type: feature
---

Breadcrumbs are DERIVED, never hand-written per page.

- Ancestry source: live `sec_get_user_context()` navigation, falling back to the generated `src/lib/breadcrumbs/navigationSnapshot.ts` (regenerate with `node scripts/generate-nav-snapshot.mjs`).
- Non-menu/detail routes: one line each in `src/lib/breadcrumbs/breadcrumbRouteRegistry.ts` (`parent` may reuse `:params`).
- Detail routes resolve business labels via `dynamicLabelResolvers.ts` descriptors (table + id column + label columns). A UUID/opaque id must never appear as a crumb label; failures degrade to a neutral fallback ("Entity", "Application").
- Mount points: `AppShell` (root `Home → /dashboard`) and `LandingNav` via `PublicBreadcrumbBar` (root `Home → /`). Pages must not build their own trails; they may only refine the current crumb with `PageHeader breadcrumbLabel`.
- Trails with a single crumb render nothing. Long trails collapse in the middle (full chain kept for screen readers).
- Guards: `node scripts/verify-breadcrumb-coverage.mjs` (must stay at 0 uncovered routes) and `src/test/breadcrumbs.test.ts`.
- Breadcrumbs are discoverability only; route guards, RLS and edge functions remain the enforcement layer.
