# Monitoring sweep — how it works, and why it returns 0

## How the "Run monitoring sweep now" button works

1. **Trigger** — Dashboard button calls edge function `prudential-monitoring-sweep` (also invoked daily by pg_cron).
2. **Feed log opened** — inserts a `prudential_data_feed_logs` row with `feed_type = 'scheduled_sweep'`, `status = 'started'`, records `triggered_by = auth.uid()` when a UI token is present.
3. **Entity list** — reads all `licensees` (up to 2000). Optional `entity_id` in the body restricts to a single tenant.
4. **Per entity → latest return** — for each licensee, picks the newest `returns_filed` row whose `workflow_status` is a "submitted/reviewed" state, ordered by `submit_date` then `period_end_date`.
5. **Delegate evaluation** — invokes `evaluate-return-prudential` for that return with `context: 'scheduled_sweep'` and `dispatch_notifications: true`. That single-return evaluator is the same one that runs at submission time and handles: server-side validation rules → ratio recompute (`record_return_ratio`) → threshold breach detection (`record_return_breach`) → stress indicator evaluation → notifications → auto-escalation. All writes are idempotent — reruns dedupe on natural keys.
6. **Risk score recompute** — after all entities are processed, invokes `risk-score-recompute` once per touched entity.
7. **Feed log closed** — updates the log row to `status = 'success'`, `row_count = returns_evaluated`, and stores `{entities_scanned, returns_evaluated, failed, errors[]}` in `metadata`. Per-entity failures never abort the batch — they're counted; only a top-level crash sets `status = 'failed'`.

## Why it currently returns `0 return(s) re-evaluated`

The latest-return query filters `workflow_status IN ('VAL','SUBMITTED','APPROVED','REVIEWED')`, but the `return_workflow_status` enum only has these values: `TEMP, WIP, SUB, VAL, TBR, REJ`. The literals `SUBMITTED`, `APPROVED`, `REVIEWED` don't exist in the enum, so PostgREST fails the `.in()` check for every entity and the client returns empty — silently, so `summary.failed` stays 0 while `returns_evaluated` stays 0. The most recent three feed log rows confirm: `entities_scanned: 16, returns_evaluated: 0, failed: 0, errors: []`.

Meanwhile the database currently holds 19 returns in `VAL`, 3 in `SUB` — plenty to sweep.

## Fix

Update the enum list in `supabase/functions/prudential-monitoring-sweep/index.ts` (line 91) to match the real enum:

```ts
.in("workflow_status", ["VAL", "SUB", "TBR"])
```

Rationale:
- `VAL` — validated / approved terminal state on the licensee side (already the main "submitted-and-passed" state seeded in the DB).
- `SUB` — submitted, awaiting review — should also be swept so evaluation happens even before approval.
- `TBR` — to-be-reviewed / resubmission — same reasoning as SUB.
- Exclude `TEMP`, `WIP` (drafts) and `REJ` (rejected).

Then redeploy the function. Click **Run sweep now** again — the feed log should show `entities_scanned: 16, returns_evaluated ≈ 16, failed: 0` (one per entity that has at least one non-draft return), and new ratio / breach / stress-event rows will appear on the FinCorp profile as expected.

## Files touched

- `supabase/functions/prudential-monitoring-sweep/index.ts` — one-line change to the workflow-status filter.

No schema changes, no frontend changes, no migrations.
