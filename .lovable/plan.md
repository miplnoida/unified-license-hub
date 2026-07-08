
## Why the screen shows 0 records

`prudential_stress_indicators` is currently empty (verified: `SELECT count(*)` = 0). RLS is fine — the read policy is `USING (true)` for authenticated users. The table simply has no seed data, so there's nothing to display or evaluate against.

Ratios and thresholds are already configured (13 DTI ratios in `prudential_ratios`, matching thresholds in `prudential_thresholds`), but stress indicators are a separate, standalone table used by the stress-event flow, and they were never populated.

## Plan

Seed one migration that inserts stress indicators mirroring the 13 DTI ratios used by FinCorp so:
- The `/prudential/stress-indicators` list is populated.
- The Stress Events feature in the entity profile has something to evaluate against when running "Evaluate stress" on submitted returns.

### Indicators to seed (all `is_active = true`, `sector_id` scoped to Deposit-taking Institutions)

Each row uses the `metric_key` matching the corresponding ratio key so the stress evaluator can map return-computed values to indicators.

| metric_key | label | direction | threshold | severity |
|---|---|---|---|---|
| primary_ratio | Primary Ratio below minimum | lt | 0.10 | critical |
| debt_to_equity | Debt-to-Equity above limit | gt | 2.00 | high |
| npl_ratio | Non-performing Loans elevated | gt | 0.10 | high |
| pdl_ratio | Past Due Loans elevated | gt | 0.05 | medium |
| provisions_to_npls | Provisions coverage insufficient | lt | 0.70 | high |
| roa | Return on Assets weak | lt | 0.01 | medium |
| roe | Return on Equity weak | lt | 0.08 | medium |
| profit_margin | Profit margin compressed | lt | 0.05 | medium |
| net_interest_margin | Net Interest Margin weak | lt | 0.03 | medium |
| efficiency_ratio | Efficiency Ratio deteriorating | gt | 0.70 | medium |
| leverage_ratio | Leverage ratio elevated | gt | 15.00 | high |
| asset_turnover | Asset Turnover low | lt | 0.05 | low |
| liquid_assets_ratio | Liquid Assets below minimum | lt | 0.20 | critical |

All 13 indicators use `notify_roles = []`, `escalate = false` (severity drives urgency), and are linked to the Deposit-taking Institutions sector so DTI licensees like FinCorp evaluate against them.

### Migration steps
1. Look up the DTI `sector_id` and use it for every insert (fallback: NULL/global if not found).
2. `INSERT ... ON CONFLICT DO NOTHING` on `(metric_key, sector_id)` (or plain insert if no such unique index exists — the migration will handle both by checking `NOT EXISTS`).
3. No schema changes, no RLS changes.

### Verification after apply
- `/prudential/stress-indicators` shows 13 rows.
- On FinCorp entity profile → Returns tab → click "Evaluate stress" on a submitted return; Stress Events tab now populates with any triggered indicators.

### Out of scope
- Threshold tuning against the Script 3 dataset (values above are conservative demo defaults derived from the same bands used in `prudential_thresholds`).
- Changes to how the stress evaluator function works.
- Any UI change to the Stress Indicators page.
