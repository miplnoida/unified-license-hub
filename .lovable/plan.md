## Root cause

`audit_logs` has no `changes` column — its jsonb columns are `old_value`, `new_value`, and `metadata`. Two RPCs were written against a non-existent `changes` column:

- `public.enforce_action(module, action, meta)` — called by every client `authorizedAction(...)`, including the "delete role" flow (`useDeleteRole` → `authorizedAction('role_management','delete', ...)` → then `rbac_delete_role`). This is what raises `column "changes" of relation "audit_logs" does not exist` before the delete even runs.
- `public.enforce_workflow_transition(...)` — same bug, will fail every workflow transition once exercised.

`rbac_delete_role` itself is fine.

## Fix

Single migration that redefines both functions to write the meta jsonb into `audit_logs.metadata` (the correct column) instead of `changes`. No table schema changes, no signature changes, no client changes.

- `enforce_action`: insert into `(user_id, action, entity_type, entity_id, metadata)` with `metadata = COALESCE(_meta,'{}'::jsonb)`.
- `enforce_workflow_transition`: insert into `(user_id, action, entity_type, entity_id, metadata)` with `metadata = COALESCE(_meta,'{}'::jsonb) || jsonb_build_object('from_state', _from_state, 'to_state', _to_state, 'submitter', _submitter_id)`.

Keep `SECURITY DEFINER`, pinned `search_path`, existing grants (`REVOKE ALL FROM PUBLIC` / `GRANT EXECUTE TO authenticated`), and behavior otherwise identical.

## Verification

- Re-run role delete from `/admin/roles` — succeeds and leaves an `audit_logs` row with `action = 'rbac_action.role_management.delete'` and the meta in `metadata`.
- `psql -c "select action, metadata from public.audit_logs where action like 'rbac_action.%' order by created_at desc limit 3"` shows the new row.
- Existing pgTAP suites that exercise `enforce_action` / `enforce_workflow_transition` (e.g. `274_enforce_action_gate.sql`, `290_workflow_guard.sql`) continue to pass — they assert allow/deny, not the column name.