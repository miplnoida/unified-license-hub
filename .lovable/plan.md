## Fixes to complaint intake forms

### 1. Complaint type dropdown blank (Internal complaint form)
Root cause: `NewInternalComplaint.tsx` filters `complaint_types` by column `active`, but the actual column is `is_active`. `ComplaintsList.tsx` correctly uses `is_active` — that's why applicant view works and internal view doesn't.

Fix: change the query in `src/pages/complaints/NewInternalComplaint.tsx` to `.eq('is_active', true)` so it matches the applicant form's data source.

### 2. Allow attachments on both complaint forms
Reuse the existing secure upload stack (`file_uploads` table + `secure-documents` bucket) and link uploads to the complaint via the existing `complaint_evidence` table (columns: `complaint_id`, `file_upload_id`, `label`, `uploaded_by`).

Approach:
- Stage files in-memory in the form (same pattern as `DocumentUpload.tsx`) — no upload until the complaint is submitted (we need the `complaint_id` first).
- After the complaint row is inserted, upload each staged file via `uploadFormFile()` from `src/lib/formFileUpload.ts` (uses `secure-documents` + `file_uploads`), then insert a `complaint_evidence` row per file.
- Apply to both:
  - `src/pages/complaints/NewInternalComplaint.tsx` — add an "Attachments" section above the submit button.
  - `src/pages/complaints/ComplaintsList.tsx` — add attachments field inside the applicant "File Complaint" dialog and wire it into `handleCreate`.
- Validation: reuse `validateFile` / size + type rules already defined in `secureFileUpload.ts`. Max 20MB per file, cap at say 5 files per submission.
- On upload failure after complaint insert: keep the complaint, toast which attachments failed (non-blocking) — same tolerance pattern used by auto-triage today.

### 3. Severity field on applicant complaint form
`complaints.severity` already exists and is used by the internal form. Add a Severity `Select` (low / medium / high / critical, default `medium`) to the applicant "File Complaint" dialog in `ComplaintsList.tsx` and include it in the `insertData` for the non-internal branch of `handleCreate`.

### Scope guardrails
- No changes to RLS, edge functions, ComplaintDetail, ConductClassificationCard, triage, workflow, prudential, or unrelated modules.
- No schema migrations — `complaint_evidence` and `file_uploads` already exist and are wired for secure storage.

### Files touched
- `src/pages/complaints/NewInternalComplaint.tsx` — fix `is_active` filter; add attachments section; upload + link evidence after insert.
- `src/pages/complaints/ComplaintsList.tsx` — add Severity select and attachments to applicant dialog; upload + link evidence after insert in `handleCreate`.
- (Optional) small shared helper `src/lib/complaintAttachments.ts` if both screens end up with the same upload-and-link loop, to keep the two call sites tidy.