## Plan

Fix only the workflow-action signature capture area so reviewers can either draw a signature in the canvas or upload a signature image before confirming the action.

## Scope

- Update `WorkflowActionPreviewDialog.tsx` only.
- Keep the existing `signature_data_url` contract unchanged so workflow actions, audit records, notifications, and backend behavior continue to receive one data URL.
- Do not change workflow logic, approval logic, database schema, notifications, AI, or unrelated UI.

## Implementation

1. **Make canvas drawing reliable**
   - Initialize the canvas after layout is available using a robust sizing path.
   - Handle pointer down/move/up/cancel events consistently.
   - Convert pointer coordinates using the canvas bounding rect so drawing works in the dialog and at different device pixel ratios.
   - Ensure the first click/touch produces visible ink immediately.

2. **Add signature upload option**
   - Add an image file input near the signature box.
   - Accept common image types (`png`, `jpg`, `jpeg`, `webp`).
   - Read the uploaded file as a data URL and set it as the same `signatureDataUrl` currently submitted to the action handler.
   - Mark the signature as present when upload succeeds.
   - Keep `Confirm & Send` disabled until either a drawn or uploaded signature exists.

3. **Clear behavior**
   - Keep the existing Clear button.
   - Clear both drawn signature state and uploaded signature state.
   - Reset the canvas back to a blank white signature surface.

4. **Validation and user feedback**
   - Reject non-image files with a toast/error message.
   - Show a small uploaded-image preview or filename so the user can confirm the upload was accepted.

5. **Verify**
   - Test that drawing in the canvas enables `Confirm & Send`.
   - Test that uploading an image enables `Confirm & Send`.
   - Test that Clear disables `Confirm & Send` again.
   - Confirm the existing `onConfirm(..., signatureDataUrl)` path remains unchanged.