## Scope

Add a clean, reusable **versioned document upload** capability for the Form Management module (form renderer file fields, form builder attachments, registration supporting documents, and the generic DocumentUpload component). Built on the existing `secure-documents` bucket and `file_uploads` table. No changes to registration approval workflow, notifications, or emails.

## Goals

- Accept PDF, DOCX, XLSX, and images (jpg/png/webp), validated per-file.
- Persist metadata: file name, size, uploader, upload date, MIME, extension, document type.
- Maintain **multiple versions of the same document** with full history and action logs.
- Allow batch upload in a single operation with per-file success/failure reporting.
- Reuse existing security model: private bucket, RLS, signed URLs, no service-role on client.

## Architecture

### 1. Storage (no bucket changes)

Keep using the existing private `secure-documents` bucket. New object path convention for versioned form-management uploads:

```text
form-management/{entityType}/{entityId}/{documentType}/{documentGroupId}/v{version}/{timestamp}-{safeFileName}
```

- `documentGroupId` is the stable identifier shared by all versions of the same logical document.
- `version` is a monotonically increasing integer per group.
- Legacy paths (`{userId}/form-field/...`, `{userId}/{entityType}/...`) keep working — new code only writes to the new path.

### 2. Database

Two new tables in `public` (with grants + RLS + service_role), reusing `file_uploads` for the underlying physical file row.

**`document_groups`** — one row per logical document.
- `id`, `entity_type`, `entity_id`, `document_type`, `display_name`, `owner_id`, `current_version_id` (FK → `document_versions`), `created_at`, `updated_at`.

**`document_versions`** — one row per uploaded version.
- `id`, `group_id` (FK), `version` (int), `file_upload_id` (FK → `file_uploads.id`), `uploaded_by`, `change_note`, `created_at`.
- Unique `(group_id, version)`.

**`document_action_logs`** — append-only history.
- `id`, `group_id`, `version_id` (nullable), `actor_id`, `action` (`upload` | `new_version` | `replace` | `delete` | `restore` | `download`), `details` jsonb, `created_at`.

**RLS**
- Group/version read: owner OR internal staff (`super_admin`, `admin`, `supervisor`, `licensing_officer`, `analyst`) OR users with access to the parent `entity_type/entity_id` via existing helpers (e.g. `entity_user_access`).
- Insert/update: owner of the group, or staff. New version inserts must reference an existing group the user can write to.
- Action logs: insert via SECURITY DEFINER RPC (`log_document_action`) so the row is always attributed to `auth.uid()`.

Per project rules, every `CREATE TABLE public.x` is followed by `GRANT ... TO authenticated; GRANT ALL ... TO service_role;` then `ENABLE RLS` then policies.

### 3. Service layer — `src/lib/documentVersioning.ts` (new)

Single entry point for versioned uploads. Wraps `secureFileUpload` for the physical write and the new tables for metadata.

```ts
uploadNewDocument({ file, entityType, entityId, documentType, displayName?, changeNote? })
  -> { success, groupId, versionId, version, fileUploadId } | { success: false, error }

uploadNewVersion({ groupId, file, changeNote? })
  -> same shape; increments version atomically (RPC `create_document_version`)

batchUploadDocuments({ entityType, entityId, items: Array<{file, documentType, displayName?, groupId?}> })
  -> { results: Array<{ file: string, success: boolean, version?: number, error?: string }> }

listDocumentVersions(groupId) -> versions + uploader profile + action logs
getVersionSignedUrl(versionId) -> 5-min signed URL (logs `download` action)
deleteVersion(versionId) / restoreVersion(versionId) (soft via action log; physical file kept)
```

Per-file validation runs through existing `validateFile()` so MIME/extension/size rules stay consistent. Batch upload validates each file individually and never aborts the whole batch on a single failure.

Atomicity for `uploadNewVersion`: use a SECURITY DEFINER RPC `create_document_version(_group_id, _file_upload_id, _change_note)` that:
1. Locks the group row.
2. Computes `next_version = coalesce(max(version),0)+1`.
3. Inserts `document_versions` + updates `current_version_id`.
4. Inserts a `document_action_logs` row.
5. Returns `(version_id, version)`.

