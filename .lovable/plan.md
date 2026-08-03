# Notification Delivery Channels — Production Hardening

Scope decided with you: **email only**. SMTP stays the sender (so no fake "delivered"), and **SMS is left visibly unavailable** — no provider integration in this pass.

## Current state (verified in code)

- `send-notification` sends via nodemailer/SMTP, validates config from `site_settings.email_sms_settings`, and writes `sent`/`failed`/`bounced` to `notification_dispatch_log`.
- `dispatch-notification-event` writes a `queued` log row per recipient/channel with `dedupe_key`, `subject`, `rendered_content`, `template_id`, `template_version` — then calls SMTP inline.
- `notification-failure-sweep` alerts admins after 3 email failures/hour; `notification-status` returns a minimal booleans-only health payload; `notification-retry` supports manual/admin retry.
- Gaps: no `provider_message_id`; no bounce webhook endpoint; no retry/backoff for email (only manual retry); SMS channel silently no-ops (log row stays `queued`, counted as neither sent nor failed); no channel-health UI page; health payload lacks queue depth, oldest pending, worker/cron status, provider errors.

## What will be built

### 1. Email status model (correct semantics)
Canonical statuses: `queued` → `processing` → `sent` (SMTP accepted) → `bounced` / `failed`, plus `skipped`. `delivered` is used **only** for in-app and for future provider-confirmed events; SMTP acceptance never sets `delivered`. Backfill any email rows wrongly marked `delivered` to `sent`.

### 2. Durable retry with backoff
- Add `attempts`, `next_attempt_at`, `provider_message_id`, `poisoned` to `notification_dispatch_log` (only those not already present).
- New `notification-email-retry-worker` edge function (cron, every 2 min): claims `failed` email rows with `attempts < 5` and `next_attempt_at <= now()` using `FOR UPDATE SKIP LOCKED`, re-sends, applies exponential backoff (2/4/8/16/32 min capped at 60), marks `poisoned` after max attempts, and never retries hard bounces or `no_email`/`opted_out` skips.
- Poison rows raise a `system_health.dispatch_failure_repeated` escalation (existing pattern).

### 3. Immutable rendered content
Database trigger makes `rendered_content`, `subject`, `recipient_email`, `template_id`, `template_version`, `sent_at` write-once once set — retries reuse the stored content instead of re-rendering (fixes today's `notification-retry`, which re-renders from current templates).

### 4. Provider message ID + bounce endpoint
- Capture nodemailer's `messageId` into `provider_message_id`.
- New public `notification-delivery-webhook` function: HMAC-verified (secret via `generate_secret`), maps provider callbacks to `delivered` / `bounced` / `opened`. It stays dormant with plain SMTP and is documented as requiring an ESP; no status is invented without a callback.

### 5. Channel health view + admin page
- `public.notification_channel_health()` (SECURITY DEFINER, gated on `notification_management.view`) returning: SMTP configured, SMS configured (false), last successful send per channel, failure count (1h/24h), queue depth, oldest pending item age, cron/worker last-run status from `cron.job_run_details` + queue worker heartbeats, and the last 10 provider errors with credentials and message bodies redacted.
- New admin page `/admin/notifications/health` (linked from Notification History) with status tiles, queue/backlog metrics, worker status, a redacted recent-errors table, and per-row **Retry** / **Resend** actions reusing `notification-retry`.

### 6. SMS made honestly unavailable
- Dispatcher: when `channel === 'sms'`, immediately mark the log row `skipped` with `sms_provider_not_configured` instead of leaving it `queued` — no silent success.
- Health view and preferences UI show SMS as "Not available".
- A thin `SmsProvider` interface file is added as the future extension point, with no implementation.

### 7. Failure handling
Existing hourly failure sweep extended to threshold-based alerting per channel, dedupe preserved, escalation on persistent failure, and log redaction helper applied to all error text.

### 8. Tests
- Deno tests (SMTP mocked): successful send, SMTP rejection → `failed`, retry with backoff, dedupe key collision → `skipped`, bounce webhook callback → `bounced`, poison → escalation, SMS → `skipped` with unavailable reason.
- pgTAP: immutability trigger, status transition constraints, `notification_channel_health()` RBAC (admin allowed, analyst/licensee denied), backfill correctness.
- Both wired into `.github/workflows/ci.yml`.

## Technical notes

Files touched: `supabase/functions/dispatch-notification-event/index.ts`, `send-notification/index.ts`, `notification-retry/index.ts`, `notification-status/index.ts`, `notification-failure-sweep/index.ts`; new `notification-email-retry-worker/`, `notification-delivery-webhook/`, `_shared/redact.ts`, `_shared/smsProvider.ts`; new migration for columns/trigger/health RPC/backfill; new `src/pages/admin/NotificationChannelHealth.tsx` + hook + route + permission gate; `docs/notifications.md` updated with environment configuration and limitations.

## Known limitations (external dependencies)

- True `delivered` / `bounced` / `opened` requires an ESP with webhooks; with plain SMTP the terminal state is `sent`.
- SMS remains unavailable until a provider is chosen and credentials/sender ID are provisioned.
- `ADMIN_NOTIFICATION_EMAILS` and `APP_BASE_URL` must be configured for admin alerting and links.
