# Ratios & Trends — show all ratios in the chart + drill-down on click

## Problems

1. In `src/pages/prudential/PrudentialEntityProfile.tsx` (line 264) the trend chart hard-caps at the first 6 ratio keys via `.slice(0, 6)`, while the table below lists all configured ratios — so the graph misses most of them.
2. The `<LineChart>` has no click handler, so users can't drill into a specific data point.

## Fix (frontend only, admin/prudential module)

Edit `src/pages/prudential/PrudentialEntityProfile.tsx` `TabsContent value="ratios"` block:

1. **Show all ratios, user-controlled**
   - Compute `allRatioKeys` from `ratioTrend[0]` (excluding `period`).
   - Add a compact multi-select chip bar above the chart: one toggle chip per ratio, using existing `ratioLabels[k].label`. Default state: all keys selected.
   - Render one `<Line>` per selected key. Extend the colour palette to a 13-colour list (matching the seeded ratio count) generated from HSL so it scales; fall back to modulo for overflow.
   - Wrap the legend in a scrollable container (`flex-wrap`, small font) so it stays readable with many series.

2. **Click-through on data points**
   - Give each `<Line>` a visible `dot` and an `activeDot` with `onClick`.
   - On click, capture `{ period, ratioKey, value }` and open a right-hand drawer (`Sheet` from `@/components/ui/sheet`, already used in the file for history).
   - Drawer content:
     - Ratio label + metric key + display format.
     - Period, computed value (formatted).
     - Configured threshold(s) for that ratio pulled from `data.thresholds` (already loaded by `usePrudentialEntityData`) — show comparator, warn, breach, and the pass/fail status vs the clicked value.
     - Source return: look up in `data.returns` by matching `period_end` → link "Open return" to `/admin/returns/queue/<return_id>` (reuse existing route pattern used in Breaches tab).
     - Any breach row from `data.breaches` that matches `metric_key + period` — surface severity + link "View breach".
   - Also make the table rows in the card below the chart clickable (same drawer, prefilled from that row).

3. **Keep the ratio table** as today (already shows all rows via `.slice(0,100)`); just add row-level `onClick` and cursor styling.

## Files touched

- `src/pages/prudential/PrudentialEntityProfile.tsx` — chart series list, ratio chip selector, click handler, drawer component (inline or small child component in the same file for locality).

No backend or schema changes; all needed data (`data.ratios`, `data.thresholds`, `data.breaches`, `data.returns`) is already fetched by `usePrudentialEntityData`.

## Out of scope

- No changes to Peer Comparison, Breaches, Assessments tabs.
- No changes to admin/licensee sides — this affects only the Prudential entity profile.
