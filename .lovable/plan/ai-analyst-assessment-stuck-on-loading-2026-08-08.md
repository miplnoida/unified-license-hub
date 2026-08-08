# AI Analyst Assessment stuck on "loading"

## What is actually happening

The panel is not loading data — it is showing a permanent in-progress spinner for an assessment that was started and never finished.

Confirmed from the database and logs:

- `application_ai_assessments` currently holds 6 rows with status `pending`, with no error message and no `generated_at`: APP-2026-000096, 000129, 000131, 000132, 000133 and 000135 (the newest created 08 Aug 2026, 08:16).
- The last assessment that actually reached the AI provider was 14 Jul 2026 (gateway request `019f60af-4b7f-7200-a8a2-1617da068b7c`, 13.5s, 3,252 in / 2,420 out tokens). The last `integration_logs` entry for `ai-gateway.application-assessment` is the same date. There is no assessment-sized gateway call after that, so every generation started since 23 Jul died before the provider call completed.
- The panel renders a spinner ("AI assessment is being generated…") whenever the latest row is `pending`, and in that state it hides both **Generate** and **Regenerate**. So a row that never completes leaves the analyst with an infinite spinner and no way to retry — it polls every 5s forever.
- Generation is dispatched from `verify-and-submit` as a nested function invoke kept alive only by `EdgeRuntime.waitUntil`, and the generator itself makes one buffered (non-streaming) provider call. The previous successful runs already took 13–25s with a growing prompt; when the parent isolate is torn down or the call runs past the platform's no-bytes ceiling, the generator dies mid-flight and nothing ever writes a terminal status.

So there are three defects: no terminal state on abnormal termination, no UI recovery path while `pending`, and a fragile buffered dispatch.

## What will be built

### 1. Pending state gets a lifetime (UI)

In `ApplicationAiAssessmentPanel`:
- Treat a `pending` row older than 10 minutes as **stale**: replace the spinner with a clear message ("Generation did not complete") plus a **Retry generation** button.
- Always show **Regenerate** in the header, including while `pending`, so an analyst is never locked out.
- Stop the 5s polling loop after a bounded window instead of polling indefinitely.

### 2. Server always writes a terminal state

In `generate-application-ai-assessment`:
- Mark the pending row `failed` with a precise reason on every early exit path (application not found, provider not configured, unexpected error), not only on provider errors.
- Make the provider call streaming and consume the stream inside the function, so a long generation keeps the connection alive instead of being severed at the platform's buffered-response ceiling.
- Fix the misplaced authorization gate: `requireUserPermission` currently sits inside the `OPTIONS` preflight branch and is dead code. Move it after the preflight return so the permission check actually runs for non-service-role callers (service-role dispatch path unchanged).

### 3. Stale-pending sweep

Add a small reconcile step (invoked by the existing panel read path) that flips `pending` rows older than 10 minutes to `failed` with `error_message = 'Generation did not complete (timed out)'`, so the analyst UI recovers on its own even without a manual click.

### 4. Repair the 6 stuck rows and verify

- Flip the 6 existing stuck rows to `failed` with the timeout reason so the UI stops spinning.
- Re-run generation for APP-2026-000135 and confirm in the gateway logs and `integration_logs` that a request is recorded and the row reaches `completed` with findings.

## Technical notes

- Files: `src/components/applications/ApplicationAiAssessmentPanel.tsx`, `supabase/functions/generate-application-ai-assessment/index.ts`, plus a migration for the stale-pending reconcile function and the one-off repair of existing rows.
- `verify-and-submit` keeps seeding the `pending` row and dispatching via `waitUntil`; reliability now comes from the terminal-state guarantees and the stale sweep rather than from the dispatch surviving.
- No change to workflow, decision gates, or notification behaviour. The assessment stays advisory.

## Verification

- Confirm the 6 stuck applications no longer spin and offer Retry.
- Trigger one real generation and cite the gateway `log_id` plus the `completed` row as evidence.
