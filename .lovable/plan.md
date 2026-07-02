## Problem

The trigger `validate_approval_step_role` throws
`APPROVER_ROLE_ID_REQUIRED: approval steps must reference a configured role (roles.id)` whenever any UPDATE runs against an `approval_steps` row where `approver_type = 'role_based_user'` and `approver_role_id` is NULL.

Currently 9 legacy step rows across 4 workflows are in this broken state (e.g. `Pre Licensee Approval Workflow` steps 1–3, plus `VRF-EMPTY-ACTIONS`). They still have the old-style `approver_role` text (`supervisor`, `admin`, `licensing_officer`) but no FK into `roles`. Any edit to those workflows fails.

## Fix (data-only backfill)

Run one migration that, for every step matching the broken pattern, sets `approver_role_id` to the best-matching row in `public.roles` based on the existing `approver_role` text:

- Prefer `roles.is_system = true` where `roles.system_role = step.approver_role`.
- Fall back to any `roles` row with the matching `system_role`.
- Also seed `approver_config.role_ids = [role_id]` when the config is empty, matching how the app writes it today.

Steps whose `approver_role` has no matching role at all (none exist in current data) are left untouched; the UI already surfaces "Configured role missing" for those.

No schema changes. No trigger changes. No app/UI code changes — the existing WorkflowList / ApproverConfigEditor code already writes both fields correctly for any newly created or edited step.

## Technical detail

Single SQL migration:

```sql
WITH pick AS (
  SELECT DISTINCT ON (s.id)
    s.id AS step_id, r.id AS role_id
  FROM public.approval_steps s
  JOIN public.roles r
    ON r.system_role::text = s.approver_role::text
  WHERE s.approver_role_id IS NULL
    AND COALESCE(s.approver_type, 'role_based_user') = 'role_based_user'
  ORDER BY s.id, r.is_system DESC, r.created_at ASC
)
UPDATE public.approval_steps s
SET approver_role_id = pick.role_id,
    approver_config = CASE
      WHEN s.approver_config IS NULL OR s.approver_config = '{}'::jsonb
        THEN jsonb_build_object('role_ids', jsonb_build_array(pick.role_id::text))
      ELSE s.approver_config
    END
FROM pick
WHERE s.id = pick.step_id;
```

Then a verification `SELECT count(*)` to confirm no `role_based_user` steps are left with `approver_role_id IS NULL`.

## Out of scope

- Trigger logic (`validate_approval_step_role`) — unchanged.
- WorkflowList / ApproverConfigEditor UI — unchanged.
- Templates, per-action routing, notifications — unchanged.
