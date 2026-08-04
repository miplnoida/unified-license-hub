# Rule Engine — Tester, runtime ownership, lifecycles and executable proof (ADM-RE-001/002/003)

Nothing already built gets rebuilt: the central Rule Library, module editors, versioning, restore, effective dates, owner validation, payload validation, executions, correlation/source-event IDs, action results, alerts, tasks, suppressions and activation controls all stay as they are. This plan adds the missing runtime, tester and proof layers.

## Verified current state (checked now)

- Module rule data exists: prudential thresholds 14, escalation rules 14, correspondence routing 5, complaint intake 4, conduct monitoring 3.
- Sufficiency rules and RFI auto rules are still empty (0 rows) — those two families have no live data yet.
- Shared-engine runtime has never run: `engine_rule_tests`, `engine_rule_executions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_tasks`, `engine_rule_suppressions` are all 0 rows. `engine_rules` = 1 (leftover draft), `engine_rule_versions` = 2.
- There is no `docs/rule-engine/` directory, no `supabase/tests/rule_engine/` suite, no runtime-ownership script, and no rule-engine job in `.github/workflows/ci.yml`.

## Phase A — Live data for all nine families

Create representative records through the owning module editors/RPCs (never raw inserts that bypass validation), including the two empty families (Sufficiency, RFI Auto Rules). Then run the library against real data and correct any inaccuracy in the view/RPC — not in the UI: counts, filters, facets, sorting, pagination, source-screen navigation, capability flags, owner / runtime owner / active version / last triggered / last tested, and CSV values. Record live row counts per family.

## Phase B — Complete the shared Rule Tester (existing Editor Test tab)

Modes: Draft Version, Active Version, Historical Version, Current Snapshot, Historical Replay, Batch Test.

Inputs: version, entity, entity group, sector, sub-sector, date, return period, source event, batch limit, manual metric overrides, suppression preview date.

Output: rule code, version, mode, candidate/matched/unmatched counts, entity, source event, every condition with metric, actual value, operator, expected value, pass/fail and reason, suppression state and expiry, expected actions in exact order (alert, task, notification, escalation, workflow action), action-failure policy, duration, correlation ID, errors.

Plus: save result, history list, compare two runs, export full output, filter history by version, user and date.

## Phase C — Dry-run isolation proof

pgTAP snapshots every production table a run could touch (notifications, alerts, tasks, escalations, assignments, workflow, risk, cases, suppressions, `engine_rules.trigger_count` / `last_triggered_at`) before and after a dry run and asserts only `engine_rule_tests` plus one `RULE_TEST_RUN` audit row grew.

## Phase D — Module-specific testers

Specialised families are tested in their own context, launched from the library by family, never forced through the generic evaluator when the data model differs: Return Validation (form/version, period, sample values → field, cross-field, expression results and messages); Prudential Threshold (entity, return, ratio, period, sector → actual, threshold, breach, severity, expected action); Conduct Monitoring (entity, period, indicators, pattern → matched signal, risk change preview, follow-up); Complaint Triage (details, category, vulnerability, urgency, channel → classification, priority, assignment, escalation, SLA); Sufficiency + RFI Auto (application, responses, documents → missing items, sufficiency result, suggested RFI with no real RFI created); Correspondence Routing (sender, direction, source record, thread type, participants → destination, owner, classification, escalation preview); Escalation Rules (tier, status, elapsed business time, acknowledgement, calendar → due/not due, next tier, recipients, notification). Results write back `last_tested` to the inventory.

## Phase E — Runtime ownership registry + overlap resolution

`docs/rule-engine/runtime-ownership.json` (with markdown/CSV views): family, source table, source event, trigger type, trigger location, evaluator, runtime owner, suppression owner, action executor, notification owner, audit owner — every cell traced to a real trigger/RPC/sweep/edge function. `scripts/verify-runtime-ownership.mjs` fails the build when more than one active owner claims a family/source-event pair.

`docs/rule-engine/overlap-matrix.md` resolves each overlap (Shared Threshold vs Prudential, Shared Pattern vs Conduct, Shared Validation vs Return Validation, Shared Routing vs Correspondence, Shared SLA vs Escalation, Shared Task/Alert vs module action creation) with authoritative owner, secondary implementation, its status (editor-only / inventory-only / deprecated), and why double execution is impossible — backed by a test.

