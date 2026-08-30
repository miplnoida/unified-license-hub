-- Phase 2 / PRU-ANA-001 — ratio engine behaviour, result states, provenance
--
-- Deterministic fixtures: Tier 1 capital 250 / RWA 2000 * 100 = 12.5 (percent).
-- Every expected number below is derived by hand in the assertion message.

BEGIN;
SELECT plan(22);

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
-- F8-W1A: the calculated-ratio store is canonical (return_metric_values).
-- The duplicate store (return_calculated_ratios) is retired: its writer is
-- dropped and it accepts no new rows, so no second ratio result can exist.
-- ---------------------------------------------------------------------------
SELECT hasnt_function('public', 'record_return_ratio',
          'the retired duplicate-ratio writer no longer exists');
SELECT throws_ok(
  $$INSERT INTO public.return_calculated_ratios (return_id, ratio_key, value)
    VALUES ('00000000-0000-0000-0000-0000000a2005', 'car', 12.5)$$,
  NULL, NULL, 'the retired ratio store rejects new rows');
SELECT ok((SELECT COUNT(*) FROM public.return_metric_values
            WHERE source_kind = 'CALCULATED') > 0,
          'calculated ratio results live in the canonical metric store');
SELECT is((SELECT COUNT(*)::int FROM public.return_metric_values
            WHERE source_kind = 'CALCULATED'
              AND (calculation_rule_id IS NULL OR calculated_at IS NULL)),
          0, 'every canonical calculated ratio retains rule and timing provenance');

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
-- Retired ratio evidence stays immutable history
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$UPDATE public.return_calculated_ratios SET value = 99$$,
  NULL, NULL, 'retired calculated ratio evidence cannot be updated');
SELECT throws_ok(
  $$DELETE FROM public.return_calculated_ratios$$,
  NULL, NULL, 'retired calculated ratio evidence cannot be deleted');
SELECT * FROM finish();
ROLLBACK;
