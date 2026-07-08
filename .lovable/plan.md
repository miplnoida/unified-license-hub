## Goal

Populate Balance Sheet and P&L data for New FinCorp Commercial Bank Limited for all remaining periods present in the uploaded workbook, matching what was done for Q1 2022.

## Periods to create (13)

From workbook columns (2021 columns are empty, so skipped):

- 2022: Q2, Q3, Q4
- 2023: Q1, Q2, Q3, Q4
- 2024: Q1, Q2, Q3, Q4
- 2025: Q1, Q2

## Steps

1. **Create 13 rows in `returns_filed`**, cloning the shape of the existing Q1 2022 return (`RET-2026-00027`):
   - `entity_id` = `30a3c4cb-ad53-4020-a5c4-d216a5ac1eb1`
   - `return_configuration_id` = `b5d22673-48f4-4cd0-8962-25cf3ed28d9e`
   - `on_behalf_of_licensee_id` = same
   - `created_by` / `updated_by` = same submitter used on Q1 2022
   - `period_start_date` / `period_end_date` = quarter bounds
   - `due_date` = quarter end + 30 days (matches Q1 2022 pattern: 2022-03-31 → 2022-04-30)
   - `workflow_status` = `WIP`, `status` = `active`, `version` = `1.0`
   - `unique_id` = next sequential `RET-2026-000NN` values
   - Fresh `id` (uuid) generated per row

2. **Load Balance Sheet + P&L values per period** into `return_form_data`:
   - Re-run the Excel mapping script for each `(year, quarter)` column pair.
   - Upsert into `return_form_data` using the same `ON CONFLICT (return_id, form_id, field_id) DO UPDATE` pattern already used for Q1 2022.
   - Same form IDs / form_version IDs: BS `59ebe8fc… / dead2bcf…`, P&L `7ac713bf… / 84869d01…`.
   - Skips: the ~23 Memoranda-adjacent Balance Sheet lines whose line codes still collide with the current schema will remain unmapped (same limitation as Q1 2022).

3. **Verification**:
   - Confirm 14 rows exist in `returns_filed` for this entity.
   - Confirm each new return has ~294 BS rows + ~36 P&L rows in `return_form_data`.

## Out of scope

- Not submitting the returns — they will remain as WIP drafts, matching Q1 2022's state (per your choice).
- Not touching Q1 2026 (`RET-2026-00026`) — the workbook has no data for that period.
- No frontend/schema changes; database-data only.
