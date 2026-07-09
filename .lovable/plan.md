## Root cause

The PPOC dashboard for "New FinCorp Commercial Bank Limited" shows Active Licences = 0 and header "SECTOR Not set" even though the license exists and is active. Traced through RLS:

- License `720b6446…` is `active`, linked from licensee `30a3c4cb…` (FinCorp).
- The PPOC user (Bharat) has an active `ppoc_entity_mappings` row for that licensee **plus** a matching `ppoc_mapping_sectors` row for sector "Commercial Bank" (`d90ffa53…`).
- Access flows through `public.ppoc_mapped_licensee_ids(uid)`, which requires:
  ```sql
  AND l.sector_id IS NOT NULL
  AND s.sector_id = l.sector_id
  ```
  where `l` is `public.licensees`.
- **`licensees.sector_id` for FinCorp is NULL**, so the function returns 0 rows for this licensee, `ppoc_accessible_license_ids` excludes the license, RLS blocks the SELECT, and every downstream metric (Active Licences, Expiring, Returns Due, Outstanding Fees, active-sector banner) collapses to 0 / "Not set".

Other PPOC-mapped licensees (3 of them) have `sector_id` populated and work correctly, which is why this looks isolated to FinCorp.

## Fix

**Single migration, data-only.** Backfill `licensees.sector_id` from the linked license whenever it is NULL:

```sql
UPDATE public.licensees lc
SET sector_id = l.sector_id, updated_at = now()
FROM public.licenses l
WHERE lc.license_id = l.id
  AND lc.sector_id IS NULL
  AND l.sector_id IS NOT NULL;
```

That single row-fix restores:
- PPOC RLS visibility of FinCorp's license → `licenses.active` count becomes 1.
- Active-sector context resolves to Commercial Bank → header shows the sector instead of "Not set".
- Returns-due / expiring / outstanding-fees tiles, which key off the same license/licensee scope, start counting correctly.

No frontend changes, no policy changes, no changes to `ppoc_mapped_licensee_ids` — the existing function contract (require sector) stays intact, we just make the data satisfy it.

## Out of scope

- Adding a trigger/service change to auto-populate `licensees.sector_id` on future license grants. Flagged for a follow-up if new licensees keep landing without a sector; will not touch it in this pass since the user asked us not to change working functionality.
- Any workflow, RLS, or unrelated dashboard-card wiring.

## Verification

1. Run migration.
2. `SELECT sector_id FROM licensees WHERE id='30a3c4cb-…';` → non-null.
3. `SELECT ppoc_accessible_license_ids('ee10b07e-…');` → now includes `720b6446-…`.
4. Reload dashboard as Bharat / PPOC → Active Licences ≥ 1, sector banner populated, other tiles reflect real counts.
