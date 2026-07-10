## Goal
Clean up the applicant complaint acknowledgement modal: show only essential fields, align labels/values consistently, and allow previewing attached files.

## Changes — `src/components/complaints/ComplaintAcknowledgement.tsx` (applicant variant only; internal unchanged)

### 1. Content — keep only
- Header title: "Complaint Acknowledgement"
- Acknowledgement no.
- Submitted on
- Title (subject)
- Description
- Attachments
- Footer buttons: Close, Print / Save as PDF

Remove: subtitle line, "Acknowledged" badge, "What happens next" section, generated/quote-reference footer note.

### 2. Alignment
Use a consistent two-column definition layout so every row starts at the same horizontal position with equal gap between label and value:
- On-screen: CSS grid `grid-cols-[180px_1fr]` with `gap-x-6 gap-y-3`, labels `text-sm font-medium text-muted-foreground`, values `text-sm text-foreground whitespace-pre-wrap break-words`.
- Description spans the value column and wraps.
- Attachments render as a vertical list inside the value column.
- Print stylesheet: mirror the same 180px / 1fr grid so the printed PDF matches the on-screen alignment.

### 3. Attachment preview
Extend the `attachments` prop shape to optionally include a preview handle:
```ts
attachments?: Array<{ name: string; size?: number; path?: string; fileUploadId?: string }>
```
For each attachment on the applicant view, render the filename as a button that opens the file:
- Resolve a short-lived signed URL via the existing `secureFileUpload` helpers (same pattern used elsewhere for `complaint_evidence`) using `path` when available, otherwise fetch `storage_path` by `fileUploadId` from `file_uploads`.
- Open in a new tab (`window.open(url, '_blank', 'noopener')`) — images/PDFs preview natively; other types download.
- Show a small `Eye` icon next to the name and size.
- Print view keeps names + sizes only (no clickable link).

### 4. Callers
- `src/pages/complaints/ComplaintsList.tsx` (applicant submit + reprint): pass attachments with `path` / `fileUploadId` when available. For the immediate post-submit case where files were just uploaded, pass the `fileUploadId` values returned by `attachStagedFilesToComplaint` (add these to its return type — small, additive change) so previews work without a refetch.
- `src/lib/complaintAttachments.ts`: extend `AttachStagedFilesResult.uploaded` from a count to an array of `{ name, size, fileUploadId }` (keep `.length` semantics at call sites where only the count is used).
- `src/pages/complaints/ComplaintDetail.tsx` (applicant reprint): already fetches `complaint_evidence` — include `file_upload_id` and pass through.

No schema, RLS, or backend changes.

## Out of scope
- Internal/admin acknowledgement layout.
- In-modal inline preview pane (opens in a new tab instead — matches existing document viewing pattern).
