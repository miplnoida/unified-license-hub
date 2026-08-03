# Notifications & Communications — Completion and Proof (In-App + Email only)

SMS is excluded from implementation, tests, reports and all completion percentages.

## Verified baseline (queried live, not copied from earlier docs)

| Measure | Value |
| --- | --- |
| Active event configurations | 212 |
| Active events with empty recipient rules | 0 |
| Active events never dispatched (no delivery row ever) | 157 |
| Distinct event keys ever dispatched | 56 |
| Event/channel template bindings | 398 |
| Template versions | 419 |
| Dispatch rows total | 814 |
| Dispatch rows with null template ID / version | 788 (legacy rows predating snapshotting) |
| Dispatch rows using fallback rendering | 0 |
| Poisoned dispatch rows / dead queue rows | 0 / 0 |
| Correspondence threads | 0 |
| Escalation records | 13 |
| In-app notification rows | 951 |

The earlier "73 unwired / 88 untested" figures do not match the database. The real gap is **157 active events with no executed evidence**. The plan works from the measured numbers.

## Phase 1 — Authoritative baseline artefacts

Build a single SQL baseline view/function that emits every metric the brief lists (trigger call site presence, recipient resolvability, channel bindings, published versions, placeholder resolution, source routes, threads, escalations, audit counts by action, email status counts, failed/poison counts). Export to:

- `docs/verification/notifications/20_current_baseline.md`
- `docs/verification/notifications/20_current_baseline.csv`

Trigger call-site detection is derived from a repository scan script (`scripts/notification-trigger-scan.mjs`) that greps DB trigger/sweep functions and `enqueueNotificationEvent` / `dispatchNotificationEvent` call sites, joined against `notification_event_configs`. This script becomes the source of truth for the trigger matrix and a CI check.

## Phase 2 — Classify and resolve every unexercised active event

For each of the 157 events, one of exactly two outcomes:

1. **Wire** — locate the owning business transaction and enqueue at the successful transaction boundary (DB trigger/RPC for backend-owned state changes; existing scheduled sweep for time-based events). Every enqueue carries entity type, entity ID, source reference, safe source route, correlation ID, dedupe key and the full template variable payload.
2. **Deactivate** — event has no business action in the approved scope. Deactivate with a recorded reason, audited, and excluded from active-compliance maths.

Rules honoured: no dispatch from presentational components, no direct writes to `notifications`, no email from frontend, no duplicated frontend+backend emission, no artificial background trigger for an action-owned event.

Output: `21_trigger_matrix.md` / `.csv` with event key, module, source transaction, previous state, resolution, call site, recipients, template, test, result.

## Phase 3 — Activation validation (server-side gate)

Strengthen `notification_event_config_validate()` and enforce it in the activation RPC. Activation fails with a specific validation error unless: verified trigger, recipient rules present and every rule type supported and resolvable in context, at least one approved channel enabled, in-app/email template binding present per enabled channel, bound templates have published immutable versions, required variables covered by the trigger payload contract, valid severity/category, consistent mandatory-vs-mute rules, valid dedupe settings, failure escalation configured where required. Result: `22_event_validation.md`.

## Phase 4 — Rendering integrity

Every new dispatch records template ID, template version, rendered subject/title, rendered body (or immutable ref), correlation ID and fallback flag. Publishing fails when required placeholders are not satisfied by the payload contract of bound events. Test-send targets only the authenticated authorised administrator and never uses production recipient rules. Legacy dispatch rows with null template IDs are backfilled where derivable and otherwise flagged as pre-snapshot legacy in the baseline so they cannot be mistaken for fallback rendering.

## Phase 5 — Communication Thread Manager end to end (currently 0 threads)

Drive the full lifecycle through real RPC/UI flows: external + internal thread creation, participants, draft save/resume, outbound send, inbound reply, attachment, linked case document, pending-response, response warning, SLA breach, close, controlled reopen, PDF export, chronological history. Security proofs: external users blocked from internal messages, cross-entity isolation, attachment permission inheritance, linked documents not bypassing document access, closed-thread immutability without reopen permission, controlled participant changes, exports excluding inaccessible content, deep links enforcing source RBAC/RLS. Verify notification events and audit rows for each step. Result: `24_thread_security_results.md`.

