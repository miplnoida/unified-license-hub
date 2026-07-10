## Problem

Attachments uploaded by an **applicant** when filing a complaint never appear on the admin side because they are never persisted.

Verified against the current complaint on screen (`CMP-2026-000008`, id `a71cce4f-…`):
- `complaint_evidence` has **zero rows** for it.
- `complaint_evidence` has only **one RLS policy** (`Internal manage complaint evidence`) that scopes both `USING` and `WITH CHECK` to internal roles: `super_admin`, `admin`, `supervisor`, `licensing_officer`, `analyst`.
- Applicants (`applicant` / external portal roles) therefore cannot `INSERT` into `complaint_evidence`. The file itself uploads to storage + `file_uploads` (that policy is permissive), but the linking row insert is silently rejected by RLS.
- The frontend catches the linkError and shows a warning toast, but the complaint save still succeeds, so users don't realise the attachments were dropped.

Secondary issue in `file_uploads` SELECT policy: `Users read own uploads` only allows `super_admin`, `admin`, `supervisor`, or the uploader themselves. `licensing_officer` / `analyst` viewing the admin complaint detail page can read `complaint_evidence` rows but the joined `file_uploads` row comes back empty, so the file name/path/size are missing.

## Fix

Single migration that widens the RLS surface **just enough** for the applicant → admin attachment flow, without loosening anything else.

### 1. `complaint_evidence` — allow complainants to attach their own evidence

Add two policies scoped to the owning complaint:

```sql
-- Applicant can insert evidence rows for their own complaint
CREATE POLICY "Complainant insert own complaint evidence"
  ON public.complaint_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_evidence.complaint_id
        AND c.complainant_id = auth.uid()
    )
  );

-- Applicant can read evidence rows for their own complaint (for the ack modal / reprint)
CREATE POLICY "Complainant read own complaint evidence"
  ON public.complaint_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_evidence.complaint_id
        AND c.complainant_id = auth.uid()
    )
  );
```

The existing `Internal manage complaint evidence` policy is left untouched so admin/supervisor/licensing_officer/analyst continue to have full access.

### 2. `file_uploads` — let internal staff who handle complaints read the joined file

Extend the SELECT policy to include the two internal roles that already have full access to `complaint_evidence`, so the join on `ComplaintDetail` returns the file metadata:

```sql
DROP POLICY "Users read own uploads" ON public.file_uploads;
CREATE POLICY "Users read own uploads"
  ON public.file_uploads
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'licensing_officer')
    OR has_role(auth.uid(), 'analyst')
  );
```

(Existing `external_file_uploads_select_capability_gate` policy is kept as-is; it already covers external-portal complaint access via `can_submit_complaints`.)

### 3. Frontend — make silent failures loud

In `src/lib/complaintAttachments.ts` the current code swallows the RLS error into `result.failed[].error`. In `src/pages/complaints/ComplaintsList.tsx` the toast currently reads `"N attachment(s) failed to upload."` with no reason. Change it to include the first failure's error message so future permission issues are visible instead of silent, e.g.:

```
toast.warning(`Complaint filed. ${r.failed.length} attachment(s) failed: ${r.failed[0].error}`);
```

No other code changes — the existing admin Attachments card in `ComplaintDetail.tsx` (added last turn) will start populating as soon as the RLS gate is lifted.

## Backfill note

The already-submitted complaint on screen (`CMP-2026-000008`) will still show "No attachments" because its evidence rows never got written. New complaints filed after the migration will display correctly. If the user wants the file the applicant originally attached restored for this specific complaint, we would need the `file_uploads.id` (or storage path) — please share it and I can insert the missing `complaint_evidence` row.

## Verification

After migration:
1. Log in as an applicant, file a new complaint with an attachment. Confirm no "failed to upload" toast.
2. Query `complaint_evidence` for the new complaint id — row should exist.
3. Log in as admin / licensing_officer, open the complaint detail — Attachments card lists the file with a working "View" (signed-URL) button.
