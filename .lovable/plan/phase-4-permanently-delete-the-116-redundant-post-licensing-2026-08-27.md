# Phase 4 — Permanently delete the 116 redundant post-licensing workflows

Narrow cleanup: hard-delete the 116 inactive `PLS - ...` workflows and only their own child configuration. Nothing else changes.

## Fresh verification already run (read-only)

- `PLS - %` workflows remaining: **116**, all `is_active = false` (the 4 canonical ones were renamed in Phase 1, so they no longer carry the prefix and are outside the candidate set by name as well as by ID).
- Candidate set (PLS-prefixed, inactive, not one of the 4 canonical IDs, not the generic fallback): **exactly 116**. Guard count satisfied.
- Their own approval steps: **348** (not 356 — the actual number will be reported after deletion).
- Operational references to candidates: `services.workflow_id` 0, `applications.workflow_id` 0, `workflow_instances.workflow_id` 0, `workflow_instances.current_step_id` 0, `returns_filed.workflow_id` / `current_step_id` 0, `approval_actions.step_id` 0, `application_legal_notes` 0, `application_legal_referrals` 0, `application_ai_assessments.proposed_routing_step_id` 0.
- Child config rows on candidate steps: `approval_step_actions` 0, `approval_action_notifications` 0, `approval_step_entry_notifications` 0, `approval_workflow_versions` 0. So the only rows that actually disappear are 116 workflows + 348 steps.
- Generic `Post Application Workflow`: present and active.

## Foreign-key behaviour relied on

Cascading children of `approval_workflows`: `approval_steps`, `approval_workflow_versions`, `workflow_instances` (0 rows for candidates). Cascading children of `approval_steps`: `approval_step_actions`, `approval_action_notifications`, `approval_step_entry_notifications`.

Blocking (`NO ACTION`) references — all verified at 0 for candidates: `approval_actions.step_id`, `returns_filed`, `workflow_instances.current_step_id`, `application_legal_notes`, `application_legal_referrals`, `application_ai_assessments`. Because they are all zero, the delete cannot silently damage another module; if any were non-zero the migration aborts.

## The migration (idempotent, guarded)

One migration that:

1. Builds a candidate CTE: `name LIKE 'PLS - %'` AND `is_active = false` AND `id NOT IN (<4 canonical ids>)` AND `name <> 'Post Application Workflow'` AND zero rows in `services`, `applications`, `workflow_instances`, `returns_filed` referencing the workflow or its steps.
2. Asserts the candidate count is `116` (delete) or `0` (already applied → no-op). Any other value raises an exception and aborts, deleting nothing.
3. Also asserts zero blocking references from `approval_actions`, `returns_filed`, `application_legal_notes`, `application_legal_referrals`, `application_ai_assessments`, `workflow_instances.current_step_id` — otherwise raises.
4. Captures before-counts and MD5 row hashes for `applications` and `workflow_instances` into temp state for the report.
5. `DELETE FROM approval_workflows WHERE id IN (<candidate ids>)` — one statement, cascade handles steps/versions/step actions/notifications.
6. Re-asserts after the delete: canonical 4 still active, generic fallback still active and unchanged, 120 service mappings all pointing at active workflows, `applications` and `workflow_instances` hashes identical to before. Any mismatch raises so the whole migration rolls back.

Nothing else is touched: no service, form, fee, payment, queue, role, F&P, register, returns, complaints or reporting change.

## Verification reported after the migration

- Before/after: redundant workflow count (116 → 0), redundant step count, references from services/applications/workflow instances (0 each).
- Deleted counts actually observed: workflows, approval steps, workflow versions, step actions, step notifications.
- Preserved: 4 canonical workflows with their 12 steps, generic fallback active and unchanged, 120 service mappings (Standard 40 / Enhanced 16 / Fit & Proper 40 / Notification 24, unmapped 0, mapped-to-missing 0, mapped-to-inactive 0), applications and workflow_instances hashes unchanged.
- Routing certification via `_resolve_application_workflow` plus the frontend resolver's mapping tier, PASS/FAIL each: Change of Legal Name → Standard, Group Restructure → Enhanced, Director Appointment / Change of Control / Shareholding Change / Beneficial Owner Change → Fit & Proper, Material Incident Notification → Post-License Notification, generic fallback for an unmapped service, and pre-licence regression (pre-licence workflows, applications and resolution unchanged; no pre-licence service references a post-licence canonical workflow).
- No service resolves a deleted workflow ID.
- Workflow Management screen after deletion: only the 4 canonical post-licence workflows plus the generic fallback appear; the 116 records are gone. No UI redesign.

## Out of scope / unchanged

Application Queue and its RPC, services (verification reads only), forms, form versions, fees, payments, invoices, duplicate protection, roles, F&P, public register, licence lifecycle, returns, complaints, reports, dashboards, post-approval effects.
