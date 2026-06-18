Root cause: the step lookup is failing because the code queries non-existent `approval_steps` fields (`step_key`, `step_level`). That makes `step_name` unavailable, so `{{step_name}}` becomes blank in the sent email.

Plan:
1. Fix `dispatch-notification-event`
   - Query only real step fields: `id`, `name`, `step_order`, `workflow_id`.
   - Populate `step_name`, `step_level` from `step_order`, `previous_step_name`, `next_step_name`, and `workflow_name`.
   - Log lookup errors instead of silently continuing with blank values.

2. Fix the preview dialog
   - Update `WorkflowActionPreviewDialog` to use `step_order` instead of missing fields.
   - Make preview render `{{step_name}}` before the reviewer confirms, so edited overrides do not carry unresolved tokens.

3. Fix registration dispatch payload
   - Include both the approved/current step and next step explicitly.
   - For approval emails, ensure `step_name` means the step that was just approved, not the next step.

4. Deploy and verify
   - Deploy the updated notification function.
   - Trigger/inspect a registration notification and confirm the subject/body show `Step 1` or `Step 2` instead of `""` or `{{step_name}}`.

Note: the already-sent email cannot be changed, but this will fix future workflow notification emails.