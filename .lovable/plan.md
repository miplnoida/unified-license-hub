# Fix: signature-upload modal auto-closes after picking a file

## Root cause

`ApplicationDetail.loadData()` unconditionally calls `setWorkflowChecked(false)` at line 295 before re-resolving the workflow. That value gates whether `<WorkflowPanel/>` is mounted:

```ts
const showWorkflowPanel = workflowChecked && workflowOn === true && !hasPendingEditRequest;
```

`WorkflowActionPreviewDialog` (which owns the Upload-digital-signature UI) is rendered *inside* `WorkflowPanel` and its `previewState` open flag is local state on `WorkflowPanel`. So the moment `workflowChecked` flips to `false`, `WorkflowPanel` unmounts, `previewState` is destroyed, and the dialog disappears.

`loadData()` is called from two places that fire around file-pick interaction:
- `window` `focus` listener (line 381) — the OS file picker steals window focus; selecting a file restores focus → `loadData()` fires → dialog unmounts.
- `approval_workflows` realtime subscription (line 388) — any update to the attached workflow row triggers a full refetch with the same reset.

Verified path: user clicks Approve → preview dialog opens → user clicks Upload → OS picker opens (blur) → picks a file (focus) → `onFocus`→`loadData()` → `setWorkflowChecked(false)` → WorkflowPanel unmounts → dialog closes before `handleSignatureUpload` can finish.

## Fix (single, minimal edit)

Edit `src/pages/applications/ApplicationDetail.tsx`:

1. Delete `setWorkflowChecked(false);` at the top of `loadData()`. The state is initialised to `false` at the `useState` site, so the very first `loadData()` still ends with `setWorkflowChecked(true)` and the initial gate behaves identically. Subsequent refetches simply update `workflowActive`/`workflowApprovalEnabled` in place — `WorkflowPanel` stays mounted, `previewState` survives, the signature dialog stays open through the upload.

That's the entire change. No behaviour change for the initial page load, no behaviour change for the "workflow just got disabled" case (we still re-resolve every refetch and unmount when appropriate — just without the transient false blip).

No frontend refactor of the preview dialog or its file input needed. No RLS or backend change.

## Verification

1. As Analyst/Legal Compliance Reviewer, open a submitted application, click Approve on a step that requires digital signature → preview dialog opens.
2. Click Upload → pick a valid PNG/JPG → dialog stays open, signature preview appears, Confirm & Send becomes enabled.
3. Regression: reload the page — WorkflowPanel still hides correctly when the workflow is off / not configured.
4. Regression: toggle the assigned workflow to inactive in another tab — realtime listener refreshes and the panel correctly disappears (still driven by `workflowActive`, which is authoritative).
