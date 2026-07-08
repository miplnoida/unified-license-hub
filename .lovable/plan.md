## Problem

On `/admin/prudential-taxonomy` → Stress Indicators, each row only has a "Deactivate" action. There is no way to edit an existing indicator (label, metric key, direction, threshold, severity, taxonomy, active/escalate flags). The `useUpsertStressIndicator` hook already supports updates via `id`, but the UI never surfaces an edit path.

## Plan

Add inline edit support to `src/pages/prudential/StressIndicatorsAdmin.tsx` only — no backend, hook, or schema changes.

1. Reuse the existing Dialog for both create and edit:
   - Track dialog mode via the same `form` state; when `form.id` is set, treat as edit.
   - Change dialog title to "Edit stress indicator" when `form.id` exists.
   - Reset `form` to defaults on close so "New indicator" still starts blank.

2. Add an "Edit" button to each row (before "Deactivate"):
   - Clicking loads the row into `form` and opens the dialog.
   - Save calls the same `upsert.mutateAsync(form)` — the hook already routes to update when `id` is present.

3. Rename the destructive action from "Deactivate" to "Delete" only if the current call (`del.mutate(i.id)`) actually deletes; otherwise keep label as-is. (Will verify against `useDeleteStressIndicator` during build — no plan change needed either way.)

4. Keep table columns, styling, and all other behavior unchanged.

### Out of scope
- No changes to `useUpsertStressIndicator`, `useDeleteStressIndicator`, or the DB.
- No bulk edit, no reordering, no new fields.
- No changes to the ratios/thresholds tabs.

### Verification
- Open `/admin/prudential-taxonomy` → Stress Indicators → click Edit on a seeded DTI indicator → change threshold/severity → Save → row reflects new values.
- "New indicator" still opens an empty dialog.
