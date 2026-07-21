# 03 · Menu Coverage

Source: `src/config/navigation.tsx` + `src/components/Sidebar.tsx`.

## Numbers

| Metric | Value |
|--------|-------|
| Nav sections | 23 |
| Nav items carrying a `module:` key | 88 |
| Nav items **without** `module:` | 0 (verified — every leaf carries a module) |
| Assignment-only regulator visible items | 1 (`Return Queue`) — enforced by `hasAssignmentReturnQueueAccess` |
| Persona sidebar tests | `src/test/sidebarVisibility.test.tsx` (10 personas, passing) |

## Findings

| Severity | Item | Issue | Recommendation |
|----------|------|-------|----------------|
| **Low** | Nested parent groups (e.g. `Returns Admin`) | Currently hidden only when *every* child is hidden. Verified in `Sidebar.tsx`. | Keep as-is. |
| **Low** | Icon-only leaf items | Icons rely on `module` for aria labels; screen-reader affordance already asserted in tests. | No action. |
| **Info** | Sidebar order is enforced by `mem://navigation/sidebar-order` | Any migration that renames a module key must also update navigation. | Add a lint step that fails when a module key in `navigation.tsx` is not present in `permission_modules`. |

## Assignment-only lockdown (verified)

`Sidebar.tsx` short-circuits to only render items in the `assignmentOnlyAllowList` when
`isAssignmentOnlyRegulator === true`. Tests in `sidebarVisibility.test.tsx` cover:

- super_admin, legacy_admin, analyst, external primary/secondary, pre-licensee,
  assignment-only regulator, unauthenticated, dual-role user, no-permission user.

No changes recommended on the menu layer.
