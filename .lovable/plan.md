# Fix appeal acknowledgement and panel referral controls

## What's wrong

The admin appeal dialog is fed a **snapshot** of the appeal row that was captured when the row was clicked in the register. Acknowledging the appeal updates the database and refreshes the register list, but the dialog keeps showing the old copy of the record. So:

- The "Acknowledge appeal" block stays visible after a successful acknowledgement and can be clicked again and again (each click rewrites `acknowledged_at` and adds another "acknowledged" history entry).
- The referral block's "Refer & constitute panel" button stays disabled with "The case file must be complete before the appeal can go to a panel", because "Appeal acknowledged" is a required case-file item and the panel section is still reasoning from stale state.

Confirmed in the data: APL-2026-000003 is already acknowledged and has a refusal decision on file with a rationale, i.e. its case file is complete — the UI simply isn't reflecting it.

## Changes (frontend only)

1. **Live appeal record in the dialog**
   - Add a single-appeal query hook (`useLicenseAppeal(appealId)`) in `src/hooks/useLicenseAppeals.ts`.
   - `AppealActionsDialog` uses the incoming appeal only as the identifier/initial value and renders from the live record, so any mutation (acknowledge, refer, schedule, decide) immediately re-renders the dialog with fresh values.

2. **Acknowledge button behaviour**
   - Hide the whole acknowledgement block as soon as `acknowledged_at` exists; show a small "Acknowledged on <date & time>" line instead.
   - Guard against double submits: disable while the mutation is in flight and ignore clicks when already acknowledged.
   - After acknowledging, explicitly refresh the case-file status so the referral section updates without reopening the dialog.

3. **Refer & constitute panel button**
   - Disable only while the case-file status is still loading or genuinely not ready; enable as soon as required items are satisfied.
   - When it is not ready, replace the generic sentence with the actual outstanding required item names, so it is clear what is blocking.
   - Keep the existing case-file checklist visible, and show a spinner state while the status is being fetched instead of an unexplained disabled button.

No backend, RPC, or permission changes — the server rules already behave correctly.

## Verification

Open Admin → Licensing Appeals, select a pending appeal, acknowledge it, and confirm the button disappears immediately, the history records exactly one acknowledgement, and "Refer & constitute panel" becomes clickable once the checklist shows Complete.
