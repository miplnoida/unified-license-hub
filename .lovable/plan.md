# Phase 4 — Script 3 (Supervision & Enforcement) Completions

Additive build on Phases 1–3. Fills the largest supervisor-facing gaps identified in the codebase inventory: enforcement lifecycle, prudential breach alerting, inspection scheduling & findings, cross-entity supervisory plan execution, and complaints investigation. No existing screens are altered — every item ships behind new routes, new tabs, or new admin panels.

Estimated effort: **12–16 dev-days**, delivered in 5 self-contained sub-features. Ships one at a time, same pattern as Phase 2 and 3.

---

## Sub-features

### 4.1 ENF-001 — Enforcement case lifecycle & queue ✅ SHIPPED
- New route `/enforcement` — cross-licensee queue with status/type filters, penalty & days-open sort, and headline stats (active, collected, outstanding). New `/enforcement/:id` case workspace.
- Lifecycle actions: **issue notice** (min 20 chars, stamps `notice_issued_at`), **record response** (date + summary), **record decision** (outcome + rationale + optional penalty override + appeal deadline), **mark appealed**, **record penalty payment** (running paid total), **close**, **withdraw**. Every action writes an `enforcement_case_events` row (actor + note + detail JSON) and a matching `audit_logs` entry via `logAction('enforcement.<event>', …)`.
- Schema: extended `enforcement_actions` with `notice_issued_at`, `response_received_at`, `response_summary`, `decision_at`, `decision_outcome`, `decision_rationale`, `appeal_deadline`, `penalty_currency`, `penalty_paid_amount`, `linked_document_ids[]`, `opened_by`, `closed_at`, `closed_by`, `source_type`, `source_reference_id`. New `enforcement_case_events` table with RLS (staff manage, all staff read).
- `src/pages/billing/Penalties.tsx` rewritten off the mock array — live totals for assessed / collected / outstanding / disputed, per-row overdue flag (unpaid past appeal deadline or 30 days after decision), deep-link to owning case. Route added at `/billing/penalties`.
- Existing per-licensee `EnforcementTab` untouched; it reads the same table so newly-added lifecycle columns simply carry through.

### 4.2 SUP-001 — Prudential breach alert inbox ✅ SHIPPED
- New route `/supervision/breaches` — supervisor inbox of `return_threshold_breaches` across all licensees, filterable by status (open / acknowledged / escalated / all) and severity, searchable by metric key / licensee / return ID, and sorted open-first by breach magnitude (|value − threshold| / threshold) then `detected_at`.
- KPI strip: **Open**, **Critical / High (open)**, **Acknowledged**, **Escalated**. Row actions: **open return** (deep-link to `ReturnDetail`), **acknowledge** (analyst note required, stamps `acknowledged_at` / `acknowledged_by`), **escalate to enforcement** (creates a prefilled `enforcement_actions` row + `enforcement_case_events` `opened` row, links back via `escalated_enforcement_id`, jumps to `/enforcement/:id`).
- Schema: extended `return_threshold_breaches` with `acknowledged_at`, `acknowledged_by`, `acknowledgement_note`, `escalated_enforcement_id`, `escalated_at`, `escalated_by`. Added `Staff can update breaches` RLS policy + partial index on open breaches.
- Audit: acknowledge → `prudential.breach_acknowledged`; escalate → `prudential.breach_escalated` (both via `logAction`, both surface in `EntityTimeline`).
- Wiring: `SupervisoryDashboard` gains an **Open Breaches** metric card linked to the inbox; new AdminHub tile "Prudential Breach Inbox".

### 4.3 INS-001 — Inspection scheduling & findings ✅ SHIPPED
- New routes: `/inspections` (cross-entity queue, tabs Scheduled / In progress / Completed / Overdue / All + counts + licensee/inspector/location/scope search), `/inspections/schedule` (month calendar with prev/today/next, colored by inspection type, click to open detail), `/inspections/:id` (summary + edit dialog + findings list).
- Schema: extended `inspections` with `scheduled_date`, `location`, `scope`, `lead_inspector_id` (backfilled from `date_conducted`). New `inspection_findings` table (`category`, `severity` [low/medium/high/critical], `description`, `recommended_action`, `follow_up_owner`, `follow_up_due`, `status` [open/in_progress/closed], `escalated_enforcement_id` + timestamps) with full staff RLS and updated_at trigger.
- Findings CRUD via dialog. High-/critical-severity findings get a **Escalate** button that inserts a new `enforcement_actions` row (`source_type=inspection_finding`, `source_reference_id=finding.id`), stamps `escalated_enforcement_id` on the finding, moves status to `in_progress`, and jumps to `/enforcement/:id`.
- Audit: `inspection.updated`, `inspection.finding_added`, `inspection.finding_updated`, `inspection.finding_high` — all via `logAction`.
- Existing `InspectionsTab` on licensee detail keeps working (reads the same table); new AdminHub tiles for the queue and calendar.

