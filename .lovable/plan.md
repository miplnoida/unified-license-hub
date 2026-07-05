## Script 3 — Prudential Supervision: Completion Plan

Additive fixes on top of the existing prudential module. No existing file/function will be removed or rewritten in scope. All additions reuse existing helpers (`logComplianceAudit`, `dispatchNotificationEvent`, `HistoryButton`, Recharts patterns, `entity_user_access`).

### 1. Migration (additive only)
New migration `..._prudential_completion.sql`:

- Add nullable columns where needed:
  - `licensees.assigned_supervisor_id uuid`, `licensees.systemic_importance text` (nullable, no default change).
  - `prudential_assessments.auto_suggested_rating jsonb`, `override_reason text`.
  - `prudential_actions.completion_notes`, `waiver_reason`, `cancellation_reason` (if missing).
  - `prudential_escalations.priority text`, `decided_at timestamptz`, `outcome text` (if missing).
- Harden `evaluate_stress_indicators_for_return(return_id)`:
  - Join `returns_filed` → sector/subsector, filter indicators by matching or null sector/subsector.
  - Compare on `return_calculated_ratios.ratio_key` numeric value, respect `direction` (`gt|lt|gte|lte|eq`).
  - Insert into `prudential_stress_events` with unique `(indicator_id, return_id)` guard (add partial unique index).
  - Return SETOF triggered rows.
- Harden `mark_prudential_actions_overdue()`:
  - Update `status='overdue'` where `due_date<now()` and status in `('open','in_progress')`.
  - Emit rows for a client-side sweep to audit + notify (function returns SETOF changed action ids).
- Extend `prudential_dashboard_metrics()` to include: red/amber breach counts, stress triggered count, recent feed failures, sector risk distribution, top-N risk entities (or add companion `prudential_dashboard_sector_risk()` / `prudential_dashboard_top_entities()` RPCs when the return shape must change — keep original signature untouched).
- Seed `notification_event_configs` rows for the 11 required event keys (idempotent `ON CONFLICT DO NOTHING`).
- Seed `permissions` / `role_permissions` for `prudential_supervision` module actions if not already seeded.
- All `CREATE POLICY` / `CREATE TRIGGER` wrapped in `DO $$ ... IF NOT EXISTS ... $$` blocks. No re-declaration of `set_updated_at()` — reuse existing.
- No table drops, no column type changes.

### 2. Hook layer (`usePrudentialSupervision.ts`, additive)
Wrap every existing mutation to also call `logComplianceAudit({ object_type: 'prudential_*', action_type, before_value, after_value, justification })` and `dispatchNotificationEvent({ event_key: 'prudential_*', entity_type, entity_id, payload })`.

Add hooks:
- `useEntityUniverse(filters)` — RPC-backed list with all required columns.
- `useEntityPrudentialProfile(entityId)` — aggregates returns, ratios, breaches, assessments, actions, escalations, stress events, notifications, audit.
- `useEvaluateStressIndicators()` — invokes RPC, audits, notifies, upserts.
- `useOverdueSweep()` — invokes `mark_prudential_actions_overdue`, iterates result, audits + notifies each.
- `useAssessmentPrefill(entityId, returnId)` — pulls ratios/breaches/analysis/stress/recommendations.
- `useCreateActionFromContext({ sourceType, sourceId, entityId, prefill })`.
- `useCreateEscalationFromContext(...)`.
- `useLogFeed({ source, feed_type, ... })`.

