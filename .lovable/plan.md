# Workflow Diagnostics Trim + Documents Tab Fix

## 1. Hide internal IDs in Workflow diagnostics

In the application workflow panel, the internal "Workflow diagnostics" box currently prints raw identifiers. Remove the two ID rows so it shows only human-meaningful facts:

Keep: Workflow name, Steps loaded, Entity type, Current step.
Remove: `Instance: <uuid>` and `Workflow ID: <uuid>`.

The mismatch warning banner above it stays (it is worded without IDs).

## 2. Documents tab shows nothing after batch upload

### What was verified
For application `8144e39a…`:
- No rows in `file_uploads`, `documents`, or `document_groups` for that application.
- No objects created in the `secure-documents` storage bucket on the day the application was created (only one unrelated registration file).
- The application's submitted form data contains no file fields.

So for this specific record nothing was ever persisted — the upload attempt did not reach storage. The cause is not yet confirmed, so verification comes first. Separately, there is a confirmed display gap: recent form-field uploads land in the versioned store (`document_groups` / `document_versions`), and the Documents tab list only reads `documents` and `file_uploads`, so versioned files would never appear even when they exist.

### Steps
1. **Reproduce and capture the failure.** Drive the app in a browser as the applicant, stage files in Batch document upload, click Upload, and capture the console/network response. This confirms whether storage upload, the `file_uploads` insert (RLS), or the click handler itself is failing.
2. **Fix the confirmed cause** from step 1 (most likely a policy/permission rejection on the upload path).
3. **Make failures visible.** The batch uploader currently aborts the whole loop on the first error and shows a single toast. Change it to report per-file status (uploaded / failed with reason) in the staged table, keep failed rows staged for retry, and never clear the queue unless everything succeeded.
4. **Unify the Documents tab source.** Extend the shared attachment list so it also reads the versioned document store (`document_groups` joined to its current `document_versions` row) for the entity, merged with the existing `documents` and `file_uploads` results, sorted by date. Downloads resolve from the version's bucket/path with the existing fallback logic.
5. **Empty-state clarity.** When the list is empty but the viewer is internal, note that only persisted documents appear, so a failed upload is not mistaken for a display bug.

## Technical notes
- Files touched: `src/components/applications/WorkflowPanel.tsx` (diagnostics rows), `src/components/shared/BatchDocumentUpload.tsx` (per-file result handling), `src/components/shared/AttachmentList.tsx` (versioned source + download resolution).
- No schema changes expected unless step 1 shows an RLS/grant gap on `file_uploads` or `storage.objects`, in which case a migration adds the missing policy only.
- No behaviour change for internal reviewers other than the extra documents now being listed.
