# Complaint closure: drop QA review, one "Close complaint" button

Frontend only. No change to the workflow configuration, the closure RPC, RBAC, or audit logging.

## What changes

1. **Remove QA from the closure screen**
   - Delete the "QA review required before closure" checkbox (the panel will always send `_qa_required: false`).
   - Delete the whole "QA review" card: QA note box, "QA approve", "Return to officer", and the "Quality review completed" banner.
   - "QA required: yes/no" line disappears from Closure history entries; the rest of each entry stays.

2. **One action instead of two**
   - Replace "Propose closure (recommendation)" and "Record closure assessment" with a single **Close complaint** button.
   - Clicking it: records the closure assessment (resolution, rationale, outcome, communication reference, evidence complete) and then performs the configured closing workflow action, so the complaint status actually becomes closed in one click.
   - The closing action is taken from the actions the workflow already offers this user at the current step (the same list the Current step tab uses) — no hardcoded action names. If no closing action is available to the user right now, the button is disabled with a short line saying closure must be done from the Current step tab, and the existing "go to Current step" guidance stays.
   - Any comment/reason the closing action requires is filled from the rationale already typed, so staff don't retype it.
   - After success: one toast ("Complaint closed"), and the closure history, complaint record, workflow tracking and available actions refresh.

3. **Requirements list stays, simplified wording**
   - Keep the inline "What's still needed" list (resolution, rationale of 10+ characters, outcome, evidence confirmed) and keep the button disabled until those are met.
   - Once the complaint is closed, the form is replaced by a short "Complaint closed" summary with the recorded outcome and timestamp, so the closure can't be re-recorded.

## Technical notes

- `src/components/complaints/ClosureQaPanel.tsx`: remove `qaRequired`/`qaNote` state and the QA card; single mutation that calls `complaint_record_closure_review` with `_decision: 'closed'`, then `execute_complaint_workflow_action` with the resolved closing action key and `_expected_updated_at` from `get_complaint_tracking` (the same concurrency guard `WorkflowActionPanel` uses). If the workflow step fails, the recorded assessment is kept and the error surfaces through the existing friendly-error mapping.
- `src/lib/complaintWorkflow.ts`: `closureDecisionLabel` keeps `closed` / `closure_proposed` labels for historical rows; QA labels stay only so old history renders, and `summariseClosure` stops treating `qaRequired` as a blocker for readiness.
- `ComplaintClosureSection.tsx` passes the available actions through so the panel can resolve the closing action.

## Verification

Open a complaint sitting at a step that offers a closing action, fill resolution/rationale/outcome/evidence, click **Close complaint**, and confirm the status becomes Closed, the history shows one recorded closure, and no QA controls appear anywhere.
