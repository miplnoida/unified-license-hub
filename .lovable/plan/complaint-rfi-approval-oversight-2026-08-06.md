# Complaint RFI Approval & Oversight

Add a supervisory quality-control gate in front of complaint information requests (RFIs) so a draft is reviewed, approved, rejected or amended before it reaches the regulated entity.

## Current state (verified)

- `complaint_rfis` has statuses `open | submitted | closed | cancelled` only. An RFI raised by an officer becomes `open` immediately and is instantly visible to the entity workbench — there is no pre-dispatch review state.
- All writes go through SECURITY DEFINER RPCs (`complaint_rfi_raise`, `_save_draft`, `_submit`, `_return_item`, `_close`, `_cancel`); tables have no direct write policies.
- `complaint_management` permissions today: create, view, view_status, edit, submit, upload_documents — no approval action exists.
- The entity workbench (`/entity/complaint-rfis`) and regulator tab (Information Requests) both read `complaint_rfis` directly via RLS.

## What will be built

### 1. Draft review lifecycle

New statuses ahead of dispatch: `draft` → `pending_approval` → `approved/dispatched (open)`, plus `rejected` (returned to drafter for rework). Entity-side visibility is restricted to dispatched RFIs and later, so drafts and pending items never leak to the licensee.

Officer flow: compose questions → save as draft → edit freely → submit for approval (optionally nominating an approver) → on approval the RFI is dispatched and the entity notification fires.

### 2. Approver assignment

- Drafter may nominate a named approver from the internal employee list.
- If left blank, the draft lands in a shared queue visible to anyone holding the new RFI-approval permission.
- Nominated approver is recorded and shown on the queue; queue holders can still act if the nominee is unavailable (recorded in audit).

### 3. Approve / reject / modify

Supervisor screen actions:
- **Approve & dispatch** — optional note; RFI becomes live, entity notified, due date confirmable at approval time.
- **Reject** — mandatory reason; returns to the drafter as `rejected` with the reason shown for rework and resubmission.
- **Modify** — approver may edit the summary, due date and question text/type/mandatory flags before approving; every change is captured as a before/after diff in the audit trail.

### 4. Configurable gate

Admin setting for complaint RFIs: approval required on/off. When off, existing behaviour is preserved exactly (raise dispatches immediately). When on, dispatch is only possible via approval. Server-side enforcement, not just UI.

### 5. Dispatch-on-approval audit

Audit entries for: draft created, submitted for approval, approver assigned/changed, modified (with diff), approved, rejected (with reason), and dispatched (with recipient entity, question count, due date, actor, timestamp).

### 6. Screens

- **RFI Approval Queue** (new page under Complaints, permission-gated): tabs for Pending approval / My drafts / Rejected / Dispatched, with entity, complaint, questions, due date, age, nominated approver. Row opens a review drawer with full question list, inline edit, and approve/reject actions.
- **Complaint detail → Information Requests tab**: shows draft/pending/rejected states with their own badges and actions ("Submit for approval", "Edit draft", "Resubmit"), leaving the existing dispatched/submitted/closed handling untouched.
- **Entity workbench**: unchanged, but only ever sees dispatched RFIs.

### 7. Notifications

New events: `complaint.rfi_approval_requested` (to nominated approver or approval-permission holders), `complaint.rfi_approved`, `complaint.rfi_rejected` (to drafter). Existing `complaint.rfi_issued` moves to fire on dispatch rather than on raise.

## Technical notes

- Migration: extend `complaint_rfis` with `approval_state`, `approver_id`, `submitted_for_approval_at/by`, `approved_at/by`, `approval_notes`, `rejection_reason`, `dispatched_at`; widen the status check constraint; keep `open` as the dispatched status so all existing queries and RLS keep working.
- New RPCs: `complaint_rfi_submit_for_approval`, `complaint_rfi_approve`, `complaint_rfi_reject`, `complaint_rfi_update_draft` (summary/due/questions, guarded to draft/pending states). `complaint_rfi_raise` gains a `p_as_draft` flag and honours the config toggle.
- New permission `complaint_management.approve_rfi` seeded into `permission_actions` + `permissions`; helper `has_complaint_perm(uid,'approve_rfi')` used in RPC guards and RLS.
- RLS: entity read policies gated on dispatched-or-later; internal read of drafts limited to drafter, nominated approver, approval-permission holders and super admins.
- Config toggle stored in the existing complaint configuration table (single-row settings pattern) and read by the RPCs.
- Frontend: extend `src/hooks/useComplaintRfis.ts` with queue/approval hooks; new `RfiApprovalQueue` page + `ReviewRfiDialog`; reuse `useEmployeeApprovers` for the nomination picker and `data-rbac` attributes for button gating.
- Verification: pgTAP tests covering the gate (no dispatch without approval, entity cannot see drafts, reject requires reason, toggle-off preserves current behaviour) plus a live browser pass through draft → approval → dispatch, with test data cleaned up afterwards.

No changes to complaint intake, triage, workflow, correspondence or the entity response workbench behaviour.
