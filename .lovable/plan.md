Enhance the Application Queue Priority column so it reflects real action urgency, without altering existing schema or manual-override plumbing.

## Scope
- Single file: `src/pages/applications/ApplicationQueue.tsx`.
- No DB migration. `applications.priority`, `priority_reason`, `priority_set_by`, `priority_set_at` remain the source of truth for manual overrides.
- No changes to bulk update, assignment, audit writes, or fetching.

## New helper: `getEffectiveActionPriority(row)`

Local pure function inside the file:

```ts
type ActionPriority = {
  effective: 1 | 2 | 3 | 4 | 5 | 'on_hold';
  label: 'Critical' | 'High' | 'Normal' | 'Low' | 'Deferred' | 'On Hold';
  reason: string;
  isManualOverride: boolean;
  badgeClass: string;
  sortKey: number; // for ordering: Critical=0 … Deferred=4, On Hold=3.5
};
```

Rules, evaluated in this order:

1. **Manual override present** — treat any of these as a manual signal:
   - `priority_set_by` is not null, OR
   - `priority_reason` is a non-empty string, OR
   - `priority !== 3` (default). *(Guard: rule #1 only fires when at least one of the first two is set OR the priority differs from 3 AND `priority_set_at` is present — avoids treating the DB default as a manual override.)*

   Use the stored `PRIORITY_META[priority]` label + `priority_reason` (fallback "Manually set by officer").

2. **Waiting on applicant** — status in `['query_raised', 'resubmission_requested', 'info_requested', 'returned_for_correction', 'awaiting_applicant']` → label `On Hold`, reason `Waiting for applicant response`. (Uses status only; no extra query for RFI/workflow pause — stays inside the current row payload.)

3. **SLA-driven suggestion** — using existing `daysSince(submitted_at || created_at)` + `SLA_TARGET_DAYS`:
   - `age > SLA_TARGET_DAYS` → `Critical`, reason `SLA breached by {age - SLA_TARGET_DAYS} day(s)`.
   - `SLA_TARGET_DAYS - age in [0..3]` → `High`, reason `Due in {remaining} day(s)`.
   - Within SLA → `Normal`, reason `{remaining} day(s) remaining`.
   - Missing timestamps → `Normal`, reason `No submission date`.

Badge classes reuse the existing `PRIORITY_META` palette; `On Hold` gets an amber outline class (`bg-amber-100 text-amber-800 border-amber-200`).

## Column changes

- Rename `<TableHead>Priority</TableHead>` → `Action Priority` with a `?` info icon (Lucide `Info`) that opens a `Tooltip` (shadcn) with text: *"Action Priority is suggested from SLA and case status. Officers may override it manually."*
- Cell render:
  - Line 1: `<Badge className={ap.badgeClass}>{ap.label}</Badge>` plus a small "Manual" chip when `ap.isManualOverride` is true.
  - Line 2: `<div className="text-xs text-muted-foreground">{ap.reason}</div>`.
  - When `canManage`, add a compact "Change" popover/select (kebab or small pencil icon) that opens the existing priority `Select` (values 1-5) — keeps the manual override path intact and continues to call `updateRow(r.id, { priority, priority_reason })`. The dropdown items show `<Badge>{label}</Badge>` only, no `"1 —"` numbering.
  - Non-manager: badge + reason only.

## Sorting

- Replace the DB-level `.order('priority', ascending)` primary sort with client-side sort after `getEffectiveActionPriority` runs on each row:
  - Sort by `sortKey` ascending (Critical → Deferred; On Hold slotted between Normal and Low).
  - Tie-break by `age` descending (breached/oldest first), then by `submitted_at` descending.
- Keep the existing DB ordering as a stable pre-sort so the 500-row cap still picks the most relevant rows.

## Bulk update dialog

- Remove `"1 — "` prefix in bulk `SelectItem` labels; show label only. Keep numeric `value`.
- No other change; audit fields (`priority_set_by`, `priority_set_at`, `priority_reason`) already written by `applyBulk`.

## Preserved
- Existing hooks, filters, queries, RLS, audit trail, bulk update, assignment logic, unassigned counter, SLA chip column.
- `applications.priority` still stores the manual value; the effective label is derived at render time only.

## Verification
- DEMO-ULRA-005 (SLA-breached) now shows `Critical · SLA breached by N days` instead of `Normal`.
- A record within 3 days shows `High · Due in 2 days`.
- A record with `status = resubmission_requested` shows `On Hold · Waiting for applicant response`.
- Manually setting priority via the change dropdown persists, shows `Manual` chip, and its `priority_reason` renders as the reason line.
- Sort order lists Critical → High → Normal → On Hold → Low → Deferred, breached-first inside each bucket.
- No TS errors; bulk update dialog still applies priority + assignee.
