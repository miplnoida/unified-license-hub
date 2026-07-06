# Split line number and label into separate columns on import

## Why this is happening

In `src/components/form-builder/FileImport.tsx` → `parseLineItemReturnSheet` (around lines 825, 835–837), every generated field's `label` is built by concatenating the line number and the label from column B:

```ts
openSection(`${lineNum} ${label}`);
// ...
const fieldLabel = layout.columnHeaders.length === 1
  ? `${lineNum} ${label}`
  : `${lineNum} ${label} — ${layout.columnHeaders[ci]}`;
```

The `FormField` model (`src/types/formBuilder.ts`) has only a single `label` string, so both pieces get flattened into one column when the form is rendered. Nothing preserves column A separately, which is why the imported form shows `"1.1 LIQUID FUNDS"` in one cell instead of `1.1 | LIQUID FUNDS | value` like your Excel screenshot.

## Fix

Keep the line number as a distinct piece of data and render it as its own column in front of the label — no schema/DB changes, purely presentational.

### 1. `src/types/formBuilder.ts`
Add one optional field:
```ts
// Optional hierarchical code shown as a leading column (e.g. "1.1.2.1" for
// prudential return line items). Imported from Excel column A.
lineCode?: string;
```

### 2. `src/components/form-builder/FileImport.tsx` (`parseLineItemReturnSheet`)
- Set `lineCode: lineNum` on every generated field.
- Change `label` to the pure column-B text (no `${lineNum}` prefix). For multi-column returns keep the period suffix, e.g. `` `${label} — ${columnHeaders[ci]}` ``.
- Section titles: keep `${lineNum} ${label}` (sections are single headings, so combined is fine and helps navigation), OR alternatively store the section's own `lineCode` on the first child — sections stay as today to avoid touching `FormSection`.
- `fieldName` generation stays identical (`line_{dotted}_col_{n}`) so existing form-field dependencies and formula resolution keep working.

### 3. Renderer: show `lineCode` as a leading column
In the form renderer used for filled-in returns (`src/components/form-renderer/FormRenderer.tsx` and the field row component it uses), when a field has `lineCode`:
- Render a small monospaced left-aligned cell with the code, then the label, then the input — mirroring the Excel layout in the screenshot.
- When `lineCode` is absent, render the current layout unchanged so all other forms are untouched.
- Read-only preview (`FormTemplateView`) uses the same renderer, so it benefits automatically.

### 4. Form builder canvas (admin edit view)
Where the builder lists fields inside a section, prefix the field row with `lineCode` (dim/monospace) when present, so admins editing an imported return see the same 3-column shape. No editing UI added for `lineCode` in this pass — it's populated only by the importer.

## Verification

- Re-import `quarter1-return.xlsx`. Expect:
  - Section `1 ASSETS - BS`
  - Fields inside show `1.1  LIQUID FUNDS  [value]`, `1.1.1  NOTES AND COINS - BS  [value]`, etc., in three visible columns matching the screenshot.
- Non-return forms (no `lineCode`) render exactly as before — regression-free.
- Existing imported returns without `lineCode` still render correctly (property is optional).
- Formulas still resolve: `fieldName` scheme unchanged, `calculatedExpression` untouched.

## Files touched

- `src/types/formBuilder.ts` — add optional `lineCode`.
- `src/components/form-builder/FileImport.tsx` — populate `lineCode`, stop prefixing `label`.
- `src/components/form-renderer/FormRenderer.tsx` (and the small field-row component it uses) — render leading code column when present.
- Form builder field-row component under `src/components/form-builder/` — show `lineCode` prefix in the admin canvas.

No DB migrations, RLS changes, or edge function changes.
