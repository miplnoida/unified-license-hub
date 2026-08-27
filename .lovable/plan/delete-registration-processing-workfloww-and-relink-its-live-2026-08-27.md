# Delete "Registration Processing WorkflowW" and relink its live registration

## What I confirmed in the database

- `Registration Processing WorkflowW` (entity_type: registration) is **already inactive and retired** (retired 2026-08-26). It has 2 steps and a published version.
- It has **1 live workflow instance**: the registration for **Beacon Federal Credit Union** (status `pending_review`), sitting on the workflow's first step.
- **0 approval actions** are recorded against its steps — no audit history to preserve.
- The canonical replacement is `Registration Workflow` (active, 4 existing instances).

The governed `workflow_hard_delete` function rejects deleting a workflow that has instances, so the live registration must be relinked first.

## Plan

### 1. Relink Beacon Federal Credit Union
Move its workflow instance to `Registration Workflow`, positioned on that workflow's **first step**, keeping status `active`. The registration itself stays `pending_review`; no history exists to migrate.

### 2. Delete the workflow
Remove the `Registration Processing WorkflowW` row. With no instances or actions referencing it, the governed delete (or direct delete of the now-orphaned row) removes it along with its 2 steps and their step-action/notification configuration.

### 3. Verify
Re-query to confirm: zero instances and zero references to the deleted workflow, and Beacon Federal Credit Union's registration opens in Registration Review showing the standard `Registration Workflow` steps.

## Technical notes

- Steps 1-2 are data changes (UPDATE + DELETE), no schema or frontend changes needed.
- `workflow_version_id` / `version_snapshot` on the relinked instance stay null, matching existing instances, so the review panel reads live step config from the target workflow.
