## Problem

DB trigger correctly writes `paused_at` / `total_pause_seconds` to `workflow_instances` when an RFI is raised, but the row's `status` stays `'active'`. `WorkflowPanel.tsx` (the SLA panel on the Application Detail page) derives its pause state solely from `status === 'paused'`, so it never sees the pause and the SLA badge keeps counting down.

Verified in DB for the current app: `status = 'active'`, `paused_at = 2026-07-04 11:23:09Z`, `resumed_at = null`, `total_pause_seconds = 1182`, `paused_reason = 'RFI …'` — the trigger works; the UI ignores it.

The generic resolver (`workflowSlaResolver.ts`) already handles this correctly. Only `WorkflowPanel.tsx` needs to be aligned.

## Fix (frontend only)

### `src/components/applications/WorkflowPanel.tsx`

1. Treat an instance as paused when either `status === 'paused'` OR (`paused_at` set AND `resumed_at` null).
   - Replace the `pausedInstance = instances.find(i => i.status === 'paused')` lookup with a helper `isInstancePaused(i) = i.status === 'paused' || (!!i.paused_at && !i.resumed_at)`.
   - Because such a row is currently also counted as `activeInstance` (status='active'), also exclude paused rows from `activeInstance`, so `isPaused` resolves true and existing gating logic (disabled action buttons, "Workflow paused — awaiting applicant" banner, paused step badge) fires as designed.

2. Feed the paused duration into the SLA calculations at all three call sites (top-summary `StepSlaCell`, per-step `StepSlaCell` in the timeline, and the inline `useWorkflowSLA` call around line 1143):
   - Pass `pauseSeconds: liveInstance?.total_pause_seconds ?? 0`.
   - Pass `pausedSince: isPaused ? (liveInstance?.paused_at ?? null) : null`.
   - Extend `StepSlaCell`'s props to accept `pauseSeconds` and `pausedSince` and forward them to `useWorkflowSLA`.

3. No changes to `useWorkflowInstances` — it already does `select('*')`, so `paused_at`, `resumed_at`, `total_pause_seconds`, `paused_reason` are already returned.

## Not changing

- DB trigger — it already writes the right data.
- `useWorkflowSLA`, `workflowSlaResolver`, `useWorkflowSlaInstances` — already correct from the previous fix; the queue/list SLA badges are unaffected.

## Verification

1. Reload the application detail page for `DEMO-ULRA-005`. The current-step SLA badge should now render as **Paused** with the amber "Workflow paused — awaiting applicant" banner.
2. Respond to / close the RFI → trigger sets `resumed_at` and increments `total_pause_seconds` → badge resumes counting from `(original deadline + paused duration)`.
3. Raise a fresh RFI on another application → badge flips to **Paused** within the next 60s tick without a page reload (thanks to the resolver's tick).
