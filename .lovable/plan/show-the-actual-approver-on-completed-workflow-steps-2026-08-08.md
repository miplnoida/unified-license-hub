# Show the actual approver on completed workflow steps

## What's happening

Each step row in the workflow timeline prints `Step N · <role>`. That role text comes from the step's *configured* approver role, and every step in the Pre License Approval Workflow has "Super Admin" stored as its first configured role — so all steps read "Super Admin", even though the people who actually acted were different:

- Step 1 Analyst Review — Anisha Anni (comment)
- Step 2 Licensing Officer — Vidya Rani (approved)
- Step 3 Final Approval — Super Admin (approved)

The correct actor names are already recorded and already appear inside each expanded step; only the collapsed header line is misleading. Two secondary issues: steps configured with several allowed roles only display the first one, and the "role_based_user" label ignores the full `role_ids` list.

## Fix

In the step header line:
- If the step is completed or sent back, show the person who acted: `Step N · Approved by Vidya Rani` (or "Comment by …", "Sent back by …" based on the recorded action). Use the latest decisive action's actor; fall back to the latest recorded action if there is no decisive one.
- If no action was recorded on that step, keep showing the assigned role/user as "Assigned to …" so nothing is invented.
- For pending and upcoming steps, keep the assignment label but prefix it with "Assigned to" and list all configured roles (not just the first), truncating with "+N more".

Apply the same change to the returns workflow timeline so both panels behave identically.

No database or workflow-configuration changes — the underlying data is already correct.

## Technical notes

- `src/components/applications/WorkflowPanel.tsx`: add an `actorLabelForStep(step, idx, status)` helper that reads from the existing `actionsByStep` map plus `actorsMap`, and use it in the accordion trigger line that currently renders `Step {idx + 1} · {stepRoleLabel(s)}` (both the terminal timeline and the active timeline render paths).
- Extend `stepRoleLabel` to map `approver_config.role_ids` through `dynamicRolesMap` instead of only `approver_role_id`.
- Mirror both changes in `src/components/returns/ReturnWorkflowPanel.tsx`.
- Verify in the running app on the completed application at `/applications/4522127b-ff11-4384-8f4a-ad7d4cabee43` that the three headers read Anisha Anni, Vidya Rani, Super Admin respectively.
