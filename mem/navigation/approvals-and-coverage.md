---
name: Canonical navigation domains and menu coverage rule
description: Nine canonical sidebar domains (Home, My Work, Entities & Registry, Licensing & Authorisation, Supervision, Returns & Data, Correspondence & Cases, Insights & Reporting, Administration); no global Approvals root; coverage guard
type: feature
---

- The sidebar has exactly nine root domains, ordered by business ownership:
  Home (10), My Work (20), Entities & Registry (50), Licensing & Authorisation (100),
  Supervision (200), Returns & Data (300), Correspondence & Cases (400),
  Insights & Reporting (500), Administration (600).
- There is **no global Approvals root** (`grp_nav_approvals` is deactivated and must not be re-added).
  Every decision/approval queue lives inside the domain that owns the process
  (registration review + application queue → Licensing, entity resolution + membership requests →
  Entities & Registry, RFI/closure approvals → Supervision, overrides + workflow definitions → Administration).
- **My Work** holds only personal, cross-module surfaces: Notifications, My Licences, My Returns,
  My Appeals, My Correspondence, Information Requests, Supervisory Actions, My Payments.
- **Entities & Registry** comes before Licensing — identity is established before authority.
- Every nav item carries the permission its page enforces, so it only appears for users who can act.
  Menu visibility is discoverability only — RLS, RPC checks and route guards are the enforcement layer.
- Coverage rule: every route in `src/routes/*.tsx` must be reachable from a sidebar item, a configuration
  hub page (`show_in_sidebar = false`, `show_in_search = true`), or be a create/detail/redirect route
  reached from its list page.
- Guards: `node scripts/verify-breadcrumb-coverage.mjs` must stay at 0 uncovered routes, and
  `node scripts/validate-nav-icons.mjs` must pass. Regenerate `src/lib/breadcrumbs/navigationSnapshot.ts`
  with `node scripts/generate-nav-snapshot.mjs` after any `sec_navigation_items` change.
