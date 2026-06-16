# Fix: Registration workflow preview email not opening

## Root cause

In `src/components/applications/WorkflowPanel.tsx`, when an applicant resubmits a registration, the `workflow_instances` row is still `status='paused'` momentarily (the resume happens server-side later). To stop the UI from showing "Workflow paused — awaiting applicant", a previous fix introduced:

```ts
const treatPausedAsActive = !activeInstance && !!pausedInstance && applicantHasResubmitted;
const liveInstance = activeInstance || pausedInstance;
const isPaused = !activeInstance && !!pausedInstance && !treatPausedAsActive;
```

The accordion, action buttons, and `useCanActOnStep` were updated to use `liveInstance` / `(activeInstance || treatPausedAsActive)`, but **the action handlers were not**:

- `handleAction` (line 524): `if (!user || !activeInstance || !currentStep) return;`
- `executeAction` (line 461): same guard
- `handleAddRemark` (line 542): same guard

So when Approver 1 clicks **Approve / Request Resubmission / Return for Correction / etc.** on a registration whose status has flipped back to `submitted` / `pending_review`, `activeInstance` is still undefined, `handleAction` returns silently, and the **email preview dialog never opens**. The button click appears to do nothing.

This matches the user's report exactly: preview opened fine before resubmission (when instance was `active`), and stopped opening after the resubmit flow was introduced.

## Fix

Replace `activeInstance` with `liveInstance` in the three action-execution guards and in the `instance_id` payloads. Keep `activeInstance` everywhere else (status badges, paused-banner gating, `permissionsUnknown`) — those semantics are correct as-is.

### Edits to `src/components/applications/WorkflowPanel.tsx`

1. **`executeAction`** (~L461, L468, L476): guard `!liveInstance`, send `instance_id: liveInstance.id`.
2. **`handleAction`** (~L524): guard `!liveInstance`.
3. **`handleAddRemark`** (~L542, L548): guard `!liveInstance`, send `instance_id: liveInstance.id`.

No other files change. No backend / RPC / edge function changes. The server already accepts a paused instance id and resumes it via `perform_registration_workflow_transition` on the approver action.

## Verification

1. Build passes (auto).
2. Manually exercise the registration approval flow in preview:
   - Reproduce: as Approver 1, request resubmission → log in as applicant → resubmit → log in as Approver 1 → open the registration → confirm the workflow panel shows the action buttons (already working).
   - **Before fix**: clicking Approve / Request Resubmission does nothing.
   - **After fix**: the **Preview & Send** email dialog opens, showing the bound email template; Confirm & Send executes the action and sends the email.
3. Confirm non-resubmission paths still work: a fresh registration where `activeInstance` exists must still open the preview and execute the action (the change is a strict superset — `liveInstance` falls back to `activeInstance`).
4. Confirm the "Workflow paused — awaiting applicant" UI still shows correctly when `isPaused` is true (no resubmission yet) — unchanged.

## Out of scope

- Notification template content, recipient rules, SMTP, dispatch edge function — already working per prior fixes.
- Application (non-registration) workflow path — same fix benefits it harmlessly (it always had `activeInstance`, so behavior is identical).
