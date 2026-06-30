## Problem

`APPROVER_ROLE_NOT_FOUND: roles.id=b440775e-29a6-439a-9736-ca7fd21e05a4 does not exist`

When the user edits the **Post Application Workflow → Legal/Compliance Review** step and changes the assigned role, the save fails.

Root cause: the previous dedup migration repointed `approval_steps.approver_role_id` and `user_dynamic_roles` to the canonical Legal/Compliance Reviewer row, but it did **not** clean stale role IDs stored inside `approval_steps.approver_config.role_ids` (JSONB). One step still carries the deleted duplicate role id in that array:

```
approver_config.role_ids = [
  "670c341e-...",                          -- another role
  "b440775e-29a6-439a-9736-ca7fd21e05a4",  -- DELETED duplicate (causes the error)
  "ebbd4d90-...-fe3403c0f35d"              -- canonical Legal/Compliance Reviewer
]
```

When `ApproverConfigEditor` saves, the update path validates every id in `role_ids` and rejects the request because the deleted id no longer exists in `roles`.

## Fix — one migration, no UI/business-logic changes

1. **Sweep `approval_steps.approver_config.role_ids`** across all rows and remove any ids that no longer exist in `public.roles`. Dedupe the resulting array. Leave the column untouched when nothing needs removing.
2. Same sweep for `approver_config.user_ids` against `profiles.id` (defensive — same class of stale-reference bug, scoped to JSONB only). No-op if nothing stale.
3. If `approver_role_id` itself points to a missing role on any step (shouldn't after the last migration, but guard), null it out and log via `RAISE NOTICE` so the step falls back to whatever remains in `role_ids`.

No changes to:
- `ApproverConfigEditor`, `WorkflowList`, or any other UI
- `perform-workflow-action`, workflow engine, RLS, or legal-notes flow
- The `roles` / `user_dynamic_roles` / triggers — they're already correct after the previous migration

## Acceptance

- Editing the Post Application Workflow → Legal/Compliance Review step and changing the assigned role saves successfully.
- The stale id `b440775e-…` is gone from every `approver_config.role_ids`.
- No other workflow step references a non-existent role or user id.
- All other steps load and save exactly as before.
