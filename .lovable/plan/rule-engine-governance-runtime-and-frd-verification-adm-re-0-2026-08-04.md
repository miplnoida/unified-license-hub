# Rule Engine — governance, runtime and FRD verification (ADM-RE-001/002/003)

No new rule library, no new engine, no migration of module rules into the shared engine, no replacement of specialised editors. Everything below extends what already exists.

## Verified current state (checked before writing this plan)

- Central library `/admin/rule-engine` (`RuleLibrary.tsx`) + shared editor (`RuleEditor.tsx`) exist; oversight view `rule_inventory` and RPC `rule_inventory_search` exist and return rows.
- `rule_inventory` currently surfaces only 6 families: shared_engine (1), prudential (14), conduct (3), complaint_triage (6), correspondence (5), escalation (14). **Missing from the inventory: Return Validation, Sufficiency, RFI Auto Rules** (their source tables exist but currently hold 0 rows, so they are absent by data, and the view has no branch for them — both must be fixed so an empty family still appears as a governed family).
- Shared engine has never run: `engine_rule_tests`, `engine_rule_executions`, `engine_rule_alerts`, `engine_rule_tasks`, `engine_rule_suppressions` are all 0 rows. 1 rule, 2 versions (the leftover verification draft `RULE-000001`).
- RPCs present: `engine_rule_save`, `engine_rule_validate`, `engine_rule_activate`, `engine_rule_deactivate`, `engine_rule_record_test`, `engine_rule_restore_version`, plus `engine_rule_versions_immutable` and `engine_rules_guard` triggers.
- `rule_engine` permissions already granular: view, edit, activate, test, export, view_versions, restore_versions, view_executions, view_alerts, manage_alerts, view_tasks, manage_tasks. **`deactivate` is missing** as a distinct action.
- Whether the shared evaluator is scheduled could not be confirmed (no read access to the cron catalog) — confirming it is a task, not an assumption.
- CI runs build, typecheck, RBAC parity, a fixed pgTAP list and Deno tests. It has no rule-engine, inventory, versioning, runtime or performance job.

## Phase 1 — Inventory governance completion

Extend the `rule_inventory` view with branches for Return Validation, Sufficiency (rule sets + rules) and RFI Auto Rules, so all nine families are governed. Guarantee every required column is non-fabricated: rule code, name, description, family, module, sub-module, type, severity, status, current version, active version, trigger count, last triggered, last tested, owner, runtime owner, last modified, source screen. Where a family genuinely has no version/test/trigger concept, the column returns null and the family capability bitmap says so — nulls are never filled with zeros to look complete.

Family tabs in `RuleLibrary.tsx` cover all nine and render even at zero rows. Server-side filters extended to the full set (module, family, severity, status, type, tag, date range) with search, sorting and pagination staying in the RPC. All seven KPIs (active, draft, inactive, never executed, never tested, stale tests, failed) computed in SQL over the filtered set — no client-side counts, no constants.

Also remove the leftover verification draft `RULE-000001` and its versions via migration (version tables are insert-only).

## Phase 2 — Runtime ownership matrix and duplicate elimination

Produce `docs/rule-engine/02_runtime_ownership.md` (+ CSV) with one row per family: business event → runtime owner → evaluation function → actions → audit → notification → task → escalation, each cell traced to a trigger, RPC, sweep or edge function read from the repo/DB, not inferred.

Then prove single ownership for the known overlap candidates: shared threshold vs prudential threshold, shared routing vs correspondence routing, shared SLA vs escalation timers, shared validation vs return validation, shared pattern vs conduct monitoring. Expected outcome: module engines remain authoritative at runtime and the shared engine only evaluates rules created in it. Where evidence shows a business event can reach two engines, the non-authoritative path is scoped out in a dedicated migration — never "both fire, dedupe later". Confirm (and schedule if absent) the shared evaluator sweep.

## Phase 3 — Shared editor completion

Complete missing FRD fields on the existing editor only: effective from/to, expiry, owner, lifecycle state, activation notes, deactivation notes, version notes. Conditions keep the current predicate structure — no new structure invented; the nesting limit is documented.

Validation duplicated client-side and enforced in `engine_rule_validate`: invalid metric, invalid operator, invalid workflow, invalid notification event, invalid escalation, invalid role, invalid threshold, duplicate code, broken JSON, invalid condition graph, empty actions, negative suppression, type/condition mismatch. `engine_rule_activate` re-validates server-side and still requires a passing test on the current version.

