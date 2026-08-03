
# Functional Notification Preferences + Digest Workers

## Current state (verified)

- `notification_user_event_preferences` exists (in_app/email/sms/digest_frequency/muted/effective_from/updated_by) with a validation trigger `trg_validate_user_event_preference`, and `notification_effective_preference()` resolves a user's effective settings. **0 rows exist today** — nothing writes to it.
- `notification_event_configs` holds **150 active events** (56 critical/high) with `severity`, `system_required`, `allow_mute`, `channels`, `description` — the real source for the preference list.
- `src/pages/settings/NotificationSettings.tsx` (route `/settings/notifications`) is fully static: 5 hardcoded rows, `defaultChecked`, a Save button with no handler, plus fake quiet-hours/timing inputs.
- `src/pages/profile/NotificationPreferences.tsx` writes the *legacy* category-based `notification_preferences` table.
- `supabase/functions/notification-digest` is legacy: it re-queries domain tables (breaches, complaints, returns…) instead of pending notifications, has no hourly/daily period concept, no duplicate protection, no per-notification inclusion record. Its cron job `notification-digest-daily` actually runs hourly (`0 * * * *`).
- SMS: `site_settings.email_sms_settings.sms.enabled` defaults to false and **no dispatch path ever sends SMS** — `notification_dispatch_log` only contains `email` and `in_app`. So SMS must be presented as unavailable.

## 1. Preference model (no new model invented)

Canonical model stays `public.notification_user_event_preferences`, one row per (user, event_key). Absent row = event config defaults. Additions:

- Extend the validation trigger to enforce, on insert/update, against the event's config row:
  - critical → `in_app_enabled` forced true, `muted` forced false, `digest_frequency` forced `immediate`;
  - high → `digest_frequency` must be `immediate`, cannot be muted;
  - `system_required` events → channels declared in the config cannot be disabled, `muted` false;
  - `muted = true` allowed only when `severity = 'low'` **and** `allow_mute = true`;
  - `sms_enabled` rejected while SMS is not operational (site settings flag off) — raises a clear message;
  - channel toggles rejected for channels the event config does not support.
- `effective_from` set to `now()` on every write so preferences only affect **future** dispatches (dispatch already filters by preference at send time; it will read `effective_from <= now()`).
- New RPCs (SECURITY DEFINER, pinned search_path, `anon` revoked):
  - `notification_preference_matrix()` → per-event rows joining config + the caller's saved row, plus computed `locks` (which controls are forced/disabled and why) and `sms_available`.
  - `notification_preferences_save(_items jsonb)` → validates and upserts the caller's rows atomically, computes before/after diffs, writes an `audit_logs` entry with action `NOTIFICATION_PREFERENCES_UPDATED` containing before/after per changed event, returns updated rows + `updated_at`.

## 2. Preference screen

Rewrite `src/pages/settings/NotificationSettings.tsx` (and point `src/pages/profile/NotificationPreferences.tsx` at the same component/hook so both surfaces share one implementation; the legacy category form is retired, the legacy table is left untouched).

- New hook `src/hooks/useNotificationPreferences.ts`: loads the matrix, tracks dirty state per row, save/reset mutations, toast success/error.
- New component `src/components/notifications/PreferenceMatrix.tsx`: grouped by module, searchable, each row shows name, module, severity badge, description, "System required" / "Mandatory — overrides preferences" indicators, In-App / Email / SMS switches, frequency select (Immediate / Hourly digest / Daily digest), Mute switch.
- Locked controls are disabled **with an inline reason tooltip** ("Critical alerts are always delivered in-app", "SMS unavailable — administrator must configure an SMS provider", etc.).
- Sticky footer: dirty count, `Save Changes`, `Reset`; unsaved-changes guard on navigation; "Last updated <timestamp>" from the newest `updated_at`.
- Quiet hours: **removed** from this page — not backed by the FRD flow and would risk delaying critical items.

## 3. Digest workers

New Edge Function `supabase/functions/notification-digest-run` (period-aware) replacing the legacy body; keep the old function name as a thin delegate so the existing cron/test-digest call sites don't break.

Backing schema:
- `notification_digest_runs` (user_id, channel, period `hourly|daily`, period_start, period_end, status, item_count, error, attempts, dispatch_log_id) with a unique index on (user_id, channel, period, period_start) → **duplicate digest sends impossible**.
- `notification_digest_items` (run_id, notification_id) unique on (run_id, notification_id) and a unique partial index on (notification_id, period) → **no notification included twice**.

Selection logic per user/channel/period:
- pending notifications created in the period, still active (not dismissed/archived), whose effective preference for that event is `hourly`/`daily` matching the period and the channel enabled;
- **excludes** critical + high severity, excludes `system_required` immediate events, excludes muted events, excludes anything already recorded in `notification_digest_items`;
- sends exactly one email via the existing `send-notification` path, records `notification_dispatch_log` + digest run status, logs failures with `attempts` so `notification-failure-sweep` retries safely;
- the individual in-app `notifications` rows are **never modified**.

Cron (via insert tool, project-specific URL/key):
- rename/replace `notification-digest-daily` → `notification-digest-hourly` at `10 * * * *` with body `{"period":"hourly"}`;
- add `notification-digest-daily` at `0 6 * * *` with body `{"period":"daily"}`.

## 4. SMS

- `sms_available` derived server-side from `site_settings.email_sms_settings` (`sms.enabled` + provider credentials present). Currently false.
- UI: SMS column rendered but disabled with "SMS delivery is not yet configured. Ask an administrator to enable an SMS provider in Settings → Email & SMS."
- Backend rejects `sms_enabled = true` while unavailable, and no dispatch writes a `sent` SMS row — failing loudly instead of recording false success.

## 5. Tests

pgTAP `supabase/tests/notifications/07_preferences_matrix.sql` and `08_digest.sql`:
- matrix returns all active events with lock metadata; save persists and round-trips;
- system-required channel cannot be disabled; critical cannot be muted or un-in-app'd;
- critical/high rejected for hourly/daily;
- low + `allow_mute` can be muted; low without `allow_mute` cannot;
- hourly digest picks only eligible rows (severity, system-required, mute, period) — same for daily;
- immediate preferences never appear in a digest;
- second run for the same (user, channel, period, period_start) is a no-op;
- forced failure marks status `failed`, increments attempts, stays retryable;
- `NOTIFICATION_PREFERENCES_UPDATED` audit row written with before/after values.

Vitest `src/test/notificationPreferences.test.ts`: dirty-state tracking, lock computation, reset, SMS-unavailable rendering rules.

## Technical notes

- All new RPCs SECURITY DEFINER with `set search_path = public`, execute granted to `authenticated`/`service_role` only.
- Digest tables get GRANTs + RLS (users read their own runs; service_role full).
- No changes to workflow, complaints, correspondence, or existing dispatch triggers beyond reading `effective_from`.

## Out of scope (explicitly not claimed as compliance)

Communication Threads (NOT-THR-001), Escalation Manager (NOT-ESC-001) and full trigger coverage remain open; this phase does not close notification-module compliance.
