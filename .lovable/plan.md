# Prudential Notification Log

Add a simple, plain-language log of prudential notifications with a detail view matching the returns notification log.

## What the user sees

New sidebar item **Notification Log** under Prudential Supervision, at `/prudential/notifications`.

**List page**
- Filters: event (friendly names), channel (In-app / Email), status (Pending / Sent / Delivered / Failed), plus a date-range-free simple search on subject/recipient.
- Columns: Sent At (date + time), Notification (friendly label, not the raw key), Channel, Recipient, Subject, Status, Problem (error, if any), Detail (eye icon).
- Clicking a row or the eye icon opens the detail drawer.

**Detail drawer** — reuses the same drawer style already used on the return notification log: Summary, Recipient, Delivery timeline, Message content, Diagnostics, and collapsed technical references (payload JSON, IDs).

**Non-technical wording**
- Raw event keys mapped to readable labels, e.g.
  - `prudential_stress_indicator_triggered` → "Stress indicator triggered"
  - `prudential_escalation_created` → "Escalation raised"
  - `prudential_escalation_resolved` → "Escalation resolved"
  - `prudential_action_assigned` → "Supervisory action assigned"
  - `sla.breach` → "Deadline breached"
- Statuses shown as words with colour badges; the raw key is only visible in the collapsed technical section.

## Technical notes

- Data source: existing `notification_dispatch_log`, filtered to prudential event keys (`prudential_%` plus the prudential-relevant `sla.breach` rows scoped by `module`/`entity_type`). No schema change or migration needed.
- New hook `usePrudentialDispatchLog` in a prudential hooks file, mirroring `useReturnDispatchLog` (filters for status/channel/eventKey, 500-row cap, newest first).
- New page `src/pages/prudential/PrudentialNotificationLog.tsx`; route added in `src/routes/dashboardRoutes.tsx` under `module="prudential_supervision"`; nav entry in `src/config/navigation.tsx` for internal roles.
- Reuse `src/components/returns/NotificationDispatchDetailDrawer.tsx` as-is (generic over any dispatch row) — no changes to the returns log behaviour.
- Friendly label map lives in a small `src/lib/notificationLabels.ts` helper with a fallback that humanises unknown keys.
- All timestamps via `formatDateTime`.
