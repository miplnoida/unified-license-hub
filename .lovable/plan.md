## Problem

On Application Detail, the SLA panel renders twice:

1. **Top banner** (`ApplicationSlaBanner`) — shows "Within SLA · 2d 23h left · SLA 72h". This value is wrong: 72h is not the active step's SLA (Step 1 is configured for 2h).
2. **Inside Step 1 card** (`WorkflowPanel` → `SlaProgressPanel`) — correctly shows "Within SLA · 1h 7m left · SLA 2h".

Root cause:
- `ApplicationSlaBanner` resolves SLA from `workflow_instances` via `resolveSlaInputFromInstance`, using `updated_at` as the step start and looking up the current step in `version_snapshot.steps`. When `current_step_key`/`current_step_id` doesn't exactly match a snapshot step's `local_id`/`id`, it falls back to a different/first matching step (and uses instance `started_at` semantics), producing the misleading 72h reading.
- `WorkflowPanel` independently and correctly computes per-step SLA from `approval_actions` history (precise per-step start time), which is the intended source of truth for the detail page.

Showing two SLA cards — one of which is mathematically wrong — is what the user is reporting.

## Fix

Remove the duplicate top SLA banner from the Application Detail page. Per-step SLA already appears prominently inside the Workflow Review card next to the current step (Step 1), which is the correct, granular value the user expects ("at step 1 it should show SLA for 1 step").

This restores a single, accurate SLA display per step without losing visibility.

### Changes

1. `src/pages/applications/ApplicationDetail.tsx`
   - Remove the `<ApplicationSlaBanner …/>` render above `WorkflowPanel`.
   - Remove the now-unused import.

2. Keep `WorkflowPanel`'s `SlaProgressPanel` (per-step) untouched — it already shows the correct step SLA, deadline, % consumed, and status badge.

3. Do **not** delete `ApplicationSlaBanner.tsx`, `useWorkflowSlaInstances`, or the Applications-list SLA badge / Dashboard SLA Overview widget — those aggregate views still need the instance-level resolver.

### Out of scope

- No changes to workflow engine, step actions, notification bindings, or dashboard SLA widgets.
- No changes to the per-step SLA computation in `WorkflowPanel`.

### Verification

- Open APP-2026-000096 detail as internal user → only one SLA card is visible, inside Step 1, showing `SLA 2h` and the correct remaining time.
- Applications Queue list still shows per-row SLA badges.
- Dashboard "Workflow SLA Overview" widget still renders counts.
