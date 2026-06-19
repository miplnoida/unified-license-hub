# Fix: completed workflow shows "No active workflow instance"

## Root cause

For `APP-2026-000079` (and any approved/rejected/cancelled application), the `workflow_instances` row exists but its `status` is `completed`. In `src/components/applications/WorkflowPanel.tsx`:

```ts
const activeInstance = instances.find(i => i.status === 'active');
const pausedInstance = instances.find(i => i.status === 'paused');
const liveInstance   = activeInstance || pausedInstance;   // null for completed
...
if (!liveInstance) {
  ...
  return <Card>… No active workflow instance found for this {entityNoun}. …</Card>;
}
```

`completed` and `cancelled` instances are never considered, so the panel renders the generic empty state instead of the read-only step timeline. SLA progress, prior approver activity, and the final outcome all disappear from view once the workflow ends. This affects every entity whose workflow has finished, not just Commercial Bank.

The earlier suspicion that the RPC marked Step 1 as final was investigated and is **out of scope** — it's a one-off data anomaly on this specific application (an `approve_final` action got recorded while the step ordering was different from today). Per user direction, we do not touch that data or the server-side workflow engine.

## Fix (frontend only, `src/components/applications/WorkflowPanel.tsx`)

Scope: presentation only. No changes to edge functions, RPCs, other workflow types (registration, returns), or any data.

1. Recognize terminal instances alongside live ones:
   - `const terminalInstance = instances.find(i => i.status === 'completed' || i.status === 'cancelled');`
   - `const liveInstance = activeInstance || pausedInstance || terminalInstance;`
   - Derive `isTerminal = !activeInstance && !pausedInstance && !!terminalInstance` and `terminalKind = terminalInstance?.status` (`'completed' | 'cancelled' | undefined`).

2. Suppress action UI when `isTerminal`:
   - Skip `useCanActOnStep` (pass `undefined` so no RPC fires) and force `noWorkflowActions = true` so the existing render path produces no remarks textarea / action buttons.
   - In `stepStatuses`, when `isTerminal` mark the resolved current step as `completed` (or `returned` if the last decisive action on it was `send_back`) instead of `current`, so the accordion shows the correct final state for every step.
   - In the header, when `isTerminal` show `Level {steps.length} of {steps.length}` and replace the "Paused" badge with `Completed` / `Cancelled`.

3. Replace the misleading early return:
   - Keep the "Workflow has not started yet" branch only when `instances.length === 0` AND the entity is still in a pre/just-submitted status.
   - Otherwise (including when only a terminal instance exists) fall through to the existing accordion timeline — `renderStepHistory` already handles `completed` / `returned` rows read-only.
   - Add a single banner at the top of the card body when `isTerminal`:
     - `completed` → success tone: "Workflow completed on {ended_at|updated_at}. Final outcome: {applicationStatus}."
     - `cancelled` → muted tone: "Workflow cancelled on {ended_at|updated_at}."

4. SLA indicators:
   - Only render the live `StepSlaBadge` / `SlaProgressPanel` for steps whose computed status is still `current` or `paused`. Because step 2 marks the final step as `completed` when terminal, no live SLA timers render once the workflow ends. Per-step history (decisive action timestamps) remains visible via `renderStepHistory`.

## Out of scope

- No changes to `useWorkflowEngine`, `useWorkflowInstances`, `perform_workflow_transition`, `perform_final_workflow_approval`, or any edge function.
- No data fix for `APP-2026-000079` — it stays approved + provisioned as it is today.
- Registration and return workflow panels are not touched (separate components).
- No new server-side guard against reordering steps under a running instance.

## Verification

- `/applications/018a72cc-d46b-41ea-ba9a-6d0ac262ffa7`: panel renders the full Commercial Bank timeline with steps marked Completed, a green "Workflow completed" banner, no action buttons, and no "No active workflow instance" message.
- A still-pending application: behavior unchanged — current step actionable, SLA badges live.
- An application that was never submitted: still shows "Workflow has not started yet".
- A rejected/cancelled application: shows the timeline plus the appropriate terminal banner.