### 4. UI components (new, under `src/components/documents/versioned/`)

- **`VersionedDocumentUploader`** — replaces single-file `DocumentUpload` for new flows. Staged-files list (reusing UX from existing `DocumentUpload.tsx`), per-file inline status (Pending / Uploading / Success / Failed + error), "Add more / Upload N files" actions, drag-and-drop. Props: `entityType`, `entityId`, `documentType` (or selector), `onUploaded`.
- **`DocumentGroupList`** — replaces `DocumentList` for new flows. Groups files by `documentGroupId`, shows current version with badges (`v3`, size, uploader, date), expandable history.
- **`DocumentVersionHistoryDialog`** — full version timeline: each version with uploader, date, change note, download, "Make current", plus the action log feed.
- **`DocumentTypeSelect`** — small shadcn `<Select>` driven by a `master_data_items` document-type list (with `'other'` free-text fallback per project Select rules; no empty `""` values).

### 5. Integration points (minimal, opt-in)

Wire the new uploader into Form Management surfaces without breaking existing behaviour:

- **Form renderer file fields** (`src/components/form-renderer/FormRenderer.tsx`): when a field is marked `versioned: true` in its config, route through `documentVersioning` instead of `uploadFormFile`. Default fields keep `uploadFormFile` for back-compat.
- **Form builder** field properties: add a "Enable versioning" toggle + "Document type" picker for file fields.
- **Registration `DocumentsStep`**: swap its uploader for `VersionedDocumentUploader` scoped to `entity_type='registration'`, `entity_id=registrationId`. Each step-required document gets a fixed `documentType` so re-uploads create new versions instead of duplicates. No change to the approval workflow, submission gating, or emails.
- **Existing generic `DocumentUpload` / `DocumentList`**: leave in place; mark as legacy in comments. New screens use the versioned components.

### 6. Action logging & audit

Every meaningful action (`upload`, `new_version`, `replace`, `delete`, `restore`, `download`) writes a `document_action_logs` row via the SECURITY DEFINER RPC. The existing global audit (`log_self_audit`) is also called for `upload` and `new_version` so the global audit trail stays complete.

### 7. Non-goals (out of scope, do not touch)

- Registration approval workflow, reviewer remarks, notifications, or emails.
- The `documents` legacy table (read-only merge in `DocumentList` stays as-is).
- Bucket policy / public access — bucket remains private.
- Service-role exposure on the client.

## Verification

1. Migration applies cleanly; `supabase--linter` clean.
2. Unit tests:
   - `documentVersioning.batchUpload` returns per-file results, including mixed success/failure.
   - `create_document_version` RPC increments monotonically under concurrent inserts (simulated).
   - RLS: a non-owner cannot read another user's group/versions; staff can.
3. Manual smoke in preview:
   - Upload 3 mixed files (PDF + DOCX + bad .exe) in one batch → 2 success, 1 failure reported inline.
   - Re-upload same logical document → new version appears, history shows v1 + v2 with uploader/date/change note.
   - Download from history → signed URL works, action log gets a `download` row.
   - Registration documents step → uploads persist, versions visible, no impact on approval flow.

## Files changed (planned)

- New: `supabase/migrations/<timestamp>_document_versioning.sql`
- New: `src/lib/documentVersioning.ts`
- New: `src/components/documents/versioned/VersionedDocumentUploader.tsx`
- New: `src/components/documents/versioned/DocumentGroupList.tsx`
- New: `src/components/documents/versioned/DocumentVersionHistoryDialog.tsx`
- New: `src/components/documents/versioned/DocumentTypeSelect.tsx`
- New: `src/test/documentVersioning.test.ts`
- Edited: `src/components/form-renderer/FormRenderer.tsx` (opt-in versioned path)
- Edited: `src/components/registration/DocumentsStep.tsx` (swap uploader, same data contract)
- Edited: `src/components/form-builder/FieldProperties.tsx` (versioning toggle + document type)
- Edited: `docs/FEATURE_DEVELOPMENT_TRACKER.md` (note the new capability)
