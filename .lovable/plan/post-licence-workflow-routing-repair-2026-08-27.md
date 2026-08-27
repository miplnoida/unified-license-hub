# Post-Licence Workflow Routing Repair

Minimal, backward-compatible repair so the 120 existing post-licence (PLS) service workflows actually get selected and completed. No workflow redesign, no consolidation, no changes to queue, fees, forms, duplicate protection or Tier-1 effects.

## What I verified first (current state)

- The 120 PLS workflows are `entity_type = 'post_application'`, `license_type = 'general'`, **`regulator_id = NULL`**, with `service_id` and `sub_sector_id` set and `category_id` NULL. The single legacy `Post Application Workflow` has a regulator and no taxonomy scope.
- The frontend resolver (`src/lib/workflowApprovalResolver.ts`) filters `.eq('regulator_id', effectiveRegulator)` — so NULL-regulator workflows can never match.
- The governed DB resolver already exists in a post-licence-aware overload `_resolve_application_workflow(license_type, regulator_id, sector_id, category_id, is_post_license)`, and `submit_application` / `repair_application_workflow` already call that overload with the post flag. Two real gaps remain there:
  - it never matches on `service_id` (the frontend does, as top priority), and
  - it derives `sub_sector_id` only from `category_id`, which is NULL for post-licence applications, so the sub-sector tier is dead for them.
  So the DB and frontend can resolve different workflows for the same application.
- Terminal behaviour: for application workflows the engine treats "last step by `step_order`" as terminal — `perform_final_workflow_approval` explicitly rejects anything that is not the last step, and completes the instance itself. The `is_terminal` / `is_start` columns are used by the complaints/conduct engines, not by the application engine. PLS final steps are already last by order, so terminal completion works once routing works; the flags will be set for consistency only.
- Step roles today: step 1 `analyst` (Licensing Analyst Review / Regulatory Review), step 2 `licensing_officer` (standard, 40), `supervisor` (enhanced specialist, 32), `analyst` (F&P, 24), `licensing_officer` (notification close, 24), Final Approval `analyst` (96). The working legacy post-licence workflow uses `super_admin` for Final Approval.

## Changes to make

### 1. One idempotent migration

**A. Backfill regulator scope (data-config, guarded).**
Set `regulator_id` on PLS workflows only, derived from `service → sub_sector → sector → regulator`, and only `WHERE regulator_id IS NULL AND entity_type = 'post_application' AND name LIKE 'PLS - %'`. Re-runnable, touches no other workflow.

**B. Correct step roles for the 120 workflows (scoped to PLS workflow ids only).**

| Family | Step sequence after fix |
|---|---|
| Standard | Licensing Analyst Review (`analyst`) → Licensing Officer (`licensing_officer`) → Final Approval (`super_admin`) |
| Enhanced | Licensing Analyst Review (`analyst`) → Specialist Review (`supervisor`) → Final Approval (`super_admin`) |
| Fit & Proper | Licensing Analyst Review (`analyst`) → Fit & Proper Assessment (`supervisor`) → Licensing Officer (`licensing_officer`) → Final Approval (`super_admin`) |
| Notification | Regulatory Review (`analyst`) → Acknowledge & Close (`licensing_officer`) |

Only the incorrect assignments change: every `Final Approval` step moves `analyst → super_admin` (matching the existing working post-licence workflow), and the F&P assessment step moves `analyst → supervisor`. Analyst steps keep their current non-final action set (`approve`, `reject`, `send_back`) so an analyst can review, comment and send back but cannot issue the final decision.

**C. Step flags.** Set `is_start = true` on the lowest `step_order` and `is_terminal = true` on the highest `step_order` per PLS workflow, clearing them on intermediate steps. Documented as convention alignment only — the application engine's terminal gate remains `max(step_order)`.

**D. Resolver: add service and sub-sector inputs.** Create a new overload
`_resolve_application_workflow(_license_type, _regulator_id, _sector_id, _category_id, _is_post_license, _service_id, _sub_sector_id)` that keeps the existing tier order and adds the two missing tiers, giving: **service > category > sub-sector > sector > regulator-only > legacy license_type prefix**. Sub-sector falls back to derivation from category when not passed. The existing 4-arg and 5-arg overloads are kept untouched and re-implemented as thin delegations with NULL service/sub-sector, so every current caller and pre-licence path behaves exactly as today.

**E. Callers.** `submit_application` and `repair_application_workflow` pass `data->>'service_id'` and `data->>'sub_sector_id'` into the new overload. Nothing else in their logic changes; no historical application is migrated onto a new workflow.

### 2. Frontend alignment (`src/lib/workflowApprovalResolver.ts`)

Keep the existing architecture and priority order; only make its scope test match the DB resolver: accept a workflow whose `regulator_id` equals the effective regulator (after the backfill all PLS rows qualify), and align the sub-sector tier so it uses the application's `sub_sector_id` the same way the DB resolver now does. No new routing logic and no second resolver.

## Verification I will run

- **Routing, per family** — Change of Legal Name (standard), Change of Control (enhanced), Director Appointment (F&P), Material Incident Notification (notification): resolve the workflow for a real service/licence combination and confirm the correct PLS workflow id, regulator, step sequence, final approver and last-step terminal completion.
- **Resolver parity** — for each representative service, compare the frontend resolver result with `_resolve_application_workflow` output and report application type, regulator, sector, sub-sector, service, selected vs expected workflow id/name, PASS/FAIL.
- **End-to-end proof** — create and submit a post-licence application through the governed path in a rolled-back transaction and prove `workflow_instances` attaches the service-specific PLS workflow, then walk it to completion. Routing is not reported as fixed on the basis of row counts.
- **Regression** — pre-licence resolution unchanged, legacy post-licence workflow still resolves for services with no PLS workflow, existing 17 applications unmodified (before/after row hashes), queue/forms/fees/payments resolution unaffected, workflow counts stay at 120 workflows / 360 steps.

## Out of scope (will be reported as remaining limitations)

Backend duplicate protection; real F&P assessment linkage from the F&P step; Tier-1 post-approval canonical effects; service-picker legacy `Change of Registered Address` duplication; source-control reproduction of the original 120 service/form/fee rows.
