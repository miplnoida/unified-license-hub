## Goal
In the Fee Management edit modal, ensure the Category and Services dropdowns appear and behave exactly like in the Add Fee modal.

## Root cause
`openEdit` (FeeManagement.tsx lines 218–238) derives `feeScope` from `fee.service_id ? 'services' : fee.form_id ? 'form' : 'category'`. Two failure modes hide the relevant dropdown when editing:

1. **State-set order race.** `setSectorId`, `setSubSectorId`, `setCategoryId`, `setServiceIds`, `setFormIds`, `setFeeScope`, and `setDialogOpen(true)` are queued together. On open, the `feeScope === 'category'` branch may render before `subSectorId` is committed, so the Category Select renders `disabled` ("Select sub-sector first") and the value never displays. Same for Services (filtered to empty by sector/sub-sector mismatch on first paint).
2. **Legacy rows with multiple scope columns.** Older rows wrote both `category_id` and `service_id` (or `form_id`) on the same row. Current derivation only honors one, hiding the other dropdown the admin needs to see/edit.

## Fix (single file: `src/pages/admin/FeeManagement.tsx`)

1. **Rewrite `openEdit`** to seed state in a stable order using functional updates and to pick scope with explicit fallback:
   - Compute `scope` as: `form_id → 'form'`, else `service_id → 'services'`, else `'category'` (default even if `category_id` is null, so the Category dropdown is always visible by default in edit).
   - Set sector/sub-sector first, then scope, then the scope-specific value (`categoryId` / `serviceIds` / `formIds`). Wrap the dialog open in a `queueMicrotask`/`setTimeout(…,0)` so the derived `filteredCategories` / `filteredServices` memos recompute against the freshly-set `subSectorId` before the dialog paints.

2. **Make the Category and Services dropdowns render regardless of `subSectorId`** in the dialog (lines 545–571):
   - Drop the `disabled={!subSectorId}` guard on the Category Select; when `subSectorId` is empty, show all categories for the active regulator. Keep the placeholder helpful ("Select a category").
   - Mirror for Services: when sector/sub-sector are empty, show the full services list for the active regulator instead of an empty filtered list.
   - `filteredCategories` and `filteredServices` (lines 406–407) updated to fall back to the unfiltered list when scope filters are empty.

3. **Preserve legacy multi-column rows on save**: in the update branch (line 345), when editing, always persist `category_id`, `service_id`, `form_id` from current state (null when not in scope) so switching scope in edit cleanly clears the unused columns instead of leaving stale values.

## Out of scope
- No changes to Add modal layout, validation rules, fee-type/amount logic, rules tab, fee types tab.
- No backend / resolver / migration changes.
- Earlier renewal-fee resolver fix (`applicationFeeBreakdown.ts`, `LicenseDetail.tsx`) stays as is.

## Verification
- Open an existing fee row with `category_id` only → Edit modal opens with scope=Category and the Category dropdown showing the saved value.
- Open a row with `service_id` only → scope=Services, Services multi-select shows the saved service.
- Open a row with `form_id` → scope=Form, Form multi-select populated.
- Switching scope inside the edit modal reveals the corresponding dropdown immediately, matching Add modal behavior.
