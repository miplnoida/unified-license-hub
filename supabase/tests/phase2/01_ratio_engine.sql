-- Phase 2 / PRU-ANA-001 — ratio engine behaviour, result states, provenance
--
-- Deterministic fixtures: Tier 1 capital 250 / RWA 2000 * 100 = 12.5 (percent).
-- Every expected number below is derived by hand in the assertion message.

BEGIN;
SELECT plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sector uuid := '00000000-0000-0000-0000-0000000a2001';
  v_type   uuid := '00000000-0000-0000-0000-0000000a2002';
  v_cfg    uuid := '00000000-0000-0000-0000-0000000a2003';
  v_lic    uuid := '00000000-0000-0000-0000-0000000a2004';
  v_ret    uuid := '00000000-0000-0000-0000-0000000a2005';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sector, 'P2 Ratio Sector')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_types (id, name, code) VALUES (v_type, 'P2 Prudential', 'P2PRU')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_configs (id, name, return_type_id, sector_id)
    VALUES (v_cfg, 'P2 Quarterly Prudential', v_type, v_sector)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_lic, 'P2 Ratio Bank', v_sector)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;
  INSERT INTO public.returns_filed
    (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status)
  VALUES (v_ret, v_cfg, v_lic, v_sector, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
    ON CONFLICT (id) DO NOTHING;
END$$;

-- ---------------------------------------------------------------------------
-- Result-state derivation (pure function contract)
-- ---------------------------------------------------------------------------
SELECT has_function('public', 'derive_ratio_result_state', 'derive_ratio_result_state exists');

SELECT is(public.derive_ratio_result_state(12.5, NULL), 'CALCULATED',
          'a computed value yields CALCULATED');
SELECT is(public.derive_ratio_result_state(NULL, 'missing_input'), 'INSUFFICIENT_DATA',
          'missing source input yields INSUFFICIENT_DATA');
SELECT is(public.derive_ratio_result_state(NULL, 'missing_ratio_dependency'), 'INSUFFICIENT_DATA',
          'missing dependent ratio yields INSUFFICIENT_DATA');
SELECT is(public.derive_ratio_result_state(NULL, 'not_configured'), 'NOT_CONFIGURED',
          'absent configuration yields NOT_CONFIGURED');
SELECT is(public.derive_ratio_result_state(NULL, 'no_ratio_config'), 'NOT_CONFIGURED',
          'no ratio config yields NOT_CONFIGURED');
SELECT is(public.derive_ratio_result_state(NULL, 'division_by_zero'), 'CALCULATION_ERROR',
          'zero denominator yields CALCULATION_ERROR, never a valid 0');
SELECT is(public.derive_ratio_result_state(NULL, 'computation_error'), 'CALCULATION_ERROR',
          'computation failure yields CALCULATION_ERROR');
SELECT is(public.derive_ratio_result_state(NULL, 'non_numeric'), 'CALCULATION_ERROR',
          'non numeric result yields CALCULATION_ERROR');
SELECT is(public.derive_ratio_result_state(NULL, NULL), 'INSUFFICIENT_DATA',
          'null value without a reason degrades to INSUFFICIENT_DATA, not CALCULATED');

-- ---------------------------------------------------------------------------
-- Persistence path: record_return_ratio must persist provenance at insert time
-- (return_calculated_ratios is append-only, so a follow-up UPDATE is rejected).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _p2_ratio_ids(kind text, id uuid);

DO $$
DECLARE v_ret uuid := '00000000-0000-0000-0000-0000000a2005'; v uuid;
BEGIN
  -- 250 / 2000 * 100 = 12.5
  v := public.record_return_ratio(v_ret, 'car', 'Capital adequacy ratio', 12.5, 'percent',
                                  NULL, NULL, 3, '(cap.tier1 / cap.rwa) * 100');
  INSERT INTO _p2_ratio_ids VALUES ('ok', v);

  v := public.record_return_ratio(v_ret, 'npl_ratio', 'NPL ratio', NULL, 'percent',
                                  NULL, 'division_by_zero', 1, '(loans.npl / loans.gross) * 100');
  INSERT INTO _p2_ratio_ids VALUES ('div0', v);

  v := public.record_return_ratio(v_ret, 'lcr', 'Liquidity coverage ratio', NULL, 'percent',
                                  NULL, 'missing_input', 1, '(liq.hqla / liq.outflows) * 100');
  INSERT INTO _p2_ratio_ids VALUES ('missing', v);

  v := public.record_return_ratio(v_ret, 'lev', 'Leverage ratio', NULL, 'percent',
                                  NULL, 'not_configured', 1, '');
  INSERT INTO _p2_ratio_ids VALUES ('notcfg', v);

  v := public.record_return_ratio(v_ret, 'roa', 'Return on assets', NULL, 'percent');
  INSERT INTO _p2_ratio_ids VALUES ('noreason', v);
END$$;

SELECT is((SELECT value FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='ok')),
          12.5::numeric, 'car persists the hand-derived 250/2000*100 = 12.5');
