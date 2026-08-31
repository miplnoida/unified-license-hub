# F8 — PRUDENTIAL SUPERVISION — READ-ONLY DISCOVERY

- HEAD: `2ec0051f3cbf4fd534c9ac6ba6831e91e2052848` (F0–F5 CERTIFIED AND FROZEN)
- Date: 2026-08-29
- Mode: READ-ONLY. No migrations, no seeding, no configuration change, no retirement, no product development.

## 1. Boundary

- **From frozen upstream:** entity master (`licensees`, read-only), shared notification primitive (`notif_enqueue`), shared escalation system (`trg_prudential_escalation_to_escalation`), audit primitives.
- **From F7:** `return_filing_versions` acceptance drives detection (`tg_prudential_detect_on_acceptance`, `_prudential_canonical_detect_run`), and `return_metric_values` (1717 rows) supplies ratio inputs.
- **F8 owns:** prudential entity state, ratio/metric formula engine with versioning, thresholds with publish/rollback, breach detection, EWI, assessments/CAMELS, risk scoring, examinations end-to-end, findings, corrective actions and follow-up, escalations, financial groups/consolidated supervision, payment-systems/PFMI oversight, stress indicators, authority/maker-checker, prudential audit, Entity360 integration.
- **Later modules:** enforcement/sanction outcomes (`prudential_breach_link_enforcement` is the handoff), F6 money.

## 2. Runtime surface manifest

| Route | Component | RPC | Tables | Class |
|---|---|---|---|---|
| `/prudential/dashboard` | `PrudentialDashboard` (`dashboardRoutes.tsx:337`) | `prudential_dashboard_metrics/_portfolio` | multiple | ACTIVE |
| `/prudential/work` | `PrudentialWorkQueue` (`:338`) | `prudential_work_queue(_counts)` | actions, examinations, escalations | ACTIVE |
| `/admin/prudential/operations` | `PrudentialEngineOperations` (`:339`) | engine ops | detection runs | ACTIVE |
| `/prudential/entities`, `/prudential/analysis/:id` | `PrudentialEntitiesList`, `PrudentialEntityProfile` (`:340,343`) | `prudential_visible_entities`, `prudential_entity_state`, `can_read_prudential_entity` | `entity_risk_scores(19)` | ACTIVE |
| `/prudential/entities/:id` | `PrudentialEntityRedirect` (`:342`) | — | — | ACTIVE shim |
| `/prudential/groups`, `/:groupId` | `FinancialGroupsList`, `FinancialGroupProfile` (`:344-345`), `useFinancialGroups.ts` | `prudential_group_consolidated`, `group_member_ratios`, `group_ewi_evaluate` | `financial_groups(1)`, `financial_group_members(2)`, `group_risk_scores(0)` | ACTIVE / UNCONFIGURED |
| `/prudential/assessments(/:id)` | `AssessmentsList`, `AssessmentWorkspace` | `prudential_assessment_create/save_draft/transition`, `prudential_component_rating_save` | `prudential_assessments(7)`, `_assessment_components(0)`, `_component_ratings(0)` | ACTIVE / UNCONFIGURED taxonomy |
| `/prudential/actions` | `ActionsList`, `usePrudentialActionLifecycle.ts` | `prudential_action_issue/update/monitor`, `close_prudential_action`, `review_prudential_action_response` | `prudential_actions(16)`, `_action_events(31)`, `_action_responses(6)` | ACTIVE |
| `/prudential/escalations` | `EscalationsList` | `prudential_escalation_raise/decide` | `prudential_escalations(10)` | ACTIVE |
| `/prudential/examinations(/:id)` | `ExaminationsList`, `ExaminationWorkspace`, `useExaminations.ts` | `examination_create/update/transition_stage/report_signoff/signoff_workpaper/team_member_*` | `examinations(13)`, `_findings(10)`, `_reports(10)`, `_scoping(10)`, `_team_members(12)`, `_workpapers(11)`, `_data_requests(10)`, `_events(117)`, `_exit_meetings(10)` | ACTIVE |
| `/prudential/payment-systems`, `/:operatorId`, `/prudential/pfmi-assessments/:id` | `PaymentSystemsOversight`, `PaymentOperatorProfile`, `PfmiAssessmentWizard` | operator/incident RPCs (`payment_incident_record/resolve`, `can_act_on_payment_oversight`) | `payment_system_operators(1)`, `payment_system_incidents(0)`, `payment_retail_volumes(0)`, `payment_oversight_config(1)`, `payment_oversight_events(1)` | ACTIVE / thin data |
| `/prudential/stress-indicators` | `StressIndicatorsAdmin` | `prudential_stress_indicator_save/delete`, `prudential_stress_event_acknowledge` | `prudential_stress_indicators(13)`, `_stress_events(0)` | ACTIVE / no events |
| `/admin/prudential-taxonomy` | `PrudentialTaxonomyAdmin` | `prudential_taxonomy_save` | `prudential_risk_taxonomy(11)` | ACTIVE |
| `/admin/returns/prudential/thresholds`, `/ratios`, `/analytics` (`adminRoutes.tsx:237-239`) | `PrudentialThresholds`, `PrudentialRatios`, `PrudentialAnalytics` | `prudential_threshold_save/publish/archive/rollback`, `prudential_ratio_*`, `prudential_analytics_*` | `prudential_thresholds(17)/_versions(19)`, `prudential_ratios(13)/_versions(15)` | ACTIVE, but **DUPLICATE governance entry point** under module `returns_management` while `/admin/prudential/*` sits under `prudential_supervision` (`navigation.tsx:339-341`) |
| `/supervision/early-warnings` (`adminRoutes.tsx:204`) | `PrudentialEarlyWarnings` | `prudential_ewi_evaluate/acknowledge`, `group_ewi_evaluate` | `prudential_ewi_rules(8)`, `_ewi_alerts(82)` | ACTIVE |
| `/supervision/breaches` (`dashboardRoutes.tsx:269`) | `BreachInbox` | `record_return_breach`, `prudential_breach_acknowledge`, `prudential_breach_link_enforcement`, `prudential_resolve_threshold` | `return_threshold_breaches(71)`, `_breach_acknowledgements(0)` | ACTIVE / acknowledgement unused |
| `/supervision/plans`, team-performance, risk heatmap | `SupervisoryPlansDashboard`, `SupervisoryTeamPerformance`, `RiskHeatmap` | plan ops | `supervisory_plans(2)`, `_plan_actions(8)`, `_plan_templates(0)`, `_plan_template_actions(0)` | ACTIVE / templates unconfigured |

