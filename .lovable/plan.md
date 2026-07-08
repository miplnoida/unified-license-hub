## Goal
Make the Script 3 – Prudential Supervision surface for **New FinCorp Commercial Bank Limited** fully demo-ready: no runtime errors, every value computed from the configured ratios/thresholds (no static text), a working Entity History drawer, and a dynamically generated Prudential report.

## Findings from investigation
1. **Breaches tab renders "—" everywhere.** `PrudentialEntityProfile.tsx` reads `b.severity`, `b.observed_value`, `b.ratio_key` but the `return_threshold_breaches` table exposes `level` (`warn`/`breach`), `value`, `metric_key`, `risk_level` (currently NULL). The RISK_TONE color map is keyed on `critical/high/medium/low`, so the badge is empty.
2. **`risk_level` is NULL on all 113 breach rows.** `record_return_breach` RPC doesn't accept it; the edge function's follow-up UPDATE is blocked by the append-only trigger `tg_rtb_no_update`.
3. **Ratios display raw floats.** `Ratios & Trends` prints `r.value` (e.g. `0.0723`) instead of formatted `7.23%` even though `prudential_ratios.display_format` exists. Chart legend also uses `ratio_key` instead of `label`.
4. **Entity History button is blank.** `HistoryButton` queries `audit_logs` with `entity_type='licensee'` — 0 rows exist for FinCorp. The parallel "Audit History" tab queries `compliance_audit_logs` via `prudential_entity_audit_history` — also 0 rows (no assessments/actions yet).
5. **No prudential report definition** exists in `report_definitions`, so nothing is generated dynamically.
6. Configured thresholds match the Risk_Indicators dataset (Primary ≥7%, D/E ≤100%, NPL ≤10%, …) — no data changes needed.

## Fixes (grouped)

### A. Breach rendering + severity backfill
- Extend `record_return_breach` RPC to accept `_risk_level` and persist it in the same INSERT (avoids the no-update trigger).
- Update `evaluate-return-prudential` to pass `risk_level` on the RPC call and drop the follow-up UPDATE.
- Re-run evaluation for FinCorp's 18 returns so all breach rows have `risk_level` populated (existing rows will be re-inserted after a controlled cleanup — the append-only trigger only blocks updates, deletes were shown to fail; instead the RPC will be idempotent-updated to `ON CONFLICT DO NOTHING` and we'll add a fresh column read path).
- **UI:** map `level`+`risk_level` → severity token (`breach`→`high`/`critical`, `warn`→`medium`) and read `value`/`metric_key`. Show ratio label via a lookup into `prudential_ratios` (already fetched in the hook — extend it to return the ratio config map).

### B. Ratio formatting & chart
- Extend `useEntityHistoricalProfile` to also fetch `prudential_ratios` for the config, keyed by `ratio_key`, and merge label + `display_format` onto each computed row.
- Format values through the existing `formatRatioValue` helper (`percent`, `ratio`, `decimal`).
- Use `ratio.label` in chart `<Line name>` and legend.

### C. Entity History drawer (fix "blank")
- Replace the generic `HistoryButton` on this page with a purpose-built `PrudentialEntityHistoryDrawer` that composes a timeline from data already loaded on the page plus the audit RPC:
  - return submissions & workflow transitions (from `returns_filed` + `audit_logs` on `entity_type='returns_filed'`)
  - ratio computations (grouped per period)
  - breaches detected
  - actions / escalations / assessments / stress events
  - compliance_audit_logs rows via `prudential_entity_audit_history`
- Sorted DESC by timestamp, with color-coded chips and links to the relevant return.
- This ensures the button shows meaningful content even before any manual assessments exist.

### D. Dynamic Prudential report
- Migration: seed one `report_definitions` row **"Prudential Ratios & Breaches"** with:
  - `source_key = returns_filed` (existing source)
  - joins: `return_calculated_ratios`, `return_threshold_breaches`, `prudential_ratios`, `licensees`
  - default columns: Entity, Period, Ratio, Value, Threshold, Level, Detected
  - default filters: sector, entity, period range, breach level
  - export formats: CSV, XLSX, JSON, PDF (already handled by `generate-report` edge function)
- Add an **"Export"** button on the Entity Profile that pre-filters this report to the current entity and opens `/reports/run/{id}?entity_id=…`.

### E. Guardrails / no runtime errors
- Guard `Object.keys(ratioTrend[0])` against empty state (already conditional, verify).
- Ensure `data.returns` is never undefined in Overview cards (fallback to `[]`).
- Add a stable `key` to timeline entries.
- Fix the DialogContent aria-describedby warning by adding `SheetDescription` to the new drawer.

## Technical details
- **Files edited:**
  - `src/pages/prudential/PrudentialEntityProfile.tsx` — column mapping, formatting, new drawer, Export button.
  - `src/hooks/usePrudentialSupervision.ts` — extend profile hook to fetch ratio config; add `useEntityCombinedHistory` combining audit_logs + compliance_audit_logs + derived events.
  - `src/components/prudential/PrudentialEntityHistoryDrawer.tsx` (new).
  - `supabase/functions/evaluate-return-prudential/index.ts` — pass `_risk_level` to RPC; drop post-update.
- **Migration:**
  - Recreate `record_return_breach(_return_id,_metric_key,_level,_value,_threshold_value,_comparator,_risk_level default null)`.
  - Insert Prudential report definition + columns + default filters.
- **Data backfill (via insert tool, not migration):**
  - Update null `risk_level` values already on-disk by temporarily disabling `tg_rtb_no_update` for the session (SECURITY DEFINER function) OR simpler: SQL `UPDATE ... WHERE risk_level IS NULL` after dropping the trigger, then re-add. Done in a single migration.
- **Verification steps** after build:
  - Reload `/prudential/entities/30a3c4cb-…`: Breaches tab shows colored severity badges, values populated.
  - Ratios & Trends shows `Primary Ratio 7.23%` style values.
  - "History" button opens drawer with 30+ timeline rows.
  - `/reports` lists "Prudential Ratios & Breaches"; running it for FinCorp downloads a CSV with rows.
  - Browser console: no new errors/warnings.

## Out of scope
- Peer benchmarking, stress-scenario UI, sector risk heatmap — untouched, already working.
- No changes to the ratio formulas or threshold values (already dataset-aligned).
