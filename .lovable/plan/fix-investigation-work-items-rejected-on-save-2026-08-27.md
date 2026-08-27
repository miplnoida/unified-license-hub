# Fix: investigation work items rejected on save

## What is actually wrong (verified)

The work-item table `complaint_investigation_tasks` still carries the original check constraint from its first migration:

```text
status IN ('pending', 'in_progress', 'completed', 'cancelled')
```

The current governed save function `complaint_investigation_task_save` (the only path the Investigation panel uses) writes the canonical uppercase states `NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED | CANCELLED`, and the UI (`InvestigationTasksPanel.tsx`) and readiness functions read those uppercase states. So every new work item is rejected by the old lowercase constraint — the exact error the user sees.

The table currently holds zero rows, so there is no historical data at risk. The column default is also stale (`'pending'`).

## Fix

One migration, no UI change:

1. Drop `complaint_investigation_tasks_status_check`.
2. Normalise any existing rows (safe no-op here, needed for other environments): map `pending → NOT_STARTED`, `in_progress → IN_PROGRESS`, `completed → COMPLETED`, `cancelled → CANCELLED`, uppercase anything else recognised.
3. Set the column default to `'NOT_STARTED'`.
4. Re-add the check constraint on the canonical set: `NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED`.
5. Align the two remaining lowercase readers/writers so nothing can reintroduce the old values:
   - `public.complaint_task_set_status` — accept and write the canonical uppercase states (still normalising legacy lowercase input for safety).
   - `public.complaint_task_create` — insert `NOT_STARTED` explicitly.
   - `public.my_work_queue` — the open-task filter `t.status <> 'completed'` becomes `upper(t.status) NOT IN ('COMPLETED','CANCELLED')` so completed items stop appearing in the personal queue.

Readiness functions (`complaint_investigation_readiness`, `complaint_closure_readiness`) already accept both casings, so they need no change.

## Frontend

`src/lib/conductGovernedOps.ts` — update the doc comment on `complaintTaskSetStatus` to the canonical states (no active callers). No component changes: the Investigation panel already speaks uppercase.

## Verification

- Insert a work item through `complaint_investigation_task_save` and confirm it persists with `NOT_STARTED`, then move it to `IN_PROGRESS` and `COMPLETED`.
- Confirm the constraint definition lists only the five canonical states, and that the closure-readiness mandatory-task blocker still counts correctly.

## Out of scope

Work-item semantics, labels, permissions/RLS, RFI and plan behaviour, and the wider investigation workflow.
