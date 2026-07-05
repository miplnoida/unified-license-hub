## Remove restrictive RLS policies on `file_uploads`

### Change
Drop the three RESTRICTIVE policies on `public.file_uploads` so uploads are governed purely by the existing permissive policies:

- `external_file_uploads_insert_capability_gate` (RESTRICTIVE, INSERT)
- `external_file_uploads_update_capability_gate` (RESTRICTIVE, UPDATE)
- `external_file_uploads_delete_capability_gate` (RESTRICTIVE, DELETE)

### Why this fixes the reported bug
The INSERT restrictive policy required `external_can_upload_document_ref(...)` to return true for external users. That function has no branch for `entity_type = 'form_field' | 'registration' | 'document_version'`, so every registration and new-application file upload was denied with:

> new row violates row-level security policy "external_file_uploads_insert_capability_gate" for table "file_uploads"

Removing the restrictive gates lets the permissive policies decide access again.

### Remaining protection after the change
- INSERT: `Users insert uploads` — `auth.uid() = uploaded_by` (authenticated); `Allow anon registration file_uploads insert` — anon can only insert with `entity_type in ('registration','form_field','document_version')`.
- SELECT: `Users read own uploads` (owner + admin/super_admin/supervisor) and the permissive `external_file_uploads_select_capability_gate` (adds capability-based reads for external users).
- UPDATE/DELETE: `Admins update uploads` / `Admins delete uploads` — owner or admin/super_admin only.

External users can no longer read/write arbitrary rows: writes still require `uploaded_by = auth.uid()`, and reads still require ownership or admin role.

### Migration
One migration:

```sql
DROP POLICY IF EXISTS external_file_uploads_insert_capability_gate ON public.file_uploads;
DROP POLICY IF EXISTS external_file_uploads_update_capability_gate ON public.file_uploads;
DROP POLICY IF EXISTS external_file_uploads_delete_capability_gate ON public.file_uploads;
```

The permissive `external_file_uploads_select_capability_gate` stays — it broadens SELECT for external users with the right capability and is not the source of the error.

### Out of scope
- No changes to `external_can_upload_document_ref` or any other function.
- No frontend changes.
- No changes to other tables' capability gates.
