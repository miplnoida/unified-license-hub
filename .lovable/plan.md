## Make Sector, Sub-Sector, Category mandatory in Returns Form Builder

Scope: `src/pages/admin/FormBuilder.tsx` only. Applies when `formType === 'returns'`.

### Changes

1. **Labels** (lines ~705, 716, 727): when `formType === 'returns'`, append a red asterisk to the "Sector", "Sub-Sector", "Category" labels.

2. **Save guard** in `handleSave` (around line 422): before proceeding, if `formType === 'returns'`, validate:
   - `selectedSector` is set → else `toast.error('Sector is required for returns forms')` and return.
   - `selectedSubSector` is set → else toast and return.
   - `selectedCategory` is set → else toast and return.

3. **Publish guard**: apply the same 3 checks in the publish handler (around line 516) so a returns form cannot be published without the taxonomy.

No changes to DB, other form types, or unrelated code.