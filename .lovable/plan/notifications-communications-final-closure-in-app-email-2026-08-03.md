# Notifications & Communications — Final Closure (In-App + Email)

SMS is excluded from all implementation, tests, reports and percentages.

## Verified starting point (queried live, this turn)

| Measure | Value |
| --- | --- |
| active event configs | 212 |
| inactive event configs | 2 |
| dispatch rows | 826 |
| dispatch rows with null template id | 788 |
| notification rows | 963 |
| notifications with no source route | 931 |
| correspondence threads | 0 |
| correspondence messages | 0 |
| escalations | 13 |
| queue rows | 12 |

Backend wiring (0 unwired active events, 0 invalid recipient rules, 0 missing bindings/versions) was closed in the previous phase and will not be rebuilt.

## What gets built

### 1. Baseline recalculation
Extend `scripts/notification-trigger-scan.mjs` into a full baseline reporter covering every measure listed in the request (including zero-recipient events, fallback rendering, unresolved placeholders, missing source references, queue-by-status, failed/poison, audit-by-action, email-by-status). Output `docs/verification/notifications/31_current_baseline.md` and `.csv`, generated only from live queries.

### 2. Execution harness for the 156 never-dispatched events
A new runner (`scripts/notification-event-exercise.mjs`) that, per module, seeds disposable fixtures, performs the **real business transaction** (RPC / edge function / DB mutation that owns the trigger), waits for the real queue worker, then asserts: queue row, resolved recipients, in-app row, email dispatch row, template id + version, source reference + route, audit row, and duplicate suppression on a second identical transaction. Fixtures are torn down inside a tracked cleanup pass.

Modules executed in order: registration, applications/RFI, licensing + appeals, returns, compliance, complaints, conduct, prudential, fit & proper, correspondence, escalation/SLA, reporting, system health, preferences/digest.

Events that genuinely cannot be reached in this environment (e.g. provider delivery confirmation) are recorded as FAIL / environment-blocked, never as passed. Outputs: `32_event_execution_matrix.md` / `.csv` with one row per active event and all requested columns.

### 3. Legacy dispatch honesty
Migration adds `template_traceability_status` to `notification_dispatch_log` (`versioned` | `legacy_unversioned`), backfilled from whether template id/version are present. No template ids are invented; rendered subject/body untouched. A vitest + pgTAP pair asserts every dispatch created after the migration carries template id, template version, rendered subject, rendered body, correlation id and source event key.

### 4. Placeholder integrity
Add a server-side placeholder contract check: extract required tokens from each published template, compare against the bound event's declared payload contract, and hard-fail publish when a required token is unsupported, a required payload field is absent, or subject/body render blank. Dispatch fails safe with a `failed` row naming the exact missing token, remains retryable, and escalates after the configured threshold. Tests cover valid payload, missing required token, optional token, blank subject, blank body, post-publication template change, and prior-version immutability.

### 5. Canonical source route resolver
Promote a single server-side resolver (DB function + the existing `src/lib/notificationLinks.ts` as the thin client mirror) covering every listed entity type. Dispatch stores source entity type, id, reference and validated route. Opening a link re-checks RBAC/RLS on the source record; unauthorised users get access-denied and `NOTIFICATION_ACTIONED` is written only after authorised navigation. Historical rows are labelled `legacy_no_route`; no links are invented.

### 6. Communication Thread Manager exercise
Drive the existing correspondence tables/RPCs/components through every listed scenario (external + internal threads, participants, outbound/inbound/internal messages, drafts, attachments, document links, pending/SLA warning/breach, close, controlled reopen, export, delivery failure, notification forwarding) plus every listed UI capability, and the full cross-entity / internal-visibility / export / attachment / reopen / participant / service-role security set. Outputs `33_thread_e2e_results.md` and `33_thread_security_results.md`.

