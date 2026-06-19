# Fee Management – Scope Selector for Add/Edit Fee

## Goal
In the Add/Edit Fee dialog (`src/pages/admin/FeeManagement.tsx`), replace the always-visible Category + Services + Form fields with a single **Fee Scope** dropdown that controls which field is shown, and make that field mandatory. Sector and Sub-Sector remain as base filters (needed to scope the dependent dropdowns).

## UI changes (dialog only)

1. **New "Fee Scope" dropdown** (required), placed above Sector/Sub-Sector:
   - `Category`
   - `Services`
   - `Individual Form`

2. **Conditional fields** based on Fee Scope:
   - **Category selected** → show Sector → Sub-Sector → **Category** (Category is mandatory). Services and Form fields are hidden.
   - **Services selected** → show Sector → Sub-Sector → **Services** multi-select (mandatory, at least 1). Category and Form fields are hidden.
   - **Individual Form selected** → show Sector → Sub-Sector → **Form** multi-select listing all forms matching the selected sector/sub-sector (mandatory, at least 1). Category and Services hidden.

3. **Reset behavior**: switching the scope clears the now-hidden fields (`categoryId`, `serviceIds`, `formIds`) so stale values are not saved.

4. **Edit mode prefill**: when opening an existing fee, infer the scope from the saved record:
   - `service_id` present → `Services`
   - `form_id` present (and no service) → `Individual Form`
   - else → `Category`

## Validation (in `handleSave`)
Add scope-specific guards before the existing `validateRows()` check:
- Scope = Category → require `categoryId`.
- Scope = Services → require `serviceIds.length > 0`.
- Scope = Individual Form → require `formIds.length > 0`.
Show a `toast.error` on failure. Persisted payload stays the same shape; hidden dimensions are saved as `null` (preserving existing row-expansion logic).

## Out of scope (do not change)
- Fee rules dialog, fee types table, list table, save/expand logic for rows, RLS, DB schema.
- Sector/Sub-Sector cascading behavior and the rest of the page.

## Files touched
- `src/pages/admin/FeeManagement.tsx` – add `feeScope` state, conditional rendering in the dialog, scope-based reset in `resetForm`/`openEdit`, and scope validation in `handleSave`.

## Verification
- Open Add Fee: Fee Scope defaults to Category; only Category field appears; submit blocked until a category is chosen.
- Switch to Services: Category disappears, Services multi-select appears and is required.
- Switch to Individual Form: Services disappears, Form multi-select shows forms filtered by sector/sub-sector and is required.
- Edit an existing fee created with a service / form / category – dialog opens with the correct scope preselected and the right field visible.