No MOCK/BROKEN/UNREACHABLE prudential surface found: all lazy imports resolve to real files and use live RPCs; `placeholder` hits are UI input placeholders only.

## 3. Live census

`prudential_detection_runs` 222 · `examination_events` 117 · `prudential_ewi_alerts` 82 · `return_threshold_breaches` 71 · `prudential_data_feed_logs` 39 · `prudential_action_events` 31 · `entity_supervision_assignments` 25 · `regulatory_metrics` 25 · `prudential_threshold_versions` 19 · `entity_risk_scores` 19 · `prudential_thresholds` 17 · `prudential_actions` 16 · `prudential_ratio_versions` 15 · `prudential_ratios` 13 · `prudential_stress_indicators` 13 · `examinations` 13 · `examination_team_members` 12 · `examination_workpapers` 11 · `prudential_risk_taxonomy` 11 · `examination_{data_requests,scoping,exit_meetings,reports,findings}` 10 each · `prudential_escalations` 10 · `prudential_ewi_rules` 8 · `prudential_process_sla_config` 8 · `supervisory_plan_actions` 8 · `prudential_assessments` 7 · `prudential_action_responses` 6 · `metric_calculation_rules` 5 · `risk_ratings` 2 · `supervisory_plans` 2 · `financial_group_members` 2 · `financial_groups` 1 · `risk_score_weights` 1.

Zero rows: `prudential_assessment_components`, `prudential_assessment_component_ratings`, `prudential_stress_events`, `group_risk_scores`, `supervisory_plan_templates`, `supervisory_plan_template_actions`, `return_calculated_ratios`, `return_threshold_breach_acknowledgements`, `payment_system_incidents`, `payment_retail_volumes`.

~60+ `public` SECURITY DEFINER RPCs across assessments, actions, escalations, ratios/thresholds (with publish/archive/rollback), EWI, groups, stress, taxonomy, detection, examinations, dashboards/analytics, plus authority helpers `can_act_on_prudential`, `can_manage_prudential_config`, `can_read_prudential_entity`, `examination_action_allowed`, `prudential_require_rationale`, `is_prudential_action_entity_user`, `external_can_access_prudential_action`. `src/lib/prudentialGovernedOps.ts:12-20` explicitly bans direct client DML on canonical prudential tables.

