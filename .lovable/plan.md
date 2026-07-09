## Problem

In `src/pages/entity/returns/MyReturnsPage.tsx`, the **On-Time** column renders:

```tsx
{r.ontime_status ? <StatusBadge status={r.ontime_status === 'ON_TIME' ? 'VAL' : 'TBR'} /> : '—'}
```

It reuses the workflow `StatusBadge`, where `TBR` is defined as **"Resubmission Requested"** (destructive) and `VAL` as **"Validated"**. So a late submission (`ontime_status = 'LATE'`) incorrectly displays as "Resubmission Requested" in the On-Time column — a label mismatch, not a data bug.

## Fix

Replace the misused `StatusBadge` in the On-Time column of `MyReturnsPage.tsx` with a plain semantic `Badge` that shows the actual on-time state:

- `ON_TIME` → green "On Time" badge
- `LATE` → destructive "Late" badge
- null/undefined → `—`

Scope: presentation only, one cell in `MyReturnsPage.tsx`. No changes to data model, hooks, or the shared `StatusBadge` (still used correctly for `workflow_status`).