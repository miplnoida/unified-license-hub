## Add dedicated "Total SLA" column to License Requests

### Change
In `src/pages/applications/ApplicationsList.tsx`:

1. Remove the `TotalSlaBadge` currently nested inside the "SLA" column cell (lines ~960 and ~974).
2. Add a new `<TableHead>Total SLA</TableHead>` immediately after the "SLA" header in both table renderings:
   - Main table (~line 1185, after the sortable SLA header)
   - Grouped table (~line 1124, after `<TableHead>SLA</TableHead>`)
3. Add a matching `<TableCell>` in `renderAppRow` right after the SLA cell, rendering `<TotalSlaBadge entry={totalSlaByApp.get(app.id)} />` (falls back to `—` inside the badge when empty).
4. Update the empty-state `colSpan` from `(isInternal ? 13 : 12)` to `(isInternal ? 14 : 13)` on line ~1194.

### Result
License Requests queue gets its own "Total SLA" column, consistent with Registration Review — SLA column stays focused on current-step status, Total SLA column shows cumulative elapsed time across all steps.