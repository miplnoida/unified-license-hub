## Goal
Fix the admin Return Queue → View page so submitted return data renders as a compact 3-column read-only table (like the supervised-entities historical return view), show entity/year/quarter clearly in the header, and hide the validation-rules section from the right sidebar.

Scope is limited to `src/pages/returns-mgmt/ReturnDetail.tsx` and one small prop addition on the shared right-side panel. No changes to workflow, submission, notifications, ratios, or audit logic.

## Changes

### 1. Header block — clearer entity / year / quarter
In `src/pages/returns-mgmt/ReturnDetail.tsx`, replace the single-line title with an explicit summary using data already loaded by `useReturnById`:

- Entity: `returnData.licensees?.name` (fallback `on_behalf_of_licensees?.name`)
- Return: `returnData.return_configs?.name`
- Year: `returnData.return_year`
- Quarter / Period: `returnData.return_period`
- Keep `unique_id` and `StatusBadge` as-is.

Rendered as a small labelled grid so entity / year / quarter are each visually distinct instead of being concatenated in one muted line.

### 2. Submitted return renders as 3-column table (not textboxes)
Replace `ReadOnlyFormBlock` (which uses `FormRenderer` and shows disabled inputs) with a new `ReturnDataTable` component in the same file:

- Load the same version + sections via `useLatestPublishedVersion` + `useVersionSections` (unchanged pinning behaviour via `pinnedVersionId`).
- Flatten sections → fields, skipping non-data field types (`heading`, `paragraph`).
- For each remaining field, emit one row with columns:
  1. `lineCode` (e.g. `1.1`, `1.2.1`) — falls back to empty string.
  2. `label`.
  3. Entered value from `valuesByForm[form_id][fieldName]`, formatted as read-only text:
     - numbers → `toLocaleString()`;
     - arrays / objects → JSON summary or comma list (multi_select, checkbox);
     - files → filename link if URL is present, otherwise "—";
     - booleans → Yes/No;
     - empty → em-dash.
- Group rows visually by section title (section header row spanning all 3 columns).
- Preserve existing per-form `Reviewer Comments` block underneath the table.
- Tabs, tab labels, active-tab logic, and fallback/submitted-forms merging stay exactly the same.

### 3. Hide "Validation rules" from right sidebar
`ReturnValidationAndRatiosPanel` currently always renders `ValidationResultPanel` + `RatioSummaryCard`.

- Add an optional `hideValidation?: boolean` prop to `src/components/returns/ReturnValidationAndRatiosPanel.tsx`. When true, do not render `ValidationResultPanel`; ratios continue to render.
- Pass `hideValidation` from `ReturnDetail.tsx`.
- Fill/View pages that consume the same panel are untouched (prop defaults to false).

### 4. Untouched
- Approval workflow panel, legacy approve / request-edit actions, activity & history, edit-requests card, comments, notifications, RPCs.
- Licensee-side `ViewReturnPage`, `FillReturnPage`, and `ReturnReviewPanel`.
- Data hooks, DB schema, edge functions.

## Technical notes
- `FormField.lineCode` already exists on the form-builder schema and is populated for prudential return templates (Excel column A import).
- `valuesByForm` is already built from `return_form_data` with JSON reparsing, so no new fetch is required.
- Section flattening reuses the `FormSection`/`FormField` types from `@/types/formBuilder`.

## Files touched
- `src/pages/returns-mgmt/ReturnDetail.tsx` — header rewrite, new `ReturnDataTable`, wire `hideValidation`.
- `src/components/returns/ReturnValidationAndRatiosPanel.tsx` — add optional `hideValidation` prop.
