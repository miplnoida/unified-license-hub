
## Root cause

Return `RET-2026-00025` submitted at 16:05 but never got a `workflow_id` / `current_step_id`, so it doesn't appear in any approver queue. Traced through the DB:

- `returns_filed.workflow_id` and `current_step_id` are both NULL.
- `returns_filed.sector_id`, `subsector_id`, and the licensee's sector are all NULL — the row has no scope of its own.
- The submit flow calls `start_return_workflow`, which falls back to `resolve_return_workflow(return_id)` when the return has no cached workflow.
- `resolve_return_workflow` has two bugs:
  1. It joins `returns_filed.return_configuration_id → return_configurations`, but that column actually references **`return_configs`** (different table). The join always returns NULL, so the config-derived scope is ignored.
  2. It hard-rejects fully-unscoped workflows (`regulator_id IS NOT NULL OR sector_id IS NOT NULL OR sub_sector_id IS NOT NULL`). Combined with (1), if the return + config both have NULL scope, the resolver never returns any workflow — even when exactly one active return workflow exists (the BOJ "Return Workflow" in this project).

Result: the admin-configured workflow is never picked up, so submissions get stuck at status `SUB` with no assignee.

## Fix

### 1. Rewrite `resolve_return_workflow` (migration)

- Look up scope from `returns_filed`, then fall back to `return_configs` (the correct table) for `sector_id` / `subsector_id`.
- Derive `v_regulator` from the resolved sector (`sectors.regulator_id`); if the config or return doesn't have a sector, also try `return_configurations.regulator_id` (legacy) as a second fallback.
- Match against `approval_workflows` where every scoped column is NULL or equal to the resolved value.
- **Remove** the "at least one scope column must be set" gate so a single global workflow can serve as a valid fallback. Keep the most-specific-first ordering (`sub_sector_id`, `sector_id`, `regulator_id` matches) so scoped configs still win.

### 2. Backfill the stuck return

Call `start_return_workflow('f2559959-c434-4412-9f90-64c0f6aa05b4')` after the resolver is fixed so the existing submission is assigned to the first step and shows in the reviewer queue.

### 3. Verification

- Re-check `returns_filed` for the affected id: `workflow_id` and `current_step_id` are populated, a `workflow_instances` row exists with `status='active'`.
- Confirm `/admin/returns/queue/...` now shows the assignee/step.
- Submit a fresh return against the same config → workflow starts automatically.

No frontend changes are needed; the client already calls `start_return_workflow` on submit.
