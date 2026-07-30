## What's actually wrong (verified)

**1. "Show unchanged" never has anything to show.**
`computeDiff` in `VersionDiffViewer.tsx` pairs fields between two versions by `field.id`. But `useCreateNewFormVersion` (`useFormTemplates.ts`, line ~892) regenerates a fresh `crypto.randomUUID()` for every field when a new version is created. So no field ID ever matches across versions: every field is reported as *removed* on the left and *added* on the right, the `unchanged` (and `changed`) count is always 0, and the toggle looks broken. The same bug also means the side-by-side columns never line up a field with its counterpart.

**2. Rollback is rendered, but nearly invisible and over-restricted.**
The action exists in `VersionHistory.tsx` (lines 323–334) as an unlabeled ghost icon (`Undo2`) sitting among four other icon buttons, and it is hidden whenever `v.status === 'draft'` or the row is the current default. On templates whose only other versions are drafts, no Rollback button appears at all.

## Changes

### A. Diff pairing — `src/components/form-builder/VersionDiffViewer.tsx`
- Pair fields by a stable identity instead of `id`: primary key `fieldName` (falling back to `section::label` when `fieldName` is blank, and finally to `id`). Keep section grouping as today.
- With real pairing, `changed` / `unchanged` classification and the existing `changedKeys` highlighting start producing results, so "Show unchanged" and the side-by-side alignment both work with no further UI change.
- Also treat a field that moved between sections as *changed* (already handled once pairing works), and keep section add/remove entries as-is.
- Add a small note under the stats row when the two versions share no field names at all, so a genuinely total rewrite still reads clearly.

### B. Rollback affordance — `src/components/form-builder/VersionHistory.tsx`
- Replace the icon-only button with a visible labelled button: `Undo2` icon + "Rollback", `variant="outline"`, same handler.
- Show it on **every version row that is not the current default**, including drafts (a draft's snapshot is a valid source to copy from). Still hidden on the current default row, since rolling back to the current version is a no-op.
- Keep the existing confirmation dialog, usage-count note, the "Make the restored version the current default immediately" checkbox, and the existing non-destructive behaviour (creates a new version; nothing is deleted).

## Technical notes
- Frontend-only. No migration, no RPC, no RLS change. Rollback keeps composing the already-authorised `useCreateNewFormVersion` + `useActivateVersionAsCurrent` mutations.
- Files touched: `src/components/form-builder/VersionDiffViewer.tsx`, `src/components/form-builder/VersionHistory.tsx`.
