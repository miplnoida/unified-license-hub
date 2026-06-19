## Plan: Restore file preview on the application review step

1. **Fix attachment detection for persisted form files**
   - Update the review attachment helper so objects with `filePath`, `fullPath`, `groupId`, or `versionId` are always treated as previewable attachments.
   - This covers files saved from the form renderer and versioned file uploads.

2. **Resolve versioned files more reliably**
   - When a review attachment only has `groupId` / `versionId`, resolve its current storage path from the version metadata.
   - If the linked `file_uploads` row is not readable, fall back to the storage metadata already present on the document version row if available.

3. **Generate fresh preview links**
   - Keep using short-lived signed preview URLs, but generate them at click time from the persistent storage path.
   - Avoid relying on the expired `url` saved during upload.

4. **Keep scope limited**
   - Only edit `src/components/registration/AttachmentDisplay.tsx`.
   - No changes to upload logic, fee management, payment, workflow, or application submission behavior.

## Expected result
On `/applications/.../continue?step=review`, clicking the eye icon for uploaded image/PDF/file fields should open the file instead of showing **Preview not available**.