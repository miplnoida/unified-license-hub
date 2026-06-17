## Goal
Prevent accidental deletion of Sectors, Sub-Sectors, Categories, and Services by requiring an explicit confirmation dialog before the delete call fires.

## Scope
File: `src/pages/admin/MasterConfiguration.tsx` only. No other workflows touched.

## Change
In `handleDelete(entity, id)` (currently lines 102–112), before calling the mutation, show a SweetAlert2 confirmation (matches project standard for destructive actions). Abort if the user cancels.

- Resolve the record name from the matching list (`sectors`/`subSectors`/`categories`/`services`) for a friendly message.
- Title: `Delete {entity-singular}?`
- Body: `"{name}" will be permanently removed. This action cannot be undone.`
- Buttons: `Yes, delete` (destructive color) / `Cancel` (focused by default).
- On confirm, keep existing try/catch + toast logic unchanged.

No changes to mutations, RLS, queries, or other admin pages.

## Verification
Open `/admin/masters/sectors`, `/sub-sectors`, `/categories`, `/services`; click delete; confirm dialog appears; Cancel aborts; Confirm deletes and toasts as before.