## 4. Industry / regulatory feature matrix

| Capability | Class | Evidence |
|---|---|---|
| Prudential entity/profile | BUILT+PROVEN | `prudential_entity_state`, 19 risk scores |
| Ratio/metric formula engine | BUILT+PROVEN | `prudential_ratios/_versions`, `FormulaBuilder.tsx`, 5 calculation rules |
| Thresholds + versioned publish/rollback | BUILT+PROVEN | 17/19 rows, publish/archive/rollback RPCs |
| Threshold values (methodology/calibration) | BCR | actual regulator thresholds are configuration |
| Breach detection | BUILT+PROVEN | 71 breaches, `record_return_breach`, detection trigger on acceptance |
| Breach acknowledgement | BUILT-NOT-PROVEN | `prudential_breach_acknowledge`, 0 acknowledgements |
| Early-warning indicators | BUILT+PROVEN | 8 rules, 82 alerts |
| Assessments lifecycle | BUILT+PROVEN | 7 assessments, governed transitions |
| CAMELS component taxonomy/ratings | BCR (engine built) | `prudential_assessment_components` 0 rows; `CamelsComponentsPanel.tsx:6` confirms config-driven, not hardcoded |
| Risk scoring | BUILT+PROVEN | `entity_risk_scores(19)`, `risk_score_weights(1)` |
| Examinations end-to-end | BUILT+PROVEN | 13 examinations with scoping/team/workpapers/findings/reports/exit meetings/117 events |
| Findings | PARTIAL | `examination_findings(10)`; findings model fragmented across `conduct_findings`, `aml_findings`, `fp_findings`, `inspection_findings`, `thematic_review_findings` |
| Corrective/remedial actions | BUILT+PROVEN | 16 actions, `examination_create_remediation_action` |
| Follow-up tracking | BUILT+PROVEN | 31 action events, `notify_prudential_remediation_due`, `mark_prudential_actions_overdue/breached` |
| Financial groups / consolidated supervision | BUILT-NOT-PROVEN | engine present; 1 group, 2 members, 0 group risk scores |
| Payment-systems / PFMI oversight | BUILT-NOT-PROVEN | full component set; 1 operator, 0 incidents, 0 volumes |
| Stress/scenario hooks | BUILT-NOT-PROVEN | 13 indicators, 0 events |
| Supervisory planning | PARTIAL | 2 plans/8 actions live; 0 templates |
| Authority & maker-checker | BUILT+PROVEN | `can_act_on_prudential`, `can_manage_prudential_config`, `prudential_require_rationale` |
| Evidence / audit | PARTIAL | `prudential_audit_event`, `prudential_entity_audit_history`; exact target surface unconfirmed |
| Escalation | BUILT+PROVEN | 10 escalations, bridge trigger to shared escalation system |
| Entity360 / reporting integration | BUILT+PROVEN | `Entity360Overview.tsx`, `EntitySupervisoryStatePanel.tsx`, `sectionCatalogue.tsx`, AI reports module area |

## 5. Finite gap register

