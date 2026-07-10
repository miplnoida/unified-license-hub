## Goal

Streamline the complaint acknowledgement modal shown to applicants so it displays only the essential, user-facing information: title/subject, description, submitted date, attachments, and the complaint/acknowledgement reference number. Internal/admin acknowledgement view remains unchanged.

## Changes

### 1. `src/components/complaints/ComplaintAcknowledgement.tsx`
- Extend `ComplaintAckInput` with optional `description` and `attachments` (array of `{ name, path?, url? }`).
- Add a `variant?: 'applicant' | 'internal'` prop (default `'internal'` to preserve current admin behavior).
- When `variant === 'applicant'`, render a slimmed layout that shows only:
  - Header: "Complaint Acknowledgement" + acknowledged badge
  - Reference number (complaint number)
  - Subject (as title)
  - Submitted date
  - Description (full text, wrapped)
  - Attachments list (filename chips; no view/download buttons in the print view, just names + sizes for the printable copy)
  - Short "What happens next" note (kept, since it's the point of an acknowledgement)
- Hide from applicant variant: complainant name/email, channel, regulator label, SLA business-days line, internal metadata.
- Print stylesheet updated to match the simplified layout.
- Audit/export logging behavior preserved.

### 2. `src/pages/complaints/ComplaintsList.tsx` (applicant filing dialog)
- After a successful applicant submission, pass `variant="applicant"` plus `description` and the staged `attachments` (names only) into `ComplaintAcknowledgement`.

### 3. `src/pages/complaints/ComplaintDetail.tsx`
- Detect applicant viewer (existing role check already present on this page) and pass `variant="applicant"` with `description` and attachments fetched from `complaint_evidence` (filename only). Internal/admin viewers keep the current full acknowledgement.

No schema, RLS, or backend changes. Purely presentational.

## Out of scope
- Admin/internal acknowledgement layout (unchanged).
- Attachment download/preview from the printed acknowledgement (names only for the applicant copy).
