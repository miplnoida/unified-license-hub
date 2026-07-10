## Problem

On the licensee side (`src/pages/complaints/ComplaintsList.tsx`), the "View" action opens a `detailDialog` that shows type, subject, description, status, filed date, and resolution — but has **no attachments section**, so uploaded files never appear. (RLS already permits complainants to read their own `complaint_evidence` and `file_uploads`; the data isn't being fetched/rendered.)

## Fix

Add an Attachments section to the licensee `detailDialog` (lines 744–773 of `ComplaintsList.tsx`).

1. When `detailDialog` is set (i.e. licensee clicks View), fetch linked files:
   - `complaint_evidence` rows where `complaint_id = detailDialog.id`, selecting `label, file_upload_id`
   - Then `file_uploads` rows for those ids, selecting `id, file_name, file_path, file_size`
   - Store in local state `detailAttachments`

2. Render a new block inside the dialog (after Description or before Resolution):
   - Heading "Attachments (N)"
   - List each file: name, size, "View" button
   - "View" button calls `getSignedUrl(file_path, 300)` from `@/lib/secureFileUpload` and opens in a new tab (same pattern already used in `ComplaintDetail.tsx` `openAttachment`)
   - Empty state: "No attachments" (only if the complaint has none)

3. Reset `detailAttachments` when the dialog closes.

## Scope

- Single file edited: `src/pages/complaints/ComplaintsList.tsx`
- No RLS/DB/schema changes (existing policies already allow complainant reads)
- Internal/admin view and acknowledgement modal untouched