| ID | Sev | Gap | Evidence | Canonical remediation |
|---|---|---|---|---|
| GAP-F8-01 | HIGH | CAMELS component taxonomy unconfigured — assessments cannot produce component ratings | `prudential_assessment_components`/`_component_ratings` 0 rows | BCR: regulator seeds taxonomy. Track-A part: prove fail-closed behaviour when taxonomy absent |
| GAP-F8-02 | ~~HIGH~~ **CLOSED** (W1E3, 2026-08-31) | Prudential audit target unproven | grep shows only `prudential_audit_event`/`_entity_audit_history`; shared `audit_logs` linkage unconfirmed | ~~Prove single canonical audit surface~~ CLOSED: every governed Prudential mutation has canonical `prudential_audit_event` dual-surface audit (39) or a ratified canonical append-only domain-event ledger (11); 2 ratified system audit exceptions; 8 derived/system operations classified outside scope; NOT_AUDITED=0, UNCLEAR=0 — see `F8-W1E-prudential-audit-closure-2026-08-31.md` |
| GAP-F8-03 | ~~HIGH~~ **CLOSED** (W1D, 2026-08-30) | Duplicate governance entry points for ratios/thresholds under two permission modules | `navigation.tsx:339-341` (`returns_management`) vs `/admin/prudential/*` (`prudential_supervision`) | CLOSED: thresholds/ratios/analytics governed solely by `prudential_supervision` (`manage_config` / `run_analytics`); legacy URLs preserved; returns-only personas denied; no RBAC/RLS weakening — W1D gate 8/8 + `prudentialConfigGovernance.test.ts` 5/5 |
| GAP-F8-04 | ~~HIGH~~ **CLOSED** (W1B, 2026-08-30) | Consolidated (group) supervision unproven | `financial_groups(1)`, `group_risk_scores(0)` | CLOSED: group supervision integrated with canonical `return_metric_values` ratios; legacy `return_calculated_ratios` retired read-only and `record_return_ratio` dropped; consolidation + group EWI proven on real multi-member group — `verify-f8-w1b-group-supervision.sql` 15/15, see `F8-W1B-group-supervision-2026-08-30.md` |
| GAP-F8-05 | ~~MEDIUM~~ **CLOSED** (W1C, 2026-08-30) | Breach acknowledgement path unexercised | 71 breaches / 0 acknowledgements | CLOSED: breach detected → visible → acknowledged (actor/time/rationale) → prudential action → lifecycle progression → closure proven with audit + notification evidence and full authorisation/isolation matrix — `verify-f8-w1c-breach-lifecycle.sql` 20/20 |
| GAP-F8-06 | MEDIUM | Stress/scenario engine never fired | `prudential_stress_events` 0 | Prove indicator → event → acknowledgement; scenario definitions are BCR |
| GAP-F8-07 | MEDIUM | Supervisory plan templates empty | `supervisory_plan_templates` 0 | BCR + prove plan-from-template instantiation |
| GAP-F8-08 | MEDIUM | Findings model fragmented across five domain tables | table census | Document canonical findings contract; do not build a sixth engine |
| GAP-F8-09 | ~~MEDIUM~~ **CLOSED** (W1A, 2026-08-30) | `return_calculated_ratios` empty while breaches fire | 0 vs 71 rows | CLOSED: canonical ratio store declared `return_metric_values` (`source_kind='CALCULATED'`); `return_calculated_ratios` retired read-only, `record_return_ratio` dropped; no second operational ratio store — W1A gate PASS |
| GAP-F8-10 | ~~MEDIUM~~ **CLOSED** (W2A/W2B/W2C, 2026-08-31) | PFMI/payment-systems oversight unexercised | 1 operator, 0 incidents/volumes | CLOSED: incident record → configured SLA → late-notification → oversight event → resolve proven (W2A 18 gates); PFMI start → operator-type applicability → scoring → completion validation → existing worst-observed-score rating → operator state proven (W2B 24 gates); retail volumes via canonical governed RPC `payment_retail_volume_record` with DB validation, server-derived actor, dual-surface audit, currency-safe UI (W2C 15 gates); full authorisation/isolation matrix — see `F8-W2-payment-pfmi-closure-2026-08-31.md`. Non-blocking residuals: PFMI assessment frequency = BCR/regulator policy; incident→action `linked_action_id` = optional cross-module integration |
| GAP-F8-11 | LOW | Parallel state machines instead of shared approval engine | no `approval_*` reference in prudential functions | Accept and document, or converge; avoid further duplication |
| GAP-F8-12 | LOW | Detection-run observability | 222 detection runs, 39 feed logs, no surfaced failure queue confirmed | Expose detection failure/exception queue |

Track-A PRODUCT GAP count: **8** (02, 03, 04, 05, 08, 09, 10, 12). BCR: **4** (01 taxonomy, 06 scenarios, 07 templates, plus threshold calibration values). Downstream/architecture: 11.

## 6. Frozen-contract dependencies

- Notifications via `notif_enqueue` in `trg_notify_prudential_action`, `trg_notify_prudential_assessment`, `trg_notify_prudential_escalation_resolved`, `trg_return_threshold_breach_notification`, `notify_overdue_prudential_actions`, `notify_prudential_remediation_due`.
- Shared escalation bridge `trg_prudential_escalation_to_escalation`.
- `licensees` read-only join (`usePrudentialSupervision.ts:47`). **No prudential function writes `licenses`.**
- Hard dependency on F7 filing-version acceptance (`tg_prudential_detect_on_acceptance`).

## 7. Verdict input

F8 is the most complete of the three modules; residual work is proving unexercised engines and consolidating duplicate governance/audit surfaces, plus regulator configuration (BCR).
