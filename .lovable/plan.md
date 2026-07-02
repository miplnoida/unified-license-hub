## Problem

For return `RET-2026-00022` (id `b48b4be7…`):
- `workflow_status = 'SUB'` (submitted)
- `resolve_return_workflow(id)` returns a valid workflow (`f42f76d0…`)
- `returns_filed.workflow_id` is `NULL`
- `workflow_instances` has **0** rows for this return

The client `useEffect` in `ReturnDetail.tsx` calls `start_return_workflow(_return_id)` on submit. Inside that RPC:

```sql
v_workflow_id := v_ret.workflow_id;   -- reads returns_filed.workflow_id (NULL here)
IF v_workflow_id IS NULL THEN
  RETURN jsonb_build_object('success', true, 'no_workflow', true, 'http', 200);
END IF;
```

Because `returns_filed.workflow_id` was never populated (routing is resolved dynamically via `resolve_return_workflow`), the RPC short-circuits with `no_workflow=true`, no `workflow_instances` row is created, and the panel keeps showing "Workflow has not started yet…". This is why the message persists even though a workflow is configured and matched.

## Fix (database-only)

Update `public.start_return_workflow(_return_id)` so that when `returns_filed.workflow_id` is NULL, it falls back to `resolve_return_workflow(_return_id)` (the same resolver the frontend already uses to detect the routed workflow) and then:

1. If the resolver also returns NULL → keep current behavior (`no_workflow=true`).
2. If it returns a workflow id → use that id to look up the first step, insert the `workflow_instances` row, and additionally persist the resolved id back onto `returns_filed.workflow_id` so subsequent reads are stable.

All other behavior — reusing an existing active/paused instance, audit log rows, `current_step_id` update, error codes — stays identical. No frontend, edge-function, or schema changes.

## Verification

After the migration, reload the return page. The client's existing auto-start `useEffect` will call `start_return_workflow`, a `workflow_instances` row will be created, and `ReturnWorkflowPanel` will render the configured multi-step approval UI (matching the application workflow panel) instead of the "not started" fallback.
