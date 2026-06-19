# Fix: "Preview not available" on Review Application attachments

## Problem
On Review Application (and other read-only review surfaces), clicking the eye icon on an uploaded image/file shows the toast **"Preview not available"** instead of opening the file.

## Root Cause
Form file uploads (`src/lib/formFileUpload.ts`) persist attachment metadata using the camelCase key **`filePath`** plus a short-lived signed `url` (5 min TTL).

The attachment normalizer in `src/components/registration/AttachmentDisplay.tsx` → `normalizeAttachments()` only recognizes these path keys:
```
f.path || f.file_path || f.storagePath || f.storage_path
```
It does **not** pick up `filePath` (camelCase). Result for a stored form upload:
- `att.path` → `undefined`
- `att.viewUrl` → the original signed URL, which has expired by review time (or is `''` if signing failed at upload).

In `resolveSignedUrl()`:
1. Returns the stale `viewUrl` if present → browser opens an expired/forbidden URL.
2. If `viewUrl` is empty and `path` is missing and there's no `groupId`/`versionId` → returns `null` → toast **"Preview not available"**.

## Fix (scope: read-only, no business logic changes)

Edit only `src/components/registration/AttachmentDisplay.tsx`:

1. **Recognize `filePath` (and a couple of common variants) as a storage path** in `normalizeAttachments()`:
   ```
   const path = f.path || f.file_path || f.filePath || f.storagePath || f.storage_path || f.fullPath || f.full_path;
   ```
   This restores the persistent storage path for every form-uploaded file.

2. **Always re-sign when a storage path is available** in `resolveSignedUrl()`:
   - If `att.path` exists, generate a fresh signed URL from `secure-documents` (fallback `documents`) instead of returning the possibly-expired `att.viewUrl`.
   - Only fall back to `att.viewUrl` when there is no storage path and no versioned reference.

3. Keep existing versioned-document resolution (`groupId`/`versionId` → `document_versions` → `file_uploads`) untouched.

## Out of Scope
- No changes to upload logic, storage buckets, RLS, or form rendering.
- No changes to versioned document flows.
- No styling/UX changes beyond the toast no longer firing for valid uploads.

## Verification
- Open an application in admin Review → click the eye icon on an attached image/PDF → a new tab opens with the file (fresh 5-minute signed URL).
- Download icon already worked via path resolution; remains unchanged.
- Attachments stored as plain strings, versioned documents, and external URLs continue to work via the existing branches.
