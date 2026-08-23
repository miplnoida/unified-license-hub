CREATE OR REPLACE FUNCTION public.cert_v2_universe_gate()
RETURNS TABLE(check_key text, expected text, actual text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT
      (SELECT count(*) FROM public.licensees) AS entities,
      (SELECT count(*) FROM public.licenses) AS licenses,
      (SELECT count(*) FROM public.entity_identifiers) AS identifiers,
      (SELECT count(*) FROM public.entity_reporting_obligations) AS obligations,
      (SELECT count(*) FROM public.reporting_periods) AS periods,
      (SELECT count(*) FROM public.return_filings) AS filings,
      (SELECT count(*) FROM public.return_filings rf WHERE rf.status = 'ACCEPTED') AS accepted,
      (SELECT count(*) FROM public.return_metric_values rmv WHERE rmv.source_kind = 'CALCULATED'
                                                          AND rmv.availability = 'AVAILABLE') AS calculated,
      (SELECT count(*) FROM public.prudential_detection_runs pdr WHERE pdr.status = 'FAILED') AS failed_runs,
      (SELECT count(*) FROM public.prudential_detection_runs) AS runs,
      (SELECT count(*) FROM public.return_threshold_breaches) AS breaches,
      (SELECT count(*) FROM public.cert_v2_golden_ratios() g WHERE g.status <> 'PASS') AS golden_fail,
      (SELECT count(*) FROM public.cert_fixture_objects) AS ledger
  )
  SELECT * FROM (VALUES
    ('ENTITIES',            '20',  (SELECT entities::text FROM c),    (SELECT CASE WHEN entities = 20 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('LICENCES',            '19',  (SELECT licenses::text FROM c),    (SELECT CASE WHEN licenses = 19 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('IDENTIFIERS',         '40',  (SELECT identifiers::text FROM c), (SELECT CASE WHEN identifiers = 40 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('OBLIGATIONS',         '18',  (SELECT obligations::text FROM c), (SELECT CASE WHEN obligations = 18 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('REPORTING_PERIODS',   '>0',  (SELECT periods::text FROM c),     (SELECT CASE WHEN periods > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('FILINGS',             '>0',  (SELECT filings::text FROM c),     (SELECT CASE WHEN filings > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('FILINGS_ACCEPTED',    '>0',  (SELECT accepted::text FROM c),    (SELECT CASE WHEN accepted > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('SERVER_CALCULATED',   '>0',  (SELECT calculated::text FROM c),  (SELECT CASE WHEN calculated > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('DETECTION_RUNS',      '>0',  (SELECT runs::text FROM c),        (SELECT CASE WHEN runs > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('DETECTION_FAILURES',  '0',   (SELECT failed_runs::text FROM c), (SELECT CASE WHEN failed_runs = 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('THRESHOLD_BREACHES',  '>0',  (SELECT breaches::text FROM c),    (SELECT CASE WHEN breaches > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('GOLDEN_RATIOS',       '0 fail', (SELECT golden_fail::text FROM c), (SELECT CASE WHEN golden_fail = 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('FIXTURE_LEDGER',      '>0',  (SELECT ledger::text FROM c),      (SELECT CASE WHEN ledger > 0 THEN 'PASS' ELSE 'FAIL' END FROM c))
  ) AS t(check_key, expected, actual, status);
END $$;

REVOKE ALL ON FUNCTION public.cert_v2_universe_gate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_universe_gate() TO service_role;