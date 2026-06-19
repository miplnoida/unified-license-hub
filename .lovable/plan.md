## Goal

Add a new approval workflow named **Commercial Bank Pre Licensee** that is structurally identical to the existing "registration workflow", but scoped to pre-licensee applications for the Commercial Bank sector.

## Scope (data-only change)

No application code, components, hooks, edge functions, or RLS policies will be touched. The change is a single data insert into `approval_workflows` + `approval_steps`.

## New workflow row (`approval_workflows`)

| Field | Value |
|---|---|
| name | Commercial Bank Pre Licensee |
| entity_type | `pre_application` |
| license_type | `Commercial Bank` |
| regulator_id | `8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3` (same as registration workflow) |
| sector_id | `d90ffa53-709b-41e8-a6d9-efd1bbac69bc` (Commercial Bank) |
| category_id | `36b7076c-182a-45cf-bbdd-7c3fab66b1ac` (Commercial Bank) |
| is_active | true |
| description | null |

Uniqueness: `approval_workflows_unique_scope_used_for` is keyed on regulator + sector + entity_type (+ category). No existing `pre_application` workflow targets this sector, so the insert will not collide.

## Steps (`approval_steps`) — copied verbatim from the registration workflow

**Step 1**
- step_order: 1, name: "Step 1", step_type: sequential, is_required: true
- approver_type: `specific_users`, approver_config: `{"user_ids":["35da4b65-baa5-426c-be83-3991b03132f0"]}`, approver_role: `admin`
- sla_hours: 2, sla_warning_threshold_percent: 80, sla_pause_on_rfi: false
- allowed_actions: `['send_back','approve','reject','request_resubmission']`
- escalation_role: `cf425653-646c-4d8e-83b7-67fc07d4bb47`, escalation_after_hours: 3
- step_entry_notifications_enabled: true, auto_approve_on_timeout: false

**Step 2**
- step_order: 2, name: "Step 2", step_type: sequential, is_required: true
- approver_type: `role_based_user`, approver_role: `super_admin`, approver_role_id: `670c341e-a6fe-44f0-831e-f464238473a4`, approver_config: `{"role_ids":["670c341e-a6fe-44f0-831e-f464238473a4"]}`
- sla_hours: 72, sla_warning_threshold_percent: 80, sla_pause_on_rfi: false
- allowed_actions: `['approve','reject','send_back']`
- No escalation
- step_entry_notifications_enabled: true, auto_approve_on_timeout: false

## Execution

Single `INSERT` (workflow) + two `INSERT`s (steps) run via the data tool — no schema migration, no code edits.

## Verification

- `SELECT` the new workflow and its two steps to confirm they match the source.
- Confirm it appears in Admin → Approval Workflows list filtered by Pre Application + Commercial Bank sector.
- Existing "registration workflow" remains untouched and continues to handle licensee registrations.
