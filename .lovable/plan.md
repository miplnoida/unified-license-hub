## Problem

On `Entity → Returns → Create New Return`, Step 1's "Return Configuration" dropdown lists **every active** return config in the system. It does not filter by the filing licensee's sector / sub-sector, so `bharatd@yopmail.com` sees "IFRS 17 Quarterly" even when it isn't intended for their entity.

Root cause (in `src/pages/entity/returns/CreateReturnPage.tsx`):

```ts
const activeConfigs = configs.filter(c => c.status === 'active');
```

No sector / sub-sector scoping is applied against the resolved licensee.

## Fix

Filter `activeConfigs` by the effective licensee's sector and sub-sector, treating `null` on the config as a wildcard (config applies to all sectors / all sub-sectors within a sector).

### Steps

1. In `CreateReturnPage.tsx`, load the effective licensee's `sector_id` and `sub_sector_id`:
   - Resolve `effectiveLicenseeId` (already computed).
   - Add a `useQuery(['licensee_scope', effectiveLicenseeId])` that selects `sector_id, sub_sector_id` from `licensees`.
2. Replace the active-configs filter with sector/sub-sector matching:
   ```
   activeConfigs = configs.filter(c =>
     c.status === 'active' &&
     (!c.sector_id    || c.sector_id    === licensee.sector_id) &&
     (!c.subsector_id || c.subsector_id === licensee.sub_sector_id)
   )
   ```
3. Reset `configId` / `period` if the previously selected config is no longer in the filtered list (e.g., after licensee switch via header).
4. Keep the existing "No return form is currently configured" empty state — it now also fires when nothing matches the licensee's scope. Update its copy slightly to say "for your sector".

### Out of scope

- No schema changes.
- No changes to the admin-side Return Configuration screen (config authoring is correct).
- No change to PPOC/licensee-switcher logic; we just react to the resolved licensee.
- Category-level filtering is not added (configs don't carry a category today).

### Verification

- As `bharatd@yopmail.com` (General Insurance / General Insurance sub-sector): the dropdown still shows "IFRS 17 Quarterly" **only if** its `sector_id` + `subsector_id` match the licensee. Per current DB it does match, so it will still appear — meaning if the user still considers it wrong, the mismatch is in the config's sector/sub-sector assignment (admin data fix), not the UI. This plan guarantees UI never shows configs outside the licensee's scope going forward.
- For any licensee in a different sector, "IFRS 17 Quarterly" will no longer appear.
