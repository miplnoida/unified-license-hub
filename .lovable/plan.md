## Problem

Complaint lifecycle actions today are hardcoded and silent:

- `escalate_complaint_to_enforcement` RPC, and enforcement lifecycle actions (`issue_notice`, `record_response`, `record_decision`, `record_payment`, `mark_appealed`, `close_case`, `withdraw_case`) in `EnforcementDetail.tsx` and `ComplaintDetail.tsx` only write DB rows + `enforcement_case_events` — no `dispatchNotificationEvent` call, so no in-app or email is sent to the assigned officer, the licensee, or the complainant.
- Only complaint intake (`trg_start_complaint_workflow`) emits in-app rows; email + step-by-step notifications aren't wired.
- There's no visible "progress" for the licensee/complainant — they can open their complaint but see no timeline of who has it, what step it's on, or what happened.
- The actions and their recipients are hardcoded in TSX, not sourced from the Complaint Management Workflow (`approval_workflows` where `entity_type = 'complaint'`), so admins can't reconfigure who gets notified.

## Goal

Every complaint lifecycle action — filed, assigned, escalated, notice issued, response received, decision, payment, appeal, close, withdraw — routes through the approval workflow engine so that:
1. In-app + email notifications fire to the recipients configured per step/action in the Complaint Management Workflow.
2. Internal staff and licensees/complainants see a live tracking timeline for their complaint.
3. No hardcoded recipient logic remains in the components.

## Changes

### 1. Migration — extend Complaint Management Workflow config
- Ensure the seeded `approval_workflows` row (`entity_type = 'complaint'`) has ordered `approval_steps` for: `Triage → Investigation → Enforcement Escalation → Notice Issued → Response Received → Decision → Closure`.
- Seed `approval_step_actions` for each step covering: `escalate`, `issue_notice`, `record_response`, `record_decision`, `record_payment`, `mark_appealed`, `close_case`, `withdraw_case`.
- Seed `approval_action_notifications` rows for each action with `recipient_type` in (`assigned_officer`, `payload_user` for complainant, `payload_licensee_primary` for licensee, `role:enforcement_officer`) and `template_id` pointing at seeded `notification_templates` (in_app + email variants per event, e.g. `complaint.escalated`, `complaint.notice_issued`, `complaint.decision_recorded`, `complaint.closed`, `complaint.withdrawn`, `complaint.payment_recorded`, `complaint.appeal_filed`).
- Seed `notification_templates` for those event keys (subject/body use `{{complaint_number}}`, `{{case_number}}`, `{{outcome}}`, `{{app_url}}`).
- Redefine `escalate_complaint_to_enforcement` to (a) still open the enforcement case, (b) advance the linked `workflow_instances` row for the complaint into the "Enforcement Escalation" step, and (c) return the new step id so the client can dispatch `complaint.escalated`.

### 2. `src/lib/complaintNotifications.ts` (new)
Thin wrapper around `dispatchNotificationEvent` that resolves the complaint's current workflow instance + step, then dispatches action-scoped events (`complaint.<action>`) with a standard payload (`complaint_id`, `complaint_number`, `case_number`, `licensee_id`, `complainant_id`, `outcome`, `note`, `app_url`). The existing runtime override path (see `workflowRuntimeNotificationDispatch.test.ts`) already expands `approval_action_notifications` rows, so no edge-function change is needed — this helper just ensures the event fires with the right entity/step context.

### 3. `EnforcementDetail.tsx` + `ComplaintDetail.tsx`
- After every successful mutation (`issueNotice`, `recordResponse`, `recordDecision`, `recordPayment`, `markAppealed`, `closeCase`, `withdrawCase`, `escalate`), call the helper from step 2 — no per-recipient logic in the component.
- Remove any inline `INSERT INTO notifications` / static toast-only paths; keep local toast for UX.

### 4. Complaint tracking timeline (new component)
- `src/components/complaints/ComplaintTrackingTimeline.tsx`: reads `workflow_instances` + `approval_steps` + `enforcement_case_events` + `complaint_investigation_tasks` + `notification_dispatch_log` (filtered to this complaint) and renders a vertical timeline: step name, entered_at, actor, outcome, note. Purely presentational; RLS already allows complainant/licensee to read their own complaint's related rows.
- Mount it in `ComplaintDetail.tsx` under a new "Progress" tab, visible to all roles that can view the complaint (internal + `licensee_primary/secondary` + `pre_licensee` + complainant). No new routes.

### 5. Tests
- Extend `src/test/complaintsSla.test.ts` sibling file `src/test/complaintNotificationDispatch.test.ts` pinning that each lifecycle mutation calls `dispatchNotificationEvent` with the matching `event_key` and includes `entity_type = 'complaint'`.
- Migration test pinning that `approval_action_notifications` seed rows exist for every complaint action.

## Out of scope

- No changes to enforcement RLS, storage, or the reports module.
- No new sidebar entry — tracking lives inside the existing complaint detail page.
- No changes to the intake trigger's existing behavior (kept as fallback for the very first `complaint.filed` event).

## Technical notes

- Recipient resolution stays server-side inside `dispatch-notification-event` — the client only fires the event; templates + recipient rules are fully editable from the Workflow Builder UI (Step → Actions → Notifications editor already exists via `StepEntryNotificationsEditor.tsx` and `useActionNotifications.ts`).
- Email delivery is gated by the existing SMTP settings; failures are swallowed per `notificationEvents.ts` contract so they never block the lifecycle mutation.
