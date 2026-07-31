## Verified current state (evidence-based)

FRD text read from `ABC_FRD_v1-2.docx` §10 (NOT-CEN/THR/ESC, R-NOT-001…011). Code/DB verified by reads and live queries.

### Traceability matrix

| FRD item | Current state | Evidence |
|---|---|---|
| NOT-CEN list/inbox | **Partial** | `src/pages/notifications/NotificationCenter.tsx` (routed `/notifications`, `dashboardRoutes.tsx:190`) + `NotificationsContext.tsx` realtime; only All/Unread tabs |
| Old duplicate page | **Duplicated/obsolete** | `src/pages/Notifications.tsx` — hardcoded array (lines 22-30), not routed anywhere |
| Bell badge + drawer | **Partial** | `Header.tsx:130-134` — click only marks read + goes to `/notifications`; no severity-red badge, no critical animation |
| Severity Critical/High/Medium/Low | **Missing** | `notifications` has `type` only (`info/success/warning/error`); severity taxonomy exists elsewhere (`src/lib/dashboardInsights.ts:14`) with no bridge |
| Tabs Action Required / Alerts / System, module + severity + date filters, search ≥3 chars | **Missing** | no filter/search code in `NotificationCenter.tsx` |
| Deep-link to source record | **UI-only data** | `entity_type`/`entity_id` on model (`NotificationsContext.tsx:13-14`) never read for navigation |
| Dismiss/archive (R-NOT-002) | **Missing** | no `dismissed_at`/`archived` column; no RPC |
| Bulk actions + export | **Missing** | only `markAllRead` |
| Forward to Colleague | **Missing** | no code path |
| Admin notification history + resend UI | **Backend-only** | `notification-retry`, `notification-failure-sweep`, `notification-status` edge functions exist; no admin page consuming them (FpaNotificationLog is F&P-scoped only) |
| Preferences (R-NOT-001 digest rules) | **Duplicated + not enforced** | `src/pages/profile/NotificationPreferences.tsx` persists to `notification_preferences` (**0 rows**); `src/pages/settings/NotificationSettings.tsx` is static, Save has no handler (`:23`); dispatcher never reads preferences |
| Templates + event config (R-NOT-003) | **Partial** | `notification_templates` (112), `notification_event_configs` (150 active) — but template_id is not stamped on `notifications` rows; 100/150 event keys never dispatched |
| Email delivery + log (R-NOT-004) | **Partial** | `dispatch-notification-event` + `notification_dispatch_log` (360 email sent / 2 failed) — no bounce/open tracking, no email body copy retained, not surfaced in audit export |
| SMS | **Missing** | `send-notification/index.ts:297-298` "SMS provider not yet implemented"; zero provider code |
| Outbox + retry (60s SLA) | **Implemented but disconnected** | `process-notification-outbox` has claim/backoff/dead-letter, but outbox has **3 rows all dead** and **no cron entry** |
| Digest | **Dormant** | `notification-digest` exists; `notification_digest_log` 0 rows; no cron |
| Notification audit events (READ/DISMISSED/ACTIONED/FORWARDED/BULK/PREFS) | **Missing** | context does raw `update({read:true})`; no triggers/RPC writing `audit_logs` |
| NOT-THR thread manager | **Mostly implemented** | `correspondence_*` tables, `CorrespondenceManager.tsx`, `ThreadList/ThreadDetail`, export + `log_correspondence_export`; but 3 overlapping entry points (`/correspondence`, `/inbox`, `/manager`), no "Communications" tab on case workbenches, delivery-failure alert to sender (R-NOT-008) unproven, `send-correspondence` bypasses the central dispatcher |
| NOT-ESC escalation manager | **Fragmented** | complaints (`complaint_escalation_*`, EscalationHub), prudential (`prudential_escalations`), SLA (`SlaManager.tsx` static `ESCALATION_TIERS:64`); no unified console, no tier engine/ack timers/ownership, no ≥50-char resolution rule, no system-health alerts (R-NOT-011) |
| Complaints/enforcement/reporting triggers | **Missing** | grep: no `dispatch-notification-event` reference in `src/pages/complaints/*`, `src/pages/enforcement/*`, reports, `complaint-escalation-sweep` |
| RBAC/RLS | **Partial** | `notifications` self-only policies OK; outbox/dispatch-log admin-read; `notification_management.dispatch` permission exists; no policies for new archive/escalation objects |

