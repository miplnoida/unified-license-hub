# Closure & QA panel: clearer guidance after QA approval

## Problem

When a complaint has a recorded `qa_approved` closure review but the case itself is not yet `closed`/`resolved`/`withdrawn`, the Closure & QA tab currently renders the closure-assessment form and then, beneath the **Close complaint** button, prints:

> No workflow action is available to you right now — use the Current step tab. Go to Current step

This is misleading for super-admins and closure officers: QA has already passed, so the panel should not suggest that the user is missing workflow permissions or needs to leave the tab. The final close is intentionally domain-driven (the configured complaint workflow action), not a generic workflow button.

## Goal

Make the panel communicate the post-QA state clearly:

1. If QA is approved and the complaint is still open, explain that the closure assessment passed QA and tell the user exactly how to finish the case (perform the configured close action on the **Current step** tab, or complete any remaining required fields and click **Close complaint** if a closing action is available).
2. If the complaint is already closed/resolved/withdrawn, keep the existing "Complaint closed" summary and do not ask for more work.
3. Do not add new generic Close/Resolve/Forward workflow actions to this panel.

## Changes

### Frontend: `src/components/complaints/ClosureQaPanel.tsx`

- Add a helper that detects the post-QA state from `reviews`:
  - `hasQaApproved` = any review with `decision === 'qa_approved'`.
  - `isEffectivelyComplete` = `qa_approved` exists and complaint status is `closed`/`resolved`/`withdrawn`.
- In the editable closure form area (`!readOnly && !alreadyClosed`):
  - When `hasQaApproved` and no `closingAction`:
    - Replace the generic "No workflow action is available…" line with:
      > QA approved — the closure assessment passed quality review. Complete the final close action from the **Current step** tab.
    - Keep the **Go to Current step** button.
  - When `hasQaApproved` and a `closingAction` exists:
    - Show a concise hint above the button:
      > QA approved. Complete the fields below and click **Close complaint** to record the final closure.
    - Leave the button enabled when form validation passes.
  - When there is no QA approval and no `closingAction`, keep the existing generic guidance unchanged.
- In the read-only warning (`readOnly`):
  - Keep the existing actionable notice (current step label + next available action + Go to Current step button). No change.
- Preserve the **Closure history** list and the "Latest decision" footer exactly as they are.

### No backend changes

- Do not modify `get_complaint_available_actions`, `execute_complaint_workflow_action`, workflow definitions, RLS, or approval matrices.
- The fix is presentation-only; the server remains authoritative for which actions are available.

## Verification

- Build passes.
- For a complaint with `qa_approved` review and status still open, the Closure & QA tab shows the QA-approved guidance and the **Go to Current step** button, not the "No workflow action" message.
- For a closed complaint, the tab shows the closed summary and no form.
- For a complaint at an earlier workflow step, the read-only notice still explains the current step and next action.
