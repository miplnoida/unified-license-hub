# Backfill SLA for APP-2026-000096

## Why SLA was empty
- `applications.workflow_id` for `b7496054-080b-4652-b404-edb903280a5d` is `NULL`.
- `workflow_instances` has zero rows for this entity_id, so the SLA banner correctly renders its empty state.
- No `approval_workflows` row exists with `entity_type='application'` matching this app's taxonomy (Building Society / Building Society / Building Society) — so the submit flow had nothing to instantiate.

## Fix (data-only, no code changes)

Single migration that does both:

### 1. Create an active "application" workflow by cloning Pre Licensee Approval Workflow v1
- `approval_workflows` insert
  - `name = 'Application Review (Default)'`
  - `entity_type = 'application'`
  - `license_type = 'Application'` (required NOT NULL)
  - `is_active = true`
  - `regulator_id = 8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3` (same as this app)
  - sector / sub_sector / category / service = `NULL` → global scope
- `approval_workflow_versions` insert
  - `workflow_id = <new>`, `version_number = 1`, `status = 'published'`, `published_at = now()`
  - `snapshot` = cloned from Pre Licensee Approval Workflow v1, with each step's `sla_hours` rewritten to `1` and `sla_warning_threshold_percent` left at 80
- `approval_workflows.current_published_version_id` updated to the new version id
- `approval_steps` rows mirrored from the snapshot (3 steps, `sla_hours=1`, default actions) so future submissions also work end-to-end through the workflow engine
- `approval_step_actions` rows mirrored from the snapshot (approve / reject / send_back) per step

### 2. Backfill the workflow_instance for APP-2026-000096
- `workflow_instances` insert
  - `entity_type = 'application'`, `entity_id = b7496054-080b-4652-b404-edb903280a5d`
  - `status = 'active'`
  - `current_step_id` / `current_step_key = de660e7e-1dcb-4c6b-8f6f-8b17081e6511` (cloned step 1 local_id)
  - `started_at = 2026-06-23 09:56:48+00` (the app's `submitted_at`)
  - `updated_at = now()`
  - `version_snapshot` = exact snapshot stored in step 1 above
- `applications.workflow_id` updated to the new workflow id (so the detail page shows the workflow link)

## Scope guardrails (per your earlier instructions)
- No application status mutation — `applications.status` stays `submitted`.
- No code changes to WorkflowPanel, SLA calculation, or Decision-Ready Summary.
- No changes to other apps. Only this one row gets a workflow_instance.
- Future submissions (any sector) will now pick up the new global "Application Review (Default)" workflow on submit. If you want a different global default or a Building-Society-scoped variant instead, say so and I'll adjust before running the migration.

## Verification after migration runs
- Reload `/applications/b7496054-...`: SLA banner shows "Within SLA · ~1h left" then warns/breaches per the 1h timer.
- Application Queue row for APP-2026-000096 shows the SLA badge.
- WorkflowPanel renders 3 steps with current = Step 1.

## Technical details
- All inserts are in one `supabase--migration` call wrapped so failures roll back.
- Snapshot keeps the original action set (approve / reject / send_back) and approver roles (supervisor → licensing_officer → admin); only `sla_hours` is overridden.
- `version_snapshot.version` bumped to a new uuid string to avoid colliding with the source.
