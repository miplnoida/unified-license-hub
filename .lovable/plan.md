# Notifications & Communications — Completion Plan (In-App + Email only)

SMS is out of scope and excluded from implementation, tests and the completion percentage. Nothing is rebuilt: all work extends the existing dispatcher (`dispatch-notification-event`), queue (`notification_event_queue` + worker), template model (`notification_templates` / `notification_template_versions` / `notification_event_channel_templates`), correspondence spine (`correspondence_threads`), and escalation spine (`escalations`).

## Verified current state (measured, not assumed)

| Signal | Value |
| --- | --- |
| Active event configs | 214 |
| Active events with zero dispatch history | 161 |
| Of those, **no code wiring at all** (config-only) | 73 |
| Of those, wired in code but never exercised | 88 |
| Dispatch rows using fallback rendering | 0 (Phase B foundation already holds) |
| Template versions / channel bindings | 419 / 398 |
| Correspondence threads in DB | 0 (feature never exercised) |
| Escalations in DB | 13 |

So the two real remaining gaps are: (1) 73 configured events that no business transaction ever raises, and (2) absence of executed end-to-end evidence for triggers, threads, escalations, email lifecycle, audit and RLS.

## Phase 1 — Authoritative trigger matrix

Generate `docs/verification/notifications/10_trigger_matrix.{md,csv}` from the database plus a repo scan: for every active event key record module, the business transaction that raises it, the call site (DB trigger / RPC / edge function / sweep), recipient rules, bound template + version, and dispatch history. This matrix is the single source of truth for the rest of the work and for the final report.

## Phase 2 — Wire the 73 unwired events

Each one is attached to the real business transaction, at the transaction boundary, via `notification_enqueue_event` (DB triggers/RPCs) or `enqueueNotificationEvent` (edge functions). No frontend inserts, no direct writes to `notifications`.

- Licensing: analyst/officer assignment, routed-to-legal, legal review completed, escalated to supervisor, decision ready/dispatched, certificate issued, licence varied.
- Registration/Entity/Users: regulator assignment changed, entity user access revoked, entity user role changed, user role changed.
- Complaints: acknowledged, investigation started, investigation overdue, RFI raised/responded, complainant update, priority changed, escalated to enforcement, outcome released, closed.
- Market Conduct: complaint created/triaged, high-severity, action assigned/overdue, thematic review created/assigned/closed, pattern alert, systemic flag.
- Fit & Proper: PQ invitation, PQ submitted, screening completed, assessment assigned, committee ready, committee decision, determination dispatched.
- Prudential/Returns: return due, return reviewed, return rejected/changes requested, validation failure, breach detected, early warning, remediation due, examination notice/assigned/finding, group contagion, supervisory plan created, return RFI, regulator comment/query.
- Enforcement: notice issued, response received, decision recorded, case closed, case withdrawn.
- Correspondence: external message sent, external response received, internal message posted, internal participant added, awaiting response, SLA near-breach, SLA breach.
- Escalation & config governance: tier advanced, ownership assigned, escalation rule changed, rule activated, rule first fired, workflow published, notification template published.

Events that turn out to have no owning transaction in the approved scope are **deactivated with a recorded reason** rather than left active and dead — the completion criterion "no active event without a real trigger" is met either by wiring or by explicit deactivation.

## Phase 3 — Template & rendering enforcement

- Extend `notification_event_config_validate()` to also fail on unresolved placeholders and on variables the trigger payload never supplies.
- Publish-time gate: a template version cannot be published if a required placeholder for its bound events is missing; activation stays blocked without a published binding (existing trigger).
- Assert `fallback_allowed = false` for every regulatory event and that each dispatch row records `template_id`, `template_version`, `used_fallback_template = false`, `correlation_id` and the rendered body.

## Phase 4 — Centre, Bell, Preferences hardening

Close the residual UX/behavioural items against the existing components (no new pages): pagination/filters/sort/search, unread/archive/dismiss (soft-state only, never delete), export, detail drawer, deep link RBAC re-check on open, forward, optimistic update with rollback, loading/retry/error states; bell unread + critical indicator, realtime with polling fallback, reconnect and duplicate suppression, mark-all-read; server-side preference locks (critical always on/immediate, mandatory not disableable), future-effect-only semantics with before/after audit, digest workers with no duplicate sends.

## Phase 5 — Communication Thread Manager

Exercise and complete the existing correspondence module: unified feed, pagination, search, filters, drafts, attachments, participants, internal/external visibility, response SLA sweeps, export, history, notifications. Threads are currently unexercised (0 rows), so this phase creates threads through the real UI/RPC path and proves entity isolation, internal-note isolation, attachment and source-record permissions, immutable history and controlled reopen.

## Phase 6 — Escalation Manager

Complete tier management, acknowledgement, ownership transfer, automatic advancement, resolution, routing, rule configuration, business calendar and immutable history on the existing `escalations` spine, and prove each escalation produces notification evidence.

## Phase 7 — Email delivery lifecycle

Verify and complete the state machine: `queued → processing → sent (SMTP accepted) → delivered (only on provider confirmation) | bounced | failed | skipped`, plus retry with backoff, poison handling, admin resend, and channel health. SMTP acceptance is never reported as Delivered. Persist provider message id, timestamps, retry count, correlation id, template version and rendered content.

## Phase 8 — Audit & security proof

- pgTAP: immutable audit rows for every notification, template, event-config, thread and escalation action listed in the scope.
- pgTAP RLS: cross-user notification reads blocked, protected fields not editable, deletes blocked, source-record permissions not bypassable, thread/escalation/export permissions enforced, forwarding cannot leak data. Server-side enforcement only.

## Phase 9 — End-to-end execution and final report

Execute real business scenarios through the actual application paths (no manual notification inserts) covering every module above. For each: source action, workflow transition, event key, recipient, queue row, in-app row, email row, audit row, template id + version, correlation id, expected vs actual, pass/fail.

Deliverables written to `docs/verification/notifications/`:
FRD traceability matrix · files changed · migrations added · triggers verified · E2E execution report · audit verification report · security verification report · regression report · remaining risks · exact completion percentage for In-App + Email scope.

## Technical notes

- New wiring uses `notification_enqueue_event` inside the business transaction so a delivery failure can never roll back a regulatory decision; sweeps continue to use direct dispatch.
- Recipient rules reuse the existing rule types (including `record_assignee`, `thread_participants`, `thread_assigned_officer`); no new resolution mechanism.
- Migrations are additive; no existing table, RPC or function signature is removed or repurposed.
- Regression coverage: existing vitest suites plus the pgTAP suites under `supabase/tests/` (notifications, complaints, rbac, regulator_access) must pass unchanged.
- Reporting will state a measured percentage; anything not proven by executed evidence is reported as incomplete rather than assumed.
