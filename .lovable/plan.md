## Cause

`SectorSelectionSection` (used by the registration page) calls `useSectors()`, `useSubSectors()`, `useCategories()` with no arguments, so the queries:

1. Return rows of **all statuses** — sectors marked Inactive in `/admin/masters/sectors` still appear.
2. Do **not** filter by regulator — sectors from other regulators also show.

In addition, the admin "Delete" action and the registration page run in separate sessions/caches, so a deletion in admin is only reflected in the registration tab after its TanStack query cache is invalidated/refetched. The registration page never invalidates these caches and has no `staleTime` set on the public side.

## Fix (frontend only, no schema change)

Edit `src/components/registration/SectorSelectionSection.tsx`:

- Filter `sectors`, `subSectors`, `categories` to `status === 'active'` before rendering.
- When the active regulator is known on the public registration flow, pass it into `useSectors(regulatorId)` (and rely on the existing inner-join filter for sub-sectors/categories) so only that regulator's taxonomy shows. If no regulator context exists on the public page, keep the unfiltered call but still apply the active-status filter.
- Show an empty-state `SelectItem disabled` "No active sectors / sub-sectors / categories" when the filtered list is empty, instead of an empty dropdown.
- On mount, call `queryClient.invalidateQueries({ queryKey: ['sectors'] })` (and sub_sectors/categories) so a freshly opened registration page always fetches the latest list rather than serving a stale cache from another tab.

No backend/migration changes. No changes to admin delete logic. No other pages touched.

## Verification

1. In `/admin/masters/sectors`, mark a sector Inactive → open registration page → it no longer appears in the Sector dropdown.
2. Delete a sector in admin → reload registration → dropdown updates immediately.
3. If all sectors for a regulator are inactive, dropdown shows the disabled "No active sectors" entry.
