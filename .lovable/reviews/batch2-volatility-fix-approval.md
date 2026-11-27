# Batch 2 — read functions marked STABLE that create temp tables (approval pack, NOT EXECUTED)

## Finding (live, 2026-11-27)
PostgreSQL refuses `CREATE TEMP TABLE` inside a function declared STABLE/IMMUTABLE. The error is `0A000 CREATE TABLE is not allowed in a non-volatile function`. A catalogue scan of public plpgsql functions found exactly three:

| Function | Volatility | Seen in browser |
|---|---|---|
| `correspondence_thread_feed(jsonb,integer,integer)` | STABLE | Application → Communications tab returns 400. The tab cannot list threads (APP-2026-002019). |
| `entity360_timeline(uuid,text[],timestamptz,timestamptz,integer,integer)` | STABLE | Entity 360 → Regulatory history returns 400 three times. The page still renders events from its other source, so it may be incomplete. |
| `fp_regulator_positions(uuid)` | STABLE | Not reached in this sweep (F&P regulator positions). |

## Proposed change
```sql
ALTER FUNCTION public.correspondence_thread_feed(jsonb, integer, integer) VOLATILE;
ALTER FUNCTION public.entity360_timeline(uuid, text[], timestamp with time zone, timestamp with time zone, integer, integer) VOLATILE;
ALTER FUNCTION public.fp_regulator_positions(uuid) VOLATILE;
```
## Rollback
```sql
ALTER FUNCTION public.correspondence_thread_feed(jsonb, integer, integer) STABLE;
ALTER FUNCTION public.entity360_timeline(uuid, text[], timestamp with time zone, timestamp with time zone, integer, integer) STABLE;
ALTER FUNCTION public.fp_regulator_positions(uuid) STABLE;
```
## Impact
- Only the volatility marker changes. Body, SECURITY DEFINER, owner, search_path, grants and results stay the same, and no data changes.
- PostgREST runs VOLATILE functions in a read-write transaction. They still only read data, apart from the session temp table they already create.
- Not in the AML/CFT boundary. No permission or RLS change.

## Verification after approval
Re-read `provolatile` as `v` for all three. Then, in the browser, open the Communications tab on APP-2026-002019 and Entity 360 → Regulatory history on Meridian Commercial Bank. Expect 200 responses, and compare the timeline event count before and after.
