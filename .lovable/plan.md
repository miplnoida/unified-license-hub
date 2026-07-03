# Phase 3 Finalization Plan

Close the remaining Phase 3 gaps after commit `7e3e7c5`. No rewrites of working modules — targeted fixes only.

## 1. Regenerate Supabase types
Regenerate `src/integrations/supabase/types.ts` from the current schema so every Phase 3 table and new column is present:
- F&P: `fp_individuals`, `fp_individual_roles`, `fp_assessments` (+ `form_template_id`, `form_version_id`, `form_response_id`), `fp_screening_configs`, `fp_screening_runs`, `fp_findings`, `fp_committees`, `fp_committee_members`, `fp_committee_votes`, `fp_determinations`, `fp_conditions`, `fp_appeals`, `fp_monitoring_events`
- Coordination: `coordination_cases` (+ `primary_regulator_id`, `closure_rationale`, `closed_by`), `coordination_participants` (+ `regulator_id`), `coordination_messages`, `coordination_flags`, `coordination_escalations`

## 2. Complete F&P audit coverage
Wire `logFpAction` (existing `src/lib/fpAudit.ts`) into every mutation path that currently writes directly to Supabase:
- `FitAndProperIndividuals.tsx`, `FitAndProperIndividualDetail.tsx` — create/update/deactivate individual, duplicate accepted, link-existing
- Roles UI — add/update/end/mark current/link
- `FpAssessmentsPanel.tsx` — re-read inserted row and audit `fp_assessment.created` with pinned `form_template_id` / `form_version_id` / `form_response_id`; also link/close
- `FpScreeningPanel.tsx` + `fp-screening-run` edge function — run, success, failure, finding created/reviewed/false-positive/restored
- `FpDeterminationsPanel.tsx`, `admin/FpCommittees.tsx` — committee CRUD, activate/deactivate, member add/remove, assign, vote cast/update, determination finalize/supersede
- `FpConditionsPanel.tsx`, `FpAppealsPanel.tsx`, `FpMonitoringPanel.tsx` + `fp-monitoring-sweep` — condition create/update/satisfy/waive/overdue, appeal file/update/decide/link-revised, monitoring create/ack/sweep
- Metadata: module=`fit_and_proper`, actor, entity type/id, individual/assessment ids, before/after, source component

## 3. Coordination closure rules
**Migration**
- Add `coordination_cases.closure_rationale text`, `closed_by uuid`
- `BEFORE UPDATE` trigger on `coordination_cases`: when transitioning to `closed`, reject if any related `coordination_escalations.status IN ('open','in_review')`, any `coordination_flags.status='open' AND flag_type IN ('blocker','interdependency','concurrent_review')`, or `closure_rationale` shorter than 10 chars; set `closed_by = auth.uid()`

**UI (`CoordinationDetail.tsx`)**
- Replace direct close with a dialog listing open blockers/escalations, disabling close while any exist, requiring rationale textarea (min 10 chars)
- Audit close attempt + successful close; audit failed close on error

## 4. Complete coordination audit
Ensure `logCoordinationAction` (existing helper) covers every mutation: case create, participant invite/remove/clear/block/update-clearance, message post, flag raise/resolve/withdraw, escalation raise/assign/in-review/resolve/withdraw, link/unlink subject, close (success + blocked failure).

## 5. Regulator-specific Twin Peaks behavior
- **`CoordinationList.tsx`** case creation: owner regulator selector + primary regulator selector; defaults include ABC Prudential and FSC Conduct when seeded
- **Participant invite**: regulator selector storing `coordination_participants.regulator_id`; regulator badge next to each participant and (where author regulator resolvable) each message
- **`CoordinationDetail.tsx`**: add three views (tabs) — **Prudential View** (ABC/Prudential participants, clearances, flags, escalations), **Conduct View** (FSC/Conduct equivalents), **Shared Resolution View** (combined status + final outcome)

## 6. Extend decision gates
Extend `check_decision_gates` (or add sibling RPCs) to accept subject types `fp_assessment`, `complaint`, `prudential_return`, `prudential_finding`, `enforcement_action`, returning coordination pending-clearance / open-blocker / open-escalation blockers.

**DB triggers (BEFORE UPDATE)**:
- `fp_determinations`: block finalize if linked coordination case has unresolved items (bypass via `rule_overrides` `decision.gate.override`)
- `complaints`: block final closure/escalation-complete transition
- `enforcement_actions`: block final closure
- Prudential finding/return final sign-off if such a state exists

**UI**: mount `DecisionGatesBanner` (extended to accept `subjectType`/`subjectId`) on `FitAndProperAssessmentDetail`, `ComplaintDetail`, enforcement detail, prudential finding/return detail.

## 7. Permission seed migration
Migration inserts into `permission_modules`, `permission_actions`, `permissions`, `role_permissions`:
- Modules `fit_and_proper` and `coordination` (plus already-seeded sub-modules) with view/create/update/delete/admin actions
- Grants to `super_admin`, `admin`, `supervisor`, and any of `reviewer/analyst`, `legal_compliance`, `licensing_officer`, `committee_member` that exist in `roles`
- Idempotent (`ON CONFLICT DO NOTHING`) so it can re-run safely

## 8. PQ pinning verification in assessment creation
In `FpAssessmentsPanel.tsx` create mutation: change insert `.select('id')` to select `id, form_template_id, form_version_id, form_response_id, individual_id, assessment_type, role_id, licensee_id`; if pinning columns missing after trigger, toast a hard error and abort navigation; log `fp_assessment.created` audit including pinned template/version.

## 9. Build
Run `npm run build`; fix any TS errors from the type regeneration or new imports. Do not report complete unless the build passes.

## Final reply format
Reply with the exact structure requested: Commit / Migrations / Checklist (all Yes) / Files changed / Build result.

## Technical Details

**New migrations** (three files):
1. `coordination_cases` closure columns + closure enforcement trigger
2. Decision-gate extension: extended `check_decision_gates` + triggers on `fp_determinations`, `complaints`, `enforcement_actions` (+ prudential where applicable)
3. Permission seeds for `fit_and_proper` / `coordination` modules and role grants

**Types regeneration**: full rewrite of `src/integrations/supabase/types.ts` from live schema.

**Component edits**: F&P individuals/roles pages, `FpAssessmentsPanel`, `FpScreeningPanel`, `FpDeterminationsPanel`, `FpCommittees` admin page, `FpConditionsPanel`, `FpAppealsPanel`, `FpMonitoringPanel`, `CoordinationList`, `CoordinationDetail`, participant/message components, `DecisionGatesBanner` (generalized), `FitAndProperAssessmentDetail`, `ComplaintDetail`, enforcement detail, prudential finding/return detail.

**Edge function edits**: `fp-screening-run`, `fp-monitoring-sweep` — call `logComplianceAudit` from `_shared/audit.ts` for run + per-finding events.

**No touch**: Phase 3 modules already working (PQ trigger, escalation table/UI, subject types, regulators seed, existing coordination audit helper, existing app/license decision gates).
