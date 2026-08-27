# Post-Licensing Workflow Consolidation — Phase 1 & 2

Scope: designate 4 canonical post-licence workflows, map all 120 service records to them via `services.workflow_id`, and make the resolver prefer that explicit mapping. No retirement, no deletion, no engine redesign.

## Metadata conflict check (done up front)

`requires_fit_and_proper = true` for exactly five services: Beneficial Owner Change, Change of Control, Director Appointment, Key Function Holder Change, Shareholding Change. Applying the stated rule (F&P flag wins):

- Change of Control and Shareholding Change move from Enhanced to Fit & Proper.
- Beneficial Owner Change moves from Enhanced to Fit & Proper (it is flagged `true`).
- Enhanced therefore keeps only Group Restructure and Entity Deregistration / Relationship Closure.

No other contradictions: all `notification` decision-type services (Director Resignation, Material Outsourcing, Material Incident) map to the Notification pattern, and no `approval` service maps to Notification. `requires_fit_and_proper` is not modified.

Resulting counts: Standard 40, Enhanced 16, Fit & Proper 40, Notification 24 = 120.

## Phase 1 — canonical workflows

Reuse one existing, verified representative per signature rather than creating new rows (zero applications and zero workflow instances reference any of them, so reuse is safe and preserves the signature byte-for-byte). Only `name`, `description`, `service_id`, `sub_sector_id` on the workflow header change; steps are not touched.

| Canonical name | Reused workflow | Steps |
| --- | --- | --- |
| Standard Post-License Approval | `7e9e0fc2` (PLS - Building Society - Branch Closure) | 3 |
| Enhanced Post-License Approval | `2b5fdc86` (PLS - Building Society - Change of Control) | 3 |
| Fit & Proper Post-License Approval | `24d71346` (PLS - Building Society - Beneficial Owner Change) | 4 |
| Post-License Notification | `d2590edc` (PLS - Building Society - Director Resignation) | 2 |

Each is re-scoped to regulator-only (`service_id = NULL`, `sub_sector_id = NULL`, `sector_id = NULL`, `category_id = NULL`, `entity_type = post_application`, active) so it is a reusable library workflow rather than a sub-sector-specific one. Steps, roles, actions, SLA, notifications, visibility and start/terminal flags are left exactly as verified.

Side effect, intentional: those 4 workflows leave the service-scoped taxonomy tier, so their 4 original services would have fallen back to taxonomy — the Phase 2 explicit mapping covers them, and the resolver change lands in the same migration so there is no window where they are unrouted.

## Phase 2 — map 120 services

Set `services.workflow_id` for all 120 post-licence service rows by service name, keyed to the canonical workflow ids resolved by name inside the migration (no hard-coded UUIDs beyond the four representative ids, which are looked up by their pre-rename identity so the migration is re-runnable).

- Standard: Change of Legal Name, Change of Address, New Branch, Branch Closure, External Auditor Change
- Enhanced: Group Restructure, Entity Deregistration / Relationship Closure
- Fit & Proper: Director Appointment, Key Function Holder Change, Change of Control, Shareholding Change, Beneficial Owner Change
- Notification: Director Resignation, Material Outsourcing Notification, Material Incident Notification

Only rows already scoped as post-licence services (those referenced by a `PLS - ...` workflow) are updated; no other service row is touched.

## Resolver change (smallest safe change)

Two symmetrical edits, both additive:

1. `public._resolve_application_workflow(..., _service_id, _sub_sector_id)` — insert one lookup ahead of the existing taxonomy chain: if `_service_id` has a `services.workflow_id` pointing at an active workflow of an allowed `entity_type`, use it. Otherwise fall through to today's chain (service-scoped → category → sub-sector → sector → regulator-only → legacy `license_type`), unchanged.
2. `src/lib/workflowApprovalResolver.ts` — the same preference in `matchWorkflowForApplication`, checked before the existing `ranked.find(...)` cascade. This is required, not optional: `resolveAttachedActiveWorkflow` rejects an attached workflow unless it equals the fresh match, so without this edit mapped post-licence applications would treat their own workflow as stale.

Pre-licence resolution is untouched (`entity_type` split unchanged, and pre-licence services carry no post-licence mapping). The generic Post Application Workflow remains the regulator-only fallback.

## Preserved / not touched

Existing application rows, workflow instances, pre-licence workflows, the generic Post Application Workflow, forms, fees, payments, Application Queue, roles, F&P architecture, public register, returns, complaints. The other 116 `PLS - ...` workflows stay active and unchanged — they simply stop being selected because the explicit mapping wins.

## Source control

One idempotent migration containing: the 4 canonical re-designations (guarded so re-running is a no-op), the 120 `services.workflow_id` updates (set by name, idempotent), and the `_resolve_application_workflow` replacement. No live-database-only change.

## Verification to report back

- Counts of services mapped per canonical workflow, plus unresolved count and wrong-workflow count.
- For Change of Legal Name, Group Restructure, Director Appointment, Material Incident Notification: `service_id`, `workflow_id`, workflow name, first step, terminal step, role sequence.
- Resolver check: call the resolver for one service per pattern and assert it returns the canonical workflow and its first step.
- Regression: application rows unchanged, zero workflow instances rewritten, pre-licence resolution unchanged, generic workflow unchanged, forms/fees/payments/queue untouched.
- Build and typecheck clean.

## Remaining issues to carry forward (not in this task)

- The Fit & Proper step still does not create or link a real F&P assessment record.
- Service picker cleanup for post-licence services.
- Tier-1 post-approval effects.
- Source-control reproducibility for the original service/form/fee seed data, if still pending.
- Phase 3 retirement of the 116 redundant `PLS - ...` workflows.
