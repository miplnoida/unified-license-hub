## Scope

Two small fixes on the licensee/applicant portal. No other functionality changes.

### 1. Pre-Licensing Applications count mismatch (9 total vs 3 rows)

**Cause** — `src/pages/applications/ApplicationsList.tsx` filters rows by `?type=pre|post` on the client (lines 351–366), but the header "Total Requests / Approved / Pending / Rejected" stat cards come from the `get_application_list_stats` RPC (lines 439–456) which is NOT scoped by `typeFilter`. So when viewing Pre-Licensing Applications, stats show all applications (e.g. 9) while the list correctly shows only pre-license rows (e.g. 3).

**Fix** — When `typeFilter` is active (pre or post):
- Skip the stats RPC for those stat cards.
- Derive `statCounts` (total / approved / pending / rejected) from the same filtered 500-row payload the list already fetches (the array right before client-side pagination slicing in the existing `loadPage` effect). `pending` mirrors the RPC definition (submitted + under_review + in_progress + clarification_requested + resubmission_requested / query_raised).
- When `typeFilter` is null, keep the existing RPC-based stats unchanged.

This keeps the totals and the visible list consistent without changing the RPC contract or any other queue.

### 2. Remove "unread notifications" strip from the licensee/applicant dashboard

**Location** — `src/components/dashboard/ApplicantDashboard.tsx`, lines 94–106 (the `{(data?.notifications.unread ?? 0) > 0 && ( … )}` block that sits right after the "New application" CTA div).

**Fix** — Delete that block. Also drop the now-unused `Bell` import. The "Unread notifications" metric tile already exists elsewhere and is unaffected.

## Files touched

- `src/pages/applications/ApplicationsList.tsx` — derive stat counts from the filtered set when `typeFilter` is active.
- `src/components/dashboard/ApplicantDashboard.tsx` — remove the notifications strip + unused import.

## Verification

- Open Pre-Licensing Applications as the licensee with the reported data: header "Total Requests" should equal the row count (3), Approved/Pending/Rejected should sum to that total.
- Open Post-Licensing Applications: same consistency.
- Open the unfiltered Applications list: stats unchanged from today.
- Licensee/applicant dashboard no longer renders the highlighted notifications strip between the "New application" CTA and the insights grid.
