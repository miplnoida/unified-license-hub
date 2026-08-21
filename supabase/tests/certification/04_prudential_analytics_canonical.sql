-- EPR-01 — Prudential Metric Analytics reads canonical Returns truth only.
--
-- The screen /admin/returns/prudential/analytics was the last active
-- operational legacy read (return_calculated_ratios + returns_filed). These
-- assertions pin the canonical read models it now depends on, their exposure
-- controls, and the peer-confidentiality behaviour.
BEGIN;
SELECT plan(11);

-- ---------------------------------------------------------------- contracts
SELECT isnt(to_regclass('public.v_return_metric_facts_current'), NULL,
  'the canonical eligible-metric-fact view exists');

SELECT ok(
  (SELECT reloptions::text LIKE '%security_invoker%'
     FROM pg_class WHERE oid = to_regclass('public.v_return_metric_facts_current')),
  'the canonical fact view runs with the caller''s RLS (security_invoker)');

SELECT isnt(to_regprocedure('public.prudential_analytics_metrics()'), NULL,
  'the metric catalogue read model exists');

SELECT isnt(to_regprocedure('public.prudential_analytics_metric_context(text)'), NULL,
  'the metric context read model exists');

SELECT isnt(to_regprocedure('public.prudential_analytics_metric_trend(uuid,text,integer)'), NULL,
  'the metric trend read model exists');

SELECT is(
  has_function_privilege('anon', to_regprocedure('public.prudential_analytics_metric_context(text)'), 'EXECUTE'),
  false, 'anon cannot execute the metric context read model');

-- --------------------------------------------------------- canonical wiring
-- Every eligible fact resolves to the accepted version, else the current one.
SELECT is(
  (SELECT count(*)::int FROM public.v_return_metric_facts_current c
     JOIN public.return_filings f ON f.id = c.filing_id
    WHERE c.filing_version_id <> COALESCE(
            f.accepted_version_id,
            (SELECT v.id FROM public.return_filing_versions v
              WHERE v.return_filing_id = f.id
                AND v.version_number = f.current_version_number LIMIT 1))),
  0, 'no superseded version leaks into the current metric facts');

-- One point per entity/metric/period: the trend cannot plot duplicates.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT entity_id, metric_code, reporting_period_id
       FROM public.v_return_metric_facts_current
      GROUP BY 1,2,3 HAVING count(*) > 1) d),
  0, 'canonical metric facts are unique per entity, metric and period');

-- The legacy tables are no longer a source for this screen.
SELECT ok(
  (SELECT count(*) FROM public.v_return_metric_facts_current) > 0,
  'canonical metric facts are populated (legacy tables are not required)');

-- ------------------------------------------------ peer confidentiality rule
SELECT is(
  (public.peer_ratio_snapshot(
     (SELECT max(period_end) FROM public.v_return_metric_facts_current),
     '__NO_SUCH_METRIC__', NULL, NULL, 5) ->> 'state'),
  'INSUFFICIENT_PEER_DATA',
  'an unreported metric yields INSUFFICIENT_PEER_DATA, not zeroed statistics');

SELECT is(
  (public.peer_ratio_snapshot(
     (SELECT max(period_end) FROM public.v_return_metric_facts_current
       WHERE metric_code = 'CAPITAL_ADEQUACY_RATIO'),
     'CAPITAL_ADEQUACY_RATIO', NULL, NULL, 100000) ->> 'state'),
  'INSUFFICIENT_PEER_DATA',
  'the minimum-peer threshold still suppresses publication when unmet');

SELECT * FROM finish();
ROLLBACK;
