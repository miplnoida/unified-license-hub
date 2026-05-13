# Form Builder: Row-Based Layout Refactor

Make rows the single source of truth for layout in Add/Edit Form, Preview, and Published rendering — same model as the Register Form. Stop relying on flat `fields[]` + `colSpan/newRow` for layout.

## Data model

Add an explicit row container on each section:

```ts
// src/types/formBuilder.ts
interface FormSection {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  isRepeatable: boolean;
  rows: FormRow[];                // NEW: source of truth
  fields: FormField[];            // KEPT: derived flat list (for queries/validation/conditional)
  conditionalLogic?: ConditionalRule[];
}

interface FormRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  fields: (FormField | null)[];   // length === columns
}
```

Invariant: `section.fields = section.rows.flatMap(r => r.fields).filter(Boolean)`. Maintained by a single helper `syncSectionFields(section)` called after every row mutation.

## Migration (one-time, on load)

Helper `migrateSectionsToRows(sections)`:
- If `section.rows` is a non-empty array → use as-is.
- Else build from legacy flat `fields[]`: pack into rows of `columns: 1` (one field per row). For backward compatibility, if a field has `colSpan/newRow`, keep them but ignore at render time (rows now drive layout).
- Always call when hydrating from `useFormFields` / `schema_snapshot` / legacy `forms.rows` JSON.

## Persistence

- Snapshot path (`form_versions.schema_snapshot`) already stores `FormSection[]` → automatically carries `rows` once added. No DB migration needed.
- Loader `useVersionSections`: prefer `schema_snapshot` when it contains `rows` on any section; otherwise build sections from normalized `form_fields` then `migrateSectionsToRows`.
- `sectionsToFieldRows` (normalized save) keeps writing the flat `fields[]` for query/validation use; row layout lives in the snapshot.
- Save flow in `FormBuilder.handleSave` already saves `schema_snapshot` and legacy `forms.rows` — no change needed besides ensuring `sections` carries `rows`.

## Builder UI — `SectionManager.tsx`

Replace flat field list inside each section with a row list:

- "Add Row" button with column-count picker (1 / 2 / 3 / 4).
- Each row renders as a horizontal grid of N slots (`grid-template-columns: repeat(N, 1fr)`).
- Slot states:
  - Empty → "+ Add Field" popover (existing field-type list).
  - Filled → existing field card (label, type icon, required badge, duplicate, delete) — clicking selects it for the right-side properties panel.
- Row actions: change column count (preserve fields up to new count, append `null` slots when growing, drop overflow with confirm when shrinking), duplicate row, delete row, drag-reorder rows.
- Field drag: allow moving a field between slots/rows in the same section.
- "Add Field" from the left palette appends to the last row if it has an empty slot, otherwise creates a new 1-col row.
- After every mutation, call `syncSectionFields` so `section.fields` stays consistent for the right-panel `allFields` and conditional logic.

## Renderer — `FormRenderer.tsx`

Replace the current 4-col grid + colSpan/newRow logic with a per-row grid:

```tsx
{section.rows.map(row => (
  <div
    key={row.id}
    className="grid gap-4"
    style={{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }}
  >
    {row.fields.map((f, i) =>
      f ? <FieldRenderer key={f.id} field={f} ... /> : <div key={i} />
    )}
  </div>
))}
```

- Keep `getAllFields(section)` helper for validation / conditional / progress / file handling — it returns `section.fields` (the synced flat list).
- Remove `getFieldSpanClass` usage from layout (kept only as no-op fallback for any legacy renderer that still references it).
- Mobile: each slot collapses to full width (single column) under `md`.

## Builder Preview Dialog — `FormBuilder.tsx`

Replace the inline 4-col grid in the preview dialog with the same row renderer pattern (or just reuse `<FormRenderer readOnly />` with current `sections`).

## Edge cases

- Sections with zero rows → show "Add Row" empty state.
- Deleting the last field in a row keeps the (empty) row; user removes the row explicitly.
- Duplicating a section deep-clones rows + fields with new IDs.
- Historical versions (`schema_snapshot` without `rows`) auto-migrate at load and re-save into row form on next save.

## Out of scope / untouched

- Register Form builder + renderer (`src/components/registration-builder/*`, `src/components/registration/*`) — unchanged.
- Form versioning, publish, status flow, payment, reapplication — unchanged.
- DB schema — no migration; rows ride in `schema_snapshot` JSON.

## Files to change

- `src/types/formBuilder.ts` — add `rows` to `FormSection`, keep `FormRow`.
- `src/components/form-builder/SectionManager.tsx` — row-based UI.
- `src/components/form-renderer/FormRenderer.tsx` — row-based render + `syncSectionFields` on incoming sections.
- `src/pages/admin/FormBuilder.tsx` — row-aware add-from-palette, delete/duplicate, preview dialog uses row renderer.
- `src/hooks/useFormTemplates.ts` — `useVersionSections` & `fieldRowsToSections` paths run `migrateSectionsToRows`; `sectionsToFieldRows` stays compatible (rows live in snapshot).
- (new) small helper module `src/lib/formRows.ts` — `migrateSectionsToRows`, `syncSectionFields`, `resizeRow`.

## Test matrix

Manually verify in builder, preview dialog, `/preview/:versionId`, and live application form:
1. New form → add row 1col, 2col, 3col, 4col → fields render in correct grid in builder, preview, and live form.
2. Save → reopen edit → row layout restored exactly.
3. Old form with only flat fields → opens with each field on its own 1-col row; saving persists new row layout.
4. Resize row 2 → 4 (preserves 2 fields, adds 2 empty slots) and 4 → 2 (with confirm; trims overflow).
5. Mixed sections with multiple rows + repeatable section still works.
6. Submission save/submit on live form unchanged (uses synced `section.fields`).
