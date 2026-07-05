## Add Edit support to Prudential Risk Taxonomy

Currently `src/pages/prudential/PrudentialTaxonomyAdmin.tsx` only supports creating a new category and deactivating an existing one. There is no way to edit code, label, description, sort order, or reactivate a deactivated category.

### Changes

1. **Reuse the existing dialog for both Create and Edit**
   - Convert the current "New category" dialog into a shared form dialog that supports two modes: create (empty form) and edit (prefilled from selected row).
   - Pass the row's `id` through to `useUpsertTaxonomy` so it performs an update instead of an insert.

2. **Add an Actions column with Edit**
   - Add an "Edit" button (pencil icon) on each row that opens the dialog prefilled with that row's values.
   - Keep the existing Deactivate button next to it.
   - For rows where `is_active === false`, show a "Reactivate" button instead of "Deactivate" (sets `is_active: true` via the same upsert).

3. **Form fields in edit mode**
   - Code, Label, Description, Sort order (same fields as create).
   - Also expose an "Active" toggle so admins can activate/deactivate directly from the edit dialog.

4. **No backend / schema / permission changes**
   - `useUpsertTaxonomy` already handles both insert and update paths, so no hook or migration work is needed.
   - Purely a UI change scoped to `PrudentialTaxonomyAdmin.tsx`.

### Verification

- Open `/admin/prudential-taxonomy`, click Edit on a row, change the label, save, and confirm the row updates in place.
- Confirm Deactivate still works and that deactivated rows show a Reactivate button.
