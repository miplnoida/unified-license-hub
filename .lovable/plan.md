# Plan: Production-Harden Script 3 — Prudential Supervision

Scope-limited follow-up to commit c40742a. All changes are additive; no rewrites of the module and no changes to unrelated features (returns, conduct, complaints, coordination, workflow, notifications infra, audit, permissions/RLS, existing dashboards).

## 1. Notification event configs (seed migration)

New migration `seed_prudential_notification_event_configs.sql`:
- Idempotent `INSERT ... ON CONFLICT (event_key) DO UPDATE` into `notification_event_configs` for the 11 keys:
  `prudential_return_validation_failed`, `prudential_breach_detected`, `prudential_assessment_submitted/reviewed/approved`, `prudential_action_assigned/overdue/completed`, `prudential_escalation_created/resolved`, `prudential_stress_indicator_triggered`.
- Each row: active=true, in-app + email channels (matching existing project pattern), title/message templates using `{{entity_name}}`, `{{return_period}}`, `{{ratio_key}}`, `{{action_title}}`, `{{severity}}`, etc.
- Recipients follow existing config model: internal supervisors/admins for regulatory events; `assigned_to` user for action assignment/overdue/completed; entity users only where existing config schema supports entity scoping.
- Documented payload keys next to each row via SQL comment.

## 2. Automatic stress-indicator evaluation on return processing

- `evaluate-return-prudential` edge function: after successful ratio + breach persistence, call `rpc('evaluate_stress_indicators_for_return', { _return_id })`.
- For each newly-triggered event returned by the RPC:
  - Insert `prudential_data_feed_logs` rows (`started` before call, `success`/`failed` after).
  - Insert audit log entry (`compliance_audit_logs`) with actor `system`.
  - Call `dispatch-notification-event` with `prudential_stress_indicator_triggered`.
  - Mark `prudential_stress_events.notified = true` only after successful dispatch.
- Same wiring added to `generate-return-analysis` end-of-flow if it also recomputes ratios (guarded by feature flag check to avoid double-run — dedupe via unique constraint anyway).
- Manual "Evaluate stress" UI button retained as supervisor re-run override.

## 3. Harden `evaluate_stress_indicators_for_return` RPC

Corrective migration replacing the function body:
- Resolve `entity_id → licensees.sector_id, sub_sector_id`.
- Filter indicators: `(sector_id IS NULL OR sector_id = e.sector_id) AND (sub_sector_id IS NULL OR sub_sector_id = e.sub_sector_id) AND active = true`.
- Join `return_calculated_ratios` on `metric_key = ratio_key` for the return.
- Compare numeric value with operators `gt/gte/lt/lte/eq`.
- `INSERT ... ON CONFLICT (indicator_id, return_id) DO UPDATE` (add unique index if missing) — updates observed value; no historical deletes.
- Returns rows for this return only, marked `is_new` so caller knows what to notify.
- `SECURITY DEFINER SET search_path = public`.

## 4. Server-side audit + notification for auto-generated stress events

Handled inside the edge function above (section 2). Ensures no silent server events.

## 5. Notification dispatch audit

- Extend `usePrudentialSupervision.ts` mutation wrappers and the edge functions to call existing `logNotificationDispatch` (if present) or insert into `notification_dispatch_log` with event_key, entity_type, entity_id, payload, status.
- Dispatch failures logged as warnings, do not block user flow. Failure rows go to `integration_logs` when pattern exists.

## 6. Entity audit history scoping

- New RPC `prudential_entity_audit_history(_entity_id uuid)` — SECURITY DEFINER — returning unioned rows from `compliance_audit_logs` where object_type in (`licensee`, `prudential_assessment`, `prudential_action`, `prudential_escalation`, `prudential_stress_event`) and object_id relates to entity (via join on the respective prudential tables). Includes date, actor, action, object_type, object_id, justification, before/after.
- `PrudentialEntityProfile.tsx` Audit History tab switches to this RPC.

## 7. Dashboard completion

Extend `PrudentialDashboard.tsx` using existing `prudential_dashboard_metrics` RPC + additive RPC `prudential_risk_heatmap()` where needed:
- Cards: total supervised, high-risk, critical breaches, amber breaches, open/overdue actions, open escalations, stress triggered, recent return breaches.
- Charts: sector risk distribution (existing), capital/liquidity/asset-quality heatmap (new), risk-movement trend line, top-10 entities by composite risk score.
- Deterministic composite risk score in SQL: `latest_rating_weight + worst_breach_severity + open_stress_events*2 + overdue_actions*3 + open_escalations*4`.
- Drilldown links (React Router `navigate` with query filters) from every widget to the pre-existing list pages.
- Recent lists: assessments, actions, escalations, failed feeds.

## 8. Assessment prefill + formal record

