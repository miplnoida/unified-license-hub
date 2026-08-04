# Rule Engine — execute, verify and close the FRD acceptance gaps (ADM-RE-001/002/003)

Nothing existing gets rebuilt or redesigned: the Rule Library, the nine governed families, module editors, the shared Rule Editor, immutable versions, effective dates, owner validation, correlation/source-event IDs, action-level results, the ownership registry, the overlap matrix, the ownership oracle, the Rule Tester unit tests, the governance pgTAP file and the `rule-engine` CI job all stay as they are. This plan runs them, proves them, and fills the gaps they do not yet cover.

## Verified current state (checked now)

- `docs/rule-engine/` holds only `runtime-ownership.json` and `overlap-matrix.md` — none of the 17 required evidence reports exist yet.
- `supabase/tests/rule_engine/` holds only `300_runtime_governance.sql` — no dry-run isolation, exactly-once, lifecycle, suppression or RBAC-persona suites.
- `src/components/admin/rule-engine/` holds only `RuleTesterPanel.tsx` — none of the eight specialised family testers exist.
- The `rule-engine` CI job runs the ownership oracle, two Vitest files and a file-existence check only; pgTAP runs in the separate `db-tests` job and does not include a rule-engine test path.
- All nine family keys are defined in `src/lib/ruleInventory.ts`.

## One limitation stated up front

I cannot run GitHub Actions on `miplnoida/unified-license-hub` from here, and I cannot produce a workflow run ID, run URL or a final commit SHA for your repository. What I can do is execute every equivalent check inside this environment (typecheck, build, the full Vitest suite, the ownership oracle, and the pgTAP suites against the live database) and record the real output as evidence. The CI run ID/URL/SHA and the "green CI" line item stay reported as UNVERIFIED until the pushed run on your repo is green — which also means the final number will not be 100%.

## Phase 1 — Local execution of everything CI runs

Run install, typecheck, build, ownership oracle, and the whole Vitest suite; run the pgTAP suites against the database. Fix every genuine failure in source — no skips, no `.only`, no weakened assertions, no deleted cases. Record exact counts and the failure/fix history in `docs/rule-engine/00_execution-log.md`.

## Phase 2 — Ownership proved against real code paths

For each of the nine families, trace business event → trigger/RPC/edge function/cron → source table → evaluator → side-effect executor → notification → audit by reading the actual artefacts, and write `docs/rule-engine/10_call-path-ownership.md` with a file/function reference per cell (correcting the registry wherever the code disagrees with it).

Add a prohibited-reference guard (Vitest + pgTAP) that fails when the shared engine references `prudential_thresholds`, return-validation evaluation, correspondence routing, escalation-tier transitions or conduct-monitoring rule tables; when a module evaluator reads `engine_rules` outside a documented allowlist; when a legacy evaluator path is reachable; or when two cron schedules target the same family. Report in `docs/rule-engine/11_prohibited-references.md`.

## Phase 3 — Eight specialised testers

Each family routes from the library/editor to its own tester, with the FRD inputs and outputs, all strictly read-only:

- Return Validation — form, version, period, sample field and cross-field inputs, expression evaluation, field-level result, severity, user-facing message.
- Prudential Threshold — entity, return, sector, sub-sector, ratio, period, threshold, direction, severity; actual vs threshold, breach, expected action.
- Conduct Monitoring — entity, period, metrics, pattern window; rule result, expected alert, expected risk impact.
- Complaint Triage — facts, category, vulnerability, urgency, channel; expected priority, SLA, assignment, escalation.
- Sufficiency — application, responses, document inventory; missing information, sufficiency score, expected officer findings.
- RFI Auto — application, requirement, current items; suggested text, duplicate check.
- Correspondence Routing — sender, direction, source record, subject/body attributes, thread type; destination, owner, classification.
- Escalation Rules — source record, tier, elapsed business time, acknowledgement, calendar; next tier, recipients, notification time.

Each writes only test history and returns `last_tested` to the inventory. One report per tester in `docs/rule-engine/3x_*.md`.

## Phase 4 — Shared Rule Tester acceptance closure

Audit the existing panel against the full FRD list (draft/active/historical version, current snapshot, historical replay, batch, entity, sector, sub-sector, source event, date/period, manual override, batch limit; condition tree with actual/operator/expected/pass-fail, matched result, suppression preview, ordered action preview, notification/alert/task/workflow previews, error, duration, correlation ID; save, history, compare, export) and implement only what is genuinely missing. Report in `docs/rule-engine/20_shared-tester.md`.

## Phase 5 — Dry-run isolation proved in the database

pgTAP snapshots counts and row hashes of every side-effect surface (alerts, tasks, notifications, escalations, workflow, risk scores, cases, RFI records, assignments, suppressions, `trigger_count`, `last_triggered_at`, business records) before and after each shared and specialised test run, asserting only test-history and labelled test-audit rows changed. Report: `docs/rule-engine/40_dry-run-isolation.md`.

## Phase 6 — Exactly-once with retries

Per side-effect family: run a source event, retry identically, retry concurrently, retry after partial action failure. Assert one canonical execution, one result per action index, and no duplicate alert, task, notification, escalation, workflow action or suppression increment. Idempotency key = family + source event ID + rule ID + active version + entity key + action index + action type, enforced by constraints. Report: `docs/rule-engine/50_exactly-once.md`.

## Phase 7 — Alert and task lifecycles

Alerts: create, acknowledge, assign, resolve, close, invalid transition, unauthorised transition, cross-regulator denial; verify history, actor, timestamp, rule/version, execution, entity, action index, source event, correlation ID, notification, audit. Tasks: create, assign, start, complete, cancel where permitted, overdue calculation, unauthorised completion, cross-regulator denial, with notification and audit per transition. Reports: `60_alert-lifecycle.md`, `61_task-lifecycle.md`.

## Phase 8 — Suppression acceptance

Same rule/same entity; same rule/different entity isolation; different rule/same entity isolation; expiry boundary; timezone boundary; critical override; retry handling; dry-run preview; suppressed-count accuracy; last-suppressed timestamp. Report: `70_suppression.md`.

## Phase 9 — RBAC/RLS matrix, server-side

Personas: System Administrator, supervisor, analyst/view-only, module administrator, another regulator's user, external regulated entity, unauthenticated. Actions: inventory view, edit, activate, deactivate, restore, run test, export, execution view, alert transition, task transition, specialised tester access. Every denial asserted at the database, not in the UI. Report: `80_rbac-rls-matrix.md`.

## Phase 10 — Live E2E per family

One real scenario per family driven by an actual business event against live development data, recording source event, rule ID/code, version, evaluator, runtime owner, entity, condition result, side effects, notification recipients, audit ID, correlation ID and retry result. Report: `90_e2e-nine-families.md`.

## Phase 11 — CI gate widened, then closure evidence

Extend the `rule-engine` and `db-tests` jobs so every new Vitest and pgTAP suite actually executes (no existence-only checks standing in for a run). Then assemble `docs/rule-engine/99_frd-closure.md`: traceability matrix, live family inventory counts, all reports above, regression report, and a completion percentage computed from the matrix — with the CI run ID/URL and final SHA left as UNVERIFIED pending your pushed run.

## Technical notes

- Schema changes stay additive: idempotency constraints, lifecycle/transition history and suppression scoping only where missing.
- Module rule tables are not altered or dropped; specialised testers reuse each family's own evaluator rather than forcing the generic one.
- Every phase ends with a typecheck plus its own executed test layer, and the suite stays green throughout.
- Anything not proven by an executed run is reported UNVERIFIED rather than assumed.
