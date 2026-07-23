## Problem

The current "Save Comment" implementation maps the action to `approve` before calling `perform_workflow_transition` / `perform_registration_workflow_transition` / `perform_return_workflow_transition`. Each of those RPCs validates:

```sql
IF NOT (_action_type = ANY(v_step.allowed_actions)) THEN
  RETURN jsonb_build_object('error', format('Action ''%s'' is not allowed on this step', _action_type), ...);
```

So when the current step's `allowed_actions` does not include `approve` for the caller's role (as on the step surfaced in application `94416f43-…`), Save Comment fails with `"action 'approve' is not allowed in this step"`. Additionally, repeatedly clicking Save Comment on the same step piles up duplicate rows in `approval_actions`.

## Fix

Treat `save_comment` as its own first-class transition action instead of masquerading as `approve`. It must advance the step (as the user asked earlier) but must not depend on `approve` being configured for the step or the role, and it must not create duplicate comments per (actor, step).

### 1. Update the three transition RPCs

Files (new migration; do NOT edit existing migrations):

- `perform_workflow_transition` (application)
- `perform_registration_workflow_transition`
- `perform_return_workflow_transition`

Changes inside each RPC:

1. Add `'save_comment'` to the valid `_action_type` whitelist so it isn't rejected as `BAD_ACTION`.
2. Skip the `allowed_actions` membership check when `_action_type = 'save_comment'` (comments are implicitly allowed on every step).
3. In the progression branch, handle `save_comment` the same way as `approve` (advance to next step, or mark final approved if last step). It uses the approve progression code path but records `action_type='save_comment'` / `action='comment_saved'` in `approval_actions`.
4. Before inserting the `approval_actions` row for `save_comment`, delete any prior `approval_actions` row where `entity_type = <entity>` AND `entity_id = <id>` AND `step_id = v_step.id` AND `actor_id = _actor_id` AND `action_type = 'save_comment'`. This enforces "only one Save Comment per actor per step".

### 2. Update the three edge functions

- `supabase/functions/perform-workflow-action/index.ts`
- `supabase/functions/perform-registration-workflow-action/index.ts`
- `supabase/functions/perform-return-workflow-action/index.ts`

Changes:

1. Remove the pre-RPC `approval_actions` insert for `save_comment` (the RPC now writes the row itself with the correct de-dup behavior).
2. Remove the `effective_action = raw_action === 'save_comment' ? 'approve' : raw_action` mapping. Pass `save_comment` through to the RPC unchanged.
3. Keep the digital-signature check keyed on `save_comment` (it will simply find no config and require nothing, matching current behavior for optional actions).
4. Keep the notification dispatch mapping for `*.comment_saved` untouched.

### 3. No frontend changes

`WorkflowPanel`, `useWorkflowEngine`, `useStepActions`, and notification templates already handle `save_comment` correctly. The UI already shows Save Comment alongside other actions; nothing to change there.

## Verification

- Load `/applications/94416f43-13d8-41ab-b4ee-a4b328ff27f5`, submit Save Comment. Confirm the step advances and no `approve`-not-allowed error appears.
- Submit Save Comment twice on the same step (via a step that loops back or via a fresh test app): confirm exactly one `approval_actions` row per (actor, step, save_comment) exists.
- Run Save Comment on a return and a registration to confirm parity across all three entities.
- Confirm the `*.comment_saved` email still dispatches with the plain-text template.

## Out of scope

- No changes to notification templates or event configs (already fixed last turn).
- No workflow builder changes — `save_comment` remains implicitly available on every step.
- No RLS or role changes.
