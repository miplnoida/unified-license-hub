# Rule Engine — Editor, Tester, runtime ownership and executable proof (ADM-RE-002/003)

The Rule Library stays as built. No new central screen, no redesign, no rebuild of the editor or the evaluator. Everything below extends what exists and ends in executed tests, not inspection.

## Verified current state (checked now)

- `rule_inventory` currently returns rows for 6 families only: prudential 14, escalation 14, complaint_triage 6, correspondence 5, conduct 3, shared_engine 1. `return_validation`, `sufficiency` and `rfi_auto` have branches but zero source rows.
- Shared-engine runtime has never run: `engine_rule_tests`, `engine_rule_executions`, `engine_rule_alerts`, `engine_rule_tasks`, `engine_rule_suppressions` are all 0 rows. `engine_rules` = 1 (the leftover verification draft), `engine_rule_versions` = 2.
- Existing surfaces: `src/pages/admin/RuleLibrary.tsx`, `RuleEditor.tsx`, module editors (`RfiAutoRules`, `SufficiencyRules`, `SufficiencyRuleSets`, `FpSectorDecisionRules`, `RuleOverrides`), `src/lib/ruleEngine.ts`, edge function `evaluate-engine-rules`.
- There is no `docs/rule-engine/` directory and no rule-engine CI job yet.

## Phase A — Live data for all nine families

Create real records through the owning module editors/RPCs (not hardcoded demo rows, not raw inserts that bypass validation) so every family has at least a small representative set, including Return Validation, Sufficiency and RFI Auto Rules. Then run the library against that data and record: row correctness, zero-row families still visible, counts, every filter, sorting, pagination, source-screen navigation, capability flags hiding unsupported actions, last triggered / last tested / owner / runtime owner accuracy, and CSV values. Anything inaccurate is fixed in the view/RPC, not in the UI.

## Phase B — Rule Editor runtime governance

- **Effective dates**: evaluator skips rules before `effective_from`, after `effective_to`, and when inactive; activation rejects an invalid range; the editor and library show scheduled / active / expired state.
- **Ownership**: owner picker limited to authorised internal users, server-side rejection of unauthorised owners, owner change audited, owner surfaced in the library.
- **Active-rule safety**: one enforced behaviour — editing an active rule always writes a new draft version while the active version keeps executing; direct mutation of the active version is rejected by trigger. No silent change.
- **Server-side validation** in `engine_rule_validate` / `engine_rule_activate` covering the full list: name, duplicate code, module, rule type, metric, operator, threshold, period/window, sector, role, notification event, workflow, escalation config, empty conditions, empty actions, malformed condition/action JSON, negative suppression, invalid date range. Client validation mirrors it but is never the gate.
- **Action order**: explicit persisted order, displayed execution order, safe reordering, deterministic execution, per-action result rows, and a documented stop-vs-continue-on-failure policy.

## Phase C — Immutable versioning proof

pgTAP proves: every save snapshots a version; UPDATE/DELETE on `engine_rule_versions` is rejected for normal users; restore creates a new version and leaves the source byte-identical; executions, tests and audit rows carry the exact version used; current vs active version differ while a draft exists. Version comparison covers conditions, actions, severity, owner, effective dates and suppression. Version note required for meaningful changes.

## Phase D — Shared Rule Tester

Inputs: version selection (draft / active / historical), entity, sector, sub-sector, date, return period, mode (current snapshot / historical replay / batch with limit), manual metric overrides.

Output: rule code, version, mode, timestamp, entity, candidate/matched/unmatched counts, every condition with actual value, operator, expected threshold, pass/fail and reason, suppression result and expiry, expected alert / task / notification / escalation / workflow action, duration, error details, correlation ID.

History: saved runs, version recorded, run comparison, export, filter by version, user and date.

## Phase E — Dry-run isolation

pgTAP snapshots row counts of notifications, alerts, tasks, escalations, assignments, workflow, risk, case, suppression tables plus `engine_rules.trigger_count` / `last_triggered_at` before and after a dry run and asserts only `engine_rule_tests` and one `RULE_TEST_RUN` audit row grew.

## Phase F — Specialised module testers

