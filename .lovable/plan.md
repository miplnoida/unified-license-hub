
# Phase 2 — Script 1 (ULRA) Completions

Builds on Phase 1 primitives (`EntityTimeline`, `useEntityAuditLog`, `integration_logs`, SLA sweep, notification acknowledgements). No changes to existing working flows — every item is additive, gated behind new tabs, buttons, or admin routes.

Estimated effort: **10–14 dev-days**, delivered in 9 self-contained sub-features. Each one ships as its own change set so you can pause/review between them.

---

## Sub-features

### 2.1 ULRA-005 — RFI (Request For Information) subsystem ✅ SHIPPED
**Part A:**
- Tables `application_rfis`, `application_rfi_items`, `application_rfi_responses` with RLS.
- Pause columns on `approval_step_actions`.
- Reviewer `RaiseRfiDialog` — multi-item, per-item due date, optional SLA pause.
- Applicant response (text + secure document upload) & reviewer close-and-resume flow inside a new RFI tab on `ApplicationDetail`.
- Every action writes to `audit_logs` for the unified `EntityTimeline`.

**Part B:**
- `near_due_notified_at` / `overdue_notified_at` idempotency columns on `application_rfis`.
- Edge function `rfi-near-due-sweep` scans open RFIs each hour (pg_cron `rfi-near-due-sweep-hourly`), dispatches `application.rfi_near_due` (within 48h) and `application.rfi_overdue` events, stamps the tracking columns so each RFI is notified once.
- Auto-sufficiency rule engine — new `application_rfi_auto_rules` table (admin-managed). Rules match by workflow type + sector; conditions (missing / present / eq / neq / lt / gt / regex) evaluate against `applications.data`; prompt templates interpolate `{{field.path}}`.
- Reviewer dialog shows a **Suggested items** panel with one-click "Add" / "Add all", auto-populates per-item due date from the rule's `default_due_days`, and records the rules used in the RFI audit log.
- New admin route `/admin/rfi-auto-rules` (AdminHub tile "RFI Auto-Rules") for full CRUD, activation toggle, and scope/condition editing.


### 2.2 ULRA-002 — Batch document upload with per-file metadata ✅ SHIPPED
- New reusable component `src/components/shared/BatchDocumentUpload.tsx` — multi-file staging with a metadata grid: document type (dropdown), description (free text), confidentiality flag per row.
- Persists extras to existing `file_uploads.metadata` JSONB (`doc_type`, `description`, `confidential`, `batch_upload: true`) — no migration required.
- Ready to drop into RFI response, application intake, and licensee detail (Phase 2.1 will wire it into RFI).


### 2.3 ULRA-004 — SLA-age & priority queue ✅ SHIPPED
- New route `/applications/queue` → `src/pages/applications/ApplicationQueue.tsx`. Sits alongside the existing listing (no changes to `ApplicationsList`).
- Added columns on `applications`: `priority` (1–5, default 3), `priority_reason`, `priority_set_by/at`, `assigned_to`, `assigned_by/at` + CHECK + indexes.
- Trigger `log_application_triage_change` writes priority/assignee changes into `audit_logs` so they surface on the unified EntityTimeline.
- Queue features: SLA-age chip (breached / due-soon / healthy), inline priority + assignee editing, multi-select bulk update dialog with reason capture, sector-scoped, stat tiles for pending / breached / due-soon / unassigned.


### 2.4 ULRA-006 — AI assessment with override & explanation ✅ SHIPPED
- Existing edge function `generate-application-ai-assessment` (Lovable AI Gateway, `google/gemini-2.5-flash`) already writes section-wise findings, risks, and routing recommendations into `application_ai_assessments` (25 columns incl. `analyst_decision`, `analyst_decision_action`, `analyst_justification`, `analyst_decision_by`, `analyst_decision_at`).
- Added an **Analyst Decision Bar** to `ApplicationAiAssessmentPanel`: Accept / Override / Escalate buttons; Override & Escalate require a justification (min 10 chars). Records the decision + AI's recommended action + confidence + model name for full traceability.
- Every decision writes to `audit_logs` (`application.ai_assessment_accepted|overridden|escalated`) and surfaces on the unified `EntityTimeline`. Override/Escalate additionally dispatches the `application.ai_overridden` notification event (registered).
- Analyst can "Clear decision" to re-evaluate. Regenerate button (already present) re-runs the AI while preserving existing decision history in `audit_logs`.

### 2.5 ULRA-008 — Consolidated Case view ✅ SHIPPED
- New "Consolidated Case" tab on `ApplicationDetail` (internal-only) aggregates: sibling applications from same applicant, held licenses, open complaints, past enforcement actions, pending returns, and recent prudential breaches.
- Read-only, parallel Supabase queries, no schema changes. Links out to each record for drill-through.

