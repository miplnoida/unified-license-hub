## Goal
Mark all 16 returns for "New FinCorp Commercial Bank Limited" (2022 Q1 – 2025 Q4) as submitted and fully approved through the return approval workflow. Leave 2026 Q1 untouched (stays WIP).

## Scope

Entity: `New FinCorp Commercial Bank Limited` (`30a3c4cb-…`)
Active return workflow: `Return Workflow` (`f42f76d0-…`) with steps Level 1 → Level 2 → VAL.

Affected 16 rows in `returns_filed` (currently all `WIP`, no workflow attached):
- 2022 Q1–Q4, 2023 Q1–Q4, 2024 Q1–Q4, 2025 Q1–Q4

## Changes (data-only, via `supabase--insert`)

1. **Attach workflow + submit**
   Update the 16 rows:
   - `workflow_id = f42f76d0-3a96-4e87-a08b-90a34bd576f7`
   - `workflow_status = 'SUB'`
   - `submit_date = now()`
   - `current_step_id = Level 1 step id`
   - `ontime_status` computed from `submit_date` vs `due_date` (`on_time` if ≤ due_date else `late`).

2. **Approve Level 1 → Level 2**
   Insert `approval_actions` rows (`entity_type='return'`, `action_type='approve'`, `step_id=Level 1`, `actor_id` = a regulator/admin uid) and advance `current_step_id` to Level 2.

3. **Approve Level 2 → Validated**
   Insert `approval_actions` rows for Level 2 approve, then set:
   - `workflow_status = 'VAL'`
   - `current_step_id = NULL`

4. **Audit trail**
   Insert `return_audit_log` entries for submit + each approval so the timeline reflects the transitions.

## Non-goals / preserved behavior
- No schema/RLS/code changes.
- 2026 Q1 return (`87a20403-…`) is untouched.
- No changes to `return_form_data`, form definitions, or workflow configuration.
- No notifications dispatched (pure data backfill).

## Verification
After apply, query `returns_filed` for the entity and confirm 16 rows show `VAL` with `submit_date` set and 2026 Q1 still `WIP`. Spot-check `approval_actions` and `return_audit_log` for one return.

## Open question
Which user should be recorded as the approver for the `approval_actions` / `updated_by` fields? If you don't specify, I'll use the entity's `assigned_supervisor_id` when set, otherwise the first active regulator admin user.