## Fix 1 — Ratios & Trends: Year/Quarter filter

File: `src/pages/prudential/PrudentialEntityProfile.tsx` (Ratios tab only)

- Derive `{ year, quarter }` for each point in `ratioTrend` from `period_end_date` (Q = `floor((month-1)/3)+1`). Keep `period` label as-is.
- Add two `Select` dropdowns above the ratio chip bar: **Year** and **Quarter**, each with "All" plus values discovered from the data. Default: latest year, "All" quarters (mirrors the Breaches tab pattern).
- Filter both:
  - the chart data (`ratioTrend` → `filteredTrend`), and
  - the ratio table below the chart (already lists all rows) — apply the same year/quarter filter so the two views stay in sync.
- Empty-state text updates when the filter yields no rows: "No ratios for selected period."
- No changes to the drill-down drawer, chip selector, colours, or table columns.

## Fix 2 — Stress Indicators duplicated

DB check confirmed: `prudential_stress_indicators` has 13 label/metric_key pairs each present twice (seed re-ran). The admin list simply shows the table, so the fix is data-level.

- Add a migration under `supabase/migrations/` that:
  1. Deletes duplicate rows keeping the earliest by `created_at` (fallback `id`) per `(metric_key, direction, threshold_value)`:
     ```sql
     DELETE FROM public.prudential_stress_indicators a
     USING public.prudential_stress_indicators b
     WHERE a.ctid <> b.ctid
       AND a.metric_key = b.metric_key
       AND a.direction = b.direction
       AND a.threshold_value IS NOT DISTINCT FROM b.threshold_value
       AND (a.created_at, a.id) > (b.created_at, b.id);
     ```
  2. Adds a unique index to prevent recurrence:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS prudential_stress_indicators_unique_rule
       ON public.prudential_stress_indicators (metric_key, direction, threshold_value);
     ```
- No frontend changes needed for this — after dedupe the admin list will render once per indicator, and any stress-event FK rows continue to reference whichever row survives (no FK changes required; if a FK exists to a removed row we'll widen the migration to reassign first — will verify during build).

## Out of scope

- No changes to Overview, Breaches, Peer Comparison, Assessments tabs.
- No changes to sweep logic, thresholds, or ratios config.
