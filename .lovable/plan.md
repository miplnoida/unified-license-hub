# Notifications & Communications — Final FRD Verification and Defect Closure

Verification runs live against the dev backend (real dispatch, real in-app/dispatch/audit rows, temporary data cleaned up afterwards). All notification defects found get fixed. Deliverables are markdown under `/docs/verification/notifications/`.

## Confirmed pre-verification findings (from reads already done)

These are measured, not assumed:

- **214 active event configs; 34 have empty `recipient_rules`.** The dispatcher resolves recipients only from `recipient_rules` (`dispatch-notification-event/index.ts:967-975`) with no payload fallback, so these events resolve to **zero recipients**. Affected: `sla.warning`, `sla.breach`, `return.overdue`, `return.breach_warning`, `return.breach_critical`, `return.validation_failed/passed`, all seven `correspondence.*`, all `conduct_*` (15), `application.rfi_near_due`, `application.rfi_overdue`, `application.rfi_responded`, `application.ai_overridden`.
- **No dispatch row has ever existed for any of those keys** — confirmed by querying `notification_dispatch_log` (51 distinct keys logged, none of the 34).
- **`correspondence_threads` has 0 rows** → NOT-THR-001 is completely unexercised end-to-end.
- **`notification_event_queue` has 0 rows** → transactional queue path unexercised in practice.
- Cron is healthy: 12 relevant jobs all `active=true` (digest hourly/daily, event-queue worker 1 min, email retry 2 min, failure sweep hourly, health monitor, SLA/escalation/correspondence/complaint sweeps, licence expiry daily).
- Complaints, licence expiry reminders, F&P invitation, return due reminders, and pattern alerts have **no dispatch history**, so their trigger paths are unproven.

## Phase 1 — Verification harness and baseline

- Add `docs/verification/notifications/` with a repeatable scenario runbook and a SQL evidence pack (`evidence/*.sql`) that, per scenario, extracts: recipient set, in-app row, severity, category, template id/version, deep link, channel, dispatch record, audit record, preference decision, dedupe key.
- Snapshot the baseline (config counts, cron state, log key inventory) as `00_baseline.md` so every later claim is diffable.

## Phase 2 — Fix the recipient-resolution defect (root cause of most failures)

- Migration seeding correct `recipient_rules` for all 34 empty configs, per FRD ownership: SLA/return breach → assigned officer + `sla_process_team_leads` + supervisor role; `return.*` licensee-facing → `entity_primary_users`; `correspondence.*` → thread participants (new `thread_participants` rule type) plus assigned owner; `conduct_*` → assigned investigator + conduct supervisor role.
- Add a guardrail so this class of defect cannot silently recur: a database validation that rejects activating an event config with empty `recipient_rules`, plus a vitest assertion that every active config has at least one rule.
- Where a rule type the FRD needs does not exist yet (thread participants, F&P invitee), add it to `resolveRecipients`.

## Phase 3 — Wire and verify missing triggers

For each of these, trace the business action to dispatch and implement the missing link only where absent: complaint submission acknowledgement, complaint assignment, pattern alert, licence expiry reminder to licensee, F&P invitation, return due reminder, RFI sent/response received, application assignment to officer, analyst/reviewer assignment, decision dispatch, thread message, thread SLA breach, scheduled report delivery failure, SMTP failure threshold, system-health alert escalation.

Every trigger must go through `notification_enqueue_event` / `dispatchNotificationEvent` — no bespoke insert paths.

## Phase 4 — Live end-to-end execution (30 scenarios)

Create disposable fixtures (a test complaint, a correspondence thread, an overdue return, an expiring licence, a failing SMTP row), invoke the real sweeps/workers, then verify each scenario against the twelve verification standards and capture row-level evidence. Includes negative and control cases: preference enforcement, critical-cannot-be-muted, dedupe on repeat dispatch, dismiss/archive, bulk mark-read and export, admin retry of a failed delivery, cross-user notification block, unauthorised source-record block, internal thread message hidden from external user, hourly and daily digests.

Cleanup script removes all fixtures and their notification rows at the end.

## Phase 5 — Security, RLS, RBAC

- Extend pgTAP (`supabase/tests/notifications/10_e2e_matrix.sql`, `11_thread_rls.sql`) with behavioural assertions for cross-user reads, source-record authorisation, internal-vs-external thread visibility, channel-health RBAC, and template/event admin gates.
- Re-run the RLS persona matrix for `notifications`, `notification_dispatch_log`, `correspondence_*`, `escalations`.

## Phase 6 — Deliverables

Written to `docs/verification/notifications/`:

1. `01_frd_traceability_matrix.md` — every FRD requirement (NOT-CEN-001, NOT-THR-001, NOT-ESC-001, bell, preferences, templates, event config, workflow config, in-app/email/SMS, digests, logs, retries, audit, RLS/RBAC, deep links, escalation, health, cross-module triggers) with pass/fail and evidence references to code line, migration, function, and test.
2. `02_e2e_results.md` — per-scenario results against all twelve standards, with row IDs as evidence.
3. `03_security_rls_results.md`.
4. `04_limitations_and_dependencies.md` — external dependencies and regression risks.
5. `05_compliance_summary.md` — exact percentages fully / partially / not implemented / blocked by external configuration.

## Reporting rules honoured

- SMS stays counted as **blocked by external configuration** (no provider; `skipped` state only) — never as implemented.
- Email `delivered`/`bounced`/`opened` stay **partially implemented**: SMTP cannot confirm delivery without a provider callback.
- Any requirement that is frontend-only, backend-only, mocked, or untested is reported as partial or fail. 100% compliance will not be claimed unless every screen, trigger, delivery path, audit event, security control, and E2E scenario passes.

## Technical details

- Dispatcher: `supabase/functions/dispatch-notification-event/index.ts` (recipient rules at 550-700, dispatch loop at 966-1120).
- Transactional path: `notification_enqueue_event` → `notification_event_queue` → `notification-event-queue-worker`.
- Delivery: `send-notification` (SMTP), `notification-email-retry-worker`, `notification-delivery-webhook`, `notification-failure-sweep`, `notification_channel_health()`.
- No changes outside notification/correspondence/escalation code paths.
