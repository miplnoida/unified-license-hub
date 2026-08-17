# Why the form is still locked, and the fix

## What the check found

For the application you have open (`d1b67783…`):

- There is one RFI, raised at 09:35 UTC, still `open`.
- The application status is still `submitted`, and no `pre_rfi_status` was stashed.
- The unlock trigger exists on `application_rfis`, but the migration that created it was applied at 09:46 UTC — 11 minutes *after* this RFI was raised.

So the code and triggers are correct; this RFI predates them. Nothing backfilled the RFIs that were already open, so their applications never moved to "Information Requested" and the applicant-side edit gate (which keys off that status) stays closed.

## Fix

1. **Backfill migration** — for every application that currently has at least one `open` RFI and whose status is one of `submitted` / `under_review` / `clarification_requested`: stash the current status into `data->'pre_rfi_status'` and set status to `info_requested`, writing one `application.info_requested` audit row per application (same shape the trigger writes). Uses the same trusted mutation context as the trigger so workflow guards don't reject the update.
2. **Verify** — re-query the affected applications to confirm status and `pre_rfi_status`, then open this application as the applicant in the preview and confirm the "Information requested" banner shows and a form opens in edit mode with a working Save.

No frontend changes are needed: `info_requested` is already in `EDITABLE_APPLICATION_STATUSES`, the applicant Edit action, the resubmit block, and `can_mutate_application`.
