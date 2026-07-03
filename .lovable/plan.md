# Phase 3 Completion — Fit & Proper + Twin Peaks Coordination

Extends existing implementation (Slice 3C-1 already shipped: navigation + module registration). No rewrites. 5 remaining slices, each independently shippable.

---

## Slice 3C-2 — Configurable PQ via Form Builder

- **Migration**: add `fp_assessments.form_id`, `form_version_id`, `form_response_id` (FK to existing `form_responses`); add `fit_and_proper_pq` to form category/type enum; seed one master PQ form covering all 13 required disclosure sections (identity, qualifications, employment, directorships, ownership, criminal/regulatory, insolvency, disciplinary, conflicts, related parties, AML/CFT, consent).
- **UI (`FitAndProperAssessmentDetail.tsx`)**: replace hardcoded declaration with `<FormRenderer>` bound to pinned version; keep legacy hardcoded view as read-only fallback when `form_version_id` is null.
- **Version pin**: at "Start Assessment" the current published PQ version is snapshotted; renderer always loads pinned version → historical submissions never shift schema.

## Slice 3C-3 — F&P Audit Coverage + Committee/Determination Hardening

- **Audit**: wire `logAudit` / `logComplianceAudit` into every mutation site — individual CRUD, roles, assessment lifecycle (draft/submit/route/close), screening run/finding/override, committee CRUD/members/votes, determination finalize, condition create/satisfy/waive/overdue, appeal lifecycle. Include before/after, assessment_id, individual_id.
- **DB triggers** (SET search_path = public):
  - voter must be `fp_committee_members.status='active'`
  - unique `(assessment_id, member_id)` per vote
  - reject/conditional votes require `justification`
  - finalize requires quorum + threshold + rationale
  - previous `current=true` determination auto-superseded
  - finalized determinations immutable except via superseding row or appeal-linked new row
- **UI**: disable Finalize until quorum/threshold met; rationale modal; force condition-creation dialog on conditional outcome.

## Slice 3C-4 — Screening Hardening + Conditions/Appeals/Monitoring QA

- **Screening**:
  - snapshot `config_snapshot` (jsonb) into `fp_screening_runs` at run time
  - each finding stamped with `source`, `rule_id`, deterministic `severity`
  - channels: sanctions, PEP, adverse_media, criminal, watchlist, credit/insolvency, custom
  - graceful degradation when `LOVABLE_API_KEY` missing → channel `skipped` with reason
  - false-positive override → mandatory reason (existing `OverrideReasonDialog`) + writes `rule_overrides`
  - rerun preserves prior findings via `superseded_by_run_id`
- **Conditions panel**: verify create-from-determination, owner, due date, evidence upload, satisfy/waive with justification, overdue badge (existing cron/trigger).
- **Appeals panel**: file → grounds/docs → assign appeal committee → decision enum (upheld / partially_upheld / dismissed / remitted); if outcome changes insert linked superseding `fp_determinations` row.
- **Monitoring panel**: list events, acknowledge with note, "Trigger recheck" button, overdue-condition auto-events.

## Slice 3C-5 — Licensing ↔ F&P Integration + Shared Registry Dedupe

- **Application detail**: new "Fit & Proper" tab listing linked individuals/assessments with status chip; button to create/link assessment for a proposed director/controller.
- **Approval guardrail**: application approval checks required F&P assessments; blocks/warns if missing/rejected/unresolved; permits conditional approval if F&P is conditional. Uses `OverrideReasonDialog` when officer overrides warning.
- **Shared registry**:
  - DB function `fp_find_duplicate_individuals(national_id, passport, email, name, dob)` returning candidates with confidence
  - "New Individual" dialog calls it → shows duplicate warning with "Use existing"
  - Individual detail shows all roles + determinations across licensees/sectors/regulators
  - RLS: shared identity readable to internal F&P viewers; `fp_individuals.private_notes` scoped to owning regulator
  - Optional merge audited via `rule_overrides`

## Slice 3C-6 — Twin Peaks Coordination Completion

- **Schema**:
  - widen `coordination_cases.subject_type` enum: application, complaint, return, prudential_finding, fp_assessment, enforcement_action, license, entity
  - new table `coordination_escalations` (case_id, raised_by, reason, positions jsonb, proposed_resolution, decision_owner_id, due_date, status, outcome, outcome_rationale, resolved_at, resolved_by)
  - `coordination_participants.role` (owner/primary/secondary) + `clearance_status` (pending/cleared/conditionally_cleared/blocked) + `clearance_note`
  - `coordination_cases.closure_rationale` (required at close via trigger)
- **Auto-suggest**: "Open Coordination" button on Application, Complaint, Prudential breach, F&P assessment, Enforcement detail — prefills subject linkage.
- **Conflict/escalation UI**: block-with-reason, request-resolution, escalate, resolve escalation with outcome enum (cleared/conditionally_cleared/blocked/deferred).
- **Decision enforcement**: source case detail shows coordination badge; approval blocked if any participant blocked, warned if pending, allows conditional if any conditionally_cleared. `OverrideReasonDialog` for overrides.
- **Regulator scoping**: seed ABC Prudential + FSC Conduct; regulator badges on participants; RLS restricts cases to participating regulators (except owner-regulator staff).
- **Audit**: `logComplianceAudit` for every mutation (create, invite, remove, message, clearance, flag raise/resolve, escalation raise/resolve, close, subject link/unlink).

---

## Cross-cutting

- **Migrations**: 5 small files, CREATE → GRANT → RLS → POLICY order for any new table; new triggers `SET search_path = public`.
- **Reuse**: `OverrideReasonDialog`, `rule_overrides`, `DiffViewer`, `HistoryButton`, `FormRenderer`, `logAudit`, `logComplianceAudit`, existing `run-fp-screening` + `overdue-action-sweep` edge functions.
- **No new backends**: extend existing edge functions rather than adding new ones.

## Verification (final slice)

- `npm run build` clean.
- Vitest additions: committee quorum/threshold enforcement, PQ version pinning, coordination approval guard, screening degradation.
- Playwright smoke: F&P checklist (create individual → role → assessment → PQ → submit → screening → false-positive override → committee → votes → finalize → condition → appeal → history) and Twin Peaks checklist (case from application → invite → message → flag → block → escalate → resolve → close → source case shows status → audit). Screenshots under `/tmp/browser/phase3/`.
- Final report: commit SHA, files changed, migration filenames, per-item acceptance confirmation, build output, smoke-test screenshot summary.

## Delivery Order

1. 3C-2 PQ Form Builder wiring
2. 3C-3 Audit + committee/determination triggers
3. 3C-4 Screening hardening + conditions/appeals/monitoring QA
4. 3C-5 Licensing integration + shared registry dedupe
5. 3C-6 Coordination completion + escalation + decision enforcement
6. Build, tests, Playwright, final report
