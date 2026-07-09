## Context

`return_calculated_ratios` has no `entity_id` column — it links to a licensee only through `returns_filed.entity_id`. Today all 299 ratio rows (13 keys × 23 quarters) belong to a single entity: **New FinCorp Commercial Bank Limited**. That's why the Prudential Analytics Licensee dropdown only ever shows one option per ratio.

To "link licensees to all ratios" for verification, we need additional entities that have submitted returns with computed ratios across a comparable time series.

## Plan

Seed demo prudential data for **2 additional Commercial Bank licensees** so the trend chart, licensee dropdown, and peer comparison can be exercised end-to-end.

### 1. Pick target licensees (data-only, no schema change)

- `Anisha Commercial Bank` (already Commercial Bank sector, 1 return)
- `David Pierce Jones` (Commercial Bank sector, 0 returns)

Both share FinCorp's sector, so the same 13 ratio keys apply.

### 2. Create `returns_filed` shells per licensee × quarter

For each target licensee, insert one `returns_filed` row per period that FinCorp has (2022 Q1 → 2025 Q3 = 15 quarters, skipping the last 8 where FinCorp is unsubmitted, to keep it realistic). Fields:

- `entity_id` = target licensee
- `form_id`, `return_config_id` = same Balance Sheet / P&L config used by FinCorp
- `period_start_date`, `period_end_date`, `financial_year`, `quarter` = matching FinCorp period
- `workflow_status = 'VAL'`, `submitted_at`, `validated_at` = backdated
- `created_by` = system user

### 3. Copy + perturb `return_calculated_ratios`

For each new `returns_filed` row, insert 13 ratio rows mirroring FinCorp's ratio_key/label/formula_snapshot for the matching quarter, with `value` scaled by a deterministic per-licensee factor (e.g. ×0.92 for Anisha, ×1.07 for Pierce Jones) so the trend chart shows visibly different lines and peer comparison ranks all three entities.

### 4. Verify

- `SELECT ratio_key, COUNT(DISTINCT rf.entity_id) FROM return_calculated_ratios r JOIN returns_filed rf ON rf.id=r.return_id GROUP BY 1;` → expect 3 for every key.
- In `/admin/returns/prudential/analytics`: pick any ratio → Licensee dropdown lists all 3 → selecting each renders a distinct trend line → peer comparison table shows 3 rows.

## Not in scope

- No changes to schema, RLS, edge functions, or UI.
- No changes to FinCorp's existing ratios or returns.
- No breach / action generation for the new entities (can be added on request if you also want to verify escalation flows for peers).

## Technical notes

- All writes are data-only via a single migration (INSERT into `returns_filed` then `return_calculated_ratios`). The `tg_rcr_no_update` trigger only blocks UPDATE/DELETE on ratios — INSERT is permitted.
- Deterministic scaling keeps values reproducible; no randomness.
