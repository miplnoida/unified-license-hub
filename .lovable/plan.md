# Phase 3 Completion Plan — Fit & Proper + Twin Peaks Coordination

Extends the existing implementation (commit f8015e6). No rewrites — only additive schema, wiring, audit, and UI gaps. Delivered in 6 small, independently shippable slices.

---

## Slice 3C-1 — Navigation, Admin Hub, Types (foundation)

- **Nav (`src/config/navigation.tsx`)**: add "Fit & Proper" group → Individual Register (`/fit-and-proper`), plus admin entries Screening Configs (`/admin/fp-screening-configs`) and Committees (`/admin/fp-committees`). Confirm "Twin Peaks Coordination" (`/coordination`) is visible. Guard with module `fit_and_proper` + admin roles for admin items.
- **Permission registry (`src/lib/permissionModules.ts`, `permissionRegistry.ts`)**: register `fit_and_proper` and `coordination` modules with `view/create/edit/approve/reject` actions; map routes.
- **Admin Hub tiles**: add F&P Screening Configs, F&P Committees, Coordination Settings.
- **Types regen**: after any schema slice, `types.ts` is auto-regenerated; verify all `fp_*` and `coordination_*` tables present.

## Slice 3C-2 — Configurable PQ via existing Form Builder

- **Migration**: add enum value `fit_and_proper_pq` to the existing form category/type used by Form Builder; seed one master PQ form covering the 13 required disclosure sections (identity, qualifications, employment, directorships, ownership, criminal/regulatory, insolvency, disciplinary, conflicts, related parties, AML/CFT, consent).
- **Schema**: add `fp_assessments.form_id`, `form_version_id`, `form_response_id` (FK to existing `form_responses`). Do NOT create a parallel response table — reuse `form_responses` for pinning to version.
- **UI (`FitAndProperAssessmentDetail.tsx`)**: replace hardcoded declaration with `<FormRenderer>` bound to the pinned version; keep legacy hardcoded view as read-only fallback when `form_version_id` is null.
- **Historical integrity**: version pin happens at "Start Assessment"; renderer always loads pinned version so old submissions never shift schemas.

## Slice 3C-3 — F&P Audit Coverage + Committee/Determination Hardening

- **Audit**: wire `logAudit` / `logComplianceAudit` into every mutation site in F&P panels and hooks (individual CRUD, roles, assessment lifecycle, screening run/finding/override, committee CRUD/members/votes, determination finalize, condition create/satisfy/waive/overdue, appeal lifecycle). Include before/after, assessment_id, individual_id.
- **Committee DB triggers**: enforce (a) voter must be `fp_committee_members.status='active'`, (b) unique `(assessment_id, member_id)`, (c) reject/conditional votes require `justification` text, (d) finalize requires quorum + threshold + rationale, (e) previous `current=true` determination auto-superseded, (f) finalized determinations immutable except via superseding row or appeal-linked new row.
- **UI**: disable Finalize until quorum/threshold met; require rationale modal; force condition creation dialog on conditional outcome.

## Slice 3C-4 — Screening Engine Hardening + Conditions/Appeals/Monitoring UI QA

- **Screening**:
  - Snapshot config into `fp_screening_runs.config_snapshot` (jsonb) at run time.
  - Each finding stamped with `source`, `rule_id`, deterministic `severity` (config-driven).
  - Add channels: sanctions, PEP, adverse_media, criminal, watchlist, credit/insolvency, custom.
  - Graceful degradation when `LOVABLE_API_KEY` missing → mark channel `skipped` with reason; do not fail run.
  - False-positive override requires reason (uses existing `OverrideReasonDialog`) + writes `rule_overrides` row.
  - Rerun preserves prior findings (`superseded_by_run_id`).
- **Conditions panel**: verify create-from-determination, owner, due date, evidence upload, satisfy/waive with justification, overdue badge (cron/trigger already exists — confirm and wire UI).
- **Appeals panel**: file → grounds/docs, assign appeal committee, decision enum (upheld / partially_upheld / dismissed / remitted), if outcome changes → insert linked superseding `fp_determinations` row.
- **Monitoring panel**: list events, acknowledge with note, "Trigger recheck" button (calls existing screening function), overdue-condition auto-events.

