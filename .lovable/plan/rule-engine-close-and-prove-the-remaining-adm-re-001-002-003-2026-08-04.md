# Rule Engine — close and prove the remaining ADM-RE-001/002/003 gaps

Nothing existing is rebuilt. The Rule Library, shared Rule Editor, shared Rule Tester, the specialised `ModuleTesterPanel` framework, immutable versions, restore, effective dates, owner validation, the ownership registry, the overlap matrix, action-level results, correlation/source-event IDs, alerts, tasks, suppressions and dry-run history all stay as they are. This plan makes each of them provable and fills what the code does not yet cover.

## Verified current state (checked now)

- `docs/rule-engine/` contains only `runtime-ownership.json` and `overlap-matrix.md` — none of the 22 required reports exist.
- `supabase/tests/rule_engine/` contains `300_runtime_governance.sql`, `310_module_tester.sql`, `320_dry_run_isolation.sql` — no exactly-once, lifecycle, suppression, effective-date or RBAC-persona suites.
- `src/components/admin/rule-engine/` contains `RuleTesterPanel.tsx` and `ModuleTesterPanel.tsx`; the family logic lives in `src/lib/moduleRuleTester.ts` plus the `rule_module_test` RPC.
- Rule-engine Vitest coverage today: `ruleTester`, `moduleRuleTester`, `ruleEngineRuntimeOwnership`, `ruleEngineProhibitedReferences`.

## One limitation stated up front

I cannot trigger GitHub Actions on `miplnoida/unified-license-hub` from here, so I cannot produce a workflow run ID, run URL or final commit SHA for your repository. I will execute every equivalent check in this environment (install, typecheck, build, full Vitest suite, ownership oracle, pgTAP against the live database) and record real output as evidence. Item 1's CI run ID/URL/SHA stays reported as UNVERIFIED until your pushed run is green — so the final percentage will not be 100%.

## Phase 1 — Execute everything CI runs, locally

Install, typecheck, build, ownership oracle, full Vitest, pgTAP suites. Fix every genuine failure in source: no skips, no `.only`, no weakened or deleted assertions. Record exact counts and the failure/fix history in `docs/rule-engine/00_execution-log.md`.

## Phase 2 — Specialised tester parity with production evaluators (item 2)

For each of the eight families, read the real production owner (return-validation RPC, prudential threshold/stress evaluation, conduct sweep, complaint classification/intake rules, sufficiency evaluation, RFI suggestion path, correspondence routing function, escalation sweep/tier evaluation) and make the tester branch call or share that same logic — operators, scoping, period, severity, dedup, message text. Where the tester currently reimplements logic, it is refactored onto the production path rather than kept in parallel. Every scenario listed in the request is covered per family, read-only. Report: `docs/rule-engine/20_tester-parity.md`.

## Phase 3 — Context-only fields (item 3)

Audit every tester input: wire it into evaluation where the FRD requires, delete it where unused, label it informational where it legitimately does not affect the result. Test results gain three explicit lists — evaluated, context-only, ignored (with reason). Report: `21_context-only-fields.md`.

## Phase 4 — Shared Rule Tester modes and inputs (items 4 and 5)

Verify and complete draft/active/historical version selection, current snapshot, real historical replay (as-of data, never current data relabelled), and batch mode with total/evaluated/matched/unmatched/failed/skipped, pagination or download, and duration. Inputs: entity, entity group, sector, sub-sector, source event, date, filing period, batch size, manual overrides. Result detail extended to the full field list including nested AND/OR grouping with per-group results, suppression preview, ordered expected actions and each expected side effect. Reports: `30_shared-tester.md`, `31_historical-replay.md`, `32_batch-test.md`.

## Phase 5 — History, comparison, export (item 6)

History filters by rule, version, user, date, matched state and failures; two-run comparison highlighting version, inputs, conditions, metrics, match, suppression, actions, duration and errors; CSV, JSON and full-result export. Report: `33_comparison-and-export.md`.

## Phase 6 — Dry-run isolation proven in the database (item 7)