### 2.6 ULRA-009 — Conditional approval + digital signature stamp ✅ SHIPPED
- New `license_conditions` table with RLS (internal manage; holder read).
- `LicenseConditionsPanel` + `ApplicationConditionsTab` — internal reviewers can attach structured conditions (category, description, due date, monitoring owner, notes) once the license is issued; holders see them read-only.
- New "Conditions" tab on `ApplicationDetail` appears when the application is approved.
- `generate-license-certificate` extended to (a) render a visible "DIGITALLY SIGNED / SHA-256 verified" stamp when signing keys are configured and (b) append a second page listing all active conditions attached to the license.

### 2.7 ULRA-010 — Bulk intake (CSV → staged applications) ✅ SHIPPED
- New `bulk_intake_enabled` boolean on `approval_workflow_types` — only whitelisted workflows can accept bulk uploads.
- Edge function `bulk-intake` (actions: `validate` / `commit`) validates each row server-side (workflow enabled, applicant email resolves to a profile, license_type present), then commits with the service-role client. Max 500 rows/batch; extra CSV columns are merged into `applications.data`; writes an `application.bulk_intake` audit log entry on commit.
- Admin route `/admin/applications/bulk-intake` (`BulkIntake.tsx`) — CSV template download, file picker, workflow-type dropdown (bulk-enabled only), inline preview table with per-row status/errors, and a commit button that stays disabled while any row is invalid. Created applications open in `draft` status and are auto-assigned to the originator.
- AdminHub tile "Bulk Application Intake" added.

### 2.8 ULRA-011 — Auto supervisory plan on approval ✅ SHIPPED
- New tables `supervisory_plan_templates` (per-sector or global) and `supervisory_plan_template_actions` (title, description, owner role, days-from-approval offset, sort order) with RLS scoped to internal staff.
- Database triggers on `applications.status → approved` and on `licenses` INSERT (whichever fires first) auto-create a `supervisory_plans` row + seed `supervisory_plan_actions` from the matching sector template (falls back to any active global template). Idempotent per license.
- Admin CRUD page `/admin/supervisory-plan-templates` (AdminHub tile added) for full template + action management. Regulators can edit the generated plan afterwards in the existing supervisory plan panel.

### 2.9 ULRA-012 — Twin Peaks coordination workspace ✅ SHIPPED
- New tables `coordination_cases`, `coordination_participants`, `coordination_messages`, `coordination_flags` with RLS scoped to invited participants (super_admin fallback). Triggers auto-seed the creator as an "owner" participant and recompute case status (`open` / `pending_clearance` / `cleared`) whenever any participant's clearance changes — the "Conditional Clearance" gate.
- New routes `/coordination` (list + case creation) and `/coordination/:caseId` (thread, participants, flags). Owners can invite internal users as participant/observer; each participant clears or blocks the case with an optional note. Interdependency / blocker / notice / concurrent-review flags can be raised against linked applications or licenses.
- AdminHub tile "Twin Peaks Coordination" surfaces the workspace. Regulators remain isolated by default — explicit invitation is required for visibility.

---

## Cross-cutting

- Every write action calls `useEntityAuditLog` → renders in the unified `EntityTimeline` (Phase 1).
- SLA pauses/resumes feed the Phase 1 sweep function automatically.
- All new edge functions log via `_shared/integration-log.ts`.
- Notifications use existing `notification_event_configs` — 4 new event keys registered: `application.rfi_raised`, `application.rfi_near_due`, `application.ai_overridden`, `coordination.clearance_requested`.

## Database impact

New tables (10): `application_rfis`, `application_rfi_items`, `application_rfi_responses`, `license_conditions`, `supervisory_plan_templates`, `coordination_cases`, `coordination_participants`, `coordination_messages`, `coordination_flags`, plus columns on `approval_step_actions`, `applications`, `application_ai_assessments`, `file_uploads`.

All with GRANTs + RLS + policies scoped by regulator / participant / applicant.

## Risks

- **RFI SLA pause** touches the active approval flow — mitigated by wrapping in a feature flag per workflow type; existing steps unaffected until enabled.
- **Twin Peaks RLS**: cross-regulator visibility is a policy decision — default is opt-in per case; will confirm before enabling for any live regulator.
- **AI cost/latency** on assessment — cached per submission hash; manual re-run only.
- **CSV bulk intake** validation must match every field rule of the form engine — will reuse the existing render-side validator server-side to avoid drift.

## Delivery order

I'll ship in this order (each independently testable): 2.2 → 2.3 → 2.1 → 2.6 → 2.8 → 2.5 → 2.9 → 2.7 → 2.11. Confirm or reorder.

---

# Phase 3 — Script 2 (Fit & Proper) — greenfield

Full greenfield build of the Fit & Proper regime for regulated-entity individuals (directors, key persons, senior managers). Estimated **20–28 dev-days** in 7 self-contained sub-features. Same additive pattern as Phase 2 — new module, new tables, new routes; no existing surfaces are modified.

