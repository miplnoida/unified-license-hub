# Onsite Examination — Examination Lifecycle Management (PRU-EXM-001)

## Current state (verified)
- Only a flat `inspections` table (scope text, dates, inspector name, rating, report URL) plus `inspection_findings` (category/severity/status, optional escalation to `enforcement_actions`) exist.
- The only UI is `InspectionsTab` inside the licensee detail page — a simple create/edit table. It is currently hidden from entity detail.
- No scoping memo, no team assignment, no workpapers/sign-off, no exit meeting, no draft/final report approval chain, no findings-to-remediation link.
- Remediation already exists as `prudential_actions` with generic `source_type` / `source_id` — findings can attach to it without new remediation machinery.
- Permission module `prudential_supervision` already has `conduct_onsite_examination`, `manage_remediation`, `workflow_action`, `manage_config` actions to reuse.

## What will be built

### 1. Examination lifecycle spine
A stage machine on the examination record: `planned → scoping → pre_exam_request → fieldwork → exit_meeting → draft_report → management_response → final_report → remediation → closed` (plus `cancelled`). Stage transitions are done through a single database function that validates the current stage, records who acted, and writes an audit event — no client-side stage jumping.

### 2. Screens
- **Examinations register** (`/prudential/examinations`): list with entity, type (full-scope / targeted / thematic / follow-up), lead examiner, stage, fieldwork window, findings count, overdue remediation count; filters by stage/entity/type, create dialog.
- **Examination workspace** (`/prudential/examinations/:id`): header with stage stepper and stage actions, plus tabs:
  - **Scoping memo** — objectives, risk focus areas, period under review, legal basis, budget days, preparer/approver with approval action.
  - **Team** — members with role (lead examiner / examiner / reviewer / observer / specialist), allocated days, conflict-of-interest declaration.
  - **Pre-examination data request** — itemised request list with due dates, requested/received/overdue status, licensee response notes and attached documents.
  - **Workpapers** — one row per procedure: area, procedure performed, evidence reference, conclusion, preparer sign-off, independent reviewer sign-off (reviewer cannot be the preparer), review notes.
  - **Findings** — records fieldwork findings with severity, criteria breached, root cause, recommendation, linked workpaper; "Create remediation action" pushes a `prudential_actions` row linked back to the finding.
  - **Exit meeting** — date, attendees (regulator + entity side), matters discussed, entity initial response, agreed timelines, minutes attachment.
  - **Reports** — draft report record → issue to entity → management response capture → final report with approval chain (preparer, reviewer, approver) and versioned document attachment.
  - **Remediation (CAP)** — corrective action plan table showing every finding with its linked action, owner, due date, status and evidence; closes only when all linked actions close.
  - **History** — human-readable audit trail of every stage change and sign-off.
- Entity-level: an **Examinations** section on the prudential entity profile listing that entity's examinations and open CAP items.

### 3. Guardrails
- Stage transitions require the `conduct_onsite_examination` or `workflow_action` permission; report approval requires a different user than the preparer.
- Fieldwork cannot start until the scoping memo is approved and at least one lead examiner is assigned.
- Final report cannot be issued while any workpaper lacks reviewer sign-off or any finding is unresolved/unlinked.
- Examination cannot close while any linked remediation action is open.

### 4. Notifications
Reuse the existing notification event pipeline for: pre-exam data request issued, request item overdue, exit meeting scheduled, draft report issued to entity, management response due/overdue, final report issued, remediation action due/overdue.

## Technical notes
- New tables (all in `public`, each with GRANTs, RLS, and `updated_at` triggers): `examinations`, `examination_team_members`, `examination_scoping`, `examination_data_requests`, `examination_workpapers`, `examination_exit_meetings`, `examination_reports`, `examination_findings`, `examination_events` (audit).
- RLS reuses the existing `can_read_inspection` / `can_act_on_inspection` helpers extended for the new tables so entity scoping and assignment-only regulators behave exactly as they do today; licensee-side users get read access only to reports/data requests issued to them.
- Transitions and sign-offs go through `SECURITY DEFINER` RPCs (`examination_transition_stage`, `examination_signoff_workpaper`, `examination_link_finding_action`, `examination_close`) with permission checks inside, consistent with the prudential module's existing RPC pattern.
- Findings link to remediation through `prudential_actions.source_type = 'examination_finding'` and `source_id = finding id` — no changes to existing action behaviour.
- Existing `inspections` / `inspection_findings` and the `InspectionsTab` are left untouched; the new module is additive, and the register optionally surfaces legacy inspections as read-only historical records.
- Verification: pgTAP suite under `supabase/tests/prudential/` covering grants, RLS presence, stage-machine rejections, preparer≠reviewer enforcement and close-gating; wired into CI alongside the existing suites.
