## Fix: Return "Notif Templates" and "Notif Log" pages

### Root cause
There are two parallel notification systems:

- **Active** — `notification_event_configs` (19 `return.*` event rows) → `notification_dispatch_log` (74 return dispatches) → `notifications` (in-app). This is what actually fires when a return is submitted, resubmitted, approved, etc.
- **Dead-wired** — `return_notification_templates` + `return_notifications_log`. Templates exist but no code, trigger, or edge function ever reads templates or writes to the log. That is why the Notif Templates page shows configured entries but no notifications flow through them, and Notif Log stays at 0 records.

The Return Admin UI is pointed at the dead pair. Rewire it to the active system, filtered to `event_key LIKE 'return.%'`.

### Changes (frontend only, no DB schema changes)

1. **`src/pages/admin/returns/NotifTemplatesPage.tsx`** — replace data source with `notification_event_configs` where `event_key LIKE 'return.%'`. Columns: Event Key, Description, Channels (in_app/email badges), Type, Active toggle, Actions. Editor dialog exposes: title template, in-app message template, email subject template, email body template, channels checkboxes, notification type, dedupe window, active. Token palette updated to the actual variables (`{{return_unique_id}}`, `{{entity_name}}`, `{{return_name}}`, `{{return_period}}`, `{{return_year}}`, `{{actor_name}}`, `{{reviewer_name}}`, `{{action_comments}}`, `{{new_status}}`, `{{previous_status}}`, `{{edit_reason}}`, `{{workflow_step_name}}`, `{{next_workflow_step_name}}`). Editing is limited to existing return events; the "Add" button is removed since event keys are code-driven.

2. **`src/pages/admin/returns/NotifLogPage.tsx`** — replace data source with `notification_dispatch_log` where `event_key LIKE 'return.%'`, joined/formatted for display. Columns: Sent At, Event Key, Channel, Recipient (email or user), Subject, Status, Error. Filters: Status (sent/failed/pending), Channel (in_app/email), Event Key dropdown populated from distinct return events.

3. **`src/hooks/useReturnsManagement.ts`** — add/replace hooks:
   - `useReturnEventConfigs()` — SELECT from `notification_event_configs` filtered by `event_key.like.return.%`, ordered by `event_key`.
   - `useMutateReturnEventConfig()` — UPDATE only (title/message/subject/body/channels/type/dedupe/is_active).
   - `useReturnDispatchLog({ status?, channel?, eventKey? })` — SELECT from `notification_dispatch_log` filtered by `event_key.like.return.%`, ordered by `created_at desc`, limit 500.
   - Keep the legacy `useReturnNotificationTemplates` / `useReturnNotificationsLog` hooks in place if referenced elsewhere, but the two pages stop using them.

No backend/edge-function changes. No changes to what fires notifications — that path already works (visible in `notifications` and `notification_dispatch_log`). This just points the admin surfaces at the real data so templates are editable and the log shows the 74+ existing return dispatches.

### Out of scope
- Migrating/removing `return_notification_templates` and `return_notifications_log` tables. They stay untouched.
- Adding new event types or channels.