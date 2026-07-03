# Phase 1 — Wire Remaining Override Flows

Scope: only add `OverrideReasonDialog` wiring to the business actions still missing it. Do not touch already-placed `HistoryButton`s, existing history drawers, `logExport`, RLS, schemas, or edge functions. Reuse the pending-override pattern already used in `FpScreeningPanel` and `ComplaintDetail` (log first, run business `apply()` in `onOverridden`, then refresh queries).

## A. Licensing / Applications
File targets: `src/pages/applications/ApplicationDetail.tsx`, `src/components/applications/AiAssessmentPanel.tsx`, decision UI within ApplicationDetail.
- AI recommendation override → `licensing.ai_recommendation.override` (module `ai_assessments`)
- AI risk flag toggle → `licensing.ai_risk_flag.override` (`ai_assessments`)
- Bypass missing required document → `licensing.required_document.bypass` (`licensing`)
- Bypass missing required form → `licensing.required_form.bypass` (`licensing`)
- Sufficiency / blocking-gap override → `licensing.sufficiency.override` (`licensing`)
- Approve/reject against recommendation, conditional decision change → `licensing.decision.override`, `licensing.conditional_decision.override` (`decision_records`)

## B. Fit & Proper
Files: `FpDeterminationsPanel.tsx`, `FpConditionsPanel.tsx`, `FpAppealsPanel.tsx`, `FpScreeningPanel.tsx` (extend only — false-positive flow stays as-is).
- Finding severity change → `fit_and_proper.finding.severity_override`
- AI declaration override → `fit_and_proper.ai_declaration.override`
- Determination outcome differs from committee/AI → `fit_and_proper.determination.override`
- Waive condition → `fit_and_proper.condition.waiver`; close without evidence → `fit_and_proper.condition.evidence_bypass`
- Appeal reverses determination → `fit_and_proper.appeal.determination_override`

## C. Prudential Returns
Files: `src/pages/returns-mgmt/ReturnDetail.tsx`, `ReturnAnalysis.tsx`, `src/pages/supervision/BreachInbox.tsx`.
- Breach severity change → `prudential.breach.severity_override`
- Ack amber/red without escalating → `prudential.breach.no_escalation`
- Early-warning override → `prudential.early_warning.override`
- Risk / health score override → `prudential.risk_score.override`, `prudential.health_score.override`
- Approve return with unresolved validation → `prudential.validation.bypass`
- Reject return with no validation issues → `prudential.return_approval.override`

## D. Complaints
File: `src/pages/complaints/ComplaintDetail.tsx` (severity flow already wired — extend only).
- Priority override → `complaints.triage.priority_override`
- Routing override → `complaints.routing.override`
- Escalation decisions → `complaints.escalation.override`, `complaints.high_risk.no_escalation`
- Close with active high-risk flag / no evidence → `complaints.closure.evidence_bypass`
- Resolve contrary to recommendation → `complaints.resolution.override`

## E. Enforcement
File: `src/pages/enforcement/EnforcementDetail.tsx`.
- Change recommended action → `enforcement.recommended_action.override`
- Severity / priority change → `enforcement.severity.override`, `enforcement.priority.override`
- Close without evidence → `enforcement.required_evidence.bypass`
- Waive penalty → `enforcement.penalty.waiver`
- Skip escalation → `enforcement.escalation.override`

## F. Supervisory Plans
File: `src/pages/supervision/SupervisoryPlansDashboard.tsx` row actions.
- Waive overdue action → `supervisory_plan.action.waiver`
- Close without evidence → `supervisory_plan.evidence_bypass`
- Priority change → `supervisory_plan.priority.override`
- Due date change after SLA breach → `supervisory_plan.due_date.override`
- Override recommended follow-up → `supervisory_plan.recommended_action.override`
- Suppress alert → `supervisory_plan.alert.suppressed`

## Shared pattern (every screen)
Local state: `{ module, entityType, entityId, ruleKey, originalValue, overriddenValue, metadata, apply }`. One `<OverrideReasonDialog>` per screen bound to it. `onOverridden` awaits `apply()` then invalidates queries. Cancel discards without mutating.

## Metadata (every payload)
Include `source: "phase1_override_framework"`, `screen`, and whichever of these are in scope: `previous_status/new_status/previous_severity/new_severity/recommendation_source/recommendation_id/ai_assessment_id/rule_result_id/breach_id/finding_id/complaint_id/application_id/return_id/assessment_id/enforcement_id/supervisory_plan_id`.

## Validation
- `tsgo` clean.
- Each new override writes one `rule_overrides` row + mirrored `audit_logs` row via `log_rule_override`.
- Business update never runs before override log succeeds; cancel is a no-op.
- No new tables, no renamed files, no touched history buttons, no changes to RLS / edge functions / `logExport`.

## Non-goals
No schema changes, no new edge functions, no edits to `HistoryButton`, `ChangeHistoryDrawer`, `EntityTimeline`, `ActivityTab`, `logExport`, or `/admin/overrides` filters/search.
