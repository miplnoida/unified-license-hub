
# Script 3 – Prudential Supervision Completion Plan

Builds on existing returns/ratios/breaches/analysis foundation. Adds only missing pieces; existing tables (`prudential_ratios`, `prudential_thresholds`, `return_threshold_breaches`, `return_calculated_ratios`, `return_consolidated_analysis`, `returns_filed`, `licensees`, `notifications`, `audit_logs`) remain untouched in behavior.

## 1. Database migrations (additive only)

New tables (all in `public`, with GRANTs to `authenticated` + `service_role`, RLS on, `has_role`-style policies, `created_at/updated_at` + update trigger, audit-friendly):

- `prudential_risk_taxonomy` — `code`, `label`, `description`, `parent_id`, `sort_order`, `is_active`. Seeded with capital, liquidity, asset_quality, profitability, concentration, governance, operational_resilience, other.
- `prudential_ratios` and `prudential_thresholds`: add nullable `taxonomy_code text` FK-ish column (soft link, backward compatible; existing rows untouched).
- `prudential_assessments` — entity_id (licensee), return_id (nullable), period_start, period_end, overall_rating, ratings jsonb (capital/liquidity/asset_quality/profitability/concentration/governance), rationale, evidence_refs jsonb, conclusion, recommended_response, status (`draft|submitted|reviewed|approved|closed`), created_by, reviewed_by, approved_by, submitted_at, reviewed_at, approved_at, closed_at, override_reason (nullable, required when overall_rating differs from auto-suggested).
- `prudential_actions` — entity_id, source_type (`return_breach|assessment|manual|escalation|stress_indicator`), source_id, action_type, title, description, severity, due_date, assigned_to, entity_contact, status (`open|in_progress|overdue|completed|waived|cancelled`), completion_notes, waiver_reason, closed_at, closed_by, created_by.
- `prudential_escalations` — entity_id, related_type (`entity|return|assessment|action`), related_id, escalation_type, reason, evidence jsonb, status (`open|under_review|resolved|withdrawn`), decision, outcome, decision_by, decided_at, created_by.
- `prudential_stress_indicators` — metric_key, threshold_value, direction (`gt|lt|gte|lte|eq`), severity, sector_id (nullable), sub_sector_id (nullable), is_active, notify_roles jsonb, escalate boolean, taxonomy_code.
- `prudential_stress_events` — indicator_id, entity_id, return_id, observed_value, triggered_at, resolved_at, notified.
- `prudential_data_feed_logs` — source, feed_type, status (`started|success|failed|retried`), row_count, error, started_at, completed_at, related_return_id (nullable), triggered_by.

RPC helpers:
- `mark_prudential_actions_overdue()` — cron/manual sweep updating status to `overdue`.
- `evaluate_stress_indicators_for_return(_return_id uuid)` — inserts `prudential_stress_events` and returns triggered rows; called after ratio computation (non-blocking).
- `prudential_dashboard_metrics(_regulator_id uuid)` — aggregate counts for dashboard widgets.

All mutations audited via existing `log_compliance_audit_as_actor` / `logAudit` helpers.

## 2. Permissions

Add module `prudential_supervision` to `permissionModules.ts`, `permissionRegistry.ts` and seed permission rows (view/create/edit/approve/reject) via migration. Route prefix `/prudential` mapped to this module. Existing modules untouched.

## 3. Routes & navigation

New lazy routes under dashboard routes, guarded by module `prudential_supervision`:
- `/prudential/dashboard`
- `/prudential/entities` and `/prudential/entities/:id`
- `/prudential/assessments` and `/prudential/assessments/:id`
- `/prudential/actions`
- `/prudential/escalations`
- `/prudential/stress-indicators`
- `/admin/prudential-taxonomy` (admin config)

Sidebar: new "Prudential Supervision" section (dashboard, entities, assessments, actions, escalations, stress indicators). Admin section gains "Prudential Taxonomy".

## 4. Pages & components

