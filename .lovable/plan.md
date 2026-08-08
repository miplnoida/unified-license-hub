# Fix "Not reached" on completed steps in the application workflow timeline

## What I confirmed for this application

- Its workflow instance is on **Pre License Approval Workflow**, status **completed**, resolved current step **Final Approval** (step order 4).
- Recorded actions:
  - Analyst Review (step 1) — `save_comment` "All okay"
  - Licensing Officer (step 3) — `approve`
  - Final Approval (step 4) — `approve`
- No action exists on the step at order 2.

## Why the screenshot happens

In `WorkflowPanel.tsx`, the completed-workflow timeline decides each step's status only from a "decisive" action list (`approve`, `reject`, `send_back`, `escalate`, `request_resubmission`, `return_for_correction`, `request_more_info`). `save_comment` is not in that list, so Analyst Review falls through to `upcoming` → badge "Not reached" and the text "This step was never reached because the workflow ended earlier." Any step the workflow passed through without a decisive action recorded on it gets the same wrong label.

## Fix (presentation only)

In the terminal-instance branch of the step status logic:

1. Determine the index of the outcome step (the instance's resolved current step).
2. Any step at or before that index is treated as **passed**, not upcoming — regardless of whether a decisive action was recorded on it.
   - Decisive `send_back` still renders as "Sent Back".
   - Steps with a decisive approval render "Completed" as today.
   - Steps that were passed with only non-decisive activity (e.g. `save_comment`) or with no recorded action render as **Completed** with a softer note.
3. Only steps **after** the outcome step stay "Not reached".
4. Replace the blanket body text: for a passed step with no recorded decisive action, show "Passed — no decision action was recorded on this step." Keep "This step was never reached because the workflow ended earlier." only for genuinely later steps.
5. Show all recorded actions for a passed step, including `save_comment`, so the analyst's comment is visible in the Analyst Review accordion instead of being hidden.

Apply the same change to the returns timeline (`ReturnWorkflowPanel.tsx`), which carries an identical copy of this logic, so returns don't show the same false "Not reached".

## Scope

- Frontend only: `src/components/applications/WorkflowPanel.tsx` and `src/components/returns/ReturnWorkflowPanel.tsx`.
- No database changes, no workflow configuration changes, no change to who can act.

## Verification

Open this application's Workflow tab and confirm Analyst Review shows Completed with the "All okay" comment visible, the order-2 step shows as passed with no decision recorded, and Licensing Officer / Final Approval remain Completed.
