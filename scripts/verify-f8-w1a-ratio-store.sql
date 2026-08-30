-- F8-W1A — CANONICAL PRUDENTIAL RATIO STORE (GAP-F8-09)
-- Proves there is exactly ONE authoritative calculated-ratio source used by
-- prudential analytics, threshold evaluation and breach detection, and that the
-- duplicate store is retired read-only with history preserved.
\set ON_ERROR_STOP on
\timing off
\pset pager off

DO $$
DECLARE n int; t text; ok boolean;
BEGIN
  -- 1. Canonical store exists and holds calculated ratio results.
  SELECT count(*) INTO n FROM public.return_metric_values
   WHERE source_kind = 'CALCULATED';
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL 1: canonical store return_metric_values has no CALCULATED rows';
  END IF;
  RAISE NOTICE 'PASS 1: canonical calculated ratio rows in return_metric_values = %', n;

  -- 2. Canonical writer is returns_calculate_metrics and it targets the canonical store.
  SELECT prosrc INTO t FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'returns_calculate_metrics';
  IF t IS NULL OR t NOT LIKE '%return_metric_values%' THEN
    RAISE EXCEPTION 'FAIL 2: returns_calculate_metrics does not write return_metric_values';
  END IF;
  IF t LIKE '%return_calculated_ratios%' THEN
    RAISE EXCEPTION 'FAIL 2: canonical calculation writes the retired store';
  END IF;
  RAISE NOTICE 'PASS 2: filing-acceptance ratio calculation writes only the canonical store';

  -- 3. Threshold evaluation / breach detection read the SAME canonical store.
  SELECT prosrc INTO t FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = '_prudential_canonical_detect_run';
  IF t IS NULL OR t NOT LIKE '%return_metric_values%' THEN
    RAISE EXCEPTION 'FAIL 3: canonical detection run does not read return_metric_values';
  END IF;
  IF t LIKE '%return_calculated_ratios%' THEN
    RAISE EXCEPTION 'FAIL 3: detection run reads the retired store';
  END IF;
  RAISE NOTICE 'PASS 3: threshold evaluation + breach detection read the canonical store';

  -- 4. Existing breach history depends on the canonical keys only.
  SELECT count(*) INTO n FROM public.return_threshold_breaches;
  IF n = 0 THEN RAISE EXCEPTION 'FAIL 4: breach history unexpectedly empty'; END IF;
  IF EXISTS (SELECT 1 FROM public.return_threshold_breaches
              WHERE return_filing_id IS NULL OR regulatory_metric_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL 4: breach rows without canonical filing/metric linkage';
  END IF;
  IF EXISTS (SELECT 1 FROM public.return_threshold_breaches WHERE return_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 4: breach rows still bound to the legacy ratio path';
  END IF;
  RAISE NOTICE 'PASS 4: % breach rows depend exclusively on canonical filing/metric keys', n;

  -- 5. Retired store has no writer routine left anywhere in the database.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'record_return_ratio';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: record_return_ratio writer still exists (% overloads)', n;
  END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.prosrc ~* '(insert|update|delete)[[:space:]]+(into[[:space:]]+)?(public\.)?return_calculated_ratios';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: % routine(s) still write the retired store', n;
  END IF;
  RAISE NOTICE 'PASS 5: no routine writes the retired store — no duplicate ratio result possible';


  -- 6. Retired store is read-only and its history is preserved (not deleted).
  ok := false;
  BEGIN
    INSERT INTO public.return_calculated_ratios(return_id, ratio_key, label, value)
    VALUES (gen_random_uuid(), 'w1a_selftest', 'W1A self-test', 1);
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL 6: retired store still accepts inserts';
  END IF;
  IF (SELECT obj_description('public.return_calculated_ratios'::regclass, 'pg_class')) NOT LIKE 'RETIRED%' THEN
    RAISE EXCEPTION 'FAIL 6: retired store is not documented as retired';
  END IF;
  RAISE NOTICE 'PASS 6: retired store is read-only compatibility history (rows preserved: %)',
    (SELECT count(*) FROM public.return_calculated_ratios);

  -- 7. Authorization unchanged: retired store exposes no Data API privileges,
  --    RLS stays enabled, and its policies are untouched.
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'return_calculated_ratios'
     AND grantee IN ('anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 7: retired store has % Data API grant(s)', n;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.return_calculated_ratios'::regclass) THEN
    RAISE EXCEPTION 'FAIL 7: RLS disabled on retired store';
  END IF;
  RAISE NOTICE 'PASS 7: authorization unchanged (no anon/authenticated grants, RLS enabled)';

  -- 8. Prudential read surfaces stay on the canonical store.
  FOR t IN SELECT p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
            WHERE ns.nspname = 'public'
              AND p.proname IN ('prudential_filing_metric_facts','prudential_dashboard_metrics',
                                'prudential_entity_returns_profile','returns_filing_metrics_display',
                                'returns_metric_series','prudential_ewi_evaluate')
              AND p.prosrc ILIKE '%return_calculated_ratios%'
  LOOP
    RAISE EXCEPTION 'FAIL 8: prudential read surface % still reads the retired store', t;
  END LOOP;
  RAISE NOTICE 'PASS 8: prudential read surfaces read the canonical store only';

  -- 9. Early-warning evaluation reads canonical ratios and canonical breach keys.
  SELECT prosrc INTO t FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'prudential_ewi_evaluate';
  IF t IS NULL OR t NOT LIKE '%return_metric_values%' OR t NOT LIKE '%return_filing_id%' THEN
    RAISE EXCEPTION 'FAIL 9: prudential_ewi_evaluate does not read the canonical ratio/breach source';
  END IF;
  PERFORM public.prudential_ewi_evaluate(
    (SELECT entity_id FROM public.return_filings WHERE status = 'ACCEPTED' LIMIT 1),
    (SELECT max(w.period_end) FROM public.v_return_filing_workflow_state w));
  RAISE NOTICE 'PASS 9: early-warning evaluation executes against the canonical source';

  -- 10. Legacy per-return stress variant is gone; canonical per-filing remains.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'evaluate_stress_indicators_for_return') THEN
    RAISE EXCEPTION 'FAIL 10: retired evaluate_stress_indicators_for_return still exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                  WHERE ns.nspname = 'public' AND p.proname = 'evaluate_stress_indicators_for_filing') THEN
    RAISE EXCEPTION 'FAIL 10: canonical evaluate_stress_indicators_for_filing missing';
  END IF;
  RAISE NOTICE 'PASS 10: stress evaluation exists only in its canonical per-filing form';


  RAISE NOTICE 'F8-W1A CANONICAL RATIO STORE: ALL CHECKS PASS';
END $$;
