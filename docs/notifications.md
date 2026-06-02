# Email Notification System

This project ships a complete server-side notification pipeline built on the existing SMTP integration. All email side effects are server-driven via Supabase Edge Functions — the frontend only fires events.

## Architecture

```
Frontend / Edge function caller
        │   dispatchNotificationEvent({ event_key, entity_*, payload })
        ▼
dispatch-notification-event   ──── resolves recipient rules from notification_event_configs
        │                          renders templates, writes to notification_dispatch_log
        │                          (unique dedupe_key blocks duplicates)
        ▼
send-notification (SMTP)      ──── loads SMTP from site_settings.email_sms_settings
                                   updates dispatch log: status, sent_at, retry_count, error
```

## Tables

- **`notification_event_configs`** — one row per event_key (templates + recipient rules + channels + dedupe window).
- **`notification_dispatch_log`** — every delivery attempt: event_key, entity, recipient, channel, status (pending/sent/failed/skipped), recipient_email, subject, payload, provider_message_id, retry_count, sent_at, last_attempt_at, reminder_window, error. Unique `dedupe_key` enforces idempotency.
- **`notifications`** — in-app inbox (realtime via `supabase_realtime`).

## Events covered

| event_key | trigger | channels |
|---|---|---|
| `license.created` | `perform-workflow-action` after approval | in_app + email |
| `license.status_changed` | (legacy) | in_app + email |
| `license.suspended` / `revoked` / `renewed` / `reinstated` / `cancelled` | `LicenseDetail` actions | in_app + email |
| `license.expiring_soon` | scheduled job, windows 30/15/7/1 days | in_app + email |
| `license.expired` | scheduled job on expiry day | in_app + email |
| `user.invited` | new user provisioning (template ready; wire as needed) | in_app + email |
| `payment.required` / `received` / `failed` | application/payment flows | in_app + email |
| `application.*`, `compliance.*`, `registration.*`, `regulator.*`, `entity.*` | existing wires in workflow code | in_app + email |
| `notification.admin_failure_alert` | hourly cron when ≥ 3 email failures in last hour | in_app + email |

## Environment variables

Add via **Cloud → Settings → Secrets** (edge function runtime):

| Name | Required | Purpose |
|---|---|---|
| `APP_BASE_URL` | recommended | Used in `{{app_url}}` template token (e.g. `https://portal.example.com`) |
| `APP_NAME` | optional | Used in `{{app_name}}` template token |
| `ADMIN_NOTIFICATION_EMAILS` | optional | Comma-separated list — direct recipients for `notification-failure-sweep` |

SMTP credentials are **not** edge-function secrets — they live in `site_settings.email_sms_settings` and are configured at **Settings → Email/SMS** in the admin portal.

## Scheduled jobs

Two `pg_cron` jobs are provisioned by the latest migration:

- `license-expiry-reminders-daily` — `30 2 * * *` UTC → calls `license-expiry-reminders` for windows 30d / 15d / 7d / 1d / 0d.
- `notification-failure-sweep-hourly` — `5 * * * *` → calls `notification-failure-sweep`.

Inspect with:
```sql
SELECT jobname, schedule, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

## Idempotency

The `notification_dispatch_log.dedupe_key` is unique. For reminders, `reminder_window` (e.g. `"30d"`) is part of the dedupe bucket, so the daily cron is safe to re-run — the same `(license, window, recipient, channel)` cannot be sent twice.

## Manual testing

```bash
# Trigger reminders for a single window
curl -X POST "$SUPABASE_URL/functions/v1/license-expiry-reminders" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"window":"30d"}'

# Or for a specific license + window
curl ... -d '{"license_id":"<uuid>","window":"7d"}'

# Health check (admin token required)
curl -X POST "$SUPABASE_URL/functions/v1/notification-status" \
  -H "Authorization: Bearer $USER_JWT"

# Retry a failed log row (admin token required)
curl -X POST "$SUPABASE_URL/functions/v1/notification-retry" \
  -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
  -d '{"log_id":"<uuid>"}'
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Emails not sent | `notification-status` → `smtp_configured`. If false, configure SMTP in Settings. |
| Recipients empty | Confirm `recipient_rules` in `notification_event_configs` for the event; check the payload contains the keys referenced by `payload_user` rules. |
| Duplicate sends | Inspect `notification_dispatch_log` for the `dedupe_key`; collisions mean the unique constraint correctly blocked the duplicate. |
| Reminders not firing | `SELECT * FROM cron.job_run_details WHERE jobname LIKE 'license-expiry%' ORDER BY start_time DESC;` |
| Failed deliveries | `notification_dispatch_log.status = 'failed'` rows expose `error`, `recipient_email`, and `retry_count`. Use `notification-retry` to retry. |

## Code helper

```ts
import { dispatchNotificationEvent } from '@/lib/notificationEvents';

await dispatchNotificationEvent({
  event_key: 'license.revoked',
  entity_type: 'license',
  entity_id: license.id,
  payload: { license_number, license_type, reason, holder_user_id: license.holder_id },
});
```

This call is fire-and-forget; it never throws to the UI.