### 4.4 SUP-002 — Supervisory plan execution dashboard ✅ SHIPPED
- New route `/supervision/plans` — cross-entity workload of `supervisory_plan_actions` grouped by `owner_role`, filterable by tab (Open / Overdue / Completed / All), owner role, due window (7 / 14 / 30 days), and searchable by action / licensee / owner.
- KPI strip: Open, Overdue, Completed, and **Plans pending review**.
- Bulk operations on multi-select: **Reassign** (records `reassigned_from`, `reassigned_at`, `reassigned_by`), **Extend due** (stamps `previous_due_date` + `extension_reason`), **Mark complete**. Every write logs a `supervisory.*` audit event.
- 4-eyes plan approval: **Submit for review** on `draft` plans; **Approve** button only shown when `approval_status = pending_review` and the reviewer is not the plan creator. Server relies on `approval_status` transitions (`draft` → `pending_review` → `approved`).
- Schema: extended `supervisory_plans` with `approval_status`, `submitted_for_review_at/by`, `approved_at/by` (+ CHECK constraint). Extended `supervisory_plan_actions` with `previous_due_date`, `extension_reason`, `reassigned_from`, `reassigned_at`, `reassigned_by`. New indexes on `due_date`, `status`, and `approval_status`.
- New AdminHub tile "Supervisory Plans Dashboard".

### 4.5 COMP-001 — Complaints investigation workflow
- New tab **Investigation** on complaint detail (existing `ComplaintsList` links unchanged).
- New tables: `complaint_investigation_tasks` (task + owner + due date + status), `complaint_correspondence` (inbound/outbound message log, direction + subject + body + attachments), `complaint_evidence` (metadata linked to `file_uploads`).
- SLA badge on complaint rows — days open vs configurable `complaint_types.sla_days`; overdue rows highlighted.
- Complainant acknowledgement email on intake + status-change email on resolution (via existing notifications pipeline).
- **Escalate to enforcement** button on resolved complaints with severity ≥ medium — creates a prefilled `enforcement_actions` row (feeds 4.1) and links it back on the complaint.
- Small analytics panel on `/complaints/analytics` — trend by complaint type + average resolution time.

---

## Cross-cutting for Phase 4

- Every write action calls `useEntityAuditLog` → renders in the unified `EntityTimeline`.
- Enforcement, inspection, plan-execution, and breach cron jobs all log via `_shared/integration-log.ts`.
- New notification event keys: `prudential.breach_raised`, `prudential.breach_escalated`, `enforcement.notice_issued`, `enforcement.decided`, `inspection.scheduled`, `inspection.finding_high`, `supervisory.action_due`, `complaint.acknowledged`, `complaint.resolved`, `complaint.escalated`.
- New AdminHub tiles: Enforcement Queue, Breach Inbox, Inspection Queue, Plan Dashboard, Complaint Analytics.
- New permission modules: `enforcement`, `inspections` (both pre-referenced in `permissionTabs.ts` — no new module wiring needed for existing supervisory/complaint modules).

## Delivery order

Build in the numeric sequence above — each sub-feature is self-contained and shippable independently. 4.1 → 4.2 creates the enforcement→breach loop; 4.3 findings can then escalate into 4.1; 4.4 and 4.5 are independent.

## Risks / open decisions

- Notice/letter document generation reuses the Phase 2.6 certificate signer template engine — same signing key.
- Inspection calendar uses `react-big-calendar` (already in deps? confirm before 4.3 kicks off — otherwise switch to a lightweight month grid).
- Enforcement→penalty billing wiring stops at "display collected/outstanding"; actual invoicing is out of scope (belongs to the fees & payments module).
