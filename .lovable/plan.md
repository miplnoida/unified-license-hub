## Problem

In the licensee/admin panel, some attachments in Registration and Application form submissions show a `v1` badge and history, others show none. `AttachmentDisplay` derives the badge from `groupId` / `versionId` / `version` stored on the file object in the form data — attachments without those fields render without a version chip and have no History action.

Root cause: two upload paths bypass the versioned document system (`document_groups` + `document_versions`) and only write a raw `file_uploads` (or storage-only) row:

1. **`src/components/registration/RegistrationStepRenderer.tsx` → `handleFileSelect`**  
   Used by `PreLicenseeRegistration` (config-driven registration form). Uploads directly to the `secure-documents` bucket and stores just `{ name, path, size, type }` in the form value. No group/version row is created.
2. **`src/components/form-renderer/FormRenderer.tsx` legacy branch (`uploadFormFile` in `src/lib/formFileUpload.ts`)**  
   Runs whenever `FormRenderer` is used **without** a `formId` prop. `RegistrationFormFill.tsx` currently passes `formName` / `sections` but not `formId`, so all its file fields go through the legacy path. Same for any other renderer callsite that omits `formId`.

Applications go through the versioned path already (`ApplicationForms`, `NewApplication`, `PostLicenseApplicationForms` all pass `formId`), so their newer uploads get versions — but any older ones and any registration uploads do not, which matches the "not showing for all uploaded files" report.

## Fix

Route both upload paths through the same helper the versioned FormRenderer branch uses: `uploadVersionedDocument` (from `src/lib/documentVersioning.ts`). That helper creates/updates the `document_groups` row, allocates a version number, and returns `{ groupId, versionId, version, fileUploadId }`, which we persist in the form field value alongside the existing `{ name, path, size, type }`. `AttachmentDisplay` already reads those keys (`groupId`, `versionId`, `version`) — no viewer change needed.

### Changes

1. **`src/components/registration/RegistrationStepRenderer.tsx`**
   - In `handleFileSelect`, replace the raw `supabase.storage.from('secure-documents').upload(...)` for the non-signature branch with a call to `uploadVersionedDocument({ file, userId, entityType: 'registration', entityId: <registrationId or null>, documentType: field.name/id, documentLabel: field.label, displayName: file.name, formId: <registration form config id>, fieldId: field.id, groupId: existing?.groupId })`.
   - Persist the resolved metadata back into the form value:
     ```ts
     onChange({
       name: file.name,
       path: resolvedFilePath,       // from file_uploads.file_path
       size: file.size,
       type: file.type,
       groupId, versionId, version, uploadId,
     });
     ```
   - Keep the existing signature-upload branch (`imageOnly`) untouched — signatures are not user documents and do not need versioning.
   - Thread the required context (`userId`, `registrationId`, `formConfigId`, `fieldId`) into `RegistrationStepRenderer` via new optional props from its callers, defaulting to `null` where not available.

2. **`src/pages/registration/PreLicenseeRegistration.tsx`**
   - Pass the active `registration_form_configs.id` and the current registration draft id (if any) down to `RegistrationStepRenderer` so the versioned upload has stable entity/form identifiers.

3. **`src/pages/registration/RegistrationFormFill.tsx`**
   - Pass `formId={formId}` and `entityType="registration"` / `entityId={resolvedSubmissionId}` to `<FormRenderer …>` so its versioned branch (already implemented) takes over. No renderer code changes needed — it already handles this branch.

4. **`src/lib/formFileUpload.ts` (defensive)**
   - Leave the function in place for legacy callers, but update the two `FormRenderer` callsites (`handleFileUpload` fallback and the second `uploadFormFile` inside the repeatable-group renderer around line 1118) to prefer `uploadVersionedDocument` when a `formId` prop is available, and only fall back to `uploadFormFile` when it is not (e.g. `FormPreview`).

### Not in scope

- No DB schema changes. `document_groups`, `document_versions`, `file_uploads` and their GRANTs/RLS already exist.
- No changes to `AttachmentDisplay` — it already reads the version fields and gracefully hides the badge when they're absent.
- No backfill of previously uploaded (non-versioned) files. Only new uploads will start showing versions. If a backfill is desired later, it can be a follow-up migration that wraps existing `file_uploads` rows (entity_type in ('registration','form_field')) into `document_groups`/`document_versions` v1 rows.
- No change to the versioned uploader used by Applications — it already works.

### Verification

- Upload a document in a Registration form (Pre-licensee flow and Registration form-fill flow): the value stored in the form data should contain `groupId`, `versionId`, `version = 1`; the admin/licensee review view should show a `v1` badge and a working History dialog.
- Re-upload the same field: version should become `v2` on the same group, with `v1` still visible via History.
- Application form uploads: unchanged, keep showing versions as today.
- Signature image upload in registration: still works, still un-versioned (by design).
