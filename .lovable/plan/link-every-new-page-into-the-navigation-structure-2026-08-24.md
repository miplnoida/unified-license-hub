# Link every new page into the navigation structure

## What I verified

I ran the two navigation guards and a full route/link audit against the live navigation data:

- 306 routes declared in `src/routes/*.tsx`
- 208 active navigation items, all icons approved (`validate-nav-icons` passes)
- 183 routes appear directly in the sidebar
- 60 routes are deliberately search-only (`show_in_sidebar = false`); I traced every one of them and each has an active ancestor that is served by a configuration hub page (`/admin/configuration/*`, `/admin/workflow-engine/*`, `/admin/notifications/*`, `/admin/system-events`, `/returns/configuration`), so they are all reachable by clicking, not just by search
- All remaining routes are create/detail/redirect routes reached from their list page

Result: exactly one page is orphaned.

## The one gap

**Regulatory Operating Structure** (`/admin/operating-structure`) — the page built during the Regulatory Operating Structure work — has:

- no entry in the live navigation (`sec_navigation_items`), so it never appears in the sidebar or global search; it only exists in the hardcoded boot-fallback menu, which real signed-in users never see
- no breadcrumb source, which is why `verify-breadcrumb-coverage` reports 1 uncovered route (it would fall back to humanised URL segments)

Today the only way to open it is by typing the URL.

## The fix

1. Add one navigation item for it:
   - Label: **Operating Structure**
   - Destination: `/admin/operating-structure`
   - Placement: Administration -> People & Access (`nav_adm_access`), next to PPOC Mappings — it manages teams, staff responsibilities, entity supervision and panels
   - Audience: internal, admin-only, gated on the same `user_management` permission the route already enforces, so it only shows for users who can open it
   - Visible in both the sidebar and global search
2. Remove the now-redundant hardcoded entry from the boot-fallback menu so there is a single source of truth.
3. Regenerate the navigation snapshot and re-run both guards; breadcrumbs then derive automatically from the menu ancestry (Home -> Administration -> People & Access -> Operating Structure).

## Technical notes

- One forward migration inserting a `sec_navigation_items` row (`nav_administration_operating_structure`) under `nav_adm_access`, linked to the existing `sec_routes` entry for `/admin/operating-structure` (created if absent) with `required_permission_id` resolved from the `user_management` module, written idempotently on the item `key`.
- `node scripts/generate-nav-snapshot.mjs` to refresh `src/lib/breadcrumbs/navigationSnapshot.ts`.
- Small edit to `src/config/navigation.tsx` (fallback only).
- Acceptance: `node scripts/verify-breadcrumb-coverage.mjs` reports 0 uncovered, `node scripts/validate-nav-icons.mjs` passes, and the item appears in the sidebar for an admin persona.
- No new permissions, no route changes, no RLS changes — menu visibility stays discoverability only.
