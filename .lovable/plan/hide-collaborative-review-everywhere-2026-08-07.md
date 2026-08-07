# Hide Collaborative Review everywhere

Collaborative Review stays fully in the codebase (components, hooks, tables, tests) but becomes invisible and unreachable in the UI, behind a single flag so it can be switched back on later.

## What changes

1. New flag file `src/lib/featureFlags.ts` exporting `COLLAB_REVIEW_ENABLED = false`.
2. Hide every mount point (render nothing when the flag is off, code left in place):
   - `src/pages/applications/ApplicationDetail.tsx` (review column)
   - `src/pages/complaints/ComplaintDetail.tsx`
   - `src/pages/returns-mgmt/ReturnDetail.tsx`
   - `src/pages/admin/RegistrationReviewDetail.tsx`
3. Hide the admin surface in `src/pages/admin/WorkflowConfig.tsx`: the "Collaborative Review" tab trigger and its tab content are only rendered when the flag is on; if that tab was the default, fall back to the first visible tab.

## Notes

- No files deleted, no database or Edge Function changes, no test removals.
- Re-enabling later is a one-line flip of the flag.
