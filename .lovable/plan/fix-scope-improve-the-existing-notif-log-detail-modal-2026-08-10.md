# Fix scope: improve the existing Notif Log detail modal

I misread the earlier request and added a new "Notification Log" menu under Prudential Supervision. This plan removes that addition and instead improves the detail modal on the existing Notif Log page (`/admin/returns/notifications/log`).

## 1. Undo the extra menu

- Remove the "Notification Log" sidebar item under Prudential Supervision.
- Remove the `/prudential/notifications` route and its page file.
- Keep `src/lib/notificationLabels.ts` (the plain-language label mapping) since the detail modal will use it. Remove the unused prudential-only data hook.

## 2. Make the detail modal non-technical

Rework the existing detail drawer used by Notif Log so a non-technical user can read it:

- Header shows a plain-language event name (e.g. "Return submitted", "Stress indicator triggered") instead of the raw event key; the raw key moves into the collapsed technical section.
- Status and channel shown as friendly words ("Delivered", "Failed to send", "Waiting to send"; "Email", "In-app", "SMS") with a one-line explanation of what the status means and, on failure, a plain-English reason.
- Timeline shown as a simple vertical list of only the events that actually happened (Requested → Sent → Delivered / Failed), each with date and time, rather than a grid of empty fields.
- "Who it went to" section leading with recipient name, then email/phone, and the related record described in words instead of a table name.
- Message section kept, with subject and rendered body.
- Everything technical (IDs, correlation/dedupe keys, template version, provider, payload JSON, raw error details, delivery-state code) collapsed under a single "Technical details" toggle, hidden by default.

## Technical notes

- Files touched: `src/components/returns/NotificationDispatchDetailDrawer.tsx` (rework), `src/lib/notificationLabels.ts` (extend with channel/status descriptions and failure-reason text), `src/config/navigation.tsx` and `src/routes/dashboardRoutes.tsx` (remove new entry), delete `src/pages/prudential/PrudentialNotificationLog.tsx` and `src/hooks/usePrudentialNotifications.ts`.
- No database, RLS, or hook/query changes; the drawer keeps consuming the same dispatch row shape, so the returns log page needs no data changes.
