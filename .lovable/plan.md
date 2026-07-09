# Breaches tab — Year / Quarter filtering

## Goal
On the Supervised Entities → Entity Profile → **Breaches** tab, replace the current single flat list with a filtered view driven by **Year** and **Quarter** dropdowns, so admins review breaches one period at a time instead of all at once.

## Scope
- File: `src/pages/prudential/PrudentialEntityProfile.tsx` (Breaches tab only).
- No backend/data changes. No changes to other tabs, CSV export logic, or breach summary counters at the top of the page.

## How period is derived
Each breach has a `return_id`. The profile already loads `data.returns` with `period_end_date`. Build a `returnId → period_end_date` map, then derive:
- **Year** = `period_end_date` year.
- **Quarter** = `Math.floor(month / 3) + 1` from `period_end_date`.

Breaches whose return has no `period_end_date` (edge case) go into an "Unassigned" bucket.

## UI changes (Breaches tab)
1. Above the table, add two `Select` dropdowns:
   - **Year** — options built from the distinct years across this entity's breaches, sorted desc. Default = most recent year present.
   - **Quarter** — `All / Q1 / Q2 / Q3 / Q4`. Default = `All`.
2. Filter `data.breaches` by the selected Year + Quarter before rendering rows.
3. Show a small count line: `Showing X of Y breaches for {Year} {Quarter}`.
4. Empty state text updates to "No breaches for the selected period." when filters yield zero.

CSV export and top-of-page summary stats stay unchanged (still reflect all breaches).

## Technical details
- Add `useState` for `filterYear` and `filterQuarter` inside the component.
- Derive `returnPeriodById` with `useMemo` from `data.returns`.
- Derive `availableYears` with `useMemo` from breaches + map.
- Derive `visibleBreaches` with `useMemo` applying the filters.
- Existing `data.breaches.map(...)` becomes `visibleBreaches.map(...)`.

## Out of scope
- Filtering the "Worst breach" / top summary cards.
- Filtering by quarter in the CSV export.
- Any DB/schema changes.
