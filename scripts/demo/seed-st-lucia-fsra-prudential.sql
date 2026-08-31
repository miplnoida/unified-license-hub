-- =====================================================================
-- DEMO ENVIRONMENT: DEMO_SLU_FSRA_2026 — STAGE 2
-- Live prudential cycle for the demonstration:
--   reported inputs -> governed filing lifecycle -> ENGINE-CALCULATED
--   ratios -> threshold breach detection.
--
-- IMPORTANT TRUTHFULNESS RULES OBSERVED HERE:
--   * Only ENTITY-REPORTED input measurements are seeded.
--   * Ratios are NEVER written by this script. They are produced by
--     public.returns_calculate_metrics() from the configured
--     metric_calculation_rules, exactly as in production.
--   * Breaches are NEVER written by this script. They are produced by
--     the configured prudential threshold detection on acceptance.
--   * Idempotent: re-running skips a cycle that is already ACCEPTED.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO seed refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  v_regulator uuid := (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com');
  v_period    uuid := 'ba95a035-4f66-4d24-855a-b92e2df1f109';  -- 2026-Q2, OPEN
  v_entity    uuid := '5855bf85-9fde-4cf8-a082-7ea904d46184';  -- prudential hero entity
  v_open      jsonb;
  v_version   uuid;
  v_filing    uuid;
  v_status    text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_regulator::text, 'role', 'authenticated')::text, true);

  SELECT f.id, f.status INTO v_filing, v_status
    FROM public.return_filings f WHERE f.reporting_period_id = v_period;

  IF v_status = 'ACCEPTED' THEN
    RAISE NOTICE 'DEMO prudential cycle already ACCEPTED for this period; nothing to do';
    RETURN;
  END IF;

  v_open    := public.returns_open_filing(v_period);
  v_version := (v_open->>'version_id')::uuid;
  v_filing  := (v_open->>'filing_id')::uuid;
  RAISE NOTICE 'DEMO filing % version %', v_open->>'filing_reference', v_version;

  -- Entity-reported input measurements for 2026-Q2 (synthetic demo figures).
  INSERT INTO public.return_metric_values
    (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
     value_numeric, availability, source_kind)
  SELECT v_version, v_entity, m.id, v_period, x.val, 'AVAILABLE', 'REPORTED'
  FROM (VALUES
      ('TOTAL_CAPITAL',              96000000::numeric),
      ('RWA',                      1000000000::numeric),
      ('GROSS_LOANS',              1000000000::numeric),
      ('NON_PERFORMING_LOANS',       64000000::numeric),
      ('LIQUID_ASSETS',              92500000::numeric),
      ('SHORT_TERM_LIABILITIES',    500000000::numeric),
      ('OPERATING_EXPENSES',         35500000::numeric),
      ('NET_INTEREST_INCOME',        50000000::numeric),
      ('CUSTOMER_DEPOSITS',        1120000000::numeric),
      ('TOTAL_ASSETS',             1310000000::numeric)
  ) AS x(code, val)
  JOIN public.regulatory_metrics m ON m.code = x.code
  ON CONFLICT (return_filing_version_id, regulatory_metric_id) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric,
        availability  = 'AVAILABLE',
        source_kind   = 'REPORTED';

  -- Governed lifecycle: validate -> submit -> maker/checker acceptance.
  PERFORM public.returns_validate_filing(v_version);
  PERFORM public.returns_submit_filing(v_version, true);
  PERFORM public.returns_review_filing(v_version, 'ACCEPT',
    'Saint Lucia FSRA demonstration: accepted for supervisory analysis');

  -- Canonical calculation (idempotent no-op if acceptance already ran it).
  BEGIN
    PERFORM public.returns_calculate_metrics(v_version);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Ratios already calculated at acceptance (%).', SQLERRM;
  END;
END $$;

COMMIT;
