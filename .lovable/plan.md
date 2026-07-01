## Change
Hide (but do not remove) the **Reusable** column in the Form Management tables.

## Files
- `src/pages/admin/PostLicenseForms.tsx` — comment out the `<TableHead>Reusable</TableHead>` header and its matching `<TableCell>` cell; reduce the empty-state `colSpan` from 8 to 7.
- `src/pages/admin/PreLicenseForms.tsx` (if it has the same column) — apply the identical change.

No data, hook, or type changes. The `is_reusable` field remains fully intact in the database, queries, form-create flow, and TypeScript types, so it can be restored by uncommenting.
