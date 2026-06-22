# Restore digital signature at runtime

## Current state (why it appears "removed")

Digital signature was **configured** but **never enforced**:

- DB columns `approval_step_actions.require_digital_signature` and `signature_data_url` exist.
- Admin builder (`StepActionsEditor.tsx`) has the toggle, file upload, preview, and badge — fully working.
- Snapshot/type/hook layers carry the fields.
- **Runtime gap**: `WorkflowPanel.tsx` (applications/registrations) and `ReturnWorkflowPanel.tsx` (returns), plus the three edge functions (`perform-workflow-action`, `perform-registration-workflow-action`, `perform-return-workflow-action`), never read these fields. Approvers can act without signing, and no signature is persisted with the action.

Nothing was removed in the latest changes — the runtime piece was never built.

## What to build

### 1. Surface signature requirement to the runtime UI
In `WorkflowPanel.tsx` and `ReturnWorkflowPanel.tsx`:
- When building the action button list from `approval_step_actions`, also read `require_digital_signature` (already in `StepAction` type).
- Pass `requireSignature` into the new preview dialog state alongside `requireComments`.

### 2. Add signature capture step in `WorkflowActionPreviewDialog`
Extend `Props` with `requireSignature: boolean`. When true:
- Before the existing email preview, show a "Sign to confirm" section with a canvas-based signature pad (react-signature-canvas or a small inline pad using `<canvas>` + pointer events — pick inline to avoid a new dep).
- Provide Clear and Save buttons; serialize to PNG data URL on Save.
- "Confirm & Send" stays disabled until a signature is captured.
- Pass the data URL through `onConfirm(overrides, signatureDataUrl)`.

### 3. Persist + enforce in the three edge functions
For `perform-workflow-action`, `perform-registration-workflow-action`, `perform-return-workflow-action`:
- Accept optional `signature_data_url` in the body.
- Look up the matching `approval_step_actions` row by `(step_id, action_type)`. If `require_digital_signature` is true and no `signature_data_url` is provided, return `{ error: "Digital signature required for this action." }` with HTTP 200 (project convention).
- Store the captured signature on the resulting `approval_actions` row.

### 4. Store the runtime signature
Add column `approval_actions.signature_data_url text` via migration so each action carries the signature image it was confirmed with. (Admin's stamp on `approval_step_actions.signature_data_url` is the template; this new column is the per-action capture.)

### 5. Show captured signature in audit/history
In `WorkflowPanel.tsx` step history accordion and the audit logs view, render a small thumbnail of the captured signature next to the actor name when present.

## Out of scope (do not change)

- Workflow builder UI, snapshot logic, allowed-actions sync, per-action notifications, SLA, routing, approver permissions.
- DocuSign integration (placeholder only, separate feature).
- Other dashboard/licensee work.

## Technical notes

- Inline signature pad: ~80-line `<canvas>` component handling pointerdown/move/up; export via `canvas.toDataURL('image/png')`. Limit to ~512KB like the admin uploader.
- Edge function lookup uses existing service-role client; one extra `select` on `approval_step_actions` keyed by `(step_id, action_type)`.
- Migration: `ALTER TABLE public.approval_actions ADD COLUMN signature_data_url text;` — no GRANT/RLS changes needed (existing policies cover it).
- All three edge functions follow the same shape; share a small helper or inline the same ~15 lines in each.

## Files to touch

- `src/components/applications/WorkflowActionPreviewDialog.tsx` — add signature pad + new prop.
- `src/components/applications/WorkflowPanel.tsx` — pass `requireSignature`, forward signature to `executeAction`, render thumbnail in history.
- `src/components/returns/ReturnWorkflowPanel.tsx` — same as WorkflowPanel.
- `supabase/functions/perform-workflow-action/index.ts`
- `supabase/functions/perform-registration-workflow-action/index.ts`
- `supabase/functions/perform-return-workflow-action/index.ts`
- New migration adding `approval_actions.signature_data_url`.
