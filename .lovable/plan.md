# Phase 1 Completion — Full Wiring of Audit & Override Framework

Foundation (`rule_overrides`, `log_rule_override`, `ruleOverrides.ts`, `DiffViewer`, `OverrideReasonDialog`, `ChangeHistoryDrawer`, `HistoryButton`, `/admin/overrides`) already exists — this plan only wires them in. No new tables, no renamed files, no duplicated components.

---

## Part 1 — Change History buttons on detail pages

Add `<HistoryButton entityType=… entityId=… title=…/>` into the `PageHeader actions` slot.

| Page | File | entityType | entityId |
|---|---|---|---|
| Application detail | `src/pages/applications/ApplicationDetail.tsx` | `application` | `app.id` | already wired — verify only |
| F&P individual | `src/pages/fit-and-proper/FitAndProperIndividualDetail.tsx` | `fp_individual` | `person.id` | **add** |
| F&P assessment | `src/pages/fit-and-proper/FitAndProperAssessmentDetail.tsx` | `fp_assessment` | `assessment.id` | already wired — verify |
| Return detail | `src/pages/returns-mgmt/ReturnDetail.tsx` | `return_filed` | `returnData.id` | **add** |
| Return analysis | `src/pages/returns-mgmt/ReturnAnalysis.tsx` | `return_analysis` (fallback `return_filed`) | analysis id or return id | **add** |
| Complaint | `src/pages/complaints/ComplaintDetail.tsx` | `complaint` | `complaint.id` | already wired — verify |
| Enforcement | `src/pages/enforcement/EnforcementDetail.tsx` | `enforcement_action` | case id | already wired — verify |
| Supervisory plan | `src/pages/supervision/SupervisoryPlansDashboard.tsx` | `supervisory_plan` | plan id | **add per-row action** (no dedicated detail page exists) |
| Prudential breach | `src/pages/supervision/BreachInbox.tsx` | `prudential_breach` | breach id | **add per-row action** |
| AI assessment panel | `src/components/applications/AiAssessmentPanel.tsx` | `ai_assessment` (fallback `application`) | ai id / app id | **add** |
| Decision records | inside `ApplicationDetail` decisions section | `decision_record` | approval action id | **add** |

Preserve existing `EntityTimeline` / `ActivityTab` / module history panels.

---

## Part 2 — Wire OverrideReasonDialog into real override actions

All flows below use the pending-override pattern from Part 3: log override first, then `apply()` in `onOverridden`, then refresh.

### A. Licensing / Applications (`ApplicationDetail.tsx`, `AiAssessmentPanel.tsx`, decision UI)
Wrap these actions with the dialog (leave plain edits alone):
- Override AI recommendation → `licensing.ai_recommendation.override` (module `ai_assessments`)
- Toggle/change AI risk flag → `licensing.ai_risk_flag.override` (`ai_assessments`)
- Bypass missing required document → `licensing.required_document.bypass` (`licensing`)
- Bypass missing required form → `licensing.required_form.bypass` (`licensing`)
- Override sufficiency / blocking gap → `licensing.sufficiency.override` (`licensing`)
- Approve/reject contradicting recommendation, or change conditional decision → `licensing.decision.override`, `licensing.conditional_decision.override` (`decision_records`)

### B. Fit & Proper
- `FpScreeningPanel.tsx`: **replace** current direct `is_false_positive` update with `OverrideReasonDialog` → `fit_and_proper.screening.false_positive` / `.restore_finding`
- Severity change on finding → `fit_and_proper.finding.severity_override`
- AI declaration override → `fit_and_proper.ai_declaration.override`
- `FpDeterminationsPanel.tsx`: outcome differs from committee/AI recommendation → `fit_and_proper.determination.override`
- `FpConditionsPanel.tsx`: waive condition → `fit_and_proper.condition.waiver`; close without evidence → `fit_and_proper.condition.evidence_bypass`
- `FpAppealsPanel.tsx`: appeal reverses determination → `fit_and_proper.appeal.determination_override`