### 3.1 FPA-001 — FP schema foundation + Individuals registry
- Full schema created up-front (all tables have RLS + GRANTs): `fp_individuals`, `fp_individual_roles`, `fp_assessments`, `fp_screening_configs`, `fp_screening_runs`, `fp_findings`, `fp_determinations`, `fp_committees`, `fp_committee_members`, `fp_committee_votes`, `fp_conditions`, `fp_appeals`, `fp_monitoring_events`.
- Ships the Individuals module first: routes `/fit-and-proper`, `/fit-and-proper/individuals/:id`. Internal staff can create individuals (name, national ID, DOB, nationality, contact), link them to licensees with roles (director, CEO, key person, controller, shareholder), and view a case-file shell with tabs for the later sub-features.

### 3.2 FPA-002 — Declarations form + assessments ✅ SHIPPED
- New `FpAssessmentsPanel` inside the individual case-file lets internal staff (and licensee_primary via RLS) start an assessment (`initial` / `renewal` / `material_change` / `adverse_event`) linked to a specific role.
- New route `/fit-and-proper/assessments/:id` renders the full declaration form: employment history, qualifications, disclosures (regulatory / criminal / financial / related parties, disqualifications / bankruptcy / disciplinary flags) with a mandatory confirmation checkbox.
- Lifecycle wired end-to-end: `draft → submitted → screening → awaiting_committee → determined → closed`. Draft is editable; submission stamps `submitted_by` / `submitted_at`. Internal-only "Send to screening / committee / Determined / Close" buttons transition status. Assessments tab on the individual profile now enabled and shows the full list.
- Magic-link declaration route (`/fit-and-proper/declare/:token`) deferred to a follow-up — the authenticated inline form covers licensee_primary via existing RLS.

### 3.3 FPA-003 — Screening engine ✅ SHIPPED
- Edge function `fp-screening-run` executes every active `fp_screening_configs` rule against the assessment's declaration + individual identity, writes a `fp_screening_runs` row (with `total_checks`/`total_hits` + duration) and per-hit `fp_findings` (severity, source, summary, raw payload). Auto-advances assessment status to `screening` when hits are found; logs via `_shared/integration-log.ts`.
- Built-in rule types: `sanctions` (keyword scan), `pep` (employment history keywords), `criminal_history` / `credit_history` / `regulator_watchlist` (self-declaration flags), `adverse_media` (Lovable AI Gateway `google/gemini-2.5-flash` returning risk-graded summaries in strict JSON).
- Admin CRUD `/admin/fp-screening-configs` — full rule pack management (key, label, type, provider, severity, active toggle, sort order). AdminHub tile "FP Screening Rules" added; 6 default rules seeded.
- New `FpScreeningPanel` on individual case-file (Screening tab now enabled) — "Run screening" button, run history, findings list with severity chips, one-click "mark as false positive" with review note and reviewer stamp.

### 3.4 FPA-004 — Committee voting + determinations
- Admin creates committees (`fp_committees` + `fp_committee_members`) with quorum and voting rules.
- Assessment routes to a committee → members vote (`fp_committee_votes`: approve / conditional / reject / abstain) with justification; when quorum reached, a determination row (`fp_determinations`) is auto-created with outcome + rationale.

### 3.5 FPA-005 — Conditional determinations
- Conditional approvals capture attached conditions (`fp_conditions`: description, deadline, monitoring owner, evidence type). Mirrors the `license_conditions` pattern.
- Individual profile shows outstanding conditions; each can be marked satisfied with a note + evidence upload.

### 3.6 FPA-006 — Appeals
- Applicant / licensee can appeal a `rejected` or `conditional` determination within a configurable window. `fp_appeals` captures grounds, supporting docs, appeal committee, and outcome.
- Appeal outcome creates a new determination (supersedes prior) with a full audit trail.

### 3.7 FPA-007 — Ongoing monitoring cron
- Edge function `fp-monitoring-sweep` (hourly / daily) re-runs screening for **approved** individuals on a rolling cadence (config: `recheck_days`), watches for new adverse hits, and creates `fp_monitoring_events` + `application.fp_alert` notifications when severity crosses a threshold.
- New "Monitoring" tab on the individual profile shows the timeline of re-checks and any raised alerts.

## Cross-cutting for Phase 3

- Every FP write action calls `useEntityAuditLog` → surfaces on the unified `EntityTimeline`.
- New permission module `fit_and_proper` (already referenced in `permissionTabs.ts`); AdminHub tile "Fit & Proper Register" added in 3.1.
- Screening + monitoring edge functions log via `_shared/integration-log.ts`.
- New notification event keys: `fp.declaration_submitted`, `fp.screening_hit`, `fp.determination_made`, `fp.condition_due`, `fp.monitoring_alert`, `fp.appeal_filed`.

## Risks / open decisions

- Adverse-media data source is a commercial decision — 3.3 defaults to Lovable AI Gateway summarisation of open web results; a real feed (e.g. Dow Jones RiskCenter) can be plugged in via the same `fp_screening_configs` rule pack.
- Digital-signature stamp on determinations reuses the certificate signer from Phase 2.6.

