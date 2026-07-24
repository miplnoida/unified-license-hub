## Verified current state

- `APP-2026-000129` now has a linked licensee row: `New FinCorp Commercial Bank Limited`.
- The licensee row now has `sector_id`, `sub_sector_id`, and `category_id` populated as Merchant Bank, so the previous NULL-taxonomy issue is fixed in the database.
- The `/admin/licensees` page still uses the direct `licensees` list query and client-side filters/pagination, so the remaining issue is likely either:
  - the signed-in regulator still fails the `licensees_read` access helper for this entity, or
  - the current page/search/filter/pagination state is hiding the row even though it exists.

## Plan

1. **Trace the logged-in list request**
   - Reproduce `/admin/licensees` with the current preview session.
   - Capture the exact `licensees` response count and whether `3c4a539a-03a1-4ad1-b936-1c8ab343e328` is returned for the signed-in regulator.
   - Check active search, sector, status, sort, and pagination state.

2. **Fix backend visibility if the row is not returned**
   - Patch the `can_read_licensee` backend helper so sector-scoped regulators can read licensees using the populated licensee taxonomy.
   - Ensure the helper also handles assignment-based access without requiring unrelated global entity permissions.
   - Keep RLS restrictive: do not make licensees publicly readable and do not loosen access beyond configured role/scope/assignment rules.

3. **Fix frontend hiding if the row is returned but not visible**
   - Reset page index to page 0 when search/sector/status filters change.
   - Make the search match the database licensee name and license number as well as the enriched display name/contact/category fields.
   - Add resilient error handling so failed secondary lookups do not silently produce an empty/partial list.

4. **Verify**
   - Confirm the target licensee is returned and visible on `/admin/licensees` for the current regulator session.
   - Confirm the target shows Merchant Bank values in Sector/Sub-sector/Category.
   - Confirm unrelated licensees remain hidden if the regulator is not scoped or assigned to them.