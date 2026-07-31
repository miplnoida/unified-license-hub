## Goal

Complete the backend data model behind NOT-CEN-001. No Notification Centre redesign, no Communication Threads, no Escalation Manager. Nothing working is removed.

## What already exists (verified)

- `notifications` already has `severity`, `category`, `module`, `action_required`, `dismissed_at`, `dismiss_note`, `actioned_at`, `template_id`, `event_key`, `correlation_id`, `metadata`, plus a delete-blocking trigger and audited RPCs (`notification_mark_read`, `notification_mark_all_read`, `notification_dismiss`, `notification_mark_actioned`, `notification_counts`, `search_notifications`, `log_notification_audit`).
- `notification_dispatch_log` has channel, dedupe_key, status, error, retry_count, sent_at, last_attempt_at, provider_message_id, recipient_email, subject, payload.
- `notification_outbox`, `notification_event_configs`, `notification_templates`, `notification_digest_log` all exist and are wired to `dispatch-notification-event`, `process-notification-outbox`, `notification-retry`, `notification-failure-sweep`, `notification-digest`.
- `notification_preferences` is a single row per user with JSONB `channels` / `categories` / `type_settings` — not per-event rows.
- RLS on `notifications` currently lets a user UPDATE any column on their own rows; no per-column protection. Audit uses `public.audit_logs`.

So Phase 2 is extension and hardening, not new tables (except one per-event preference table).

## 1. Notification record model (migration)

Add to `public.notifications`, all nullable/defaulted so existing rows stay valid:

- `recipient_role text`, `recipient_group text` (role/group context)
- `preview text` (short preview; backfilled from `message`, maintained by trigger when null)
- `status` — new enum `notification_status` (`unread`, `read`, `actioned`, `dismissed`, `archived`), derived from existing `read` / `actioned_at` / `dismissed_at` on backfill; a trigger keeps `read` boolean and `status` in sync so all current code paths keep working
- `read_at timestamptz`, `archived_at timestamptz`
- `system_required boolean not null default false`
- `source_reference text` (human-readable, e.g. `APP-2026-000131`), `source_route text`, `route_params jsonb`
- `template_version integer`, `rendered_content_ref text`
- `dedupe_key text`, `expires_at timestamptz`

Indexes: `(user_id, status, created_at desc)`, unique partial on `dedupe_key` where not null, index on `expires_at`.

Keep `notifications_block_delete`; extend it so only `service_role` may hard-delete.

## 2. Preferences

New `public.notification_user_event_preferences` (per user + event key):
`user_id`, `event_key`, `in_app_enabled`, `email_enabled`, `sms_enabled`, `digest_frequency` (new enum `notification_digest_frequency`: immediate/hourly/daily), `muted`, `effective_from`, `updated_by`, `created_at`, `updated_at`; unique `(user_id, event_key)`. GRANTs for `authenticated` + `service_role`, RLS scoped to `auth.uid()`.

Add `severity_floor`/`allow_mute boolean` and `system_required boolean` to `notification_event_configs` so mute eligibility is config-driven.

Validation trigger enforces:
- critical → `in_app_enabled` forced true
- critical/high → `digest_frequency` forced `immediate`
- system-required events → cannot disable any channel, cannot mute
- `muted` allowed only for low severity where `allow_mute` is true

The existing single-row `notification_preferences` table and `save_notification_preferences` RPC stay untouched and functional; a resolver function `notification_effective_preference(user, event_key)` reads the new table first and falls back to the legacy JSONB, so dispatch keeps working either way.

## 3. Delivery records

Extend `notification_dispatch_log` (no replacement): `notification_id uuid`, `provider text`, `recipient_phone text`, `queued_at`, `delivered_at`, `failed_at`, `template_id`, `template_version`, `rendered_content`/`rendered_content_ref`, `error_details jsonb`. Widen `status` to the required set via a check constraint (`queued|processing|sent|delivered|failed|bounced|skipped`) that also accepts existing values.

Add `notification_record_delivery(...)` service RPC used by the Edge Functions so every attempt (including `skipped` due to preferences) is logged, and wire it into `dispatch-notification-event`, `process-notification-outbox`, `notification-retry`, `notification-status`.

## 4. Audit events

Reuse `public.audit_logs` via an extended `log_notification_audit`, covering: `NOTIFICATION_CREATED`, `NOTIFICATION_SENT`, `NOTIFICATION_DELIVERY_FAILED`, `NOTIFICATION_READ`, `NOTIFICATIONS_BULK_MARKED_READ`, `NOTIFICATION_DISMISSED`, `NOTIFICATION_ACTIONED`, `NOTIFICATION_FORWARDED`, `NOTIFICATION_PREFERENCES_UPDATED`, `NOTIFICATION_RETRIED`, `NOTIFICATION_RESENT_BY_ADMIN`. Audit rows stay immutable (existing `audit_logs_prevent_mutation`). No competing audit system.

## 5. RLS and security

- Replace the permissive `notifications` UPDATE policy with a `BEFORE UPDATE` guard trigger that rejects changes to `user_id`, `severity`, `category`, `module`, `title`, `message`, `preview`, `event_key`, `template_id`, `entity_type`, `entity_id`, `source_reference`, `system_required`, `correlation_id`, `dedupe_key` unless the caller is `service_role`. Users may only move status/read/actioned/dismissed/archived fields.
- Role/group notifications are still materialised per-recipient row, so `auth.uid() = user_id` remains the only read path — no group leakage.
- Delivery history read policy on `notification_dispatch_log` moves from hardcoded admin roles to `has_permission(auth.uid(),'notification_management','view_delivery_history')`, keeping admin/super_admin working through the RBAC catalogue.
- Deep links stay metadata only: `source_route` is resolved client-side and target routes keep their own RBAC/RLS, so no bypass. Notification content stores only recipient-safe text (documented rule; no schema change).

## 6. Compatibility

- Regenerate `src/integrations/supabase/types.ts`.
- Add `src/types/notifications.ts` with the canonical `NotificationRecord` / status / preference types, and update `NotificationsContext` + `notificationLinks` to read `status`, `preview`, `source_route` with fallbacks to the legacy fields.
- No page or component removed. Obsolete items recorded in `docs/notifications/phase2-obsolete.md`.

## Verification

New pgTAP suite `supabase/tests/notifications/` (run in CI alongside complaints/rbac):
1. user cannot read another user's notification
2. user cannot alter protected fields (severity/recipient/content/event key)
3. critical in-app preference cannot be disabled
4. critical/high cannot be placed into a digest
5. dismissed and archived notifications remain stored
6. delivery attempts are logged (including `skipped`)
7. read and dismiss produce audit rows
8. duplicate dispatch prevented by dedupe key

Plus Vitest coverage for the preference resolver and status/preview fallbacks, and a live check that existing in-app notifications load and one email dispatch still succeeds end-to-end.

## Deliverable at completion

Files changed, migrations added, table/policy summary, tests added and results, and the remaining Phase 3 gaps (Notification Centre UX, SMS provider, digest scheduling, unified Escalation Manager, full trigger coverage). Phase 2 does not complete the notification module.