### 7. Escalation Manager exercise
Drive the existing central escalation model through creation, routing, ownership, acknowledgement and deadlines, manual and automatic tier 1–3 advancement, pause-on-ack, business-hours maths, resolution with the 50-character narrative, source-alert retention, and all history surfaces; plus rule administration and every server-side validation. Outputs `34_escalation_e2e_results.md` and `34_escalation_rules_results.md`.

### 8. Email delivery lifecycle
Normalise the status model to `queued → processing → accepted_by_provider → delivered | bounced | failed | skipped | poison`, with SMTP success mapped only to `accepted_by_provider`. Ensure each delivery row carries the full field list (recipient, provider, provider message id, event key, notification id, template id/version, rendered content reference, all lifecycle timestamps, retry count, error, correlation id, dedupe key). Tests: acceptance, rejection, temporary error, backoff retry, max attempts, poison, manual retry, admin resend, duplicate prevention, failure threshold, persistent-failure escalation. Absence of a provider delivery/bounce callback is documented honestly in `35_email_delivery_results.md`.

### 9. Audit coverage
Verify (and add where missing) immutable append-only audit records for every notification, template, event, thread and escalation action in the request, each carrying actor id/role, timestamp, module, source entity type/id/reference, correlation id, before/after, result and failure reason. pgTAP proves no client role can update or delete audit rows. Output `36_audit_coverage_results.md`.

### 10. RLS / RBAC proof
New pgTAP files exercising each listed assertion at database level (ownership, role-addressed visibility, immutability of content/recipient/severity/source/template, no delete, thread isolation, internal-message hiding, escalation access, route non-bypass, export parity, forward leakage, and permission gates for history/retry/resend/template/event/rule management, plus service-role-only functions rejected for authenticated clients). Output `37_rls_rbac_results.md`.

### 11. Notification Centre + bell
Playwright runs against the running app covering pagination, totals, sorting, tabs and filters, search, single and bulk read/dismiss/archive, export, detail drawer, forward, source navigation, loading/empty/error/retry, and optimistic rollback on failed mutation; bell counts, urgent indicator, last-20 tray, realtime insert/update/disconnect/reconnect, 60s polling fallback, duplicate suppression, mark-all-read rollback. Output `38_notification_ui_results.md`.

### 12. Preferences and digests
Execute preference saves proving critical stays enabled and immediate, mandatory cannot be disabled, only configured Low events mute, forward-only effect, audited before/after, and UI rollback on failed save. Run the real hourly and daily digest workers and prove eligibility, critical/high exclusion, mandatory exclusion, single inclusion per notification, digest item rows, retained in-app rows, normal email path, retryability and duplicate prevention. Output `39_preferences_digest_results.md`.

### 13. CI
Extend `.github/workflows/ci.yml` with a notifications job running typecheck, build, frontend and notification unit tests, template validation, trigger-matrix and event-config validation, migration validation, and the pgTAP notification/RLS/correspondence/escalation/audit suites — with hard gates that fail on an unwired active event, invalid recipient rules, missing published binding, a new dispatch missing template id/version, an unresolved required placeholder, a notification mutation without an audit event, or any failing RLS test.

### 14. Final acceptance
`40_final_acceptance.md` / `.csv` reporting the approved-scope denominator (SMS excluded), counts by status, exact completion percentage, test/pass/fail counts, unresolved defects, environment dependencies, migration and regression risks, CI status, and one of the four permitted final statuses. 100% will not be claimed while any listed disqualifier holds — in particular, if provider delivery confirmation is unavailable the status will be "Functionally complete but environment-dependent".

## Technical notes

- Schema changes: `notification_dispatch_log.template_traceability_status`, `notifications` legacy route labelling, placeholder-contract validation function, canonical route resolver function. Delivered as migrations; no new notification, thread or escalation infrastructure is created.
- All evidence comes from live queries and real transactions; no manual notification, dispatch or queue inserts are used as proof, and historical rows are never rewritten.
- Work is executed in module batches with the baseline scanner re-run after each batch so the matrices always reflect measured state.
