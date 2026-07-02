## Problem

On `RET-2026-00022`, Step 1 (Level 1) is configured with `approver_type = 'specific_users'` (a specific user), but the workflow panel displays it as "Admin". The label comes from `stepRoleLabel` in `src/components/returns/ReturnWorkflowPanel.tsx`:

```ts
const stepRoleLabel = (step) => {
  if (step.approver_role_id) return dynamicRolesMap[step.approver_role_id] || 'Configured role missing';
  return ROLE_LABELS[step.approver_role as AppRole] || step.approver_role;   // <-- falls back to legacy 'admin'
};
```

It ignores `approver_type` and `approver_config.user_ids`, so a specific-user step falls through to the legacy `approver_role` field and shows "Admin".

## Fix

In `ReturnWorkflowPanel.tsx`, port the same specific-user handling already used by `src/components/applications/WorkflowPanel.tsx`:

1. Collect every `approver_config.user_ids` across `steps` where `approver_type === 'specific_users'`.
2. Fetch matching `profiles(id, full_name, email)` in a single query via `useQuery`.
3. Update `stepRoleLabel` so that:
   - `specific_users` → `Specific user(s): <name1, name2 …>` (or "none selected" when empty).
   - `role_based_user` with `approver_role_id` → dynamic role name (current behavior).
   - Fallback → legacy role label.

No changes to database, workflow engine, or other components. Purely a display fix in the return workflow panel.