## Phase F — Exactly-once execution and action policy

Deterministic idempotency key of source-event ID + rule ID + active version + entity key + action index + action type, enforced by unique constraints. Retry tests prove one execution record (or one canonical retried execution) and no duplicate alert, task, notification, escalation, workflow action or suppression update.

`on_action_failure` is implemented and verified for continue, stop and retry-where-supported. Every action persists index, type, status, start/end timestamps, result, error, correlation ID and rule version; the UI shows each action's real outcome and never renders a failed action as successful.

## Phase G — Effective dates and version immutability

Boundary tests (exact start/end timestamps, timezone handling) prove: no execution before `effective_from` or after `effective_to`; invalid ranges rejected on save and activate; inactive and draft rules never execute; the active version is the one executed; a newer draft never silently replaces the active version; expiry visible in inventory and editor.

Database tests prove previous versions cannot be updated or deleted by normal roles, restore creates a new byte-identical snapshot, active version stays explicit, and executions / tests / alerts / tasks / action results all reference the exact version, with version and activation notes audited.

## Phase H — Alert, task and suppression lifecycles

Alerts: Open → Acknowledged → Assigned → Resolved → Closed, retaining rule, version, execution, action index, source event, entity, correlation ID, severity, assignee and full transition history, with server-side permission checks and an audit row per transition.

Tasks: Open → In Progress → Completed, plus Cancelled and Overdue where applicable, retaining the same lineage fields plus assigned user/role, due date and completion actor/date; the correct assignee is notified and every transition audited.

Suppression: rule + entity isolation (one entity can never suppress another), entity key generation, start, expiry, suppressed-count increment, last-suppressed timestamp, documented critical-severity bypass, expired-record handling, retry handling, and dry-run preview without persistence.

## Phase I — RBAC/RLS and audit evidence

pgTAP proves server-side gating (not hidden buttons or route guards) for view, manage, activate, deactivate, restore version, run tests, export, view executions, view/manage alerts, view/manage tasks and module editors — across System Administrator, authorised supervisor, view-only analyst, another regulator's user, external entity user and unauthenticated user.

Audit coverage for create, update, clone, activate, deactivate, restore, version creation, owner change, effective-date change, test run, runtime evaluation, action execution, action failure, alert transition, task transition, suppression and export — each row carrying actor, actor role, family, rule ID/code, version, source event ID, entity key, action index, correlation ID, before, after, note, result/error and timestamp.

## Phase J — Live end-to-end scenarios

One real business scenario per family driven by an actual business event (not mocked frontend data), proving correct rule/version selection, effective-date enforcement, condition evaluation, execution recording, action order, exactly-once side effects, suppression, complete audit, and a retry that duplicates nothing.

## Phase K — CI acceptance gate

A `rule-engine` job in `.github/workflows/ci.yml` runs install, typecheck, build, migration validation, unit tests, and the library, editor, generic tester, module tester, dry-run isolation, runtime ownership, duplicate-engine, exactly-once retry, effective-date, version immutability, alert lifecycle, task lifecycle, suppression, RBAC/RLS and regression suites.

## Deliverables (`docs/rule-engine/`)

FRD traceability matrix, family inventory with live row counts, runtime ownership registry, overlap-resolution matrix, Rule Tester report, module tester report, dry-run isolation report, exactly-once/idempotency report, effective-date report, version immutability report, alert lifecycle report, task lifecycle report, suppression report, RBAC/RLS report, audit report, E2E execution report, CI run reference, final commit SHA, and a completion percentage computed from the traceability matrix.

Anything not proven by an executed test is reported UNVERIFIED. I cannot self-certify a GitHub Actions pass — the CI link and commit SHA come from the run on your repository after the changes are pushed, so completion will not be claimed as 100% before that run is green.

## Technical notes

- DB changes stay additive: idempotency unique constraints, lifecycle state/transition history where missing, suppression scoping, audit columns where missing, and cleanup of the stray leftover draft rule.
- Module rule tables are not altered or dropped, except a proven duplicate-execution scope-out in Phase E.
- Each phase ends with a typecheck plus its own test layer; the suite stays green throughout.
