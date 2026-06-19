## Goal
Seed a new approval workflow named **"Complaint Management Workflow"** modeled after the existing registration workflow, so admins can use it immediately from `/workflows`.

## Data to insert

**`approval_workflows` row**
- name: `Complaint Management Workflow`
- entity_type: `complaint`
- license_type: `Domestic Insurance` (mirrors existing registration workflow)
- regulator_id: `8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3`
- sector_id: `1ea22781-fee7-4a26-b382-09f0477485d5`
- category_id: null
- is_active: true

**Two `approval_steps` rows** (cloning the registration workflow's step config):

| Order | Name | Approver type | Approver | SLA | Allowed actions | Escalation |
|---|---|---|---|---|---|---|
| 1 | Step 1 | specific_users | user `35da4b65-…3132f0` | 2h | send_back, approve, reject, request_resubmission | role `cf425653-…4bb47` after 3h |
| 2 | Step 2 | role_based_user | role `670c341e-…473a4` (super_admin) | 72h | approve, reject, send_back | none |

Both steps: `step_type=sequential`, `is_required=true`, `step_entry_notifications_enabled=true`, `auto_approve_on_timeout=false`, `sla_pause_on_rfi=false`.

## Method
One `supabase--insert` call wrapped in a CTE: insert the workflow, capture its id, insert both steps referencing it. Idempotency guard: skip insert if a workflow with this name + regulator + sector already exists.

## Out of scope
- No schema/UI changes. `complaint` is already an active workflow type, so it appears in the "Used for" dropdown without code edits.
- No notification template wiring beyond the step defaults already set.
