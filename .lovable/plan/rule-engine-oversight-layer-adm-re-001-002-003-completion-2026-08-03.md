# Rule Engine oversight layer — ADM-RE-001 / 002 / 003 completion

## Verified current state

- Central library exists: `/admin/rule-engine` (`src/pages/admin/RuleLibrary.tsx`, 268 lines) — loads all `engine_rules` client-side, filters in memory, and shows the eight module-specific rule areas only as static shortcut cards (`LEGACY_RULE_MODULES`).
- Shared editor exists: `src/pages/admin/RuleEditor.tsx` (659 lines) with configuration, sandbox test, execution history.
- Shared backend exists: tables `engine_rules`, `engine_rule_versions`, `engine_rule_tests`, `engine_rule_executions`, `engine_rule_alerts`, `engine_rule_tasks`, `engine_rule_suppressions`; RPCs `engine_rule_save`, `engine_rule_validate`, `engine_rule_activate`, `engine_rule_deactivate`, `engine_rule_record_test`, guard trigger; evaluator `supabase/functions/_shared/ruleEngineEval.ts` + runner `evaluate-engine-rules`.
- Module-specific rule families are live with real data: `return_validation_rules` (+ `return_validation_rule_versions`, `return_validation_run_log`), `prudential_thresholds` (14), `conduct_monitoring_rules` (3), `conduct_triage_rules` (6), `correspondence_routing_rules` (14), `escalation_rules` (5), `sufficiency_rules` / `sufficiency_rule_sets`, `application_rfi_auto_rules` (0 rows).
- `engine_rules` = 0 rows and `engine_rule_executions` = 0 rows: the shared engine has never been exercised end to end. Whether the evaluator is scheduled could not be confirmed (no read access to the cron catalog) — confirming that is a task, not an assumption.
- RBAC: `rule_engine` module currently has only three actions — `view`, `edit`, `activate`. The finer permissions the request asks for (test, executions, alerts, tasks, versions, restore, export) do not exist yet.

No second library, editor, evaluator, or rule table will be created. All work extends what is listed above.

## Phase 1 — Inventory and ownership decisions (no behaviour change)

Produce `docs/rule-engine/01_inventory.md` + `inventory.csv` covering the nine families with every attribute requested (screen/route, tables, RPCs, edge functions, evaluation trigger, rule format, lifecycle, versioning, testing, audit, permissions, alerts/tasks/notifications, suppression, central visibility, FRD gaps). Each row is read from code and the database, not inferred.

Then `docs/rule-engine/02_ownership_matrix.md` classifying each family as native shared-engine, module-specific surfaced centrally, migration candidate, must-remain-module-specific, or retire — with the authoritative runtime owner named for each overlap (shared threshold vs prudential threshold, shared routing vs correspondence routing, shared SLA vs escalation, shared validation vs return validation, shared pattern vs conduct monitoring). Expected default: prudential, return validation, triage, routing and escalation stay module-owned at runtime; the shared engine owns only rules created in it. Any change to a runtime owner is only done in Phase 6 and only where the matrix proves double-firing exists.

## Phase 2 — Central library as a real oversight layer

Backend: a read-only normalisation view/RPC (`rule_inventory` view + `rule_inventory_search` RPC) that UNIONs `engine_rules` with the eight module tables into one shape (rule code, name, description, module, sub-module, family, type, severity, status, version, active version, trigger count, last triggered, last tested, owner, last modified by/date, source screen, runtime status) plus a capability bitmap per family (can_edit_centrally, can_clone, can_test, can_activate, has_versions, has_executions, has_alerts, has_tasks). Server-side pagination, search, sorting and all requested filters live in the RPC; RLS/permission-checked.

Frontend (`RuleLibrary.tsx` extended, not replaced): tabs All Rules / Shared Engine / Return Validation / Prudential / Conduct / Complaint Triage / Licensing / Correspondence / Escalation; server-driven table with the full column set; KPI strip (active/draft/inactive, never executed, failing evaluation, no recent test); row actions rendered strictly from the family capability bitmap — unsupported actions are absent, not disabled placeholders. Module rules open their own specialised editor; shared rules open `RuleEditor`.

