## Why signature upload is still breaking the approval flow

When the uploaded image is too large or fails to draw into the canvas, the current code either falls back to sending the raw image data URL (which can be huge and break the approval request) or silently lets the dialog misbehave. There is no user-facing guidance on the expected image size, so users keep uploading photos that exceed what the approval payload can carry.

## Plan

Scope: only `src/components/applications/WorkflowActionPreviewDialog.tsx`. No changes to workflow, permissions, notifications, AI, reports, approval rules, or backend.

1. **Define explicit signature upload limits (constants in the dialog)**
   - Max file size: 2 MB.
   - Recommended dimensions: 600 x 200 px (max 1200 x 400 px).
   - Allowed types: PNG, JPG, JPEG, WebP.

2. **Show the limits in the UI before upload**
   - Replace the current "PNG, JPG, JPEG, or WebP image." helper text under "Upload digital signature" with:
     "Recommended 600 x 200 px (max 1200 x 400 px), under 2 MB. PNG, JPG, JPEG, or WebP."
   - Keep the Upload button and hidden file input as-is.

3. **Validate the file before reading and show a friendly inline message**
   - On file selection, check type and size first.
   - If invalid: do NOT close the modal, do NOT toast-and-vanish. Instead set an inline error state shown in the signature panel in destructive style, for example:
     - Wrong type: "Unsupported file type. Please upload a PNG, JPG, JPEG, or WebP image."
     - Too large: "This image is {actualSize} MB. Please upload a signature under 2 MB (recommended 600 x 200 px)."
   - Reset the file input so the same file can be retried after fixing.

4. **Validate dimensions after image loads**
   - Load the image to read natural width/height.
   - If width or height exceeds the max (1200 x 400), show inline message:
     "This image is {w} x {h} px. Please upload a signature no larger than 1200 x 400 px (recommended 600 x 200 px)."
   - Do not commit `signatureDataUrl` and do not enable Confirm.

5. **Only commit normalized canvas output**
   - On a valid image, draw it into the signature canvas (fitted, preserving aspect ratio) and store `canvas.toDataURL('image/png')` as `signatureDataUrl`.
   - Remove the current fallback that stored the original uploaded data URL when canvas drawing was unavailable — that path is what produced oversized approval payloads.
   - If drawing fails for any reason, show the same friendly inline message and keep the modal open.

6. **Keep modal stable during upload**
   - Hidden file input stays inside `DialogContent`.
   - Upload button stays `type="button"`.
   - Existing `onPointerDownOutside` / `onFocusOutside` / `onInteractOutside` guards remain for signature-required actions so the file picker focus return cannot close the dialog.

7. **Clear/Confirm behavior unchanged**
   - Clear wipes canvas, filename, file input, error message, `sigHasInk`, and `signatureDataUrl`.
   - Confirm stays disabled until a valid normalized `signatureDataUrl` exists, then calls `onConfirm(overrides, signatureDataUrl)` exactly as today.

8. **Verify**
   - Manually: upload a >2 MB image → inline friendly message, modal stays open, Confirm disabled.
   - Upload a 3000 x 1000 px image → dimension message, modal stays open.
   - Upload a valid small PNG → preview shows, success message shows, Confirm enabled, action submits successfully.
   - Drawing path and non-signature actions unchanged.