- `useAssessmentPrefill` extended to also load early-warnings, recommendations, peer/trend, stress events, breaches.
- On create-from-context, persist snapshot into existing metadata columns (`auto_suggested_rating`, `signal_snapshot` jsonb — add column via migration if missing).
- Do not overwrite supervisor rationale on re-open; explicit "Refresh prefill" action re-pulls.
- Submit/Review/Approve gates enforce rationale / review_notes / decision, and require override justification when rating differs from `auto_suggested_rating`. Status transitions audited + notified via section 1 events.

## 9. Contextual "Create action" buttons

Add `CreatePrudentialActionDialog` triggers (already exists) to:
- Return detail validation/breach panel
- Return analysis breach + recommendation sections
- Assessment breach + recommendation sections (already partial)
- Entity profile Breaches + Stress Events tabs
- Dashboard drilldown rows

Prefill: entity_id, source_type, source_id, title, description, severity, suggested type, suggested due_date. Enforce completion/waiver/cancel reasons (already in place — verified). Assign + overdue notifications wired via section 1.

## 10. Contextual escalation creation

Add `CreatePrudentialEscalationDialog` triggers from:
- Critical/high breaches, critical stress events, high-risk assessments, overdue critical actions.
- Entity profile + Assessment detail + Action detail pages.

Enforce reason on create, decision+outcome on resolve. Priority persisted. Audit + notification wired.

## 11. Migration hardening

Additive corrective migration:
- `CREATE OR REPLACE FUNCTION set_updated_at()` guarded — reuse existing if present.
- All `CREATE TRIGGER` wrapped in `DROP TRIGGER IF EXISTS` first.
- All policies use `DROP POLICY IF EXISTS ... ; CREATE POLICY ...`.
- Guard column adds with `ADD COLUMN IF NOT EXISTS` for `licensees.assigned_supervisor_id`, `licensees.systemic_importance`, `prudential_assessments.review_notes`, `prudential_actions.cancellation_reason`, `prudential_escalations.priority`, `prudential_assessments.signal_snapshot`.
- All new RPCs: `SECURITY DEFINER SET search_path = public`.
- Verify no unintended write grants to `anon`; keep `authenticated` scoped via existing `has_role` / `entity_user_access` helpers.
- After migration runs, `src/integrations/supabase/types.ts` regenerates automatically.

## 12. Permissions & route access verification

- Confirm `prudential_supervision` in `permissionModules.ts`, `permissionRegistry.ts`, seed migration.
- Route guards under `/prudential/*` and `/admin/prudential-taxonomy` verified via existing `RequirePermission` wrapper.
- Licensee/external users blocked from internal prudential pages; entity-scoped reads limited by `entity_user_access` in RLS.

## 13. Build / typecheck proof

- Run `bunx tsgo --noEmit` and capture output.
- If repo has no GitHub Actions workflow: add `.github/workflows/ci.yml` running checkout → setup-bun → `bun install` → `bun run build` → `bunx tsgo --noEmit`. Uses only scripts that exist in `package.json`.

## 14. QA checklist refresh

Update `docs/prudential-supervision-qa.md`:
- Header with date, commit SHA, environment.
- Each item marked Passed / Failed / N/A / Pending with notes and page/RPC references.
- Known limitations listed.

## 15. Regression verification

Manual verification pass (documented in QA doc) that these are unchanged:
returns submission, returns validation, ratio calc, breach detection, consolidated analysis, return detail/analysis pages, complaints, market conduct dashboard, conduct alerts/actions, coordination, workflow screens, notification center, audit history/export, role/permission management.

---

## Technical details

**New migrations (in order):**
1. `*_seed_prudential_notification_event_configs.sql` — data seed (uses insert semantics but is idempotent config seeding tied to schema).
2. `*_prudential_hardening.sql` — RPC replacements (`evaluate_stress_indicators_for_return`, new `prudential_entity_audit_history`, optional `prudential_risk_heatmap`), safe column adds, unique index `prudential_stress_events(indicator_id, return_id)`, policy/trigger idempotency.

**Files touched (edits only, no rewrites):**
- `supabase/functions/evaluate-return-prudential/index.ts` — append stress evaluation + audit + dispatch after ratio persistence.
- `supabase/functions/generate-return-analysis/index.ts` — optional trailing call, guarded.
- `src/hooks/usePrudentialSupervision.ts` — add `useAssessmentPrefill` expansion, dispatch-audit wrapper, entity-audit-history hook.
- `src/pages/prudential/PrudentialDashboard.tsx` — add widgets + drilldowns.
- `src/pages/prudential/PrudentialEntityProfile.tsx` — swap audit tab to new RPC; add action/escalation triggers on Breaches & Stress tabs.
- `src/pages/prudential/AssessmentDetail.tsx` — enforce override justification; refresh-prefill button; action/escalation triggers on breach & recommendation rows.
- `src/pages/returns/ReturnAnalysis.tsx` and return detail page — add contextual "Create action" buttons on breach/recommendation rows (UI-only additions).
- `docs/prudential-supervision-qa.md` — refresh.
- `.github/workflows/ci.yml` — add only if none exists.

**Explicitly NOT touched:** returns submission/validation logic, workflow engine, conduct/complaints/coordination modules, notification infra, existing dashboards outside prudential, auth.