## Phase 3 — Shared Rule Editor gap closure

Audit `RuleEditor.tsx` against the FRD field list and add only what is missing: owner, effective date, optional expiry, tags, suppression window on the identification panel; per-type condition completeness for the ten supported types; the full action set (alert, task, notification, escalation, assign role/owner, start workflow/step, risk status, follow-up) with deterministic ordering and a per-action preview of exactly what will be created. Condition nesting stays at the predicate structure the saved model already supports; the limitation is documented rather than silently changed.

Validation is duplicated client-side and enforced server-side in `engine_rule_validate` (required fields, duplicate code, unsupported metric/operator, invalid threshold/period/window, malformed conditions, empty actions, invalid recipient/role/workflow/notification event, negative suppression, type/condition mismatch). `engine_rule_activate` always re-runs server validation and refuses activation without a passing test on the current version.

## Phase 4 — Versioning

Verify and complete for the shared engine: every save creates a version, prior versions immutable (trigger-enforced), active version explicit, version notes, created by/date shown, side-by-side version comparison, restore creates a new version, executions and tests retain the version used. Module families: document their actual versioning state (only return validation has a version table) and add versioning only where the FRD requires it for that family; no unified-versioning claim is made where it does not exist.

## Phase 5 — Testers

Shared tester (existing sandbox) completed to support draft/historical version selection, entity, sector/sub-sector, period, batch limit, metric override, historical replay; output shows candidates, matched/unmatched, metrics used, predicate-by-predicate results, match reason, suppression outcome, expected alert/task/notification/escalation/workflow, errors and duration. Dry runs write only `engine_rule_tests` + audit — asserted by a pgTAP test that counts alert/task/notification rows before and after.

Module families: reuse their existing preview/test tooling where present; add a safe module-specific preview where absent (triage, routing, escalation) using each module's own evaluation path — specialised rules are never pushed through the generic evaluator. Test results surface as `last_tested` in the central inventory.

## Phase 6 — Runtime ownership, integrations, de-duplication

For each family prove the real invoker (trigger / RPC / edge function / sweep / submission / intake / workflow transition / correspondence receipt / escalation timer) and prove per execution: correct rule and active version, correct entity scope and metrics, execution row written, suppression applied, action created exactly once, correlation ID retained, audit row written, errors recorded without breaking the business transaction. Schedule the shared evaluator (hourly sweep + daily calendar pass) if it is not already scheduled. Where the matrix found genuine double evaluation, the non-authoritative side is made to reference the authoritative rule or scoped out — never both firing.

## Phase 7 — RBAC / RLS and audit

Extend the `rule_engine` permission module from three actions to the full set (view, manage, activate, deactivate, test, view_executions, view_alerts, manage_alerts, view_tasks, manage_tasks, export, view_versions, restore_versions) and enforce each server-side in the corresponding RPC; module rule pages get equivalent server-side checks. Audit every listed event with actor, actor role, timestamp, family, rule ID/code, version, module, before/after, justification, correlation ID, result/error.

## Phase 8 — Acceptance, regression, reporting

Execute all 30 listed acceptance scenarios (pgTAP for RLS/permission/audit/immutability/suppression, Vitest for inventory normalisation, validators, preview rendering, capability gating, and a Playwright end-to-end pass covering create → test → activate → real fire → alert/task/notification → deactivate with justification). Deliverables under `docs/rule-engine/`: inventory, FRD traceability matrix, ownership/duplication matrix, library/editor/tester test reports, runtime execution report, RBAC/RLS report, audit report, regression report, and a computed completion percentage derived from the traceability matrix — not from file existence.

## Technical notes

- New DB objects are additive: one inventory view, its search RPC, extra permission actions, immutability/audit triggers, capability metadata. No existing rule table is altered or dropped in Phases 1–5.
- Any runtime-owner change in Phase 6 is a separate migration, gated on evidence of double-firing recorded in the matrix.
- Each phase ends with typecheck + the relevant test layer; CI stays green throughout.
