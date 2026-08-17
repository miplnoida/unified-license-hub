# Fix India missing from Master Data country list

## What's actually happening
India does exist in Master Data (with 36 states and 238 cities beneath it), but two records were seeded with a non-zero sort order:

- India — sort order 2, code stored as `In` (should be `IN`)
- Anguilla — sort order 1, code missing

Every other country has sort order 0. Because the admin Master Data list sorts by sort order first and then caps the fetch at 200 rows, India lands at position 250 of 250 and never appears in the visible page. In the registration dropdown it appears, but pushed to the very bottom of the list instead of alphabetically.

## Fix

1. Data correction (no schema change):
   - Set India's sort order to 0 and its code to `IN`.
   - Set Anguilla's sort order to 0 and its code to `AI`.
   - Re-check that no other country/state/city row carries a stray sort order.
2. Admin list usability: keep the 200-row cap for performance, but make the list order purely alphabetical by name for these location types so no record can be hidden by a stray sort order, and show the "showing X of Y — refine your search" hint so admins know to search when the cap is hit.

## Verification
- Query the country list ordered as the admin screen orders it and confirm India appears within the first page.
- Open Master Data → Country in the admin panel, confirm India is listed and its code reads `IN`.
- On the registration form, select India and confirm its states load, then pick a state and confirm its cities load.

## Notes
No changes to registration submission logic, seeding scripts, or other master data types.
