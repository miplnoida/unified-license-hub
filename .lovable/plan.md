# Fix "View document" in Submitted Forms tab

## What's wrong

In Application Detail → Submitted Forms, the eye ("view") button on uploaded documents does nothing — no dialog, no error.

Confirmed cause: the file values saved inside submitted form data carry an empty `filePath` and empty `url`, and only keep `groupId` / `uploadId` / `versionId`. The preview handler only opens a document when `filePath` or `url` is present, so it silently returns. Example stored value from the database:

```text
{ name: "form1.png", filePath: "", url: "", version: 1,
  groupId: "9c06...", uploadId: "0b58...", versionId: "0b58..." }
```

The real storage location lives in the document version record (`document_versions.storage_path`), keyed by that same version id — verified for two sample documents.

## Fix

1. Resolve the storage path before previewing, in this order:
   - existing `filePath` (older records still have it),
   - `document_versions.storage_path` looked up by `versionId` / `uploadId`,
   - current version of the document group when only `groupId` exists,
   - fall back to `file_uploads.file_path` by `uploadId`,
   - existing `url` as last resort.
2. Create a fresh signed URL for the resolved path and open the existing preview dialog.
3. Show a clear error toast when no path can be resolved or the signed URL fails, instead of silently doing nothing (this is what made it look "broken").
4. Add a small spinner state on the view button while resolving, so the click gives feedback.

Applies to single-file fields, multi-file lists, and file cells inside repeatable/table sections — all of which use the same preview handler.

## Technical notes

- Edit: `src/components/form-renderer/FormRenderer.tsx` (`handleFilePreview`) and a new resolver helper in `src/lib/formFileUpload.ts` (e.g. `resolveFormFileStoragePath`).
- Bucket stays `secure-documents`; signed URL TTL stays 300s.
- Read-only change to viewing logic — no changes to upload paths or stored form data.
- If a resolved document still fails to open for internal reviewers, that would point to storage/read policy scope rather than this UI path; I'll verify with an admin-side check after the fix and report back before touching any policy.
