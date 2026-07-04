## Goal

Ensure Applications Queue, Returns list, and Complaints list all show the most recently submitted rows at the top.

## Findings

- **Complaints (`ComplaintsList.tsx`)** — already sorts by `created_at DESC`. No change needed.
- **Returns (`returns-mgmt/ViewReturns.tsx`)** — already sorts by `submit_date DESC`, then `created_at DESC`. No change needed.
- **Applications Queue (`ApplicationQueue.tsx`)** — currently sorts by `priority ASC`, then `submitted_at ASC` (oldest first). This is the only page that needs fixing.

## Change

`src/pages/applications/ApplicationQueue.tsx` (query at lines ~134–135):

- Keep `priority ASC` as the primary sort (business intent: critical items first).
- Flip the secondary sort to `submitted_at DESC` (`ascending: false, nullsFirst: false`), and add a tertiary `created_at DESC` tiebreaker so drafts that were never submitted still bubble by recency.

No changes to filters, columns, permissions, or the other two pages.

## Verification

- Open `/applications/queue`: within each priority band, newest submissions appear on top.
- `/complaints` and returns list continue to show newest first (unchanged).
