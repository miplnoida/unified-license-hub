---
name: Approvals domain and menu coverage rule
description: Top-level Approvals menu grouping all cross-module decision queues; every app route must be reachable from menu, hub page, or breadcrumb registry
type: feature
---

- A top-level **Approvals** menu domain (`grp_nav_approvals`, sort 25, between Licensing and Supervision) collects every cross-module decision queue: registration review, entity resolution decisions, application review queue, licence lifecycle actions, licence appeals, complaint RFI approvals, investigation/thematic closure, prudential escalations, entity membership requests, approval overrides, approval workflows. Each entry carries the same permission its page enforces, so it only appears for approvers.
- Coverage rule: every route in `src/routes/*.tsx` must be reachable from either a sidebar item, a configuration hub page (`show_in_sidebar = false`, `show_in_search = true`), or be a create/detail/redirect route reached from its list page.
- Guard: `node scripts/verify-breadcrumb-coverage.mjs` must stay at 0 uncovered routes; regenerate `src/lib/breadcrumbs/navigationSnapshot.ts` with `node scripts/generate-nav-snapshot.mjs` after any `sec_navigation_items` change.
- Menu visibility remains discoverability only — RLS, RPC checks and route guards are the enforcement layer.
