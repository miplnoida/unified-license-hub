
# Phase 2 — Script 1 (ULRA) Completions

Builds on Phase 1 primitives (`EntityTimeline`, `useEntityAuditLog`, `integration_logs`, SLA sweep, notification acknowledgements). No changes to existing working flows — every item is additive, gated behind new tabs, buttons, or admin routes.

Estimated effort: **10–14 dev-days**, delivered in 9 self-contained sub-features. Each one ships as its own change set so you can pause/review between them.

---

## Sub-features

### 2.1 ULRA-005 — RFI (Request For Information) subsystem
- New tables: `application_rfis`, `application_rfi_items`, `application_rfi_responses`.
- Reviewer action on `ApplicationDetail` → "Raise RFI" dialog (multi-item, per-item due date, attachments).
- Automatically **pauses SLA** on the current approval step (new `paused_at` / `paused_reason` columns on `approval_step_actions`); resumes on applicant response.
- Applicant portal: RFI tab on their application with response form + file upload (reuses `useDocumentUpload`).
- Cron `rfi-near-due-sweep` (daily) → notification 48h before RFI due.
- Auto-sufficiency rule engine: configurable required-fields checklist per workflow type; missing items pre-populate RFI draft.

### 2.2 ULRA-002 — Batch document upload with per-file metadata ✅ SHIPPED
- New reusable component `src/components/shared/BatchDocumentUpload.tsx` — multi-file staging with a metadata grid: document type (dropdown), description (free text), confidentiality flag per row.
- Persists extras to existing `file_uploads.metadata` JSONB (`doc_type`, `description`, `confidential`, `batch_upload: true`) — no migration required.
- Ready to drop into RFI response, application intake, and licensee detail (Phase 2.1 will wire it into RFI).


### 2.3 ULRA-004 — SLA-age & priority queue columns
- New view / RPC `application_queue_view` returning: age in business days, SLA remaining, priority (auto from sector + fee tier + manual override), current assignee.
- New "Queue" tab on Applications listing with sortable columns, color-coded SLA chips, bulk-assign action.
- Priority override writes to `applications.priority` (new column) with audit entry.

### 2.4 ULRA-006 — AI assessment with override & explanation
- "Run AI Assessment" button on `ApplicationDetail` → edge function `ai-assess-application` (Lovable AI Gateway, `google/gemini-2.5-flash`).
- Persists to existing `application_ai_assessments` (already has 25 columns) + new `override_reason`, `overridden_by`, `overridden_at`.
- Right-side panel shows: score, risk flags, per-criterion explanation, cite-back to form fields, "Accept / Override" with mandatory justification.

### 2.5 ULRA-008 — Consolidated Case view
- New tab "Consolidated Case" on `ApplicationDetail` that aggregates: linked applications from same entity, past licenses, open complaints, past enforcement actions, pending returns, prudential flags.
- Read-only, pulls via parallel queries + TanStack; no schema changes.

### 2.6 ULRA-009 — Conditional approval + digital signature stamp
- New approval action option "Approve with Conditions" → captures condition list (structured: category, description, due date, monitoring owner).
- Writes to new `license_conditions` table; conditions surface on the issued certificate PDF and licensee dashboard.
- Certificate generation extended to embed digital-signature stamp (PEM key already in secrets; else placeholder image + hash).

### 2.7 ULRA-010 — Bulk intake (CSV → staged applications)
- Admin route `/admin/applications/bulk-intake`.
- CSV upload → server-side validation via edge function `bulk-intake-validate` → preview table (errors highlighted) → confirm creates draft applications assigned to originator.
- Reuses existing form-template resolution; only supports workflow types flagged `bulk_intake_enabled`.

### 2.8 ULRA-011 — Auto supervisory plan on approval
- Trigger on `applications` status → `approved`: insert into `supervisory_plans` + seed `supervisory_plan_actions` from a per-sector template (`supervisory_plan_templates`, new table).
- Editable by regulator afterwards; audit-logged via `useEntityAuditLog`.

### 2.9 ULRA-012 — Twin Peaks coordination workspace
- New tables: `coordination_cases`, `coordination_participants` (multi-regulator), `coordination_messages`, `coordination_flags` (interdependency).
- New route `/coordination/:caseId` with shared thread, participant list, linked applications from each regulator, "Conditional Clearance" action that blocks final approval until all participants clear.
- RLS: visibility scoped to `coordination_participants.user_id` — regulators still isolated by default; explicit invite required.

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
