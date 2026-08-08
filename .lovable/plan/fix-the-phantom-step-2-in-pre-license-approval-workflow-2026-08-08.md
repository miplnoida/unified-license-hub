# Fix the phantom "Step 2" in Pre License Approval Workflow

## What I confirmed in the database

`Pre License Approval Workflow` has exactly **3 steps**, but their order numbers have a gap:

| Step name | step_order |
| --- | --- |
| Analyst Review | 1 |
| Licensing Officer | 3 |
| Final Approval | 4 |

There is no step at order 2 — a step was deleted at some point and the remaining steps were never renumbered. Anything that reads or displays `step_order` therefore looks like a 4-step workflow with an empty second step.

Two other workflows have the same gap:

- `Post Application Workflow` — 3 steps numbered 1, ?, 4
- `Complaint Management Workflow` — 12 steps numbered 10 … 99

Cause: deleting a step (`useDeleteStep`) removes the row only; it never renumbers the surviving steps. Reordering via the up/down arrows does renumber, so only deletions leave gaps.

## Fix

### 1. Repair the existing data
Renumber the steps of each affected workflow to a contiguous `1..N`, preserving their current relative order, so:
- Pre License Approval Workflow → Analyst Review 1, Licensing Officer 2, Final Approval 3
- Post Application Workflow → 1, 2, 3
- Complaint Management Workflow → 1 … 12

This is a pure renumbering: no step is added, removed, renamed or re-roled, step IDs stay the same, so all recorded approval actions, workflow instances and per-step action/notification configuration remain attached to the same steps.

### 2. Stop new gaps appearing
Make step deletion renumber the remaining steps of that workflow to `1..N` immediately after the delete, using the same ordering path the reorder controls already use. Result: the builder can never again show a workflow with a missing step number.

### 3. Display
With contiguous orders, the admin builder's step badge and the application/return workflow timelines all agree on "Step 1 / 2 / 3" and the completed Pre License workflow reads as a 3-step workflow.

## Still outstanding from the earlier finding

Separately from the numbering, the completed timeline labels Analyst Review as "Not reached" because only a `save_comment` was recorded there and that action is not treated as decisive. That is a display bug in the timeline status logic and I will fix it in the same pass, so a step the workflow passed through shows as passed with its comment visible, and only steps after the outcome step show "Not reached".

## Technical notes

- Data repair: one migration that renumbers `approval_steps.step_order` per workflow using `row_number()` over the existing order, run inside the workflow-mutation-safe path.
- Code: `useDeleteStep` in `src/hooks/useWorkflowEngine.ts` gains a post-delete compaction step; timeline status fix in `src/components/applications/WorkflowPanel.tsx` and `src/components/returns/ReturnWorkflowPanel.tsx`.
- No change to workflow behaviour, permissions or routing.

## Verification

- Re-query all workflows for order gaps — expect none.
- Open the Pre License Approval Workflow in the admin builder: 3 steps numbered 1-3, no empty slot.
- Open the completed application's Workflow tab: 3 steps, Analyst Review shown as passed with the "All okay" comment, Licensing Officer and Final Approval completed.
