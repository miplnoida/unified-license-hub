Goal: Stop showing the expiry badge twice. Move the expired/upcoming-expiry indicator into the existing Status column only, with a blink style, and display the configured grace-period days in the upcoming badge. No other functionality changes.

### Changes
File: `src/pages/admin/ManageLicensees.tsx`

1. **Remove the separate Expiry column**
   - Delete the `ExpiryCell` component.
   - Remove the `<TableHead>Expiry</TableHead>` column header and its `<TableCell>`.
   - Revert the empty-state `colSpan` from `10` back to `9`.
   - Keep `valid_until` in the `LicenseeRow` interface and in the Supabase `licenses` query, because the status column still needs it.

2. **Load license-expiry configuration for grace days**
   - Add `const { data: expiryConfig } = useLicenseExpiryConfig();` near the top of the page.

3. **New status-cell logic**
   - Compute `daysUntil(valid_until)` using the existing helper.
   - Determine the effective expired state: `status === 'expired' || days < 0`.
   - Resolve the row's grace period via:
     ```
     expiryConfig?.resolveFor({
       sector_id: row.sector_id,
       sub_sector_id: row.sub_sector_id,
       category_id: row.category_id,
     }).grace_period_days ?? 0
     ```
   - Render in the Status column:
     - **Expired** (red destructive badge with `animate-pulse`) when expired.
     - **Expiring in {days} + {grace} days** (amber badge with `animate-pulse`) when `status === 'active'` and `0 <= days <= 7`.
     - Otherwise the existing `LicenseStatusBadge` so suspended/revoked/pending/etc. stay unchanged.

4. **Assumptions to confirm**
   - "Upcoming expiry" window remains 7 days, matching the previous implementation.
   - Badge text shows the literal expression `{days} + {grace} days` using the resolved grace period for that sector/category.

### What is not changing
- `src/lib/licenseStatusBadge.tsx` remains untouched, so all other pages keep their current badge behavior.
- `src/pages/licenses/LicenseDetail.tsx` renewal flow is unchanged.
- Table filters, sorting, pagination, stats, and row-click navigation stay exactly as they are.
