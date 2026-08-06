# Thematic Reviews — Closure & Follow-Up

Closes the three FRD gaps on thematic review closure: a published report artefact, a follow-up action register tracked to completion, and a closure approval gate — plus per-entity supervisory letters on publication. Existing thematic review lifecycle, scope, evidence, findings and action creation stay untouched; the closure step becomes gated instead of a free-form status advance.

## What gets built

### 1. Published report artefact
- A versioned report record per review: type (draft / final), version number, title, executive summary, content sections (background, scope, methodology, key findings, required actions, regulatory learning), and lifecycle `draft → in_review → approved → published`.
- Report editor tab on the review detail page with a live printable preview assembled from the review's findings and actions, so officers don't retype them.
- "Generate PDF" produces the report document, stores it in secure storage, and links it to the report version. Published versions are read-only; a new version must be created to amend.
- Report list shows every version with prepared-by / approved-by / published-at and a download link.

### 2. Follow-up action register
- Extends the existing thematic action register with follow-up tracking: owner (entity contact and responsible officer), next follow-up date, verification status (pending / evidence received / verified / not satisfied), verification notes and verifier, extension requests with a new due date plus mandatory justification, and completion evidence.
- Register view per review showing open / due soon / overdue / verified / waived counts, filterable by entity and status; the same rows continue to feed the existing overdue sweep.
- Completing an action now requires evidence and a verification outcome, replacing the current browser prompt. Waiving keeps the existing override-with-reason path.
- Closure of the review is blocked while any required action is unverified, unless a documented override is recorded.

### 3. Closure approval gate
- Lead officer submits the review for closure with a closure summary, regulatory learning capture, and a nominated approver (optional). Status becomes `pending_closure`.
- Approvers are the nominated user or anyone holding the conduct approval permission (shared queue), mirroring the RFI approval gate.
- Approver can approve (review moves to `closed`, closure timestamp and approver recorded) or reject with a mandatory reason (returns to `monitoring` for the drafter to fix).
- A closure approvals queue lists reviews awaiting sign-off, with the report version, outstanding-action count and findings summary visible before deciding.
- Every transition (submitted, approved, rejected, published, letters dispatched) is written to the review status history and the compliance audit trail.

### 4. Supervisory letters on publication
- On publication of an approved final report, a supervisory letter is generated per in-scope licensee from a correspondence template, listing that entity's findings and required actions with due dates, and dispatched through the existing correspondence pipeline.
- Letters are recorded against the review with dispatch status and recipient, visible in a Closure tab; failures are surfaced and re-sendable rather than silently swallowed.

### 5. Regulatory learning capture
- Structured capture at closure: what changed in supervisory approach, rule/guidance implications, recommended follow-on work, and reusable indicators. Stored on the review and reproduced in the published report.

## Technical notes

- **Schema**: new `thematic_review_reports` (versioned, approval + publication columns, `file_upload_id`), new `thematic_review_letters` (per-entity dispatch record), new columns on `thematic_reviews` (`closure_state`, `closure_approver_id`, `closure_requested_by/at`, `closure_approved_by/at`, `closure_rejection_reason`, `regulatory_learning` jsonb), and follow-up columns on `thematic_review_actions` (`follow_up_due_date`, `verification_status`, `verification_notes`, `verified_by/at`, `extension_reason`, `original_due_date`, `entity_contact`). All new tables get GRANTs then RLS with policies gated to internal conduct/supervision roles; entities do not read these tables.
- **RPCs (SECURITY DEFINER)**: `thematic_report_upsert_draft`, `thematic_report_submit_for_approval`, `thematic_report_approve`, `thematic_report_publish` (creates letters), `thematic_review_request_closure`, `thematic_review_approve_closure`, `thematic_review_reject_closure`, `thematic_action_record_verification`, `thematic_action_extend_due_date`. Each enforces permission, state preconditions, required reasons, and writes `compliance_audit_logs` + status history.
- **Edge function**: PDF generation and storage upload for the report artefact; letter dispatch reuses `send-correspondence`.
- **Notifications**: register `thematic_review.closure_requested`, `.closure_approved`, `.closure_rejected`, `.report_published`, `.action_follow_up_due`, dispatched server-side from the RPCs/sweep (not from the browser) so fan-out is actually delivered. Templates published for enabled channels.
- **Frontend**: new `Closure & Report` and `Follow-up register` tabs in `ThematicReviewDetail.tsx`, a `ThematicClosureQueue` page + route + sidebar entry, and hooks in a new `useThematicClosure.ts`. Existing tabs and transition logic are left in place, with the forward advance into `closed` rerouted through the gate.
- **Verification before claiming done**: typecheck, pgTAP tests for the new RPC guards and RLS, and a browser run through draft report → submit → approve → publish → letters dispatched → closure request → approve, plus a negative run (closure blocked with unverified actions, rejection requires reason).

## Out of scope

No change to complaints, investigations, monitoring rules, conduct dashboards, or existing examination/prudential modules.