## Target architecture

One dispatch spine: business action → `notify_event()` (DB or edge) → `notification_outbox` (enqueued, severity-aware) → **cron-driven outbox worker** → channel adapters (in_app insert / email SMTP / SMS provider) → `notification_dispatch_log` (+ retry, dead-letter, bounce). Preferences and digest applied at enqueue; Critical/High always immediate. Notification Centre reads `notifications` (extended) with severity/category/action_required/source deep-link. Escalations unify into `escalations` + `escalation_rules` + `escalation_tier_events`, fed by existing module sweeps. Threads stay in `correspondence_*`, with thread events flowing into the same notification spine.

## Database plan

1. `notifications`: add `severity` (critical/high/medium/low enum), `category` (action_required/alert/system/info), `module`, `action_required boolean`, `dismissed_at`, `dismiss_note`, `actioned_at`, `template_id`, `event_key`, `correlation_id`; backfill from `type`/`event_key`; keep `type` for compatibility. FTS index on title+message+entity ref.
2. RPCs (SECURITY DEFINER, audit-writing): `notification_mark_read`, `notification_dismiss`, `notification_mark_actioned`, `notifications_bulk_mark_read`, `notifications_bulk_dismiss`, `notification_forward_to_colleague` (creates correspondence thread), `save_notification_preferences` (validates Critical/High ≠ digest), `admin_resend_notification`. Each writes `compliance_audit_logs` with the FRD action names.
3. `notification_preferences`: per-type matrix (`type_settings jsonb`), `system_required` overrides; add trigger blocking digest for critical/high.
4. Email log: add `subject`, `body_snapshot`, `bounced_at`, `opened_at`, `provider_status` to `notification_dispatch_log`; expose via audit export.
5. Escalations: `escalation_rules` (alert_type, tier1/2/3 role, ack windows, business-hours flag, template per tier, routing: in_app/email/sms/task/auto-case), `escalations` (source_type/id, type, severity, current_tier, status, assigned_to, acknowledged_at, root_cause, resolution_note ≥50 chars CHECK, resolved_at), `escalation_tier_events`. Views mapping existing `complaint_escalation_cases` / `prudential_escalations` / SLA breaches into the unified console (no data migration, no removal).
6. `system_health_alerts` (component, error, first_detected_at, impact, status) + `system_health_contacts`.
7. GRANTs + RLS on every new table (authenticated scoped by role/assignment, service_role full, no anon).

## Frontend plan

- Delete-in-place-safe: leave `src/pages/Notifications.tsx` unrouted but remove it (dead), and convert `settings/NotificationSettings.tsx` into a redirect/alias of the real preferences screen (no functional loss).
- `NotificationCenter.tsx`: tabs All | Unread | Action Required | Alerts | System; filters module/severity/date; debounced search (≥3 chars) on FTS RPC; severity icons + module colour dot; row actions Mark read / Dismiss (with note) / Open source record / Forward; multi-select bulk bar with Mark read, Dismiss, Export CSV/PDF.
- `Header.tsx` bell: drawer with last 20, red badge when unread critical/high, pulse on new critical, per-item deep-link resolver (`entity_type` → route map, shared `src/lib/notifications/deepLink.ts`).
- New `src/pages/admin/NotificationHistory.tsx` (admin-only): all sends, filters recipient/type/status/date, resend button on failed, dead-letter view.
- Preferences screen: per-type × channel matrix, digest frequency, quiet hours, disabled controls for critical/high with explainer.
- NOT-THR: single canonical entry (`/correspondence/manager`), keep other routes as redirects; reusable `<CommunicationsTab>` mounted in application, complaint, return, enforcement, F&P workbenches; bounce banner + "confirm receipt via alternative channel" action (R-NOT-008).
- NOT-ESC: new `src/pages/escalations/EscalationManager.tsx` with Active / History / Rules / Routing / System Health tabs, detail side panel (chain history, take ownership, escalate tier, acknowledge, resolve with 50-char validation). Existing module escalation screens remain and link into it.

