## Problem (verified)

For pre-licensee and post-licensee application workflows, a "Reject" at an early step leaves the record as **In Progress** and pushes it to the next approver instead of ending as **Rejected**.

Cause confirmed in the database:
- `public.perform_workflow_transition` applies the per-step action configuration (`approval_step_actions`) before considering the action's meaning. When `next_step_mode = 'next' | 'keep' | 'specific_step' | 'previous'`, it unconditionally sets the application status to `in_progress` and advances the step — even when the action is `reject`.
- 8 configured reject actions currently use `next_step_mode = 'next'` instead of `end_workflow`, on: Building Society Pre License Workflow (Steps 1, 2), Commercial Bank Pre Licensee (Steps 1, 2), Pre License Approval Workflow (Licensing Officer, Final Approval), Post Application Workflow (Licensing Officer, Final Approval).

Registrations are not affected: `perform_registration_workflow_transition` already sets `rejected` + `completed` for any step (verified — REG-2026-000025 rejected at step 1 shows `rejected`).

## Fix

**1. Harden the application transition function (migration)**

In `public.perform_workflow_transition`, short-circuit `reject` before the step-config branch:
- If `_action_type = 'reject'`, always set application status `rejected`, workflow instance `completed`, keep the current step as the terminating step, and skip `next_step_mode` / `result_status_override` handling entirely.
- Same treatment for `cancelled`-style terminal end states already configured — no behaviour change there.
- Everything else (approve, send_back, escalate, resubmission/correction/info paths, save_comment) stays exactly as it is.

**2. Normalise the misconfigured step actions (data fix)**

Update the 8 `approval_step_actions` rows with `action_type = 'reject'` and `next_step_mode <> 'end_workflow'` to `next_step_mode = 'end_workflow'`, `end_state = 'rejected'`, so the builder UI also reflects the correct terminal behaviour.

**3. Prevent recurrence in the workflow builder**

In the step action editor, force reject to a terminal outcome: when action type is `reject`, lock `next_step_mode` to "End workflow" with end state "Rejected" (shown as read-only) so admins cannot configure a non-terminal reject.

**4. Backfill existing bad records (optional, on confirmation)**

Any application whose latest workflow action is `reject` but whose status is still `in_progress` gets corrected to `rejected` with its instance marked completed. I'll list the affected records before applying.

## Not changing

Registration workflow logic, approve/send-back/escalate/resubmission paths, notifications, RBAC gates, and any other module.