## Plan

1. **Repair existing workflow role data everywhere**
   - Backfill any remaining live `approval_steps` missing or referencing invalid `approver_role_id`.
   - Backfill `approver_config.role_ids` so every role-based approval step points to the same configured `roles.id`.
   - Repair stale `approval_workflow_versions.snapshot.steps` entries, including published snapshots that still have missing or deleted role IDs.
   - Re-check workflow templates and only repair them if any stale role reference is found.

2. **Prevent the error from coming back**
   - Update the workflow UI save path so changing a step role writes both:
     - `approver_role_id`
     - `approver_config.role_ids`
   - Update “add step” and template/snapshot apply paths so newly-created steps always receive a configured role ID and matching `approver_config.role_ids`.
   - Update the backend create-workflow RPC so atomic workflow creation also requires/assigns valid role IDs instead of inserting null values.

3. **Keep other functionality unchanged**
   - Do not alter approval actions, routing, notification logic, workflow matching, permissions, or UI layout.
   - Keep current role mapping behavior, preferring existing configured/system roles by `approver_role`.

4. **Verify before saying fixed**
   - Run database diagnostics showing zero live step issues and zero snapshot/template role issues.
   - Test the workflow operation that was failing so the `APPROVER_ROLE_ID_REQUIRED` error no longer appears.
   - Only report completion after the backend verification succeeds.