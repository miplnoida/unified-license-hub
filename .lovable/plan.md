# Closure & QA panel: clearer guidance after QA approval

## Problem

When a complaint has a recorded `qa_approved` closure review but the case itself is not yet `closed`/`resolved`/`withdrawn`, the Closure & QA tab currently renders the closure-assessment form and then, beneath the **Close complaint** button, prints:

> No workflow action is available to you right now — use the Current step tab. Go to Current step

This is misleading for super-admins and closure officers: QA has already passed, so the panel should not suggest that the user is missing workflow permissions or needs to leave the tab. The final close remains domain-driven (the configured complaint workflow action), and any available close action should be usable directly in this panel.

## Goal

Make the panel communicate the post-QA state clearly:

1. If a valid closure action is available in Closure & QA, guide the user to complete the form and use it here.
2. If no closure action is available here, explain that the case is waiting for the remaining workflow/domain requirement, and mention the **Current step** tab only as guidance — not as a required next click.
3. If the complaint is already closed/resolved/withdrawn, keep the existing "Complaint closed" summary and do not ask for more work.
4. Do not add new generic Close/Resolve/Forward workflow actions to this panel.

## Changes

### Frontend: `src/components/complaints/ClosureQaPanel.tsx`

- Add a helper that detects the post-QA state from `reviews`:
  - `hasQaApproved` = any review with `decision === 'qa_approved'`.
  - `isEffectivelyComplete` = `qa_approved` exists and complaint status is `closed`/`resolved`/`withdrawn`.
- In the editable closure form area (`!readOnly && !alreadyClosed`):
  - When `hasQaApproved` and a `closingAction` exists:
    - Show a concise hint above the **Close complaint** button:
      > QA approved — the closure assessment passed quality review. Complete the fields below and click **Close complaint** to finalise the case here.
    - Leave the button enabled when form validation passes.
  - When `hasQaApproved` and no `closingAction` exists:
    - Replace the generic "No workflow action is available…" line with:
      > QA approved — the closure assessment passed quality review. The case is waiting for the remaining workflow/domain requirement before it can be finalised. Check the **Current step** tab for what is still needed.
    - Keep the **Go to Current step** button, but label it as guidance (e.g. "Review Current step") rather than a mandatory next action.
  - When there is no QA approval and no `closingAction`, keep the existing generic guidance unchanged.
- In the read-only warning (`readOnly`):
  - Keep the existing actionable notice (current step label + next available action + Go to Current step button). No change.
- Preserve the **Closure history** list and the "Latest decision" footer exactly as they are.

### No backend changes

- Do not modify `get_complaint_available_actions`, `execute_complaint_workflow_action`, workflow definitions, RLS, or approval matrices.
- The fix is presentation-only; the server remains authoritative for which actions are available.

## Verification

- Build passes.
- For a complaint with `qa_approved` review, status still open, and a `closingAction` available, the Closure & QA tab shows the QA-approved hint guiding the user to complete the closure here.
- For a complaint with `qa_approved` review, status still open, and no `closingAction`, the panel explains the case is waiting on the remaining workflow/domain requirement and points to Current step only as guidance.
- For a closed complaint, the tab shows the closed summary and no form.
- For a complaint at an earlier workflow step, the read-only notice still explains the current step and next action.
