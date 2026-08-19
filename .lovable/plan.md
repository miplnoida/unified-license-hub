# Hide digital signature from workflow actions (Registration Review, License Requests, Return Queue)

## Current behaviour (verified)

- All three surfaces use the same action dialog: Registration Review and License Requests render `WorkflowPanel`, the return queue renders `ReturnWorkflowPanel`; both pass `requireSignature` into `WorkflowActionPreviewDialog`, which then shows a "Digital signature required" block with a draw canvas / image upload and blocks Confirm until a signature exists.
- `requireSignature` is computed from the step-action config (`require_digital_signature`) or the step itself, so any step flagged in the workflow builder forces the signature pad.
- The panels also show a step-level notice: "This step requires a digital signature. You'll be prompted to sign when you submit an action."
- The three edge functions (`perform-workflow-action`, `perform-return-workflow-action`, `perform-registration-workflow-action`) each reject the action with HTTP 422 `SIGNATURE_REQUIRED` when the config asks for a signature and none is sent — so hiding only the UI would break actions on those steps.

## What will change

### Frontend — hide the capture UI
- In `WorkflowPanel` and `ReturnWorkflowPanel`, stop propagating the signature requirement to the action dialog (`requireSignature` becomes permanently false). The computation and the underlying config fields stay in place, just unused.
- Hide the step-level "This step requires a digital signature…" notices and the step badges advertising the requirement in those two panels.
- Leave `WorkflowActionPreviewDialog` untouched (the whole signature capture block stays in the code, only unreachable now), and leave the workflow builder's Digital Signature configuration intact.
- Keep the history/audit rendering: already-recorded signatures on past actions continue to display.

### Backend — no runtime error when no signature arrives
- In all three workflow action functions, turn the `SIGNATURE_REQUIRED` 422 into a non-blocking path: the requirement is logged/ignored and the action proceeds. The signature-persistence branch is untouched, so if a signature is ever supplied again it still gets stored on the `approval_actions` row.
- Nothing is dropped from the schema and no columns or config rows are deleted.

## Verification
- Take an action (approve / send back) on a Registration Review, a License Request, and a Return whose step has `require_digital_signature = true`: the dialog shows no signature pad and the action completes with no 422 and no console error.
- Confirm the workflow builder still shows and saves the Digital Signature setting, and that historic actions with a stored signature still render it in the timeline.
- Typecheck plus the existing workflow test suites.

## Technical notes
- Files: `src/components/applications/WorkflowPanel.tsx`, `src/components/returns/ReturnWorkflowPanel.tsx`, `supabase/functions/perform-workflow-action/index.ts`, `supabase/functions/perform-return-workflow-action/index.ts`, `supabase/functions/perform-registration-workflow-action/index.ts`.
- A single shared constant (e.g. `WORKFLOW_SIGNATURE_CAPTURE_ENABLED = false`) will gate the frontend behaviour so the feature can be switched back on in one place.
