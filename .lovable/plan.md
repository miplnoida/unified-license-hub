## Findings
- For the specific return `RET-2026-00027`, row **1.4** is configured as a calculated field:
  - `1.4 = 1.4.1 + 1.4.2 + 1.4.3`
- The saved backend data currently contains rows `1`, `1.1`, `1.2`, and `1.3`, but **does not contain saved values for `1.4`, `1.4.1`, `1.4.2`, or `1.4.3`**.
- The UI displays calculated fields using `evaluateFormula(...)`, but calculated results are not written back into `formData`, so they are not included when the return is saved/submitted.
- Because the submitted/saved dataset lacks `line_1_4_col_1`, downstream review/validation/audit views can show row 1.4 as missing or zero even if the UI visually calculated it.

## Plan
1. Update `FormRenderer` so calculated fields are included in the merged save/submit payload.
   - Compute every visible calculated field from the current form data.
   - Add the computed value into `getMergedData()` under the calculated field’s `fieldName`.
   - Keep the field itself read-only in the UI.

2. Prevent stale calculated values.
   - Recalculate just before draft save, next/submit actions, and parent `onChange` propagation.
   - Do not rely on users manually touching calculated fields.

3. Add a runtime safety guard for missing calculated dependencies.
   - Missing source fields remain treated as `0`, matching the existing formula evaluator behavior.
   - Invalid formula output remains `Error`, but will not overwrite numeric source fields.

4. Backfill the affected return/form data directly in the backend.
   - For return `RET-2026-00027`, insert/update `line_1_4_col_1` using the configured formula and currently saved child values.
   - Since child rows `1.4.1`, `1.4.2`, and `1.4.3` are also absent, their saved values will be treated as `0` unless the user enters them in the UI.

5. Verify after implementation.
   - Confirm the UI save payload includes `line_1_4_col_1`.
   - Confirm the backend has a `return_form_data` row for `line_1_4_col_1` after saving.