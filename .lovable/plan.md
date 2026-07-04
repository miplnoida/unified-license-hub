## Goal

Give staff on `/applications/queue` explicit control over which applications appear, so the count can match what they see elsewhere (e.g., the 43 in the admin panel) instead of being silently capped by the default pending-only + active-sector filter.

## Changes — `src/pages/applications/ApplicationQueue.tsx`

### 1. New filter controls in the toolbar
Add two shadcn `Select` controls next to the existing search input:

- **Status** — options:
  - `Pending (default)` → current behavior: `submitted, in_progress, resubmission_requested, query_raised`
  - `Submitted`
  - `In progress`
  - `Resubmission requested`
  - `Query raised`
  - `Approved`
  - `Rejected`
  - `Withdrawn`
  - `Draft`
  - `All statuses`
- **Sector** — options:
  - `Active sector (default)` → uses `activeSectorId` (current behavior)
  - One entry per sector from `useActiveSector().availableSectors`
  - `All sectors`

Local state: `statusFilter` (default `'pending'`), `sectorFilter` (default `'active'`).

### 2. Query rebuilt from the filter values
Replace the fixed `.in('status', PENDING_STATUSES)` and `activeSectorId` OR clause with:

- Status:
  - `'pending'` → `.in('status', PENDING_STATUSES)`
  - `'all'` → no status filter
  - anything else → `.eq('status', value)`
- Sector:
  - `'active'` + `activeSectorId` present → keep existing OR filter on `data->>sector_id` / `data->>resolved_sector_id`
  - `'all'` → no sector filter
  - specific id → same OR filter using that id

Re-run the fetch whenever either filter or `refreshTick` changes (extend the existing `useEffect` deps).

### 3. Result count hint
Under the toolbar, show a small muted line: `Showing N of up to 500 · Status: <label> · Sector: <label>`. Helps explain the number vs. the admin panel.

### 4. KPIs
Recompute the four KPI cards (Pending / Breached / Due Soon / Unassigned) from the currently loaded `rows`, as today — they naturally reflect the active filter, which is the desired behavior once the user widens the view.

### 5. Everything else unchanged
- Pre/Post column, priority, assignee, bulk update dialog, permissions, sorting (priority ASC → submitted_at DESC → created_at DESC) all untouched.
- No backend, no route, no permission changes.

## Verification

- Open `/applications/queue` — default view identical to today (Pending + active sector), same 25 rows.
- Set Status = `All statuses`, Sector = `All sectors` → count grows to match the admin panel (~43).
- Pick a single status (e.g., `Approved`) → only approved rows appear.
- Pick a specific sector → only rows tagged to that sector appear; drafts/rows without a sector on `data` are excluded, matching existing sector-scoping semantics.
- Bulk update, priority change, assignee change continue to work on whatever rows are visible.
