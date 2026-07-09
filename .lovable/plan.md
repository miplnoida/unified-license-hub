## Plan: Enable Compare Versions for resubmitted returns

**Problem found**
- The current return (`RET-2026-00026`) already has 2 revision snapshots in the database: initial submit and resubmit.
- The admin button is disabled only when the frontend receives fewer than 2 revisions.
- The likely issue is access filtering: the logged-in reviewer role (`Legal/Compliance Reviewer`) is not included in the `return_data_revisions` read policy, so the admin page receives no/too few revision rows even though they exist.

**Implementation steps**
1. **Backend access fix**
   - Add a database helper/policy update so users who can view the linked return through normal return access can also view its revision snapshots.
   - Keep access scoped to the same return only; no public or anonymous access.

2. **Frontend resilience**
   - Update the admin return detail button logic to show a loading state while revisions are loading.
   - If the revision query errors, show a clear toast/tooltip instead of silently appearing disabled.
   - Keep the button enabled when there is at least one saved revision plus current live return data, so reviewers can compare a saved revision against the current submitted values even if only one snapshot exists.

3. **Validate on the current return**
   - Confirm `RET-2026-00026` returns revision rows to the reviewer/admin context.
   - Verify the Compare Versions button is enabled and opens the diff dialog.

**Files / areas expected to change**
- Database policy/function for `return_data_revisions` access.
- `src/pages/returns-mgmt/ReturnDetail.tsx` button state.
- Possibly `src/hooks/useReturnRevisions.ts` for better error handling/loading behavior.