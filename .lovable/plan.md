## Fix "pending" badge on closed RFI items + confirm applicant notifications

### 1. Notifications on RFI raise — already working (verified)
Nothing new to build here; explaining what already ships so we don't duplicate:

- **In-app + email** dispatch is wired: `RaiseRfiDialog.submit()` calls `dispatchNotificationEvent({ event_key: 'application.rfi_raised', … })`.
- The notification config in `notification_event_configs` is active with channels `[in_app, email]`, `recipient_rules = [{applicant}, {entity_primary_users}]`, and both subject and body templates.
- `notification_dispatch_log` confirms recent dispatches for `application.rfi_raised` completed with `status = 'sent'` on both channels for the applicant.
- The applicant dashboard already surfaces open RFIs — `useApplicantMetrics` merges open RFIs into "Action required", and the top-header notification bell shows the same events.

If a specific applicant genuinely isn't getting notified, that's a data-scoping issue (e.g. the application's `applicant_id` doesn't match the logged-in user, or the entity has no `primary_user_id`) — call it out separately with an example and we'll patch dispatch. No code change in this plan for notifications.

### 2. Fix stale "pending" badge when the RFI is closed
`ApplicationRfiTab.RfiItemRow` always renders `item.response_status` in an orange badge. When a reviewer closes an RFI while some items were left unanswered, those items keep showing an orange **pending** pill even though the RFI is `closed` and no further response is possible — exactly the screenshot.

Change in `src/components/applications/ApplicationRfiTab.tsx` (RfiItemRow):

- If `rfiStatus === 'closed'`:
  - `responded` items → keep the existing green "responded" badge.
  - Non-responded items → render a muted **"Not responded"** badge instead of the orange "pending" one. This makes the state consistent with the parent "closed" chip and the existing "This RFI is closed to further responses." lock line.
- If the RFI is still open/responded → behaviour unchanged (pending / responded as today).

Small, UI-only change. No data or backend edits.

### Not touched
- No new notification events, templates, or dispatch calls.
- No changes to `application_rfi_items.response_status` values in the DB — the badge just renders differently in the closed state.
- No changes to admin/reviewer flows.
