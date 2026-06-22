# Step-level Digital Signature Requirement

Move/expose digital signature as a single switch on the approval step. When ON, every action executed on that step requires the approver to capture a signature at runtime. The existing per-action toggle stays as an override (optional), but the new step-level switch is the primary control admins use.

## 1. Database

New migration:
- `ALTER TABLE public.approval_steps ADD COLUMN require_digital_signature boolean NOT NULL DEFAULT false;`
- No RLS/GRANT changes (existing policies cover the column).

Snapshot tables (`approval_workflow_versions.snapshot` JSON) — no schema change; snapshot writer already serializes whatever columns are on the step.

## 2. Admin UI — `WorkflowList.tsx` (step card)

Add a new switch block right above `<StepActionsEditor>` (around line 1665):

```
[Switch] Require digital signature on this step
        When ON, every approver action on this step must be signed at runtime.
        Individual action overrides still apply.
```

- Wired through existing `onUpdate(step.id, { require_digital_signature: !!v })`.
- `useWorkflowEngine` `WorkflowStep` type + `useUpdateStep` payload extended with the new field.

## 3. Runtime enforcement (edge functions)

In all three: `perform-workflow-action`, `perform-registration-workflow-action`, `perform-return-workflow-action`.

Update the existing signature-required check so it triggers when **either**:
- the matching `approval_step_actions.require_digital_signature` is true, OR
- the parent `approval_steps.require_digital_signature` is true.

One extra `select require_digital_signature from approval_steps where id = step_id` (or join into the existing step lookup). If required and `signature_data_url` missing → return 422 `SIGNATURE_REQUIRED` (already wired).

## 4. Runtime UI

`WorkflowPanel.tsx` and `ReturnWorkflowPanel.tsx`:
- When loading the step, also read `require_digital_signature` from `approval_steps`.
- Compute `requireSignature = stepRequires || actionRequires` and pass to `WorkflowActionPreviewDialog` (already accepts the prop). No change to the dialog itself.

## 5. Snapshot / versioning

`workflowTemplateSnapshot.ts` — include `require_digital_signature` when serializing steps and when applying a snapshot back to `approval_steps`. Backward-compatible (missing field treated as `false`).

## 6. Per-action toggle

Keep it as-is in `StepActionsEditor` for fine-grained overrides. Add a small helper line under it: "Already required at step level" (muted) when the parent step has the flag on, so admins aren't confused.

## Out of scope

- Builder visual diagram, SLA, routing, notifications, DocuSign.
- Changing existing per-action signature data already saved.
- Dashboard/licensee work.

## Files to touch

- New migration: `approval_steps.require_digital_signature`.
- `src/hooks/useWorkflowEngine.ts` — type + update payload.
- `src/pages/workflows/WorkflowList.tsx` — step-level switch.
- `src/components/workflows/StepActionsEditor.tsx` — muted hint when step-level is on.
- `src/components/applications/WorkflowPanel.tsx` — OR logic for requireSignature.
- `src/components/returns/ReturnWorkflowPanel.tsx` — same.
- `supabase/functions/perform-workflow-action/index.ts` — OR check.
- `supabase/functions/perform-registration-workflow-action/index.ts` — same.
- `supabase/functions/perform-return-workflow-action/index.ts` — same.
- `src/lib/workflowTemplateSnapshot.ts` — serialize/apply new field.