pgTAP captures counts and row hashes across every production side-effect surface before and after each shared and specialised run — executions, trigger counters, alerts, tasks, notifications, escalations, suppressions, workflows, assignments, risk scores, conduct alerts, prudential breaches, complaints, correspondence threads, RFI records, application findings, returns, cases — asserting only test-history and labelled test-audit rows changed, including on failure paths. Report: `40_dry-run-isolation.md`.

## Phase 7 — Ownership proven from code (item 8)

Generate the ownership registry from code evidence: every read of each rule table, evaluator invocation, cron, trigger, Edge Function, RPC and frontend call. CI fails on an undocumented owner, a second evaluator on the same table, one source event reaching two evaluators, frontend production evaluation, or a live legacy path. Report: `50_runtime-ownership.md`.

## Phase 8 — Exactly-once and action-failure policy (items 9 and 10)

Per side-effect family: first run, immediate retry, delayed retry, concurrent retry, retry after partial failure, worker restart, duplicate event delivery — exactly one alert, task, notification, escalation, workflow transition, risk update, follow-up and case. Idempotency key = family + source event ID + rule ID + active version + entity key + action index + action type, enforced by database uniqueness. Action records carry index, type, started, completed, status, result, error, retry count, correlation ID and version; `continue` and `stop` policies tested across first/middle/last failure and retry outcomes, with the real per-action result shown in the UI. Reports: `60_exactly-once.md`, `61_action-failure.md`.

## Phase 9 — Lifecycles and suppression (items 11, 12, 13)

Server-side alert transitions (Open, Acknowledged, Assigned, Resolved, Closed) and task transitions (Open, In Progress, Completed, Cancelled, Overdue) with valid/invalid matrices, assignee validation, cross-regulator and external denial, retained history, per-transition audit and notification, and retained rule/version/execution/action-index. Suppression: same rule same entity, entity isolation, rule isolation, expiry and exact boundary, timezone boundary, critical override, counts, last-suppressed time, retry, concurrency, dry-run preview, with no crossing of entity, sector or version. Reports: `70_alert-lifecycle.md`, `71_task-lifecycle.md`, `72_suppression.md`.

## Phase 10 — Effective dates, versions, RBAC/RLS, audit (items 14, 15, 16)

Date/version tests: draft and inactive never run, scheduled not early, exact start and end boundaries, invalid range rejected, consistent timezone, active version always chosen, newer draft does not displace it, restore yields a draft, activation records the exact version. RBAC across eight personas against library, module inventory, editor, save, activate, deactivate, restore, test, export, executions, alerts, tasks, history and specialised testers — asserted server-side only. Audit: append-only entries for all eighteen events with actor, actor role, family, rule ID/code/version, source event, source entity, action index, correlation ID, before, after, justification, result and timestamp. Reports: `80_effective-dates-versions.md`, `81_rbac-rls.md`, `82_audit.md`.

## Phase 11 — Nine real E2E scenarios and regression (items 17, 18)

One genuine business event per family — not a manually invoked tester RPC — capturing source event ID, runtime owner, rule ID/code, active version, entity, input metrics, condition result, execution record, action results, side effects, notifications, audit records, correlation ID, retry outcome and pass/fail. Regression pass over return submission and validation, prudential evaluation, complaint intake, conduct monitoring, application review, RFI creation, correspondence routing, escalation sweeps, notifications, workflows, role permissions, audit logs and dashboards. Reports: `90_e2e-nine-families.md`, `91_regression.md`.

## Phase 12 — CI gate widened, then closure

Extend the `rule-engine` and `db-tests` jobs so every new Vitest and pgTAP suite actually executes — no existence-only check standing in for a run. Then assemble `99_frd-closure.md`: traceability matrix, links to all reports above, and a completion percentage computed from the matrix, with CI run ID/URL and final SHA marked UNVERIFIED pending your pushed run.

## Technical notes

- Schema changes stay additive: idempotency constraints, transition history and suppression scoping only where missing.
- Module rule tables are not altered or dropped; parity is achieved by testers calling the family's own production evaluator.
- Every phase ends with a typecheck plus its own executed test layer; the suite stays green throughout.
- Anything not proven by an executed run is reported UNVERIFIED, never assumed.