## Edge functions & scheduled jobs

- Refactor `dispatch-notification-event` into enqueue-only (severity-aware: critical/high → immediate send, medium/low → digest per prefs), keeping existing signature for all current callers.
- Schedule `process-notification-outbox` every minute (satisfies R-NOT-001 60s), `notification-digest` hourly + daily, `notification-failure-sweep` hourly (exists), new `escalation-tier-sweep` every 10 min (auto tier advance, business-hours aware), new `system-health-monitor` every 5 min (R-NOT-011, 2h → external IT escalation).
- New SMS adapter: connect a provider connector (GatewayAPI available) and implement `sms` branch in `send-notification`; log provider ids/status.
- Wire missing triggers: complaints (received/assigned/escalated/closed, `complaint-escalation-sweep`), enforcement actions, reporting (scheduled report success/failure), prudential remaining flows.
- Register cron jobs via SQL so they are reproducible.

## Audit & security plan

- All notification user actions go through the RPCs above so `NOTIFICATION_READ/DISMISSED/ACTIONED/FORWARDED/NOTIFICATIONS_BULK_MARKED_READ/NOTIFICATION_PREFERENCES_UPDATED` are recorded; thread events `THREAD_CREATED/MESSAGE_SENT/THREAD_CLOSED/THREAD_EXPORTED/MESSAGE_DELIVERY_FAILED/CONFIRMED`; escalation events `ESCALATION_TRIGGERED/ACKNOWLEDGED/TIER_ADVANCED/RESOLVED/OWNERSHIP_TAKEN/RULE_UPDATED`.
- New permission actions under `notification_management` (view_history, resend, configure) and `escalation_management` (view, acknowledge, resolve, configure); route + button guards; enforce in RPCs via `enforce_permission`.
- RLS: notifications self-only (admin history via definer RPC), escalations visible to tier recipients/assignee/domain roles, system health admin-only.

## Phases

1. **P1 Foundations** — severity/category/dismiss schema, audited RPCs, dedupe of pages, preferences enforcement.
2. **P2 Notification Centre UX** — tabs, filters, search, deep links, bulk, export, bell upgrade.
3. **P3 Delivery spine** — outbox cron, retry/dead-letter, email log enrichment + bounce, admin history/resend UI.
4. **P4 SMS + digest** — provider connector, sms adapter, digest jobs, quiet hours.
5. **P5 Escalation & Alert Manager** — unified tables, tier sweep, console, rules/routing config, system health.
6. **P6 Trigger completion** — complaints, enforcement, reporting, prudential gaps; thread Communications tabs + bounce handling; traceability doc update.

## Risks & backward compatibility

- 150 existing event configs and ~20 live keys must keep working: enqueue refactor keeps the current function name/payload; `type` column retained alongside `severity`.
- 356 stale `channel='email'` rows in `notifications` need classification (backfill to dispatch log, do not delete).
- Making dispatch non-silent could surface previously hidden failures — route them to the failure sweep, never to user-blocking errors.
- Cron additions can multiply email volume; ship with per-run caps and a kill switch in `site_settings`.
- SMS incurs provider cost; gate behind admin toggle.

## Tests per phase

pgTAP: RLS/persona matrix for notifications, escalations, system health; CHECK on 50-char resolution; digest-ban for critical/high; audit row written per RPC. Vitest: deep-link resolver map, severity mapping, filter/search reducers, no-hardcoded-data guard. Deno: outbox claim/backoff/dead-letter, sms adapter, tier sweep business-hours math. E2E (Playwright): critical notification appears ≤60s, dismiss→archive, bulk export, forward→thread, admin resend, escalation acknowledge→auto tier advance.

## Acceptance criteria

Every FRD control traced end-to-end: business trigger → outbox row → delivered channel row in `notification_dispatch_log` → visible in Notification Centre with correct severity/tab/deep link → audit row with the FRD action name → failure path visible in admin history with working resend. Escalations auto-advance tiers on timer, cannot close without 50 chars, and system-health alerts fire within 5 minutes with 2-hour external escalation. No existing route, table or function removed without an equivalent replacement or redirect.
