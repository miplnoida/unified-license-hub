## Goal
Registration Review currently filters the list to a hardcoded set of "in-flight" statuses. Show **all** registration requests, and add a status filter so reviewers can narrow the view.

## Change

**File:** `src/pages/admin/RegistrationReview.tsx`

1. **Fetch all statuses** — remove the `.in('status', [...])` filter in `load()`. Query returns every registration ordered by `created_at desc`.

2. **Add status filter UI** — above the table, add a shadcn `Select` filter:
   - Options: `All statuses` (default), plus each distinct status present in the loaded rows (dynamically derived, formatted with underscores → spaces + title case). Fallback baseline includes: `pending_verification`, `pending_review`, `in_progress`, `approved`, `rejected`, `resubmission_required`, `returned_for_correction`, `info_requested`.
   - Store selection in local state `statusFilter` (default `'all'`).
   - Also add a simple text search box (applicant name / email / reference) for usability.

3. **Client-side filtering** — derive `filteredRows` via `useMemo` applying `statusFilter` and search text against `rows`. Table renders `filteredRows`. Empty-state message adjusts when filter is active ("No registrations match the current filter").

4. **Row count indicator** — small muted text showing `Showing X of Y` next to filters.

## Out of scope
- Workflow drawer behavior, hydration logic, SLA columns — untouched.
- Server-side filtering / pagination.
- Bulk actions.