SELECT is((SELECT result_state FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='ok')),
          'CALCULATED', 'a persisted value is CALCULATED');
SELECT is((SELECT ratio_version FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='ok')),
          3, 'ratio version provenance is retained on the row');
SELECT is((SELECT formula_snapshot FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='ok')),
          '(cap.tier1 / cap.rwa) * 100', 'formula snapshot provenance is retained on the row');
SELECT is((SELECT return_config_id FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='ok')),
          '00000000-0000-0000-0000-0000000a2003'::uuid,
          'source configuration is linked to the calculated ratio');

SELECT is((SELECT value FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='div0')),
          NULL::numeric, 'a zero denominator stores NULL, not a fake 0');
SELECT is((SELECT result_state FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='div0')),
          'CALCULATION_ERROR', 'zero denominator surfaces CALCULATION_ERROR');
SELECT is((SELECT result_state FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='missing')),
          'INSUFFICIENT_DATA', 'missing source input surfaces INSUFFICIENT_DATA');
SELECT is((SELECT result_state FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='notcfg')),
          'NOT_CONFIGURED', 'absent applicable configuration surfaces NOT_CONFIGURED');
SELECT is((SELECT null_reason FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='noreason')),
          'missing_input', 'a null value without a supplied reason still records a reason');

-- ---------------------------------------------------------------------------
-- Threshold classification (warning vs breach, both comparator directions)
-- ---------------------------------------------------------------------------
SELECT is(public.classify_ratio_risk(12, 10, 8, '<='), 'green',
          'value 12 above the 10 warn floor is green');
SELECT is(public.classify_ratio_risk(9, 10, 8, '<='), 'amber',
          'value 9 at/below the 10 warn floor is amber (warning)');
SELECT is(public.classify_ratio_risk(7, 10, 8, '<='), 'red',
          'value 7 at/below the 8 breach floor is red (breach)');
SELECT is(public.classify_ratio_risk(5, 12, 20, '>='), 'green',
          'value 5 below the 12 warn ceiling is green');
SELECT is(public.classify_ratio_risk(15, 12, 20, '>='), 'amber',
          'value 15 at/above the 12 warn ceiling is amber (warning)');
SELECT is(public.classify_ratio_risk(25, 12, 20, '>='), 'red',
          'value 25 at/above the 20 breach ceiling is red (breach)');
SELECT is(public.classify_ratio_risk(NULL, 10, 8, '<='), 'green',
          'a null ratio never fabricates a breach');

-- ---------------------------------------------------------------------------
-- Recalculation must append, never overwrite historical evidence
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ret uuid := '00000000-0000-0000-0000-0000000a2005';
BEGIN
  -- restated numbers: 300 / 2000 * 100 = 15
  PERFORM public.record_return_ratio(v_ret, 'car', 'Capital adequacy ratio', 15, 'percent',
                                     NULL, NULL, 4, '(cap.tier1 / cap.rwa) * 100');
END$$;

SELECT is((SELECT COUNT(*)::int FROM public.return_calculated_ratios
            WHERE return_id = '00000000-0000-0000-0000-0000000a2005' AND ratio_key = 'car'),
          2, 'recalculation appends a second car row instead of replacing the first');
SELECT is((SELECT value FROM public.return_calculated_ratios
            WHERE id = (SELECT id FROM _p2_ratio_ids WHERE kind='ok')),
          12.5::numeric, 'the original 12.5 evidence row is untouched after recalculation');
SELECT is((SELECT value FROM public.return_calculated_ratios
            WHERE return_id = '00000000-0000-0000-0000-0000000a2005' AND ratio_key='car'
            ORDER BY computed_at DESC, ratio_version DESC LIMIT 1),
          15::numeric, 'the latest car row carries the restated 300/2000*100 = 15');

SELECT throws_ok(
  $$UPDATE public.return_calculated_ratios SET value = 99
     WHERE return_id = '00000000-0000-0000-0000-0000000a2005' AND ratio_key = 'car'$$,
  NULL, NULL, 'calculated ratio evidence cannot be updated (append-only)');
SELECT throws_ok(
  $$DELETE FROM public.return_calculated_ratios
     WHERE return_id = '00000000-0000-0000-0000-0000000a2005'$$,
  NULL, NULL, 'calculated ratio evidence cannot be deleted (append-only)');

SELECT * FROM finish();
ROLLBACK;
