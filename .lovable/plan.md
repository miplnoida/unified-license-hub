## Goal

Make every notification trigger the FRD requires actually fire end-to-end, and prove it with tests plus a published trigger matrix.

## What exists today (verified)

- 157 active event configurations in the notification event registry, with templates, versioning, recipient rules, preference gating and a dispatch log with unique dedupe keys.
- A single shared dispatcher (`dispatch-notification-event`) plus outbox/retry/failure-sweep workers, and ~40 server functions already calling it.
- Coverage is strong for: applications and workflow actions, registration, RFI (raised/responded/near-due/overdue), licences (create/suspend/revoke/renew/expiry), returns and prudential breaches, conduct/complaints/enforcement, correspondence (including SLA near-breach and breach), F&P findings/conditions/appeals/monitoring, form version publication, SLA config change.

## Confirmed gaps in the registry (no event key exists)

- Escalation spine: escalation created / tier advanced / resolved / ownership taken.
- Reports & AI: scheduled report delivered, first successful delivery, delivery failure, AI insight generated, critical AI insight, AI processing failure.
- System health: SMTP failure threshold, SMS provider failure, integration failure threshold, scheduler/cron failure, notification queue backlog, repeated dispatch failure (only a generic admin failure alert exists today).
- Administration: workflow publication, rule activation, first rule firing, role change, escalation rule change, template publication.
- Licensing: F&P invitation, officer assignment, analyst assignment, route to legal, legal review completion, decision ready, decision dispatch, supervisory plan creation, variation.
- Fit & Proper: PQ invitation, PQ submission, screening result, adverse finding, assessment assignment, committee readiness, committee decision, determination dispatch.
- Prudential: examination assignment, examination notice, examination finding, remediation due/overdue, group contagion alert, EWI alert as a first-class event.
- Complaints: acknowledgement, assignment, priority change, complainant update, entity RFI + response, investigation assignment, pattern alert, systemic flag, outcome release, overdue investigation.

Where an adjacent key exists (e.g. `conduct_alert_created`, `prudential_stress_indicator_triggered`) it will be mapped to the FRD trigger rather than duplicated.

## Plan

### Phase 1 — Matrix and ground truth
Build `docs/notifications/frd-trigger-matrix.md` (human) + `docs/notifications/frd-trigger-matrix.json` (machine) with one row per FRD trigger: FRD screen ID, business event, event key, source file/function, recipient rules, channels, template, severity, mandatory flag, audit event, test name, status. Status is derived from a checker script, never hand-set. Statuses: `dispatched` (registry row + call site + test), `registry-only`, `missing`.

### Phase 2 — Registry completion
One migration per domain seeding the missing event configs and their template versions: severity, mandatory/critical locks (critical/high cannot be muted or digested), channel set, recipient rules reusing existing resolvers (`assigned_officer`, `next_step_role`, `role`, `entity_primary_users`, `regulator_team`, `custom_email`), dedupe window, and deep-link route template.

### Phase 3 — Server-side wiring
Fire each event from the server after the business transaction commits, using the shared dispatcher only:
- Existing edge functions (workflow, licence action, return workflow, complaint triage, prudential sweeps, F&P screening/cycle) gain the missing dispatch calls.
- Database-side events (record insert/state change: escalation tiers, complaint assignment/priority, remediation due, supervisory plan creation, role change, rule activation) are dispatched from an outbox row written in the same transaction as the business change, then drained by `process-notification-outbox`. This keeps correlation IDs, guarantees no lost event, and guarantees a failed send never rolls back a regulatory decision.
- Scheduled triggers (return due, remediation due/overdue, overdue investigation, condition reminder, pending-response warning) go through existing cron sweeps with window-scoped dedupe keys.
- Reports/AI/system-health events fire from `run-scheduled-reports`, the AI insight functions and a health monitor sweep with threshold state so an alert raises once per incident, not per failure.

### Phase 4 — De-duplication and hygiene
Remove frontend dispatch calls wherever the server now covers the same event (notably licence actions, F&P panels, RFI dialogs, appeals) so a single event is never dispatched twice. Every dispatch carries `idempotency_key = event_key + entity + state + window`, plus the originating correlation ID; failures are logged to the dispatch log and escalated through the escalation spine rather than retried silently forever.

### Phase 5 — Verification
- pgTAP tests: registry completeness (every matrix key exists, active, with a published template version), recipient resolution per rule type, mandatory/severity lock enforcement, dedupe key uniqueness, outbox-write-on-business-event triggers.
- Deno integration tests: for each wired edge function, invoke it against test fixtures and assert an in-app notification row, a dispatch-log row per required channel, deep-link metadata, and an audit row.
- A CI script fails the build if any matrix row is marked complete without a named passing test.

### Phase 6 — Report
Final summary in `docs/notifications/frd-trigger-coverage.md`: implemented vs required trigger counts, remaining unsupported triggers with reasons, test list with results, and external provider dependencies (SMTP relay for email, SMS provider — currently unconfigured, so SMS-required triggers degrade to email + in-app and are surfaced as unavailable).

## Technical notes

- No frontend ad hoc email sending; all channels flow through `dispatch-notification-event` → `send-notification` / outbox.
- SMS remains gated on provider configuration; matrix marks such triggers `email+in_app (SMS pending provider)`.
- Scope is limited to notification wiring, registry rows, tests and docs; no business-rule or workflow-logic changes beyond adding post-commit dispatch.
- Expect roughly 6 migrations, ~25 edge-function edits, ~15 frontend de-duplication edits, and ~20 test files.
