## Root cause

The DB trigger `rfi_pause_sla` (migration `20260703140636…sql`) writes `paused_at` / `resumed_at` / `total_pause_seconds` on `workflow_instances` when an RFI is opened / responded / closed. It does **not** change `workflow_instances.status`.

But the SLA panel decides "paused" from `wi.status === 'paused'` and never subtracts pause time:

- `src/lib/workflowSlaResolver.ts:142` — `const paused = wi.status === 'paused';`
- `src/hooks/useWorkflowSlaInstances.ts:54` — `SELECT` list doesn't include `paused_at`, `resumed_at`, or `total_pause_seconds`.
- `src/hooks/useWorkflowSLA.ts` — `elapsedHours = now − startedAt`; no `pauseSeconds` subtracted.

So the trigger fires correctly, but the UI never reads what it wrote → the timer keeps ticking through the RFI window and never adds the paused hours back on resume.

## Fixes (frontend only — DB trigger already writes the right data)

### 1. Fetch pause columns — `src/hooks/useWorkflowSlaInstances.ts`
Extend the `SELECT` constant to include `paused_at, resumed_at, total_pause_seconds, paused_reason`.

### 2. Extend row type — `src/lib/workflowSlaResolver.ts`
Add `paused_at?: string | null`, `resumed_at?: string | null`, `total_pause_seconds?: number | null`, `paused_reason?: string | null` on `WorkflowInstanceRow`.

### 3. Compute paused + pauseSeconds from the row — `src/lib/workflowSlaResolver.ts` (`resolveSlaInputFromInstance`)
- `paused = wi.status === 'paused' || (!!wi.paused_at && !wi.resumed_at)`.
- Pass a new `pauseSeconds` value to the SLA input:
  - `base = wi.total_pause_seconds ?? 0`
  - if currently paused, add `(now − paused_at)` at render time (handled in `computeWorkflowSLA`, so the resolver only needs to pass the persisted base + `pausedSince`).
- Pass `pausedSince: wi.paused_at ?? null` so the tick loop advances the live pause window.

### 4. Subtract pause time from the clock — `src/hooks/useWorkflowSLA.ts`
Extend `UseWorkflowSLAInput` with:
- `pauseSeconds?: number` — accumulated paused seconds (`total_pause_seconds`).
- `pausedSince?: string | null` — start of the current pause window; adds `(now − pausedSince)` to the effective pause when set.

Then in `computeWorkflowSLA`:
- `effectivePauseMs = (pauseSeconds ?? 0) * 1000 + (pausedSince ? max(0, now − pausedSince) : 0)`.
- Shift the deadline forward: `deadlineMs = startMs + slaHours*HOUR_MS + effectivePauseMs`.
- Elapsed: `elapsedHours = max(0, (now − startMs − effectivePauseMs) / HOUR_MS)`.
- `remainingHours` derived from the shifted deadline.
- `label` still uses `'Paused'` when `paused`.
- Re-include `pauseSeconds` and `pausedSince` in the memo/effect deps so the reactive hook recomputes.

### 5. Backfill existing rows — one-off DB update (via `supabase--insert`)
The trigger only pauses when INSERT/UPDATE fires. For any application with an already-open RFI whose `workflow_instances.paused_at` is NULL, set `paused_at = the RFI's raised_at` so the panel reflects state immediately. Idempotent, service-role only.

## Not changing

- DB trigger `rfi_pause_sla` — already correct.
- `RaiseRfiDialog` / `ApplicationRfiTab` client-side updates to `approval_step_actions.paused_at` — kept as a secondary primitive.
- `notification_event_configs` / notification wiring — unrelated.
- SLA escalation sweeps — they'll naturally honour the shifted deadline once #4 is in.

## Verification

1. Open an application under review with an active workflow. Note the SLA countdown.
2. Raise an RFI. The `workflow_instances.paused_at` gets set (DB trigger).
   - **Expected:** SLA badge changes to **Paused**, countdown freezes.
3. Wait a few minutes, then respond to all RFI items (or close the RFI). The trigger writes `resumed_at`, increases `total_pause_seconds`, clears `paused_at`.
   - **Expected:** SLA badge un-pauses; remaining hours are approximately the same as at step 2 (the pause window is added back).
4. Repeat with a second RFI on the same application to confirm `total_pause_seconds` accumulates.
5. Existing paused RFIs — after the backfill, their applications' SLA badges immediately show **Paused** without any user action.
