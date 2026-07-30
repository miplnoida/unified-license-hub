## What I verified

- `VersionDiffViewer.tsx` reads `version.schema_snapshot` directly as the section list.
- In the database, many `form_versions` rows have an **empty** `schema_snapshot` (`[]`) while their fields live in the normalized `form_fields` table (e.g. versions with 0 snapshot sections but 20–36 field rows). The rest of the app handles this: `useFormTemplates.ts` (~line 660) uses the snapshot only when `isValidSectionSnapshot` passes, and otherwise builds sections from `form_fields` via `fieldRowsToSections`.
- Consequence: for those templates the diff array is empty, every stat reads 0, and the "Show unchanged" toggle has nothing to reveal — which matches the reported behaviour. Where a version *does* carry a snapshot (checked templates with 317 fields, all with unique non-blank `fieldName`s), pairing by field name works.

## Changes

### 1. Remove the rollback feature — `src/components/form-builder/VersionHistory.tsx`
- Delete the Rollback button on every version row, the `onRollback` handler and its SweetAlert confirmation dialog, and the now-unused `Undo2` import plus any imports/hooks used only by rollback (`useCreateNewFormVersion`, and `useActivateVersionAsCurrent`/`updateSchedule` if not used elsewhere in the file — keep whatever the remaining publish/activate/schedule actions still need).
- No other version-history action (view, publish, activate, schedule, edit) changes.

### 2. Make the diff resolve sections the same way the app does — `src/components/form-builder/VersionDiffViewer.tsx`
- For each of the two selected versions, resolve its section list through the shared path instead of reading `schema_snapshot` raw:
  - use the snapshot when it is a valid non-empty section array,
  - otherwise fetch that version's `form_fields` (+ conditions) and build sections with the existing `fieldRowsToSections` helper — i.e. reuse the existing per-version sections hook from `useFormTemplates.ts` for the left and right version ids.
- Handle loading state: show a small "Loading versions…" line while either side is still resolving, so the empty-state text doesn't flash a misleading "No differences found".
- Keep existing field pairing (`fieldName` → `section::label` → `id`), stats, side-by-side/list toggle and the "Show unchanged" switch as-is; with real sections on both sides the unchanged bucket populates and the toggle works.
- Keep the "no common fields" note, and keep the empty-state message when both versions genuinely resolve to zero fields.

## Technical notes
- Frontend-only: no migration, no RPC, no RLS change. Files touched: `src/components/form-builder/VersionDiffViewer.tsx`, `src/components/form-builder/VersionHistory.tsx`.
- The `form_fields` fallback reads through the same authorised queries already used to render a version, so no new data access is introduced.
