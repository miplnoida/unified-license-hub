## Scope

Populate return `RET-2026-00027` (Q1 2022, entity: **New FinCorp Commercial Bank Limited**, return id `b100bd21-b90e-4cbf-b59f-20794db3e208`) with values from the uploaded workbook:

- Sheet **New FinCorp CB - BalSheet** → form **Balance Sheet** (`59ebe8fc…`, version `dead2bcf…`)
- Sheet **New FinCorp CB - P&L** → form **P&L** (`7ac713bf…`, version `84869d01…`)

Only column **Q1 2022** (col_1) will be written. Only this one entity. All other entities untouched. Workflow status stays `WIP` (no submission).

## What's already there

- Balance Sheet section **1 ASSETS** is already saved (64 rows, `line_1_*_col_1`). Those rows will be preserved and updated only if the workbook value differs (upsert on `(return_id, form_id, field_id)`).
- Sections **2, 3, 7, 8** of the Balance Sheet are missing → will be inserted.
- Entire **P&L** form is empty → will be inserted.

## Plan

1. **Extract Q1 2022 values from Excel**
   - For each row in both sheets, read column A (line code) and the Q1 2022 column (index 6).
   - Skip rows with no line code or a blank value.

2. **Resolve field mapping via `form_versions.schema_snapshot`**
   - For each form version, flatten every field across sections (including nested `rows[*].fields`) and index by `lineCode` → list of `{ fieldName, label }`.
   - Only use `_col_1` fieldNames (Q1 = period 1).
   - When Excel has duplicate line codes (memoranda block: 8.1, 8.2, 8.8, 8.9, 8.18…), match by row label similarity (case-insensitive substring) to pick the correct dedup suffix (`_b`, `_c`, …).
   - Log any Excel row that can't be mapped and skip it (report at the end).

3. **Upsert into `return_form_data`**
   - Row shape: `return_id`, `form_id`, `form_version_id`, `field_id = fieldName`, `field_name = fieldName`, `field_value` (rounded to 2 decimals as string).
   - Use `ON CONFLICT (return_id, form_id, field_id) DO UPDATE SET field_value = EXCLUDED.field_value, updated_at = now()`.
   - Executed as a single migration so it's reviewable and reversible.

4. **Report**
   - After running, show:
     - Rows inserted / updated per form.
     - Any Excel line codes that couldn't be mapped to a schema field (so the user can confirm they're intentional gaps like the 8.1 memoranda dedup).

## Out of scope

- No changes to any other licensee, return, form, or workflow config.
- No submission — return remains `WIP` for the user to review and submit in the UI.
- No changes to the form schemas or calculated-field logic (already fixed in the previous turn).

## Technical notes

- Executed via one `supabase--migration` call using inline JSON of the extracted `{fieldName: value}` map (built in Python from the workbook, then embedded in the SQL as a `jsonb` literal). SQL unpacks it with `jsonb_each_text` and upserts.
- Data types: values stored as text (matches existing column and existing 1.x rows).
