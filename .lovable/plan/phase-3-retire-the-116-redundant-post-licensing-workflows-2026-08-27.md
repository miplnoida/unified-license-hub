# Phase 3 — Retire the 116 Redundant Post-Licensing Workflows

Configuration cleanup only: deactivate the redundant `PLS - ...` workflows, keep everything else exactly as it is. No deletions, no resolver redesign.

## Fresh read-only verification (already run)

- `PLS - ...` workflows: 116 total, all active — plus the 4 canonical workflows, which were renamed in Phase 1 and no longer carry the `PLS - ` prefix.
- Candidate set (PLS-prefixed, active, excluding the 4 canonical IDs): **exactly 116**. Count guard satisfied.
- References to candidates: `services.workflow_id` = 0, `workflow_instances` = 0, `applications.workflow_id` = 0, `approval_workflow_versions` = 0. `workflow_id` exists only on `applications`, `services`, `workflow_instances` in the public schema, so there is no other operational FK to retire against.
- Approval steps on candidates: 348 (the 4 canonical workflows hold the remaining 12 of the 360).
- Service mapping today: Standard 40, Enhanced 16, Fit & Proper 40, Notification 24 = 120 post-licence services mapped, 0 unmapped.

Since the candidate count is exactly 116 and no candidate has an operational reference, retirement proceeds.

## Retirement mechanism

Workflow Management already uses `approval_workflows.is_active` for on/off (`handleToggleActive` sets `is_active: false`). Phase 3 uses that same column — no new status field.

## The migration (idempotent, guarded)

One migration that:

1. Builds the candidate set in a CTE: `name LIKE 'PLS - %'` AND `is_active` AND `id NOT IN (<4 canonical ids>)` AND no row in `services`, `applications`, or `workflow_instances` referencing it.
2. Asserts the candidate count is `116` or `0` (0 = already retired, rerun case). Any other count raises an exception and aborts the migration — nothing is retired.
3. `UPDATE approval_workflows SET is_active = false, updated_at = now()` for that candidate set only.
4. Touches nothing else: no step deletes, no application updates, no workflow-instance updates, no service updates, no changes to the generic `Post Application Workflow` or the 4 canonical workflows.

Rerunning it is a no-op because the candidate filter requires `is_active`.

## Post-retirement verification to report

- Counts: canonical active = 4, retired PLS = 116, deleted workflows = 0, approval steps still present = 360.
- Service mapping: 120/120 mapped; Standard 40 / Enhanced 16 / F&P 40 / Notification 24; mapped-to-inactive = 0; unmapped = 0.
- Routing rehearsal (read-only, via `_resolve_application_workflow` and the frontend resolver's mapping tier) for Change of Legal Name, Group Restructure, Director Appointment, Material Incident Notification — reporting service id, `services.workflow_id`, selected workflow id/name, active status, first step, terminal step, role sequence, PASS/FAIL.
- One service whose own former dedicated `PLS - ...` workflow is now retired: prove it routes to its canonical workflow and not the retired one.
- Generic `Post Application Workflow` still active and still resolving as fallback for a service with no mapping.
- Pre-licence regression: pre-licence workflow rows, resolution and applications unchanged; no pre-licence service carries a post-licence `workflow_id`.
- Data protection: before/after row hashes for the 17 applications (including the 2 NULL-workflow drafts) and for `workflow_instances`; services unchanged except the Phase 2 mappings; forms, fees, payments, queue, roles, duplicate guard untouched.
- Audit evidence from whatever mechanism already records `approval_workflows` configuration changes (reported as-is; no new audit architecture).

## Known limitation to report, not fix

`WorkflowList` renders an Active/Inactive badge per workflow but has no dedicated retired/inactive filter or view toggle. Retired workflows will therefore still be listed under their workflow type, marked Inactive, rather than hidden behind a filter. Per scope, Workflow Management is not being redesigned in this task — this will be reported as a limitation.

## Remaining issues carried forward (reported, not fixed)

- Post-licence service picker: `lifecycle_stage = 'post_license'` filtering and legacy `Change of Registered Address` vs `Change of Address`.
- Fit & Proper step still not linked to real F&P assessment records.
- Tier-1 post-approval canonical effects (legal name, address, director resignation, branches, external auditor, deregistration).
- Source-controlled reproducibility of the original 120 services/forms/fees seed data.