Each family tests in its own context, launched from the library by family: return validation (form/version, period, sample field values, cross-field, expression result, messages); prudential (entity, return, ratio, sector, period, threshold, breach); conduct (entity, metrics, pattern period, risk signal); complaint triage (type, vulnerability, urgency, category, assignment, priority); correspondence routing (sender type, source record, direction, category, participant, route); escalation (tier, business calendar, acknowledgement time, deadline, recipient, next tier). Results feed `last_tested` back to the inventory.

## Phase G — Runtime ownership registry + duplicate scan

`docs/rule-engine/runtime-ownership.json` (+ markdown/CSV view) with one row per family: family, source table, evaluator, trigger type, trigger location, actions, suppression owner, audit owner, notification owner — every cell traced to a real trigger/RPC/sweep/edge function. `scripts/verify-runtime-ownership.mjs` fails the build when two active owners claim the same family, source event, module or action type. Overlap candidates resolved by scoping the non-authoritative path out: shared threshold vs prudential, shared routing vs correspondence, shared SLA vs escalation, shared validation vs return validation, shared pattern vs conduct.

## Phase H — Exactly-once execution

Idempotency key of correlation ID + rule ID + version + entity + source-event ID + action index, enforced by a unique index. Real scenario per runtime family proves one source event yields one execution record and at most one alert / task / notification / escalation per configured action, and that replaying the same event creates no duplicates.

## Phase I — Alert, task and suppression lifecycles

Alerts: created from a match, referencing rule + execution + entity, acknowledge / assign / resolve, retained status history, notification to the right user, every transition audited, unauthorised transitions rejected.

Tasks: created from a match with valid assignee/role, correct due date, assignee notified, completion audited, another user's task not completable.

Suppression: scoped to rule + entity (proven one entity cannot suppress another), expiry honoured and expired rows ignored, suppressed count increments, documented critical-severity override, dry-run preview only, runtime writes, visible history, idempotent retries.

## Phase J — RBAC / RLS server-side tests

pgTAP for view, manage, activate, deactivate, restore versions, run tests, export, view executions, view/manage alerts, view/manage tasks and module editors, across System Administrator, authorised supervisor, view-only analyst, external entity user, other-regulator user and unauthorised user. Gating is proven in RPCs; hidden buttons prove nothing.

## Phase K — Audit evidence

Every action in the FRD list audited (create, update, clone, activate, deactivate, restore, version created, test run, runtime execution, action executed, action failed, alert acknowledged, alert closed, task completed, suppression applied, export, owner changed, effective dates changed) with actor, actor role, family, rule ID, rule code, version, source event, source entity, correlation ID, before, after, justification, timestamp, result/error. pgTAP counts audit rows per action.

## Phase L — Automated tests and CI gate

Vitest + pgTAP covering: nine-family inventory, filters, pagination, sorting, export, activation validation, effective-date enforcement, immutable versions, restore, historical-version testing, dry-run isolation, duplicate-runtime prevention, exactly-once actions, per-entity suppression, critical override, RBAC, RLS, tester routing, runtime execution per family. A `rule-engine` job in `.github/workflows/ci.yml` runs install, typecheck, build, unit tests, migration validation, library/editor/tester tests, RLS/RBAC tests, runtime-ownership and duplicate-action tests, and regression.

## Deliverables (`docs/rule-engine/`)

FRD traceability matrix, family inventory with live row counts, runtime ownership registry, duplicate-owner scan output, library/editor/tester test reports, dry-run isolation report, runtime execution report, alert/task/suppression reports, RBAC/RLS report, audit report, CI run reference and final commit SHA, and a completion percentage computed from the traceability matrix.

Anything not proven by an executed test is reported as UNVERIFIED, never as complete. CI status is reported from the actual run, and I cannot self-certify a GitHub CI pass — the CI link and SHA come from the run on your repository after the changes are pushed.

## Technical notes

- DB changes are additive: validation/audit hardening in existing RPCs, active-version mutation guard, idempotency unique index, suppression scoping, extra audit columns where missing, cleanup of the stray `RULE-000001` draft.
- Module rule tables are not altered or dropped except a proven duplicate-execution scope-out in Phase G.
- Each phase ends with a typecheck plus its own test layer; the suite stays green throughout.
