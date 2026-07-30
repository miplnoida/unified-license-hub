## Goal

Close the FRD gap on **Form Builder — Version History**: add a true side-by-side version comparison and a rollback-to-previous-version action. No other workflow (scheduling, activation, publishing, notifications, form rendering) changes.

## Current state (verified)

- `src/components/form-builder/VersionHistory.tsx` — lists versions with preview, schedule, activate-as-current, activate/deactivate. No rollback action.
- `src/components/form-builder/VersionDiffViewer.tsx` — a "Compare" dialog exists, but it renders a **single stacked list** of added/removed/changed items, not a side-by-side left/right view.
- `src/hooks/useFormTemplates.ts` — has `useCreateNewFormVersion` (creates a draft version from a schema snapshot, regenerating field IDs and conditional-logic references), `useActivateVersionAsCurrent` (RPC `activate_form_version_as_current`), `useFormVersions`, `useFormVersionUsageCounts`.

## What will be built

### 1. Side-by-side diff (upgrade `VersionDiffViewer.tsx`)

- Keep the existing version pickers, auto-swap logic and the +added / −removed / ~changed summary badges.
- Add a **view toggle: "Side by side" | "List"**, defaulting to side-by-side. The existing list view stays intact as the second mode.
- Side-by-side layout: two synchronized columns headed by the selected version labels (`v<semantic> — status`), grouped by section, each field row aligned on the same line:
  - removed → left cell filled/red, right cell shows an empty placeholder
  - added → right cell filled/green, left empty
  - changed → both cells shown with the differing attributes (type, label, required, options, validation, section) listed under each side
  - unchanged rows hidden behind a "Show unchanged fields" toggle
- Reuse the existing `computeDiff` logic; extend its output with the old/new field attribute values needed to render both columns. No change to how versions are read.
- Responsive: columns stack on narrow screens.

### 2. Rollback to a previous version (`VersionHistory.tsx`)

- New **"Rollback"** action on each non-current version row (hidden on the current default and on draft rows), gated with the same `data-rbac="form_management.edit"` marker used by the Compare button.
- Rollback is **forward-only and non-destructive**: it never rewrites or deletes history. Clicking it:
  1. Shows a SweetAlert2 confirmation (matching the existing dialog styling) naming the source version and explaining that a new version will be created from its content and that in-flight applications keep their assigned version.
  2. Creates a new draft version via the existing `useCreateNewFormVersion` using the selected version's `schema_snapshot`, with `change_notes` set to `Rolled back to v<x>`.
  3. Offers an optional checkbox in the confirmation — "Make the restored version the current default immediately" — which, when checked, calls the existing `useActivateVersionAsCurrent` on the new version (same retirement semantics as today). Unchecked leaves it as a draft to publish through the normal flow.
  4. Toast on success/failure and query invalidation (already handled by the hooks).
- If the source version has usage counts, the confirmation surfaces them as an informational note.

## Technical notes

- Frontend-only change; no migration, no RLS or RPC changes. Rollback composes two existing, already-authorised mutations.
- Files touched: `src/components/form-builder/VersionDiffViewer.tsx`, `src/components/form-builder/VersionHistory.tsx`. No changes to `useFormTemplates.ts` unless a small helper is needed to fetch a single version snapshot (it is already available in the `useFormVersions` rows).
- Styling uses existing semantic tokens and shadcn primitives already in these files.
