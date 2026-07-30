## Goal
Prevent duplicate clicks on the "Send notification" button in Form Builder → Version History and show clear progress feedback.

## Change (single file: `src/components/form-builder/VersionHistory.tsx`)
1. Add local state `notifyingId: string | null` to track which version is currently being notified.
2. On click:
   - Guard: ignore if `notifyingId` is already set.
   - Set `notifyingId = v.id`, show a loading toast ("Sending notifications…").
   - Await `notifyVersionToLicensees(v.id)`, then replace the toast with the existing success/error message.
   - Clear `notifyingId` in a `finally` block.
3. Button UI while pending for that row:
   - `disabled` (also disabled for other rows to avoid parallel sends)
   - swap the `Send` icon for a spinning `Loader2` icon
   - tooltip/title changes to "Sending notifications…"

No changes to the notification dispatch logic, templates, or any other workflow.