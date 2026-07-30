# Reinstate an application when its appeal is considered

Today, "Consider appeal" only stamps a decision on the appeal record. The application stays `rejected` forever, so the applicant sees a dead end and staff have nothing to continue with.

## What will change

**1. Accepting an appeal reopens the application**

When a reviewer clicks **Consider appeal** on `/admin/license-appeals`, the linked application is reinstated:

- Status moves from `rejected` back to `in_progress`, `rejected_at` is cleared.
- The workflow instance that was closed on rejection is reactivated and resumes at the step where the refusal happened (no restart from step 1, no re-payment, no re-submission of forms).
- The applicant gets a notification: "Your appeal was considered — application ABC is back under review."

Declining an appeal changes nothing on the application; it stays refused.

**2. History tells the full story**

Both the application activity trail and the appeal history will show the sequence in plain English:

```text
Application refused — remarks: "…"
Appeal APL-2026-0000X lodged
Appeal considered — remarks: "…"
Application reinstated for reconsideration
```

The refusal entry is never deleted, so the record shows it was rejected and then reconsidered on appeal.

**3. UI cues**

- Application detail page: while an appeal is open or has been considered, a banner reads "Reinstated after appeal" instead of just the red Rejected badge.
- Appeal dialog confirmation text for "Consider appeal" states clearly that the application will be reopened for reconsideration.
- Applications list: reinstated applications drop the "Appeal available" cue and appear back in the active queue.

## Technical notes

- New `SECURITY DEFINER` RPC `public.reinstate_application_after_appeal(_appeal_id uuid, _remarks text)`, mirroring `reject_application_action`: sets the trusted workflow-mutation context, verifies the caller holds `license_appeals` decide permission, guards that the application is currently `rejected`, updates `applications` (status/rejected_at), flips the `workflow_instances` row from `rejected` back to `active` (clearing `completed_at`), writes an `audit_logs` entry (`application_reinstated_after_appeal`), an `approval_actions` row, a `license_appeal_events` row, and an applicant notification. All in one transaction.
- `recordDecision` in `src/hooks/useLicenseAppeals.ts` calls the RPC when `decision === 'upheld'`, then invalidates application/workflow query keys alongside the appeals key.
- `AppealActionsDialog.tsx`: reworded confirmation and success toast only.
- No change to the reject path, appeal lodging, or the 30-day window logic.
