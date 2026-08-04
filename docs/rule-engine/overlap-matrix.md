# Rule Engine — runtime overlap resolution matrix

Scope: ADM-RE-001 (Rule Library), ADM-RE-002 (Rule Editor), ADM-RE-003 (Rule Tester).

Governing principle: the central Rule Library is a **governance and oversight layer**.
It inventories, searches, exports and reports on all nine rule families, but it only
*executes* rules stored in `public.engine_rules`. Every module family keeps its own
editor, its own source table and its own single runtime owner.

The machine-readable source of truth is `docs/rule-engine/runtime-ownership.json`,
enforced by `scripts/verify-runtime-ownership.mjs` and
`src/test/ruleEngineRuntimeOwnership.test.ts` (CI job `rule-engine`).

## Overlap candidates and how each is resolved

| Overlap candidate | Shared-engine capability | Module owner | Resolution |
|---|---|---|---|
| Threshold breach | `engine_rules` rule_type `threshold` | `prudential_thresholds` → `prudential-monitoring-sweep` | Prudential ratios/thresholds are evaluated **only** by the prudential sweep. Shared threshold rules operate on `engine_rules` rows exclusively and never read `prudential_thresholds`. |
| Routing | `engine_rules` rule_type `routing` | `correspondence_routing_rules` → `classify_correspondence` | Correspondence messages are routed only by `classify_correspondence`. Shared routing rules cannot subscribe to correspondence message events. |
| SLA / escalation | `engine_rules` escalation actions | `escalation_rules` → `escalation_sweep` | Escalation tiers, business calendars and acknowledgement deadlines belong to `escalation_sweep`. Shared rules may raise an alert or task, never an escalation tier transition. |
| Data validation | `engine_rules` rule_type `validation` | `validation_rules` → `evaluate_return_validations` | Return submissions are validated only by `evaluate_return_validations`, which is the submission gate. Shared validation rules never run on return submit. |
| Pattern detection | `engine_rules` rule_type `pattern` | `conduct_monitoring_rules` → `evaluate-conduct-monitoring` | Conduct pattern detection and `conduct_alerts` creation belong to the conduct sweep. Shared pattern rules write only `engine_rule_alerts`. |
| Triage / classification | `engine_rules` classification actions | `complaint_intake_rules` → `classify_complaint` | Complaint classification, SLA stamping and workflow start are trigger-owned on `public.complaints`. |
| Application completeness | — | `sufficiency_rules` → `evaluate-application-sufficiency` | Sufficiency assessment is edge-function owned, officer-confirmed. |
| RFI generation | — | `application_rfi_auto_rules` → RFI suggestion path | RFI items are always officer-confirmed; no automatic issue path exists. |

## Structural guarantees

- **Disjoint source tables.** No two families read the same rule table; the oracle fails the build if that changes.
- **One runtime owner per family.** The oracle fails when two families declare the same runtime owner *and* the same source event, which is the double-execution shape.
- **One central editor.** Only `shared_engine` may be edited from the central Rule Editor; every other family must name its module editor route.
- **Exactly-once actions.** Unique idempotency indexes on `engine_rule_executions`, `engine_rule_action_results`, `engine_rule_alerts` and `engine_rule_tasks` (rule + version + entity + source event + action index) make replay of a source event a no-op. Proven in `supabase/tests/rule_engine/300_runtime_governance.sql`.
- **Dry-run isolation.** A tester run writes exactly one `engine_rule_tests` row and one `RULE_TEST_RUN` audit row, and never alerts, tasks, notifications, escalations or `trigger_count`. Proven in the same pgTAP file.
