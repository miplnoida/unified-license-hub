## Why it looks like Total SLA only shows on Complaints

- **Complaints list & detail** — `TotalSlaBadge` renders unconditionally, so it's always visible.
- **Applications list** — badge is gated by `total && total.stepCount > 0`. Rows whose workflow instance has no decisive action yet, or where the total hook is still loading/empty, render nothing → user sees a blank cell.
- **Returns queue / Return detail** — badge is wired in, but only in the SLA column / right rail; on narrower viewports it can be scrolled off, and if `workflow_instances` for that return isn't `active/completed` yet it stays empty.
- **Registration Review (list & detail)** — `TotalSlaBadge` / `useWorkflowTotalSla` are **not integrated at all**. That's the main gap.

Data check confirmed `workflow_instances` exist for `application` (64), `return` (6), `registration` (20), and `complaint` (28), so the hook has data to compute against on all four modules.

## Changes

1. **Registration Review list** (`src/pages/admin/RegistrationReview.tsx`)
   - Call `useWorkflowTotalSla({ entityType: 'registration', entityIds: filteredRows.map(r => r.id) })`.
   - Add a "Total SLA" column (next to the existing "SLA" column) rendering `<TotalSlaBadge entry={byEntityId.get(r.id)} />`.

2. **Registration Review detail** (`src/pages/admin/RegistrationReviewDetail.tsx`)
   - Add `<TotalSlaBadge variant="card" entry={...} />` alongside the existing workflow/SLA panel so reviewers see cumulative elapsed time.

3. **Applications list** (`src/pages/applications/ApplicationsList.tsx`)
   - Remove the `stepCount > 0` gate so the badge renders as soon as a workflow instance exists (in-progress step already increments `stepCount` to 1, but the guard also hides rows during initial hook load). Fall back to a muted `—` when there is genuinely no workflow.

4. **Returns queue** (`src/pages/returns-mgmt/ViewReturns.tsx`) and **Return detail** (`src/pages/returns-mgmt/ReturnDetail.tsx`)
   - No logic change; verify placement is inside the always-visible SLA column and that the detail card badge stays in the header strip (not the collapsible right rail) so it's visible without scrolling.

No hook or calculation changes — the elapsed-time logic in `useWorkflowTotalSla` stays as-is. Purely a UI/wiring fix so Total SLA is consistently surfaced across License Requests, Registration Review, and Returns Queue the same way it is in Complaints.
