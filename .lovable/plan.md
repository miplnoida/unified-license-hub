## Goal
Show a "Total SLA" figure — the sum of `sla_hours` across every step of the active approval workflow — on both list rows and detail pages for:
- License requests (Applications list + Application detail)
- Returns queue (admin `ViewReturns` list + `ReturnDetail`)
- Complaints (`ComplaintsList` + `ComplaintDetail`)

This is a presentation-only addition; step-level SLA badges/panels already in place remain unchanged.

## Approach

### 1. New shared hook: `useWorkflowTotalSla`
File: `src/hooks/useWorkflowTotalSla.ts`

- Input: `{ entityType, entityIds }` (same signature as `useWorkflowSlaInstances`).
- Query joins `workflow_instances` (active/paused) → `approval_steps` grouped by `workflow_id`, summing `sla_hours` per workflow.
- Fallback: if no live steps exist for a workflow, sum `sla_hours` from `version_snapshot.steps` on the instance (matches existing resolver's snapshot fallback).
- Returns `Map<entityId, { totalHours: number; stepCount: number; workflowId: string }>`.
- Cached via TanStack Query (staleTime 60s).

### 2. New shared UI: `TotalSlaBadge`
File: `src/components/workflows/TotalSlaBadge.tsx`

- Compact chip: `"Total SLA: 5d 4h (4 steps)"` for lists; verbose card variant for detail pages (`"Total workflow SLA · sum across N approval steps"`).
- Uses same `formatHoursShort` style as `SlaIndicator`.

### 3. Wire into list pages (one column / inline chip)
- `src/pages/Applications.tsx` (license request queue): add inline `TotalSlaBadge` next to existing per-step SLA badge.
- `src/pages/returns-mgmt/ViewReturns.tsx`: batch entity ids from visible rows, render badge in row.
- `src/pages/complaints/ComplaintsList.tsx`: render badge in the SLA cell / evidence row.

### 4. Wire into detail pages
- `src/components/applications/ApplicationSlaBanner.tsx` — append total-SLA line under the step SLA panel (keep the existing `SlaProgressPanel`).
- `src/pages/returns-mgmt/ReturnDetail.tsx` — add badge in the header meta block.
- `src/pages/complaints/ComplaintDetail.tsx` — add badge in the SLA/summary section.

## Technical Details

- No DB migrations. Read-only: `approval_steps.sla_hours` already exists.
- Steps with `sla_hours = null` are excluded from the sum (badge shows `"—"` and tooltip "Some steps have no SLA configured" when any step is null).
- Total SLA is per-workflow, so entities pointing at the same workflow share the total; the hook caches by `workflow_id` to avoid duplicate work.
- No behavior changes to breach/warning logic, notifications, or workflow execution.

## Out of scope
- Editing SLAs.
- Recomputing existing per-step SLA colors or escalation dispatches.
- Non-workflow SLA sources (e.g., complaint `sla_days`) — those stay as-is.