## Slice 3C-5 — Licensing ↔ F&P Integration + Shared Individual Registry

- **Application detail**: new "Fit & Proper" tab listing linked individuals/assessments with status chip; button to create/link assessment for a proposed director/controller.
- **Approval guardrail**: application approval action checks required F&P assessments; blocks/warns if missing/rejected/unresolved; permits conditional approval if F&P is conditional. Uses `OverrideReasonDialog` when officer overrides warning.
- **Shared registry**:
  - Add DB function `fp_find_duplicate_individuals(national_id, passport, email, name, dob)` returning match candidates with confidence.
  - "New Individual" dialog calls it and shows duplicate warning with "Use existing" action.
  - Individual detail shows all roles, determinations across licensees/sectors/regulators.
  - RLS: shared identity readable to any internal user with F&P view; restricted notes (`fp_individuals.private_notes`) scoped to owning regulator.
  - Optional merge action audited via `rule_overrides`.

## Slice 3C-6 — Twin Peaks Coordination Completion

- **Schema additions**:
  - `coordination_cases.subject_type` enum widen: application, complaint, return, prudential_finding, fp_assessment, enforcement_action, license, entity.
  - Add `coordination_escalations` (case_id, raised_by, reason, positions jsonb, proposed_resolution, decision_owner_id, due_date, status, outcome, outcome_rationale, resolved_at, resolved_by).
  - Add `coordination_participants.role` (owner/primary/secondary) and `clearance_status` (pending/cleared/conditionally_cleared/blocked) + `clearance_note`.
  - Add `coordination_cases.closure_rationale` (required at close via trigger).
- **Auto-suggest**: "Open Coordination" button on Application, Complaint, Prudential breach, F&P assessment, Enforcement detail — prefills subject linkage.
- **Conflict/escalation UI**: block-with-reason, request-resolution, escalate, resolve escalation with outcome enum (cleared/conditionally_cleared/blocked/deferred).
- **Decision enforcement**: source case detail shows coordination status badge; approval action blocked if any participant blocked, warned if pending, allows conditional if any conditionally_cleared. Uses existing `OverrideReasonDialog` for overrides.
- **Regulator scoping**: seed ABC Prudential + FSC Conduct regulators; add regulator badges to participants; RLS ensures users only see cases their regulator participates in (except owner-regulator staff).
- **Audit**: wire `logComplianceAudit` for every coordination mutation (create, invite, remove, message, clearance, flag raise/resolve, escalation raise/resolve, close, subject link/unlink).

---

## Cross-cutting Technical Notes

- **Migrations**: five small migration files, each following the CREATE/GRANT/RLS/POLICY order for any new table. All new triggers use `SET search_path = public`.
- **Reuse**: `OverrideReasonDialog`, `rule_overrides`, `DiffViewer`, `HistoryButton`, `FormRenderer`, `logAudit`, `logComplianceAudit`, existing screening edge function.
- **No new backends**: extend existing edge functions (`run-fp-screening`, `overdue-action-sweep`) rather than adding new ones.

## Verification (final slice)

- `npm run build` clean.
- Vitest: add targeted tests for committee quorum/threshold enforcement, PQ version pinning, coordination approval guard, screening degradation.
- Playwright smoke: two scripts covering the F&P and Twin Peaks checklists exactly as user listed; screenshots stored under `/tmp/browser/phase3/`.
- Report includes: commit SHA, files changed, migration filenames, per-item acceptance confirmation, build output, smoke-test screenshots summary.

## Delivery Order

1. 3C-1 Nav + module registration (small, unblocks discovery)
2. 3C-2 PQ Form Builder wiring
3. 3C-3 Audit + committee/determination triggers
4. 3C-4 Screening hardening + conditions/appeals/monitoring QA
5. 3C-5 Licensing integration + shared registry dedupe
6. 3C-6 Coordination completion + escalation + decision enforcement
7. Build, tests, Playwright, final report
