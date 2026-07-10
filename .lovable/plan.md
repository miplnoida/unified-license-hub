## Problem

The admin complaint detail page (`src/pages/complaints/ComplaintDetail.tsx`) does not render the files uploaded with the complaint. Attachments are stored via `complaint_evidence` → `file_uploads` (uploaded through `src/lib/complaintAttachments.ts`), and today they only surface in the applicant acknowledgement modal. Admins/internal reviewers cannot see or open them.

## Fix

Add an "Attachments" card to the Overview tab of `ComplaintDetail.tsx`.

1. New query `['complaint_attachments', id]` that:
   - Selects `id, label, file_upload_id, uploaded_by, created_at` from `complaint_evidence` where `complaint_id = id`.
   - Joins to `file_uploads` for `file_name`, `file_path`, `file_size`, `mime_type`.
2. Render a compact list (icon + filename + size + uploaded date). Each row has a "View" button that calls `getSignedUrl(file_path)` from `@/lib/secureFileUpload` and opens the returned URL in a new tab (same pattern as the applicant acknowledgement).
3. Empty state: "No attachments uploaded with this complaint."
4. Place the card in the Overview tab, right after the existing "Complainant" card. No changes to Investigation/Actions tabs, no schema changes, no policy changes.

## Out of scope

- Uploading new attachments from admin detail (that already exists in the investigation flow / intake).
- Any change to applicant-side acknowledgement or list views.
