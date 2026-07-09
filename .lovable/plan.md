## Verification Result

DB has 299 rows in `return_calculated_ratios` covering all 13 active ratios × 23 rows each — data IS there. The page renders "No data" because `PrudentialAnalytics.tsx` queries use invalid column and relationship references.

### Bugs found in `src/pages/returns-mgmt/PrudentialAnalytics.tsx`

1. `returns_filed!inner(licensee_id, licensees!inner(...))` — fails because:
   - `return_calculated_ratios.return_id` has NO foreign key to `returns_filed`, so PostgREST cannot embed it.
   - `returns_filed` has no `licensee_id` column — it is `entity_id` (FK → `licensees.id`).
2. `returns_filed.period_end` — the actual column is `period_end_date`.

Both licensee and period dropdowns therefore return `[]`, and the trend chart never gets data.

## Fix Plan

### A. Edit `src/pages/returns-mgmt/PrudentialAnalytics.tsx`

Replace the three hooks with two-step queries that don't rely on the missing FK:

- **`useLicenseesForRatio`**: 
  1. `select('return_id').eq('ratio_key', ratioKey)` from `return_calculated_ratios`.
  2. `select('entity_id').in('id', returnIds)` from `returns_filed`.
  3. `select('id, legal_name').in('id', entityIds)` from `licensees`.
- **`usePeriodEndsForRatio`**: same first step, then `select('period_end_date').in('id', returnIds)`; dedupe + sort desc.
- **`useRatioTrend`**: fetch matching `return_calculated_ratios` rows for `ratioKey`, then fetch `returns_filed(id, entity_id, period_end_date)` for those return_ids filtered to the selected licensee (`entity_id = licenseeId`); map to `{ period: period_end_date, value }`.

No other files change. Peer snapshot RPC (`peer_ratio_snapshot`) already works and stays as-is.

### B. Optional hardening (same file only)

Add graceful empty states already present; no schema/RLS change required.

## Manual Verification Steps (after fix)

1. Go to `/admin/returns/prudential/analytics`.
2. **Ratio dropdown** should list 13 ratios (Primary Ratio, ROA, ROE, NPL Ratio, Liquid Assets Ratio, etc.). Auto-selects the first (Asset Turnover).
3. **Licensee dropdown** should populate with entities that have computed ratios — "FinCorp Commercial Bank Limited" should appear. Auto-selects one.
4. **Period end dropdown** should list all `period_end_date` values (2022 Q1 … 2025 Q4) sorted newest first.
5. **Trend card**: line chart renders across quarters for the selected licensee/ratio.
6. Switch ratio → Licensee/Period lists refresh; Trend re-plots.
7. Change Period → Peer Comparison card shows `Min / Median / P90 / Max` with a non-zero `count` in the title.
8. Pick a ratio with fewer submissions (e.g., filter by a licensee with only 2022 data) → chart shows only those points, peer card shows correct peer count.
9. Cross-check one point manually: open `/admin/returns/queue`, find the same licensee's return for that period, confirm the ratio value on the return matches the point plotted.

### DB spot-check queries (optional, for reviewer)

```sql
-- Row counts per ratio
SELECT ratio_key, count(*) FROM return_calculated_ratios GROUP BY ratio_key;
-- Trend rows for FinCorp / ROE
SELECT rf.period_end_date, rcr.value
FROM return_calculated_ratios rcr
JOIN returns_filed rf ON rf.id = rcr.return_id
JOIN licensees l ON l.id = rf.entity_id
WHERE rcr.ratio_key='roe' AND l.legal_name ILIKE 'FinCorp%'
ORDER BY rf.period_end_date;
```