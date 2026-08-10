# Fix duplicate rows in Ratios & Trends (supervised entity detail)

## What is actually happening (verified)

`return_calculated_ratios` keeps **every** recomputation of a ratio instead of one row per return + ratio. For FinCorp's 2026-06-30 return there are **10 rows for each of the 13 ratios** (same ratio_key, different `computed_at`, mostly identical values). The entity profile query selects all of them and the Ratios & Trends table renders one row per record, so each ratio appears repeatedly.

The same pattern exists for breaches: `return_threshold_breaches` has 186 rows for only 126 distinct return + metric pairs, so the Breaches list on the same page repeats entries too.

The trend chart is less visibly affected because points are merged by period, but the merged value is whichever record happens to be last in the result set rather than the newest computation.

## Fix (presentation layer only, no data deletion)

1. In the entity historical profile data hook, collapse ratios to the **latest computation per return + ratio key** (highest `computed_at`, falling back to newest row id when timestamps tie). Everything downstream — table, trend chart, ratio detail sheet, CSV export — then works from one authoritative record per ratio per period.
2. Apply the same collapse to the breaches list: keep the most recently detected record per return + metric.
3. Keep the historical records intact in the database; no migration, no deletes. Recomputation history stays available for audit views.

## Verification

Open the supervised entity detail page for FinCorp (2026-06-30 period): the Ratios table should show 13 rows instead of 130, each period should contribute a single point per ratio in the trend chart, the CSV export should contain one line per ratio per period, and the Breaches tab should show no repeated metric for the same return.

## Technical notes

- Change is confined to `useEntityHistoricalProfile` in `src/hooks/usePrudentialSupervision.ts` (dedupe after fetch); `PrudentialEntityProfile.tsx` needs no logic change since it already derives everything from `data.ratios` / `data.breaches`.
