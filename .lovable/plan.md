
## Problem

1. `Assigned` column shows `assigned_team` (role text) and `investigator_id` profile — not the users configured in the complaint approval workflow's current step.
2. No `workflow_instances` are being created for complaints. Root cause found in `start_complaint_workflow()`: the workflow lookup uses `w.regulator_id IS NULL OR w.regulator_id = NEW.regulator_id`. All recent complaints have `regulator_id = NULL`, and the seeded complaint workflow has a non-null `regulator_id`, so no workflow matches → no instance, no dynamic assignment, no notification.
3. Current step for the seeded workflow uses `approver_type = 'specific_users'` with two user ids in `approver_config.user_ids`; the trigger only writes the role text into `assigned_team` and only notifies by role — it ignores `specific_users` config.

## Fix

### 1. Migration: repair `start_complaint_workflow()` + backfill

- Relax workflow selection so a complaint with `regulator_id IS NULL` still picks up the best active `entity_type='complaint'` workflow:
  ```
  WHERE w.entity_type='complaint' AND w.is_active
    AND (NEW.regulator_id IS NULL OR w.regulator_id IS NULL OR w.regulator_id = NEW.regulator_id)
  ORDER BY (w.regulator_id = NEW.regulator_id)::int DESC, w.updated_at DESC NULLS LAST
  ```
- Resolve assignees by `approver_type`:
  - `specific_users` → `approver_config->'user_ids'`
  - `role_based_user` → `user_roles` where `role::text = approver_role` (and/or roles listed in `approver_config.role_ids`)
- Notify all resolved users via `notifications` (in-app), same shape as today.
- Set `complaints.assigned_team` to the step's `approver_role` text for display continuity.
- One-time backfill in the same migration: for every existing complaint that has no active `workflow_instances` row, insert one using the same resolver logic and emit the assigned notification.

### 2. `src/pages/complaints/ComplaintsList.tsx` — resolve names from the workflow

- After loading complaints, fetch in parallel (internal view only):
  - `workflow_instances` where `entity_type='complaint'` and `entity_id IN (complaint ids)` and `status IN ('active','paused')`.
  - The referenced `approval_steps` (id, approver_role, approver_role_id, approver_type, approver_config).
  - For any step with `approver_type='role_based_user'`, expand to user ids via `user_roles` filtered by `role::text = approver_role` (or `role_id IN approver_config.role_ids`).
  - Extend the existing `profiles` batch fetch to include all resolved assignee user ids.
- Build `assigneesByComplaintId: Map<complaintId, Array<{ id; full_name; email }>>`.
- Render the `Assigned` cell as:
  - Line 1: `approver_role` from the current step (falls back to `assigned_team`).
  - Line 2: comma-separated resolved names (`John Doe, Jane Roe`) with `+N` overflow after 2 names; `Unassigned` when the list is empty.
- No change to sorting/filters this pass; team filter continues to key off `assigned_team`.

### 3. Verification

- Re-run trigger against an existing complaint via UPDATE... no, just insert a test row through the app or SQL and confirm a `workflow_instances` row appears and the Assigned column shows the two configured user names.

## Out of scope

- Reassignment UI, changing the workflow config editor, notification email templates (already seeded in prior turn).

## Files touched

- New: `supabase/migrations/<ts>_fix_complaint_workflow_assignment.sql`
- Edit: `src/pages/complaints/ComplaintsList.tsx`
