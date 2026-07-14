## Fix: "Total SLA" column missing on /applications/queue

### Root cause
Previous edits added the column to `src/pages/applications/ApplicationsList.tsx`, but the `/applications/queue` route actually renders `src/pages/applications/ApplicationQueue.tsx` — a different triage view. That file was never touched, so the header never appeared.

### Change
Edit `src/pages/applications/ApplicationQueue.tsx`:

1. Import `useWorkflowTotalSla` and `TotalSlaBadge`.
2. After the visible rows are computed, call `useWorkflowTotalSla({ entityType: 'application', entityIds: <visible app ids> })`.
3. Add `<TableHead>Total SLA</TableHead>` immediately after the existing `<TableHead>SLA</TableHead>` (line ~564).
4. In the row renderer, add a matching `<TableCell><TotalSlaBadge entry={totalSlaByApp.get(app.id)} /></TableCell>` right after the SLA cell.
5. Update any empty-state `colSpan` to account for the new column.

No changes to `ApplicationsList.tsx` (already correct) or to hooks/badge component.

### Result
The License Requests queue at `/applications/queue` displays a dedicated "Total SLA" column, matching Registration Review and other modules.