Module: `fit_and_proper`.

### C. Prudential Returns (`ReturnDetail.tsx`, `ReturnAnalysis.tsx`, `BreachInbox.tsx`)
- Breach severity change → `prudential.breach.severity_override`
- Acknowledge without escalating amber/red → `prudential.breach.no_escalation`
- Override early-warning result → `prudential.early_warning.override`
- Override risk / health score → `prudential.risk_score.override`, `prudential.health_score.override`
- Approve return with unresolved validation → `prudential.validation.bypass`
- Reject return with no validation issues → `prudential.return_approval.override`

Module: `prudential_returns`.

### D. Complaints (`ComplaintDetail.tsx`)
- **Replace** current direct severity update with dialog when old severity exists and differs → `complaints.triage.severity_override`
- Priority override → `complaints.triage.priority_override`
- Routing override → `complaints.routing.override`
- Escalation decisions → `complaints.escalation.override`, `complaints.high_risk.no_escalation`
- Close with active high-risk flag or no evidence → `complaints.closure.evidence_bypass`
- Resolve contrary to recommendation → `complaints.resolution.override`

Module: `complaints`.

### E. Enforcement (`EnforcementDetail.tsx`)
- Change recommended action → `enforcement.recommended_action.override`
- Severity / priority change → `enforcement.severity.override`, `enforcement.priority.override`
- Close without evidence → `enforcement.required_evidence.bypass`
- Waive penalty → `enforcement.penalty.waiver`
- Skip escalation → `enforcement.escalation.override`

Module: `enforcement`.

### F. Supervisory Plans (`SupervisoryPlansDashboard.tsx` row actions)
- Waive overdue action → `supervisory_plan.action.waiver`
- Close without evidence → `supervisory_plan.evidence_bypass`
- Priority change → `supervisory_plan.priority.override`
- Due date change after SLA breach → `supervisory_plan.due_date.override`
- Override recommended follow-up → `supervisory_plan.recommended_action.override`
- Suppress alert → `supervisory_plan.alert.suppressed`

Module: `supervisory_plans`.

---

## Part 3 — Pending-override pattern (shared)

Local state holds `{module, entityType, entityId, ruleKey, originalValue, overriddenValue, metadata, apply}`. Render one `<OverrideReasonDialog>` per screen bound to it. `onOverridden` awaits `apply()` then refreshes queries. Business update never runs before override is logged; cancel discards.

## Part 4 — Metadata

Every metadata payload includes: `source: "phase1_override_framework"`, `screen`, and any of `previous_status/new_status/previous_severity/new_severity/recommendation_source/recommendation_id/ai_assessment_id/rule_result_id/breach_id/finding_id/complaint_id/application_id/return_id/assessment_id/enforcement_id/supervisory_plan_id` available in scope.

## Part 5 — `/admin/overrides` verification

Confirm filters (module, entity type, rule key, date range), full reason display, before/after diff, metadata JSON, CSV export, and export audit logging exist. **Add entity-id search input** if missing. Do not touch existing `logExport`.

## Part 6 — Deliverable summary format

Final message will include: Files changed · Components reused · Screens where HistoryButton added · Override flows wired · Rule keys used · Manual tests completed · Remaining gaps.

## Part 7 — Validation before declaring complete

- `tsgo` typecheck passes
- All listed detail pages load with visible History button
- Drawer merges audit_logs + rule_overrides (no duplicates)
- Every wired override writes one `rule_overrides` row + one mirrored `audit_logs` row via `log_rule_override`
- SweetAlert2 / RLS / existing audit unchanged
- No new tables, no renamed files, no duplicated components
- Manual DB check: `select count(*) from rule_overrides where rule_key like '<key>%'` grows by 1 per test

## Non-goals

No schema changes. No new Edge Functions. No changes to `audit_logs`, `EntityTimeline`, `ActivityTab`, existing history panels, or `logExport`.
