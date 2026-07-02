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

### 4.3 INS-001 — Inspection scheduling & findings
- New route `/inspections` — cross-entity inspection queue with tabs: **Scheduled**, **In progress**, **Completed**, **Overdue**.
- New route `/inspections/schedule` — calendar view (month/week) of upcoming inspections, drag-to-reschedule; supports on-site / off-site / desk-review type filter.
- Inspection detail `/inspections/:id`: existing summary + new **Findings** section — many findings per inspection, each with `category`, `severity`, `description`, `recommended_action`, `follow_up_owner`, `follow_up_due`, `status` (`open` / `in_progress` / `closed`).
- New tables: `inspection_findings`, `inspection_follow_up_actions`. Findings marked "severity=high" surface a one-click **create enforcement case** button (feeds 4.1).
- Inspector assignment via a dedicated `inspection_assignments` join (multi-inspector support) — replaces current free-text `inspector_name`.
- Existing `InspectionsTab` on licensee detail keeps working; it reads the same table.

### 4.4 SUP-002 — Supervisory plan execution dashboard
- New route `/supervision/plans` — supervisor cross-entity workload view: all `supervisory_plan_actions` grouped by owner_role, filterable by status (`pending` / `in_progress` / `completed` / `overdue`), due-date window, and licensee sector.
- Calendar sub-tab shows the same actions on a monthly calendar with color-coded severity.
- Bulk operations: reassign owner (writes audit row), extend due date (with mandatory reason), mark complete (existing pattern).
- Plan approval flow — new `supervisory_plans.approval_status` (`draft` / `pending_review` / `approved`); an `approve` button appears only when the reviewer is a different user than the plan creator (4-eyes).
- Notifications: nightly cron sweep flags actions due within 7 days → `notifications` event key `supervisory.action_due`.

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
