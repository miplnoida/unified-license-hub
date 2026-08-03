# Notifications & Communications — Closing the Remaining Approved Scope (In-App + Email)

SMS is excluded from all acceptance criteria, denominators and percentages, and stays hard-disabled for users and admins.

## Measured current state (verified by queries just now, not assumed)

- **214 active `notification_event_configs`.**
- **`notification_event_channel_templates` has 0 rows** — no event/channel is bound to a template at all.
- **`notification_templates`: 112 rows, all `status = 'active'`; 0 rows in `notification_template_versions`** — no immutable published versions exist. The status check constraint allows only `draft | active | archived`.
- **All 788 rows in `notification_dispatch_log` have `template_id = NULL`** — every notification ever sent used inline config/fallback rendering.
- **Dispatch history exists for only 54 distinct event keys; 161 of the 214 active configs have never dispatched once** — that is the real trigger-coverage gap.
- `notification_dispatch_log` statuses in use: `sent` (779), `delivered` (9). No `queued`/`accepted_by_provider`/`poison` rows observed.
- **`correspondence_threads` still has 0 rows** — NOT-THR-001 remains unexercised end to end.
- `escalations` has 13 rows. Cron state cannot be read from this session (no `cron` schema privilege); it will be read via the Supabase tooling during Phase 1 and reported as real job evidence.

Nothing above is treated as "complete because the component exists".

## Phase 1 — Authoritative traceability matrix + baseline

Build `docs/verification/notifications/` as the single source of truth:

- `00_baseline.md` — measured counts above plus real cron/job evidence (job name, schedule, last run, last status).
- `01_traceability_matrix.md` + `01_traceability_matrix.csv` — one row per FRD requirement with every column requested: FRD ID, screen/module, business event, status, frontend file, backend RPC/function, table + migration, event key, actual source trigger, recipient rules, severity, category, mandatory, channels, template ID/version, source route, audit event, automated test, latest verification result, remaining issue.
- Statuses restricted to the approved vocabulary; "Fully implemented and tested" is only used where a live E2E run in Phase 6 produced row-level evidence.

## Phase 2 — Eliminate fallback templates for active regulatory events

- Introduce a real publish lifecycle: publishing a template writes an immutable row to `notification_template_versions` (content snapshot + version number); published content becomes read-only.
- Backfill: publish v1 versions for the 112 existing templates, and generate published templates for every active event that lacks one, seeded from its current `title_template`/`message_template`/`email_subject_template`/`email_body_template` (so content does not regress) with placeholders corrected where they currently render blank.
- Populate `notification_event_channel_templates` for every active event × enabled channel (`in_app`, `email`).
- Dispatcher (`dispatch-notification-event`) resolves the bound published template, and records `template_id`, `template_version`, rendered subject and rendered body on the dispatch row. Rendering uses the version snapshot, so history stays reproducible after later edits.
- Required-variable validation: templates declare required tokens; publishing fails on unresolved required tokens; dispatch fails loudly (retryable + escalation) rather than sending a message with blank placeholders.
- Fallback rendering is retained only for an explicit allow-list of emergency system-health events and is stamped `used_fallback_template = true` on the delivery record.
- Guardrail trigger: an event config cannot be activated without a bound published template for every enabled channel.

## Phase 3 — Validate every active event configuration

Add a `notification_event_config_validate()` function plus a generated report `02_event_config_validation.md` covering all 214 active configs against: real source trigger present, recipient rules present, rule types supported by the dispatcher, at least one recipient resolves, in-app or email configured, template bound, valid severity/category, mandatory/mute consistency, sane dedupe window, failure escalation where required.

Activation is blocked when rules are empty/invalid, no trigger exists, templates are missing, channels are unavailable, or mandatory fields are incomplete. Configs that fail with no legitimate trigger are deactivated rather than left as phantom "configured" rows.

## Phase 4 — Wire the missing business triggers

For each of the 161 never-dispatched event keys, trace the real regulatory action and wire the enqueue at the point of successful transaction — via `notification_enqueue_event` / `dispatchNotificationEvent` only, never a bespoke insert. Coverage follows the request's lists across licensing/registration, Fit & Proper, prudential, market conduct/complaints, communications, and reporting/AI/system-health.

Each wiring must satisfy: transaction succeeds, exactly one queue event, correlation ID present, recipients resolve, preferences and mandatory rules applied, in-app row created, email queued, template ID+version recorded, source route/reference recorded, audit event written, duplicates suppressed, failures retryable, persistent failure escalates.

