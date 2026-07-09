## Admin Return Detail — Value column formatting fix

Scope: `src/pages/returns-mgmt/ReturnDetail.tsx` only (admin side). Licensee-side rendering untouched.

### Changes

1. **Numeric formatting in Value column**
   - Current `formatCellValue` only formats values already typed as `number`. Submitted return values arrive as strings from `return_form_data.field_value`, so the "up to 2 decimals" branch never runs.
   - Update the helper to also detect numeric strings (trim, regex `/^-?\d+(\.\d+)?$/`) and format them via `Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` — always 2 decimals as requested.
   - Non-numeric strings render unchanged.

2. **Font size 2px smaller (admin only)**
   - Add `text-xs` (or an inline `style={{ fontSize: '11px' }}` if current is `text-sm`/13px) to the `ReturnDataTable` rows/headers inside this file. Scoped to the admin `ReturnDetail.tsx`; licensee `FillReturnPage` unaffected.

### Out of scope
- No changes to data model, edit-highlighting, revisions, or licensee views.