### 3. Pages (extend, don't replace)
- **`PrudentialDashboard.tsx`**: add widget cards + Recharts (sector heatmap, risk distribution, trend, top-10 entities, recent feed failures, recent assessments/actions/escalations). Cards link to filtered list pages via route params.
- **`PrudentialEntitiesList.tsx`**: replace placeholder table with `useEntityUniverse` output; add filter bar (sector, risk, breach severity, action status, escalation status, latest return status) + search.
- **`PrudentialEntityProfile.tsx`**: extend tabs to Overview, Historical Returns, Ratios & Trends, Breaches, Assessments, Actions, Escalations, Stress Events, Notifications, Audit History. Each tab reads from `useEntityPrudentialProfile`. Add `HistoryButton` on entity + child rows.
- **`AssessmentDetail.tsx`**: add prefill sections (return summary, ratios, breaches, stress events, consolidated analysis, recommendations), status transitions (draft→submitted→reviewed→approved→closed) each guarded by required inputs; override rating uses `OverrideJustificationDialog` and persists `auto_suggested_rating` + `override_reason`. Add `HistoryButton`.
- **`AssessmentsList.tsx`**: "New assessment" respects entityId/returnId query params for prefill entry from other pages.
- **`ActionsList.tsx`** + inline detail drawer: complete/waive/cancel dialogs requiring notes/reason; audit + notify.
- **`EscalationsList.tsx`**: create requires reason; resolve requires decision + outcome; audit + notify.
- **`StressIndicatorsAdmin.tsx`** and **`PrudentialTaxonomyAdmin.tsx`**: add `HistoryButton`, audit deactivation.
- Add contextual "Create prudential action" / "Create escalation" buttons in:
  - `pages/returns-mgmt/ReturnAnalysis.tsx` breach section
  - `pages/returns-mgmt/ReturnDetail.tsx` validation/breach panel
  - `AssessmentDetail.tsx` recommendation section
  - Entity profile Breaches/Stress tabs
  These open a shared `CreatePrudentialActionDialog` / `CreatePrudentialEscalationDialog` (new small components in `src/components/prudential/`).

### 4. Notifications
- Seed 11 event configs (see task list).
- Hook mutations dispatch each event with `entity_type='licensee'|'prudential_assessment'|...`, `entity_id`, and `payload` containing linked ids so notification center can deep-link.
- Overdue sweep + stress evaluation fire notifications from the hook wrappers.

### 5. Automatic stress evaluation trigger points
- After successful ratio computation (find existing hook in `returns-mgmt` submission path — reuse via `useEvaluateStressIndicators` from success handler; do not modify submission logic itself, only add a fire-and-forget post-step).
- Manual "Evaluate stress indicators" button on ReturnAnalysis + Entity profile Stress tab.
- Supervisor re-run action inside AssessmentDetail.

### 6. Feed logging integration
- Call `useLogFeed` at:
  - return submission (source=`returns`, feed_type=`submission`)
  - ratio compute completion (feed_type=`ratio_compute`)
  - stress evaluation (feed_type=`stress_evaluation`)
  - taxonomy/config bulk import (if any exist)
- Dashboard "Recent Data Feed Failures" widget reads recent rows with status=`failed`.

### 7. Permissions / RLS verification
- Confirm `prudential_supervision` module + actions exist in `permissionModules.ts`, `permissionRegistry.ts`, and DB seeds; add missing seeds via migration.
- Route guards already applied in `dashboardRoutes.tsx` — verify each new sub-route is gated.
- RLS: internal roles (admin, super_admin, supervisor, analyst via `has_role`) full access; external users read-only via `entity_user_access`; no anon.

### 8. Build & QA
- Run `tsgo` typecheck + build; fix any TS/RLS/import issues.
- Add `docs/prudential-supervision-qa.md` with the full QA checklist from the task.
- Add a minimal vitest for `evaluate_stress_indicators_for_return` shape and `useEntityUniverse` filter mapping.

### Regression guardrails
- No edits to existing returns submission, validation, ratio calc, breach detection, conduct, complaints, workflow, notifications infra, or auth code paths — only additive wrappers/handlers subscribed to their success events.
- No changes to `src/integrations/supabase/client.ts` or auto-generated `types.ts` beyond what the new migration regenerates.

### Deliverables
1. One new SQL migration (additive, idempotent).
2. Extended `usePrudentialSupervision.ts` with audit + notification wrappers and new hooks.
3. Extended prudential pages + 2 shared dialogs in `src/components/prudential/`.
4. Small additions in `ReturnAnalysis.tsx` / `ReturnDetail.tsx` (contextual buttons only).
5. Notification event seeds + permission seeds.
6. `docs/prudential-supervision-qa.md` checklist.
7. Passing build.
