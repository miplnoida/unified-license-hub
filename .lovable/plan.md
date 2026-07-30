## What I found (verified in the database)

- Application `APP-2026-000131` (`e2d244b7…`): `status = rejected`, `rejected_at = 30 Jul 08:59`.
- Its appeal `APL-2026-000001`: `decision = upheld`, `decided_at = 30 Jul 12:34`, `status = decided`.
- The appeal's event history has `filed → panel_assigned → decided`, but **no `application_reinstated` event**, and there is no `application_reinstated_after_appeal` audit entry. So the decision was saved, but the reinstatement step never completed for this appeal.
- The application's workflow instance is `status = completed` (not `rejected`). The reinstatement function only reactivates instances whose status is `rejected`, so even on a successful run the workflow would not have reopened here.

Two separate problems: this one record is stuck, and the logic/UX has gaps that let it get stuck silently.

## Plan

1. **Repair this record**: run the reinstatement for appeal `APL-2026-000001` so `APP-2026-000131` returns to `in_progress`, its workflow instance is reactivated at the step it was refused, and the audit trail / applicant notification are written.

2. **Handle refused workflow instances that ended as `completed`**: broaden the reinstatement function to pick the most recent instance in `rejected` **or** `completed` state for the application (keeping the existing guard that never creates a second active/paused instance).

3. **Make failure visible instead of silent**: when an appeal is accepted, treat the reinstatement result as part of the operation — if the function returns an error or is skipped, the UI surfaces a clear message rather than a plain "Appeal considered" success toast.

4. **Add a retry path**: on an already-decided, upheld appeal whose application is still `rejected`, show a "Reopen application" action in the admin appeal dialog so staff can complete the reinstatement without developer help. Uses the same function, so it stays idempotent.

5. **Verify**: re-check the application status, workflow instance, appeal events, audit log and applicant notification for APP-2026-000131, and confirm the applicant's application page shows the "Reinstated after appeal" banner.

### Technical notes
- Files touched: `public.reinstate_application_after_appeal` (migration), `src/hooks/useLicenseAppeals.ts`, `src/components/appeals/AppealActionsDialog.tsx`.
- No changes to appeal lodging, panels, notifications templates, or unrelated workflow behaviour.
