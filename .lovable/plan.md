# Prudential Dashboard — Scheduled + Confirmed Sweeps

Scope is limited to the two buttons on `/prudential/dashboard`: **Run Monitoring Sweep** and **Sweep Overdue Actions**. No existing business logic changes.

## 1. Daily 12:00 AM scheduler (server-side)

Enable `pg_cron` + `pg_net` and install two cron jobs (via `supabase--insert`, per scheduled-jobs guidance, so the anon key and function URL aren't stored in shared migrations):

- `prudential-monitoring-sweep-daily` → `0 0 * * *` → POST `prudential-monitoring-sweep` with body `{ "trigger": "scheduled" }`.
- `overdue-action-sweep-daily` → `0 0 * * *` → POST `overdue-action-sweep` with body `{ "trigger": "scheduled" }`.

Timezone: `pg_cron` runs in the DB's configured TZ; we'll set the job schedule using `cron.schedule` and rely on the project TZ already in use for the dashboard.

## 2. Execution logging (both functions)

Both edge functions already write to `prudential_data_feed_logs` (monitoring sweep) — extend so overdue sweep writes there too, and both capture:

- `source`, `feed_type`, `started_at`, `completed_at`, `status` (success/failed), `row_count` (records processed), `metadata.trigger` (`scheduled` | `manual`), `triggered_by` (user id if manual).

Duplicate-run guard: before starting, both functions check for an existing row with `status='started'` in the last 15 min and short-circuit with `{ ok: true, skipped: true, reason: 'already_running' }`.

`overdue-action-sweep/index.ts` gets a small addition: insert a `started` feed log row at entry, update to `success`/`failed` at exit with `row_count = marked_overdue`, `metadata = { trigger, scanned, alerts_created }`. No changes to overdue-marking logic.

`prudential-monitoring-sweep/index.ts` already logs; just read `trigger` from body and store in metadata.

## 3. Confirmation dialogs (frontend only)

Replace the two existing buttons in `src/pages/prudential/PrudentialDashboard.tsx` with wrappers that open an AlertDialog (shadcn) matching the exact copy in the spec:

- **Run Monitoring Sweep** — title, bulleted actions list, "Automatic Schedule: Daily at 12:00 AM", Cancel / Run buttons. On completion toast: `Monitoring Sweep completed successfully. Returns evaluated: X Failed: Y`.
- **Sweep Overdue Actions** — title "Check Overdue Actions?", bulleted list, schedule note, Cancel / Check Now. On completion toast: `Overdue Action Check completed. X actions marked as overdue.` or `No overdue actions were found.` when `marked_overdue === 0`.

Existing manual invocation paths and query invalidation are preserved.

## 4. Schedule info panel

Below the header buttons add a small three-column card row (no layout shift to the metric grid):

- **Last Monitoring Sweep** — latest `prudential_data_feed_logs` where `source='prudential-monitoring-sweep'` and `status IN ('success','failed')`, formatted date/time.
- **Last Overdue Check** — same query for `source='overdue-action-sweep'`.
- **Next Automatic Run** — computed client-side as next 12:00 AM.

New hook `useSweepSchedule()` in `src/hooks/usePrudentialSupervision.ts` returns both `last_*` timestamps from `prudential_data_feed_logs`.

## Technical details

### Files touched
- `supabase/functions/overdue-action-sweep/index.ts` — add feed-log write + duplicate-run guard + read `trigger` from body. No change to overdue detection logic.
- `supabase/functions/prudential-monitoring-sweep/index.ts` — read `trigger` from body into metadata + duplicate-run guard. No change to evaluation chain.
- `src/pages/prudential/PrudentialDashboard.tsx` — add two AlertDialog wrappers, schedule info card, replace toast strings with spec wording.
- `src/hooks/usePrudentialSupervision.ts` — add `useSweepSchedule()` hook.
- `supabase--insert` call (not a migration) — enable `pg_cron`/`pg_net` and register the two daily cron jobs.

### Non-goals
- No change to `prudential-monitoring-sweep` evaluation logic, ratio calc, breach detection, stress evaluation, or risk-score recompute.
- No change to `overdue-action-sweep` overdue detection or alert-creation logic.
- No change to permissions, RLS, audit logs, notification templates, or reports.
- No change to the existing metric grid or dashboard cards below the header.
