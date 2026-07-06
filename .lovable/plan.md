# Show the line-number column everywhere in the import + form flow

## Why the numbers still don't show

The previous change added `lineCode` to `FormField` and rendered it in `SectionManager` and `FormRenderer`, but three code paths still ignore it, so the number column keeps disappearing:

1. **`FileImport.tsx` → `EditableFieldRow`** (the Preview step of the import dialog, ~lines 1574–1598) shows only `field.label`. When users open the "Preview & Edit" step before committing the import, they see just the labels — no line numbers.
2. **`FormBuilder.tsx` → `FieldPreview`** (preview dialog, ~lines 45–51) shows only `field.label`.
3. **DB round-trip loses `lineCode`.** `form_fields` has no `line_code` column, `sectionsToFieldRows` in `useFormTemplates.ts` doesn't write it, and `fieldRowsToSections` doesn't read it. `handleMultiSheetImport` currently writes only `form_versions.schema_snapshot`, which keeps `lineCode` — but the moment the user hits **Save Form** in the builder, `useSaveFormTemplate` normalizes into `form_fields` and drops `lineCode`. On next load, `useVersionSections` prefers the snapshot when present, but any admin who re-saves without a schema snapshot loses it permanently.

## Fix

### 1. Persist `line_code` in the database
- Migration `supabase/migrations/<ts>_add_form_fields_line_code.sql`:
  - `ALTER TABLE public.form_fields ADD COLUMN IF NOT EXISTS line_code text;`
  - No RLS/grant changes (existing policies cover new columns).
- Regenerate types is handled automatically; if `src/integrations/supabase/types.ts` needs a manual bump, we won't touch it — code accesses `line_code` via `as any` where necessary (matches existing patterns for other loose columns in this file).

### 2. `src/hooks/useFormTemplates.ts`
- Add `line_code: string | null` to `FormFieldRow`.
- `sectionsToFieldRows`: include `line_code: f.lineCode || null`.
- `fieldRowsToSections`: set `lineCode: row.line_code || undefined` on the built `FormField`.

### 3. `src/components/form-builder/FileImport.tsx`
- Update `EditableFieldRow`: render a small monospaced `lineCode` chip before the label input:
  ```tsx
  {field.lineCode && (
    <span className="font-mono text-[10px] text-muted-foreground shrink-0 min-w-[3.5rem] text-right">
      {field.lineCode}
    </span>
  )}
  ```
  Position it right after the drag handle, before the label input. No editing UI for `lineCode` yet — it's read-only in preview.

### 4. `src/pages/admin/FormBuilder.tsx`
- `FieldPreview` (~line 45): prepend the same `lineCode` chip to the label so the builder's Preview dialog matches the runtime renderer.

### 5. No changes needed
- `SectionManager` and `FormRenderer` already render `lineCode` — those were done in the previous turn.
- `FileImport.tsx` parser already populates `lineCode` on every field.
- `migrateSectionsToRows` already preserves unknown FormField props via object spread.

## Verification

- Re-import `quarter1-return.xlsx`:
  - Preview & Edit step shows `1.1  LIQUID FUNDS  …`, `1.1.1  NOTES AND COINS - BS  …` etc. with the number in a distinct leading column.
  - After confirming the import, the form list edit view (SectionManager) shows numbers next to each field.
  - The Preview dialog in the builder shows numbers next to each field.
  - Filling the form via `FormRenderer` (licensee portal, admin view-only) shows numbers.
- Save the form once and reload: numbers still show (because `line_code` now round-trips through `form_fields`).
- Non-return forms (no `lineCode`) render exactly as before.

## Files touched

- `supabase/migrations/<timestamp>_add_form_fields_line_code.sql` — one-line ALTER.
- `src/hooks/useFormTemplates.ts` — 3 small edits (row interface + two mappers).
- `src/components/form-builder/FileImport.tsx` — 4-line JSX addition in `EditableFieldRow`.
- `src/pages/admin/FormBuilder.tsx` — 4-line JSX addition in `FieldPreview`.

No RLS, edge function, or renderer changes beyond what's above.
