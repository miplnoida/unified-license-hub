# Fix: complaint workflow action fails with `column "meta" does not exist`

## What's happening

Every workflow action on a complaint (Start Triage, Assign Investigator, Resolve, Close, etc.) writes an audit entry at the end. That write targets a column named `meta`, but the audit table's column is actually `metadata`. Because the write happens inside the same transaction as the action, the whole action is rolled back and the user sees the error instead of the complaint moving forward.

Verified: the live function `execute_complaint_workflow_action` inserts into `audit_logs (entity_type, entity_id, action, user_id, meta)`, while `audit_logs` has columns `id, user_id, action, entity_type, entity_id, old_value, new_value, metadata, created_at, user_role`. No other database function references a `meta` column on that table.

## Fix

One database migration that recreates `public.execute_complaint_workflow_action` with the audit insert corrected to `metadata`. Everything else in the function is preserved byte-for-byte, including:

- the existing permission check `is_super_admin(v_user) OR has_complaint_perm(v_user, 'edit')`
- workflow step resolution, assignee rules, and instance advancement
- `approval_actions` history insert and notification outbox inserts

No workflow definitions, steps, action configuration, RBAC, or approval matrices are touched. No frontend changes.

## Validation

- Confirm no function in the database references `audit_logs(... meta ...)` after the migration.
- Run a workflow action on the complaint currently open (CMP at the "Filed" step, action "Start Triage") and confirm the step advances and an audit row lands in `audit_logs` with the details in `metadata`.
