# Step-level Digital Signature — Frontend Polish (every workflow)

The backend column, edge-function enforcement, and snapshot serialization for `approval_steps.require_digital_signature` are already in place, plus a switch on the step card in `WorkflowList.tsx`. This plan closes the remaining frontend gaps so the requirement is **visibly managed and surfaced for every workflow** (applications, registrations, returns).

## 1. Admin: `WorkflowList.tsx`

- Keep the existing step-level switch where it is (just above `StepActionsEditor`).
- When `step.require_digital_signature === true`, also render a small **"Signature required"** badge in the step card header next to the step name / SLA badge, so admins see it at a glance without expanding the step.

## 2. Admin: `StepActionsEditor.tsx` (per-action editor)

When the parent step has `require_digital_signature = true`:

- **List view** (each action row): always show the existing `Digital signature` badge (currently shown only when the per-action flag is true). Tooltip: "Required at step level."
- **Edit form**: above the per-action `Digital Signature Required` switch, show a muted hint: *"Already required at step level — this per-action toggle only adds an override and is not needed."* Leave the per-action switch interactive (overrides are still allowed).

No data model changes — purely presentational, driven by the `step.require_digital_signature` prop already passed in.

## 3. Runtime UI — applications (`WorkflowPanel.tsx`)

- In the step progress list, append a small **"Signature required"** badge to the **current** step when `currentStep.require_digital_signature` is true.
- Above the action buttons, render a one-line inline notice when the active step requires a signature: *"This step requires a digital signature. You'll be prompted to sign when you submit an action."*
- `requireSignature` passed to `WorkflowActionPreviewDialog` already ORs step + action — no change.

## 4. Runtime UI — returns (`ReturnWorkflowPanel.tsx`)

Mirror the application changes above (badge in progress list + inline notice).

## 5. Runtime UI — registrations

Check the registration review surface (`src/pages/admin/RegistrationReview.tsx` and any registration workflow panel it renders) and apply the same badge + inline notice. If registration review uses `WorkflowPanel` already, no extra work is needed.

## 6. Out of scope

- No DB / migration changes.
- No edge-function changes (enforcement already ORs step + action).
- No changes to the signature-capture dialog itself.
- No changes to saved per-action signature data.
- No dashboard / licensee-portal changes.

## Files to touch

- `src/pages/workflows/WorkflowList.tsx` — step header badge.
- `src/components/workflows/StepActionsEditor.tsx` — list badge + edit-form hint when step-level is on (needs `step` already in props).
- `src/components/applications/WorkflowPanel.tsx` — current-step badge + inline runtime notice.
- `src/components/returns/ReturnWorkflowPanel.tsx` — same.
- `src/pages/admin/RegistrationReview.tsx` (only if it renders its own workflow panel rather than reusing `WorkflowPanel`).

## Verification

- Toggle the step-level switch on an application workflow → reload an in-progress application → confirm badge + notice appear in `WorkflowPanel` and the signature dialog is required at submit.
- Repeat for a return workflow and a registration workflow.
- With step-level ON, open `StepActionsEditor` → confirm every action row shows the badge and the edit form shows the hint.
