## Goal
Fix only the digital signature capture/upload behavior in `WorkflowActionPreviewDialog.tsx`, preserving all workflow, permission, notification, AI, reporting, approval, and backend behavior.

## Plan
1. **Stabilize canvas initialization**
   - Replace the current resize path that can repaint white over user ink.
   - Initialize the canvas only when the dialog is open and the canvas has real dimensions.
   - Allow resize setup only before a signature exists; after `sigHasInk`/`signatureDataUrl` exists, do not clear or rescale in a way that wipes the canvas.
   - Keep device-pixel-ratio scaling and visible dark ink on a white background.

2. **Make drawing reliable**
   - Use pointer events with canvas-rect coordinate conversion for mouse, touch, and stylus.
   - Ensure `pointerdown` immediately marks the signature present and draws a visible dot, so a tap counts.
   - On `pointerup`, `pointercancel`, or leaving the canvas during a stroke, write `canvas.toDataURL('image/png')` into `signatureDataUrl`.
   - Keep drawn signatures stable during scrolling/resizing.

3. **Fix upload behavior without closing/submitting**
   - Prevent unintended dialog close caused by file-picker focus/outside interactions by guarding Radix dialog outside/focus events on `DialogContent`.
   - Upload should only read the selected image and update local signature state; it must not call `onConfirm`, close the modal, or submit the action.

4. **Improve uploaded signature confirmation**
   - On valid PNG/JPG/WebP upload: set `signatureDataUrl`, set `sigHasInk = true`, store filename, show a success confirmation message, show filename, and show preview.
   - Preferably draw the uploaded image into the signature canvas as well, fitted within the white canvas area while preserving aspect ratio, then store the canvas data URL.
   - Invalid files will show the existing error toast and leave the modal open.

5. **Keep confirm/clear contracts unchanged**
   - `Confirm & Send` remains disabled only when a required signature has no valid `signatureDataUrl`.
   - Confirm continues calling `onConfirm(overrides, signatureDataUrl)` and does not close before that call starts.
   - Clear wipes the canvas, filename, file input value, `signatureDataUrl`, and `sigHasInk`, disabling Confirm again.

6. **Verify integration without backend changes**
   - Check `WorkflowPanel.tsx` continues passing `signatureDataUrl` into `executeAction` unchanged.
   - Manually verify draw path, upload path, clear path, confirm enabled state, cancel close, and saved signature display in workflow history where access allows.

## Files in scope
- `src/components/applications/WorkflowActionPreviewDialog.tsx`
- Read-only verification of `src/components/applications/WorkflowPanel.tsx`

## Out of scope
- Backend functions/RPCs
- Workflow action permissions
- Approval business rules
- Notification templates/dispatch
- AI/reporting modules
- Database schema
- Non-signature workflow behavior