## Phase 6 — Escalation Manager end to end

Exercise creation, routing, ownership, acknowledgement and deadline, automatic Tier 1/2/3 progression, manual escalation, pause-on-acknowledgement, business-calendar behaviour, resolution validation including the 50-character narrative minimum, recipient notification, and immutable tier/ownership/notification history with source alert retention. Exercise rule administration (create, edit, activate, deactivate, tier recipients, thresholds, channels, templates, business hours, pause, task creation, case creation) with audit on every action. Result: `25_escalation_results.md`.

## Phase 7 — Email delivery state model

Adopt the explicit state model: `queued`, `processing`, `accepted_by_provider`, `delivered`, `bounced`, `failed`, `skipped`, `poison`. SMTP acceptance maps to `accepted_by_provider`; `delivered`/`bounced` only on provider callback; no `opened` state without callback support; permanent failures move to `poison` at max attempts. Persist recipient, provider, provider message ID, template ID/version, rendered subject and body reference, queued/processing/acceptance/delivered-or-bounced/failed timestamps, retry count, last attempt, error details, correlation ID and dedupe key. Verify backoff retry, max attempts, poison handling, manual retry, admin resend, queue depth, oldest pending, last successful send, recent failure count and persistent-failure escalation. Result: `26_email_delivery_results.md`.

## Phase 8 — Notification Centre and bell (executable tests)

Vitest + Playwright coverage for pagination, total count, stable sort, tabs, filters, search, mark read, mark all read, dismiss with note, archive, bulk actions, export, detail drawer, forwarding, source navigation, loading/error/retry and optimistic rollback on backend failure. Source-record opening checks access, rejects unauthorised navigation and records the notification action only after successful authorised navigation. Bell: unread count, urgent count, critical indicator, realtime insert/update, disconnect/reconnect, polling fallback, duplicate suppression, last-20 tray, mark-all-read rollback.

## Phase 9 — Preferences and digests

Prove Critical stays in-app, Critical/High stay immediate, mandatory cannot be disabled, optional Low mutable only where allowed, preference changes affect future delivery only with before/after audit rows, and failed saves leave no false UI state. Run the real hourly and daily digest jobs and prove eligibility filtering, Critical/High and mandatory-immediate exclusion, single inclusion per notification, retained digest item records, retained original in-app rows, retryable failures and blocked duplicate sends.

## Phase 10 — Audit, RLS/RBAC, regression, CI

- Append-only audit coverage for every listed notification, configuration, thread and escalation action, each row carrying actor ID, actor role, timestamp, module, source entity, correlation ID, before/after where applicable, success/failure and failure reason. Result: `27_audit_results.md`.
- pgTAP suite for the full RLS/RBAC list (own-notification visibility, protected field immutability, no deletes, thread isolation, internal-message shielding, escalation access, source links granting no extra access, export parity with UI permissions, forwarding leak prevention, service-role-only functions not client callable, explicit permissions for administration, retry/resend, template/event management and escalation rules). Frontend guards are not accepted as evidence. Result: `28_rls_rbac_results.md`.
- Real business flow suite across registration, licensing, F&P, prudential, returns, complaints, market conduct, enforcement, correspondence, escalation, reporting, system health, preferences, digests and email failure/retry — each row recording test name, user, role, action, transaction result, event key, queue row ID, notification row ID, email delivery row ID, recipients, template ID/version, correlation ID, source route, audit row ID, expected, actual, pass/fail. Manual queue/notification inserts are never accepted. Results: `23_e2e_results.md`, `29_regression_results.md`.
- CI (`.github/workflows/ci.yml`) gains: TypeScript compile, frontend unit tests, notification vitest suite, migration validation, notification pgTAP, RLS tests, template validation, event-config validation and the trigger-matrix consistency check.
- `30_final_acceptance.md` reports scope totals, fully implemented, implemented-but-untested, partial, missing, deactivated out-of-scope events, exact completion percentage, failed tests, unresolved defects, environment dependencies, migration and regression risks and CI status. 100% is claimed only when every gate in the brief is green.

## Sequencing note

Phases 1–4 are backend correctness and must land before the evidence phases, because the e2e records depend on template/version and validation guarantees. Phases 5–9 are independent of each other and can be executed in any order. Phase 10 closes last.
