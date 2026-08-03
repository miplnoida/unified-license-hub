# Rule Engine — ADM-RE-001 / 002 / 003 (complete to FRD)

Today there is no Rule Engine. Rule configuration is scattered across ~15 separate module screens and tables (conduct monitoring, triage, escalation, prudential thresholds/stress indicators, return validation, correspondence routing, sufficiency, RFI auto-rules, delegation, duplicate detection). Verified: no `/admin/rules` route, no unified rule table, no rule tester, no rule execution history.

Per your decision, **no existing rule module is modified or migrated**. They keep working exactly as they do now, and they appear in the Rule Library as read-only "external" rows that link out to their own admin screen. All new FRD behaviour lives on a new unified engine.

## What gets built

### ADM-RE-001 — Rule Library (`/admin/rule-engine`)
- Table: Rule ID, Rule Name, Rule Type, Module, Status (Active/Inactive/Draft), Last Triggered (date/time), Trigger Count (lifetime), Last Modified By/Date, Actions.
- Filter by Rule Type (all 12 FRD types) and Module; text search by name; sortable, paginated 50/page.
- Row actions: Edit (Active rule → "New Version" confirmation), Test, Execution History, Activate/Deactivate toggle.
- Activate confirmation ("This will begin firing immediately"); Deactivate requires written justification (SweetAlert2), audit `ADMIN_RULE_DEACTIVATED`.
- Activation is blocked unless the rule has a passing sandbox test on its current version (R-ADM-016) — the toggle explains why and links to the Tester.
- Deactivation leaves open alerts open, with an explicit notice (R-ADM-017).
- Legacy rules shown as read-only rows tagged "External — managed in {module}" with a link to their existing screen.

### ADM-RE-002 — Rule Editor (`/admin/rule-engine/:id`)
No code entry — everything through UI.
- Metadata: Rule ID (auto, permanent, never reassigned — R-ADM-018), Name, Description, Rule Type (12 types), Module, Sub-module, Tags.
- Type-specific condition builders, matching the FRD field-for-field:
  - **Threshold** — metric selector (live ratio/indicator IDs per sector), operator (6 operators), value + unit, sector scope (multi-select).
  - **Trend/Sequential** — metric, direction, consecutive periods, period type, optional magnitude.
  - **Peer Comparison**, **Cross-Field Validation**, **Condition Monitoring**, **Recurrence**, **Macro Overlay**, **Group Contagion** — condition panels using the same metric/operator/scope primitives.
  - **Pattern Detection** — event type, count threshold, rolling time window, grouping (entity/product/conduct category/postcode), comparison (absolute vs sector average).
  - **Routing** — data field, operator, value, destination (role/team/named user/sub-queue), multiple conditions with AND/OR.
  - **Scheduling** — calendar-based (daily/weekly/monthly/quarterly/annual + date offset) or event-based (return submitted / assessment completed / licence expiring in N days / condition deadline in N days).
  - **SLA** — workflow + stage + duration + warning threshold.
- Severity assignment (Low/Medium/High/Critical) for alert-generating rules.
- Actions on Trigger (multi-select, all executed for real): Generate Alert with `{{metric}}/{{entity}}/{{value}}` text template, Send Notification (template + recipient role), Create Task (role + due-date formula), Update Entity Risk Status, Initiate Workflow (Published workflows only — R-ADM-019), Log EWI Event.
- Suppression: same entity within X days → suppress and increment count; Critical severity overrides suppression.
- Rule Logic Preview — live plain-language sentence of the configured rule.
- Validations: name required; ≥1 condition; ≥1 action; sector scope required for threshold/EWI (R-ADM-020); pattern-detection window ≥ 7 days (R-ADM-021).
- Save Draft / Test / Save & Activate (confirmation shows the plain-language summary).

### ADM-RE-003 — Rule Tester (`/admin/rule-engine/:id/test`)
- Sandbox run against representative production-shaped data with **no** production side effects: choose entities/sectors and a period range, or run against a sample set.
- Output per candidate: matched / not matched, the metric values used, the plain-language reason, and the actions that *would* have fired (rendered alert text, notification recipients, task, workflow).
- Records a test result row against the rule version; a passing test is what unlocks activation.

### Evaluation & execution (real firing)
- New scheduled Edge Function `evaluate-engine-rules` (pg_cron: hourly + a daily pass for calendar rules), plus event-driven invocation for event-based scheduling triggers.
- On match it executes the configured actions for real: creates the alert, dispatches the notification event, creates the task, updates entity risk status, starts the published workflow, logs the EWI event — each with suppression checks and full audit entries.
- Every evaluation writes an execution-history row (timestamp, entity/individual, result, action taken) powering "Last Triggered", lifetime trigger count and the Execution History screen.
- Notifications: on activation → module owner; on first fire after activation → confirming admin.

## Technical notes

- New tables (RLS + GRANTs, R-01/admin-gated writes, audit triggers): `engine_rules`, `engine_rule_versions`, `engine_rule_tests`, `engine_rule_executions`, `engine_rule_suppressions`.
- Rule IDs: human-readable immutable sequence (`RULE-000123`) held on the rule row; never reused.
- Condition/action definitions stored as validated JSONB; a SQL/TS validator enforces R-ADM-019/020/021 server-side too, so activation cannot be bypassed from the client.
- Evaluators reuse existing metric sources (prudential ratios/indicators, returns data, complaints/conduct signals) read-only — no changes to those modules.
- RBAC: new `rule_engine` permission module with view/edit/activate actions, routes guarded, action buttons `data-rbac` tagged.
- Audit events: `ADMIN_RULE_CREATED`, `ADMIN_RULE_UPDATED`, `ADMIN_RULE_ACTIVATED`, `ADMIN_RULE_DEACTIVATED`, plus execution logging.
- Sidebar/Admin Hub entry under Admin Console > Rule Engine.

## Verification before I call it done

- pgTAP: RLS/permission matrix on the new tables, activation-without-test rejection, sector-scope and 7-day-window rejections, unpublished-workflow rejection, rule-ID immutability, suppression counting.
- Vitest: plain-language preview generation, condition validators, all 12 type builders' payload shapes, action-preview rendering.
- End-to-end run in the preview browser: create a threshold rule → test → activate → force a fire via the evaluator → confirm alert + notification + task + risk-status update rows exist and execution history/trigger count update; then deactivate with justification and confirm the open alert stays open.
- A short verification doc under `docs/verification/rule-engine/` recording the executed evidence, and the FRD tracker row moved to Done only after that evidence exists.
