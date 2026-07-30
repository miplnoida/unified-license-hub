## Problem

The "Notify" action in Form Builder → Version History only writes in-app rows. Confirmed in `src/hooks/useFormTemplates.ts`:

- `notifyVersionToLicensees()` (line ~1528) resolves licensee + PPOC user IDs and does a direct `supabase.from('notifications').insert(...)` with `channel: 'in_app'`. No email path at all.
- `notifyUpcomingVersionIfNeeded()` (line ~1477, fired on scheduling a future version) does the same.

Email in this system flows only through the `dispatch-notification-event` edge function, which resolves recipients from `notification_event_configs`, renders templates, writes the in-app row **and** sends SMTP mail with dispatch logging/dedupe. A query of `notification_event_configs` shows no `form_version.*` event keys exist yet.

## Fix

1. **Add two event configs** (migration, seeded into `notification_event_configs`, `channels: ['in_app','email']`, `is_active: true`, recipient rule `[{"type":"payload_user","key":"recipient_user_id"}]`):
   - `form_version.published` — admin-triggered notify
   - `form_version.upcoming` — scheduled/future effective version
   Each gets `title_template`, `message_template`, `email_subject_template`, plain-text `email_body_template` using tokens: `{{form_name}}`, `{{semantic_version}}`, `{{effective_date}}`, `{{app_url}}`.

2. **Rewrite both helpers** in `src/hooks/useFormTemplates.ts` to stop inserting `notifications` rows directly and instead call `dispatchNotificationEvent()` (from `src/lib/notificationEvents.ts`) once per recipient, with `entity_type: 'form_version'`, `entity_id: versionId`, and payload `{ recipient_user_id, form_name, semantic_version, effective_date }`. Dispatch calls are batched with limited concurrency (e.g. 10 at a time) so large licensee lists don't stall the UI, and remain fire-and-forget so a mail failure never breaks the admin action.
   - Duplicate in-app rows are avoided because the dispatcher already inserts the in-app notification.
   - `notified_for_upcoming` flag handling stays unchanged.

3. **Toast wording** in `src/components/form-builder/VersionHistory.tsx` becomes "Notification queued for N user(s) (in-app + email)" so the message matches actual behaviour.

## Notes

- Email delivery still depends on SMTP being configured under Settings → Email/SMS; if SMTP is off, the dispatch log will record `failed`/`skipped` rows that can be inspected in `notification_dispatch_log`.
- No changes to workflow, publishing, scheduling, or version-diff behaviour.
