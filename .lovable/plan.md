Add a **View** button next to the existing Download button on RFI response attachments.

## Change

In `src/components/applications/ApplicationRfiTab.tsx` `RfiAttachmentList`:

- Keep the existing Download button (opens signed URL — browser downloads based on content-disposition).
- Add a second icon button (Eye icon) that:
  - Calls `getSignedUrl(row.file_path, 300)` the same way.
  - Opens the returned URL in a new tab with `window.open(url, '_blank', 'noopener,noreferrer')` so the browser renders inline (PDFs, images) instead of downloading.
- Independent busy state per action so the two spinners don't share (`busyId` becomes `{ id: string, mode: 'view' | 'download' } | null`).

No policy, hook, or backend changes — signed URL flow already works for both actions.

## Verification

On the RFI tab, click the eye icon on any attachment → new tab opens with the file rendered inline; download button still triggers a download.