Where an FRD event has no corresponding business action in the product, it is reported as `Missing` with the reason — not silently marked complete.

## Phase 5 — Screen hardening

- **Notification Centre**: complete tab/filter/search matrix, accurate total count, stable keyset sort, detail drawer, mark read / bulk mark read, dismiss with note, archive, bulk actions, export, safe source navigation, forward to colleague, loading/error/retry states, and optimistic-update rollback (read state only commits after the backend confirms).
- **Bell**: unread and unread-critical/high counts, urgent indicator, critical emphasis, realtime insert/update, reconnect de-duplication, 60s polling fallback, last 20 in the drawer, mark-all-read error handling — with tests for realtime failure → polling fallback.
- **Preferences + digests**: verify the server locks (critical always in-app, critical/high always immediate, mandatory not disableable, unsupported channels unselectable, future-dispatch-only), audit before/after on save, and prove hourly/daily digest behaviour with real job runs and per-notification digest item rows.
- **Template & event administration**: full lifecycle (create, edit draft, preview, token validation, test-send restricted to the acting admin only, publish, immutable version, clone, archive, version history, modified-by/at, per-channel subject/body, variable reference) and full event administration including per-channel template binding and recipient-rule validation before activation.
- **Communication Thread Manager (NOT-THR-001)**: complete list/filter/search, composer with templates and attachments, draft save/resume, pending-response + SLA states, close/controlled reopen, PDF export, thread event history — over the existing correspondence model, no new messaging system.
- **Escalation & Alert Manager (NOT-ESC-001)**: register + detail + tier/notification/ownership history, ownership/acknowledge/advance/resolve actions with ≥50-char resolution narrative, and admin rule management with per-tier recipients, thresholds, business-hours behaviour (using the real `business_calendar_*` data), pause-on-ack, per-tier templates and channels, task/case creation.
- **Email production readiness**: distinguish `queued | processing | accepted_by_provider | delivered | bounced | failed | skipped | poison`; SMTP acceptance maps to `accepted_by_provider`, never `delivered`; `opened` only from a real provider callback; full metadata (provider message ID, timestamps, retries, error detail, correlation ID, dedupe key); backoff retries, max-attempt/poison handling, manual retry, admin resend, queue-depth/oldest-pending/last-success/failure-count health with threshold alert and persistent-failure escalation.

## Phase 6 — Live end-to-end execution and security proof

- Run all ~60 requested scenarios against the dev backend by performing the **real business action** (never by inserting notification rows), using disposable fixtures cleaned up afterwards. Record per scenario: test user, role, source action, transaction result, queue event, event key, recipients, notification row, email dispatch row, template ID+version, audit row, source link, expected vs actual, pass/fail, evidence.
- Extend pgTAP (`supabase/tests/notifications/`) and vitest with the requested RLS/RBAC proofs: own-notifications-only, no content/recipient/severity/template/source mutation, no user deletes, admin permissions required for history/retry/resend/templates/events, internal-vs-external thread isolation, cross-entity thread block, escalation detail authorisation, deep links granting no extra access, service-role surface not client-reachable, exports enforcing UI-equivalent access, forwarding not leaking restricted source content.
- Complete audit coverage for every listed notification, configuration, thread and escalation action, each with actor, actor role, timestamp, module, entity, correlation ID, before/after, result and failure reason, on an append-only table.

## Phase 7 — Final acceptance report

`docs/verification/notifications/03_acceptance_report.md` with the full matrix, requirement totals and exact counts per status, computed completion percentage (SMS excluded from the denominator), executed test results, failed tests, unresolved defects, environment dependencies, migration and regression risks, and a production configuration checklist.

The final status will be one of the four allowed values, and 100%/compliant will not be claimed while any disqualifier in the request still holds — in particular the current fallback-template and never-triggered-event findings must be closed by evidence, not assertion.

## Technical notes

- Migrations touch only `notification_*`, `correspondence_*`, `escalation*` objects; every new public table gets GRANTs plus RLS.
- Dispatcher changes are confined to `supabase/functions/dispatch-notification-event/` and the queue/retry/digest workers.
- Trigger wiring adds enqueue calls to existing licensing, registration, returns, complaints, F&P and prudential paths without altering their business logic or transaction outcomes.
- Risk to watch: making template binding mandatory could stop dispatch for events lacking templates, so the Phase 2 backfill lands in the same migration as the enforcement trigger.
