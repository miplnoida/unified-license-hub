## Goal

Keep only the user-created `registration workflow` (2 steps). Remove the auto-seeded `Default Registration Workflow` and make sure every pending registration uses the user's workflow.

## Plan

1. **Replace `resolve_registration_workflow`** so it always returns the user's workflow:
   - For `entity_type = 'registration'` and `is_active = true`, try in order:
     1. exact `sector_id` match
     2. same `regulator_id` (any sector), `ORDER BY updated_at DESC`
     3. global active registration workflow, `ORDER BY updated_at DESC`
   - This makes the 2-step `registration workflow` win for any sector under its regulator.

2. **Remove the seeded default**:
   - Delete `approval_step_actions`, `approval_steps`, `approval_workflow_versions`, and the `approval_workflows` row for `Default Registration Workflow` (id `7441328c-…`). Safe because no completed actions reference its step (only currently-pending instances do, and those will be re-pinned in step 3).
   - Drop the seed `DO $$ … 'Default Registration Workflow' … $$` block from future seeds by making it conditional on a non-existent flag (or just rely on the `IF NOT EXISTS` guard — since the user-created workflow now exists, it won't re-seed).

3. **Re-pin pending registration instances** that point to the deleted default:
   - For each `workflow_instances` row with `entity_type='registration'` and `workflow_id = 7441328c-…` whose registration is still in a pending status, call `resolve_registration_workflow(sector_id)` and update the instance to the new workflow's id, current first step, version snapshot, and reset `started_at = now()`.
   - Historical (approved/rejected) registrations: leave untouched.

4. **Verification**:
   - `SELECT id, name FROM approval_workflows WHERE entity_type='registration'` returns only `registration workflow`.
   - Open Registration Review for the Banking pending registration → panel shows "Level 1 of 2" with both steps and their configured actions.
   - Create a new registration under any sector under the regulator → instance is pinned to the 2-step workflow.

### Technical notes

- All work is in one SQL migration: function replacement + targeted deletes + targeted updates of `workflow_instances`. No client/UI changes — `WorkflowPanel` already renders steps and actions dynamically from `approval_steps` / `approval_step_actions` for whichever `workflow_id` the instance points to.
- The resolver stays `SECURITY DEFINER` so `start_registration_workflow` keeps working.
- If any pending instance has a `sector_id` whose regulator doesn't match the user's workflow regulator, the resolver returns NULL and the instance is left unchanged — flagged via a NOTICE in the migration so you can see it.
