# NOT-CEN-001 — Notification Centre

Builds on the Phase 2 notification model (`notifications.status/severity/category/module/preview/source_reference/source_route`, audited RPCs `notification_mark_read`, `notification_mark_all_read`, `notification_dismiss`, `notification_archive`, `notification_mark_actioned`, `notification_counts`, `notification_record_delivery`, `log_notification_audit`).

## Canonical route and deprecation

- Canonical route: `/notifications` → `src/pages/notifications/NotificationCenter.tsx` (registered in `src/routes/dashboardRoutes.tsx`).
- Canonical state: the existing single `NotificationsContext` (`src/contexts/NotificationsContext.tsx`) + `useNotifications`. No second context or page will be created.
- `src/pages/Notifications.tsx` (hardcoded array) has no importers anywhere in `src/` — it will be deleted after a repeat reference check.
- New admin route: `/admin/notification-history` in `src/routes/adminRoutes.tsx`, gated by the `settings` module permission (same gate as notification templates).

## Backend additions (one migration)

1. `notification_feed(_tab, _module, _severity, _type, _status, _from, _to, _search, _cursor_created_at, _cursor_id, _limit)` — SECURITY DEFINER, scoped to `auth.uid()`, keyset pagination (`created_at desc, id desc`), tab semantics (all/unread/action_required/alerts/system/archived), search over title/message/source_reference/entity_id with a 3-char minimum.
2. `notification_delivery_for(_notification_id)` — returns the user's own dispatch rows (channel, status, timestamps, retry count, failure reason).
3. `notification_bulk_export_intent(_ids)` — authorises + audit-logs an export, returns only rows the caller may see.
4. `notification_forward(_notification_id, _to_user_id, _note)` — creates an internal forward record/draft, writes `NOTIFICATION_FORWARDED` audit, and returns the target thread/draft reference. If the thread manager write path is unavailable it returns an explicit `not_available` result so the UI shows a real failure rather than a fake success.
5. `notification_history(...)` for R-01/authorised admins — joins `notification_dispatch_log` with recipient/event/template/channel/status/retry/error/source, with filters, search and keyset pagination; permission-gated via `enforce_permission`.

All new tables/functions get GRANTs to `authenticated` (+ `service_role`) and re-use existing RLS.

## Frontend

**Bell (`src/components/layout/Header.tsx`)**
Real unread count from context; destructive/red styling when any unread critical or high exists; pulse animation on a newly arrived critical (realtime INSERT); last 20 in the drawer with loading, error and empty states; Mark All Read; View All Notifications; safe navigation via `notificationLink` (RBAC/RLS still enforced by the destination route). Shown for any authenticated role with notification access.

**Context (`NotificationsContext.tsx`)**
Add a 60s polling fallback that engages when the realtime channel does not reach `SUBSCRIBED` (or errors), plus a `realtimeHealthy` flag. Keep existing action APIs; add `forward`, `exportSelected`, and paginated feed access via a new `useNotificationFeed` hook (TanStack `useInfiniteQuery` over `notification_feed`).

**Notification Centre page**
Tabs: All / Unread / Action Required / Alerts / System / Archived. Filters: module, severity, type, status, date range. Search (min 3 chars, debounced). Cursor pagination with "Load more" — no 100-row ceiling.
List item: module indicator, severity badge, title, preview, relative time (absolute on hover via tooltip), source module, source reference, status, action-required flag, unread styling, selection checkbox.
Detail drawer: full content, severity, type, module, created timestamp, source reference, role-appropriate metadata, delivery channels/status (where permitted), and actions — Open Source Record (marks actioned), Mark as Read, Dismiss (optional note), Forward to Colleague.
Bulk bar: Mark selected read, Dismiss selected, Export selected (CSV via the audited export intent).
All mutations: progress state, disabled-while-pending (no duplicate clicks), optimistic update with rollback on failure, toast with a meaningful error message.

**Admin history (`src/pages/admin/NotificationHistory.tsx`)**
Table of recipient, event key, type, template, channel, status, date/time, retry count, failure reason, source reference; filters + search; delivery-detail drawer; Retry/Resend for failed rows (invokes `notification-retry` with `x-triggered-by: admin`), each retry audit-logged. Non-authorised users never see the route or the nav entry.

## Tests (Vitest, `src/test/`)

`notificationFeed.test.ts` (tab filtering, severity filter, search min-length, cursor pagination), `notificationBell.test.tsx` (realtime insert, polling fallback, critical styling), `notificationActions.test.ts` (mark read, mark all read, dismiss + note, archive visibility, bulk actions audit, API failure rollback), `notificationDeepLink.test.ts` (deep-link action marks actioned; blocked source access surfaces a denial, not data), `notificationHistoryRbac.test.tsx` (admin history RBAC, retry permission gating). Run with `bunx vitest run`.

## Out of scope this phase

NOT-THR-001 (Communication Threads — only the forward integration contract is implemented) and NOT-ESC-001 (Escalation Manager). Preference UI/digest scheduling remains for the preference phase.
