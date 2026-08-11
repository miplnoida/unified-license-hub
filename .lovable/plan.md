# Fix: complaint attachments missing in applicant detail modal

## What's happening

The applicant's complaint detail modal lists attachments from the link table `complaint_evidence`. For the two recent portal complaints the files were uploaded successfully, but no link rows exist:

- CMP-2026-000079 (`84246b63…`): 1 uploaded file, 0 evidence rows
- CMP-2026-000078 (`0feae757…`): 1 uploaded file, 0 evidence rows

Both files are owned by the complainant and are not quarantined, so the only gate they could have failed is the ownership check inside `finalize_complaint_with_attachments`, which requires `complaints.complainant_id = auth.uid()`. At the time these complaints were filed, `complainant_id` was still NULL (the portal-complaints bug fixed in the previous turn; the column was only backfilled afterwards). The RPC therefore raised `NOT_AUTHORIZED_FOR_COMPLAINT`, every file was reported as failed, and no `complaint_evidence` rows were written — while the uploads themselves already carried `entity_type='complaint'` / `entity_id=<complaint id>`, so the file is in storage but invisible to the modal.

Filing now sets `complainant_id` correctly, so new complaints will link properly. Two things still need fixing: the orphaned historical rows, and the modal's single-source read.

## Plan

1. **Repair the orphaned links (data migration)**
   Insert `complaint_evidence` rows for every `file_uploads` row where `entity_type='complaint'` and the `entity_id` complaint has no matching evidence row, using `file_name` as the label and `uploaded_by` as the uploader. Idempotent (`WHERE NOT EXISTS`), no deletions.

2. **Make the applicant modal resilient**
   In `src/pages/complaints/ComplaintsList.tsx`, after loading `complaint_evidence`, also query `file_uploads` by `entity_type='complaint'` + `entity_id=<complaint id>` and merge by file id (dedupe against evidence-derived entries). This means a future link failure degrades to "attachment still shows" instead of "attachment disappears". Same merge for the acknowledgement reprint path so the ack preview matches.

3. **Surface link failures loudly at filing time**
   The upload helper already returns per-file errors; the filing flow currently shows only the first error in a warning toast. Make it an error toast naming the failing files so a partial failure is not mistaken for success.

## Notes

- No changes to RLS, storage policies, the RPC's authorization logic, or the complaints workflow.
- Existing SELECT policies already let the complainant read their own `complaint_evidence` and their own `file_uploads`, so the merged read needs no policy change.