- `PrudentialDashboard` — widgets: total supervised entities, high-risk, red/amber breaches, open + overdue actions, recent breaches, triggered stress indicators, top-risk table, sector heatmap, trend chart. Reuses existing Recharts + `dashboardInsights` patterns.
- `PrudentialEntitiesList` — filterable table of licensees with prudential fields (last return, outstanding breaches, open actions, risk rating, assigned supervisor).
- `PrudentialEntityProfile` — tabs: Overview, Historical Returns, Ratios/Trends, Breaches, Assessments, Actions, Escalations, Notifications, Audit (uses existing `HistoryButton`).
- `AssessmentsList` + `AssessmentDetail` — create/edit/submit/review/approve; pre-fill via `useReturnComputedRatios`, `useReturnBreaches`, consolidated analysis; override-rating dialog reuses `OverrideJustificationDialog`.
- `ActionsList` + inline detail drawer; "Create action from breach" button in `ReturnReviewPanel`/`ValidationResultPanel` and assessment detail.
- `EscalationsList` + create dialog (from entity/return/assessment/action context).
- `StressIndicatorsAdmin` — CRUD, sector scoping, activation.
- `PrudentialTaxonomyAdmin` — CRUD list.

Hooks (`src/hooks/usePrudentialSupervision.ts`) mirroring `usePrudentialConfig` patterns: `usePrudentialEntities`, `useEntityPrudentialProfile`, `useAssessments*`, `useActions*`, `useEscalations*`, `useStressIndicators*`, `useTaxonomy*`, `useDashboardMetrics`, `useDataFeedLogs`.

## 5. Notifications

Add event configs (via `notification_event_configs` seed) and dispatch calls (existing `dispatch-notification` edge function) for:
- prudential_return_validation_failed, prudential_breach_detected, prudential_assessment_submitted/approved, prudential_action_assigned/overdue, prudential_escalation_created/resolved, stress_indicator_triggered.

Wiring: from mutation hooks after successful DB write; overdue via daily job that calls `mark_prudential_actions_overdue` then dispatches. Reuse existing infra — no new edge function required except a thin `prudential-jobs` scheduled function (optional; can trigger manually initially).

## 6. Data-feed logging

Reusable client helper `logPrudentialFeed({source, feed_type, ...})` inserted at existing return-upload/import points (return submission, master data imports touching prudential config). Admin page `/prudential/dashboard` includes "Recent Data Feeds" panel; failures surface with retry-audit.

## 7. Audit coverage

Every create/update/status-change on new tables calls `logCompliance`/`logAudit`. `HistoryButton` mounted on entity profile, assessment detail, action detail, escalation detail. Override rating and waiver require justification stored + audited.

## 8. Tests / QA

- New vitest: `prudentialAssessmentPrefill.test.ts`, `prudentialActionLifecycle.test.ts`, `stressIndicatorEvaluation.test.ts`, `prudentialPermissions.test.ts`.
- Manual QA checklist appended to `docs/` covering acceptance criteria list.

## Out of scope / preserved

- No changes to existing returns submission, validation, ratio compute, complaint, conduct, workflow engine, authentication, or existing dashboards.
- Existing `prudential_ratios`/`prudential_thresholds` behavior preserved; new `taxonomy_code` column nullable with default null.
- No demo/static data — seeds are the taxonomy defaults and permission rows only.

## Technical notes

- Migration order per project rule: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY, then triggers/functions. Policies use `has_role(auth.uid(),'admin')` for admin writes and internal-role checks for supervisor reads/writes; entity-scoped read via `entity_user_access` join for licensee visibility (read-only where applicable).
- Stress evaluation invoked from client after return submission (non-blocking) and re-evaluatable from admin UI; server RPC is idempotent per (indicator, return).
- Overdue sweep is idempotent and safe to call repeatedly.

```text
Return submit ─▶ ratios/breaches (existing)
                 │
                 ├─▶ evaluate_stress_indicators_for_return  ─▶ stress_events ─▶ notify
                 └─▶ auto-suggest assessment pre-fill (client)

Assessment ─▶ Action (from breach/recommendation) ─▶ Escalation (if severe)
       │              │                                       │
       └───────── audit_logs / notifications / HistoryButton ─┘
```
