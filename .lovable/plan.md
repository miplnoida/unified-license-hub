
## Problem

Complaint intake currently:
- Sets `assigned_team` **statically** from `conduct_triage_rules` only — it does not run the configured approval workflow (entity_type = `complaint` exists in `useWorkflowEngine` but no runtime hook fires on submit).
- Fires **no notification** to the complainant, assignee, or admins on filing.
- Conduct Dashboard tiles show counts but do not visually flag critical / SLA-breached / open-alert conditions.

## Fix Plan

### 1. Backend — workflow-driven complaint routing
- New migration:
  - Add `complaint` to the allowed `entity_type` list in `perform_workflow_transition` + `approval_workflows` CHECK (already allowed in some places, verify).
  - Trigger `trg_start_complaint_workflow` `AFTER INSERT ON public.complaints`:
    - Resolve active `approval_workflows` where `entity_type='complaint'` matching sector/sub_sector/category (reuse the same taxonomy resolver used for applications/returns).
    - Insert `approval_workflow_instances` row (entity_id = complaint.id) at step 1.
    - Set `complaints.assigned_to` / `assigned_team` from the first step's `assigned_role` / `assigned_team_id` (dynamic, overrides any static triage output).
    - Skip if no workflow configured (fall back to current triage behaviour so we never block intake).
- Extend `perform-workflow-action` edge function (or a thin wrapper `perform-complaint-workflow-action`) to accept `entity_type='complaint'`, update `complaints.status` from step `result_status_override`, and log to `case_audit_events`.

### 2. Backend — notifications on file
- Seed rows in `notification_templates` (idempotent upsert) for these event keys, if missing:
  - `complaint.filed` → complainant (email + in-app): "We received your complaint {ack_no}".
  - `complaint.assigned` → assignee/team (email + in-app): "Complaint {ack_no} assigned to you, SLA due {sla_due_at}".
  - `complaint.sla_breach_warning` → assignee + supervisor.
- Add to the same `AFTER INSERT` trigger a call to `dispatch_notification_event('complaint.filed', ...)` (SQL wrapper already used by returns).
- On workflow step transition, dispatch `complaint.assigned` to the new assignee.

### 3. Frontend — file-time notification hook
- In `src/pages/complaints/ComplaintsList.tsx` (applicant path) and `NewInternalComplaint.tsx` (internal path), after successful insert call `dispatchNotificationEvent('complaint.filed', { complaint_id, ack_no, app_url })` as a fire-and-forget backstop (mirrors `slaNotifications.ts` pattern). Trigger remains the source of truth.

### 4. Frontend — dynamic assignment display
- `ComplaintDetail.tsx` and `ComplaintsList.tsx`: replace the current `assigned_team` badge with data from the active `approval_workflow_instance` (step name + assignee) using the existing `useWorkflowInstance` hook. Fall back to `assigned_team` when no workflow is running.
- Remove the hardcoded assignee override in `evaluate-complaint-triage` when a workflow instance exists (triage still classifies severity/priority/SLA; routing is delegated to workflow).

### 5. Frontend — Conduct Dashboard alert highlighting
- `ConductDashboard.tsx` tile styling driven by thresholds:
  - `criticalComplaints > 0` → red border + pulse dot.
  - `slaBreachedComplaints > 0` → red border.
  - `openAlerts > 0` → amber border.
- Add a top "Attention required" banner listing the active alert conditions with deep links to the filtered list (`/complaints?severity=critical`, `?sla=breached`, `/conduct/alerts?status=open`).
- No metric-math changes; purely presentational + query-param wiring already supported by `ComplaintsList` filters.

## Out of scope
- Rewriting the triage rule engine.
- Changing complaint intake forms.
- New workflow builder UI (admins already can configure `entity_type='complaint'` workflows in the existing builder).

## Technical notes
- Reuse `dispatch-notification-event` edge function and `notification_templates` seeding pattern from returns.
- Reuse `approval_workflow_instances` schema — no new tables.
- Trigger uses `SECURITY DEFINER` with `set search_path=public` to bypass RLS for the workflow instance insert.
- All new migrations follow the CREATE TABLE → GRANT → RLS → POLICY order where applicable (no new public tables expected; only trigger + templates).
