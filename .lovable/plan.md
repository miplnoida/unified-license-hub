## Goal
Keep the label **"Total SLA"** everywhere it appears today, but change the number it displays to the **sum of actual time spent on every workflow step so far** (not the sum of configured `sla_hours`).

## What changes

### 1. Rework `useWorkflowTotalSla` to compute elapsed time
File: `src/hooks/useWorkflowTotalSla.ts` (replace current logic)

For each entity's workflow instance:
- Load `workflow_instances` (active, paused, completed) + related `approval_actions` ordered by `created_at`.
- Decisive step-advance actions (matches `workflowSlaResolver.ts`): `approve`, `reject`, `send_back`, `escalate`, `request_resubmission`, `return_for_correction`, `request_more_info`.
- **Step start**:
  - First step → application `submitted_at` (fallback `created_at`) / instance `started_at` / `created_at`.
  - Later steps → `created_at` of the previous step's decisive action.
- **Step end**:
  - Completed step → its own decisive action's `created_at`.
  - Current (in-flight) step of an `active` / `paused` instance → `now`, minus pause time (`total_pause_seconds` + open `paused_at` if currently paused).
- Sum `(end − start)` across every step that has started.
- Return per entity: `{ totalHours, stepCount, inProgress }`.

Cached via TanStack Query, staleTime 60s. Read-only, no migration.

### 2. Minor `TotalSlaBadge` tweaks
File: `src/components/workflows/TotalSlaBadge.tsx`
- Keep the "Total SLA" label.
- Drop the `*` / "some steps have no SLA configured" note — not meaningful for elapsed time.
- Update tooltip to: *"Sum of actual time spent on each approval step so far."*
- Append `· in progress` (inline) / `Still in progress` (card) when the workflow is not yet complete.
- `stepCount` shown = number of steps that have started (completed + current in-flight).

### 3. Integration points untouched
Lists (`ApplicationsList.tsx`, `ViewReturns.tsx`, `ComplaintsList.tsx`) and detail views (`ApplicationSlaBanner.tsx`, `ReturnDetail.tsx`, `ComplaintDetail.tsx`) already consume the hook + badge; only the underlying numbers change.

## Technical Details
- Reuses the same decisive-action set and pause handling as `src/lib/workflowSlaResolver.ts` for consistency with per-step SLA logic.
- Formatting stays `Xd Yh` / `Xd` / `Yh` via existing `formatHours` helper.
- No DB schema, RLS, or workflow-execution changes.

## Out of scope
- Comparing elapsed time to configured SLA (breach math stays in `SlaIndicator` / `useWorkflowSlaInstances`).
- Editing SLA configuration or workflow behaviour.