Actions: verify and complete notification, task, alert, workflow, escalation, assignment, risk update, case creation, follow-up; deterministic ordering persisted with the rule; a preview showing the exact sequence and the exact records each action would create.

## Phase 4 — Immutable versioning verification

Prove by pgTAP, not by inspection: every save writes a new version; UPDATE/DELETE on `engine_rule_versions` is rejected; restore creates a new draft version and leaves history byte-identical; executions, tests and audit rows each store the version they used. Version comparison highlights conditions, actions, thresholds, owner, effective dates, suppression, notification and workflow actions.

## Phase 5 — Shared Rule Tester completion

Version selection (draft / historical / current), modes dry run / historical replay / current snapshot / batch, plus entity, sector, sub-sector, date, return period, manual metric override, batch limit.

Output per evaluation: each condition with pass/fail, threshold, actual value and reason; suppression result; actions, notifications, alerts, tasks, escalations, workflow actions that *would* be created; evaluation time, correlation ID, duration, rule version, overall result. Export, save test, compare tests, history.

Dry-run isolation is proven by a pgTAP test that snapshots counts of notifications, tasks, alerts, workflow, risk and assignment tables before and after a dry run and asserts only `engine_rule_tests` (+ audit) grew.

## Phase 6 — Module-specific testers

Specialised rules never go through the generic evaluator. Each family's tester uses its own context — return validation context, prudential metrics, conduct metrics, complaint attributes, correspondence thread context, escalation timers — reusing existing preview tooling where present and adding a safe module preview where absent. The central library launches the correct tester automatically from the family capability bitmap; results feed `last_tested` back into the inventory.

## Phase 7 — Runtime verification with real events

Drive real business events across licensing, returns, prudential, conduct, complaints, correspondence, escalation, workflow, AI and dashboards. For each, prove: correct rule, correct version, correct entity, correct metrics, correct conditions, correct actions, suppression applied, audit written, notification/task/escalation created **exactly once**, correlation ID retained, errors recorded without breaking the business transaction. Recorded in `docs/rule-engine/07_runtime_execution.md` with the row IDs produced.

## Phases 8–10 — Alerts, tasks, suppression

Alerts: created, acknowledged, assigned, closed, history, comments, source rule, source execution, linked entity, notification, audit.
Tasks: created, assigned, due date, completed, notification, audit, source rule, source execution, linked entity.
Suppression: entity suppression, duplicate suppression, expiry, preview, statistics, critical override, history — with a pgTAP test proving a suppression on one entity cannot suppress another.

## Phase 11 — RBAC server-side

Add the missing `deactivate` action and enforce every rule-engine action inside the corresponding RPC (view, manage, activate, deactivate, restore, run tests, export, view executions, view alerts, view tasks, module editors, inventory). Frontend gating stays presentation only. pgTAP asserts each RPC rejects an unprivileged caller.

## Phase 12 — Audit

Audit create, edit, clone, activate, deactivate, restore, run test, runtime execute, alert, task, suppression, export — each with user, role, timestamp, version, rule family, rule, before, after, correlation ID. Verified by pgTAP counting audit rows per action.

## Phase 13 — Performance

Seed 100 / 500 / 1000 rules, 10 000 executions, large test/alert/task histories in a scratch run; measure inventory search, filter and pagination latency; confirm server-side pagination and no N+1 in the RPC (single query, no per-row lookups). Results in `docs/rule-engine/13_performance.md`.

## Phase 14 — Regression

Full pass over licensing, workflow, returns, complaints, prudential, conduct, correspondence, escalation, notifications, dashboards, audit and role management using existing pgTAP/Vitest suites plus a Playwright pass.

## Phase 15 — CI

Add a rule-engine CI job running build, typecheck, rule tests, runtime tests, inventory tests, RLS/permission tests, version tests and regression. CI must be green before any completion claim.

## Deliverables (all under `docs/rule-engine/`)

Rule inventory matrix, runtime ownership matrix, rule family mapping, library/editor/tester verification reports, runtime execution report, alert/task/suppression reports, RBAC report, audit report, performance report, regression report, and an FRD completion percentage computed from the traceability matrix — not from file existence. Anything not proven by an executed test is reported as UNVERIFIED rather than complete.

## Technical notes

- DB changes are additive: extended inventory view, extra permission action, validation/audit hardening, cleanup of the stray draft rule. No module rule table is altered or dropped except a proven duplicate-execution scope-out in Phase 2.
- Each phase ends with typecheck plus its test layer; CI stays green throughout.
