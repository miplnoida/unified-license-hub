-- EPR-01 final closure: canonical Prudential Metric Analytics.
-- Eligible fact = the accepted version, else the current version of the filing.
CREATE OR REPLACE VIEW public.v_return_metric_facts_current
WITH (security_invoker = true) AS
SELECT mv.id                        AS metric_value_id,
       mv.entity_id,
       f.id                         AS filing_id,
       mv.return_filing_version_id  AS filing_version_id,
       f.status                      AS filing_status,
       ver.status                    AS version_status,
       mv.reporting_period_id,
       p.period_end,
       p.period_label,
       m.id                          AS regulatory_metric_id,
       m.code                        AS metric_code,
       m.name                        AS metric_name,
       m.unit                        AS metric_unit,
       mv.value_numeric,
       mv.availability,
       mv.source_kind,
       f.updated_at                  AS filing_updated_at
  FROM public.return_metric_values mv
  JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
  JOIN public.return_filing_versions ver ON ver.id = mv.return_filing_version_id
  JOIN public.return_filings f ON f.id = ver.return_filing_id
  JOIN public.reporting_periods p ON p.id = mv.reporting_period_id
 WHERE mv.return_filing_version_id = COALESCE(
         f.accepted_version_id,
         (SELECT v2.id FROM public.return_filing_versions v2
           WHERE v2.return_filing_id = f.id
             AND v2.version_number = f.current_version_number
           LIMIT 1));

REVOKE ALL ON public.v_return_metric_facts_current FROM PUBLIC, anon;
GRANT SELECT ON public.v_return_metric_facts_current TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_analytics_metrics()
RETURNS TABLE (
  metric_code text, metric_name text, unit text,
  entity_count bigint, period_count bigint, latest_period_end date
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT c.metric_code, c.metric_name, c.metric_unit,
         count(DISTINCT c.entity_id),
         count(DISTINCT c.reporting_period_id),
         max(c.period_end)
    FROM public.v_return_metric_facts_current c
   WHERE c.value_numeric IS NOT NULL
   GROUP BY c.metric_code, c.metric_name, c.metric_unit
   ORDER BY c.metric_name;
$$;
REVOKE ALL ON FUNCTION public.prudential_analytics_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prudential_analytics_metrics() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_analytics_metric_context(_metric_code text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  WITH facts AS (
    SELECT c.entity_id, c.reporting_period_id, c.period_end, c.period_label
      FROM public.v_return_metric_facts_current c
     WHERE upper(c.metric_code) = upper(_metric_code)
       AND c.value_numeric IS NOT NULL
  )
  SELECT jsonb_build_object(
    'metric', (SELECT jsonb_build_object('metric_code', m.code, 'metric_name', m.name, 'unit', m.unit)
                 FROM public.regulatory_metrics m
                WHERE upper(m.code) = upper(_metric_code) LIMIT 1),
    'entities', COALESCE((
      SELECT jsonb_agg(s.e ORDER BY s.e->>'entity_name')
        FROM (
          SELECT jsonb_build_object(
                   'entity_id', l.id,
                   'entity_name', COALESCE(l.name, 'Entity ' || left(l.id::text, 8)),
                   'sector_id', l.sector_id,
                   'category_id', l.category_id,
                   'latest_available_period', max(fa.period_end),
                   'fact_count', count(*)
                 ) AS e
            FROM facts fa
            JOIN public.licensees l ON l.id = fa.entity_id
           GROUP BY l.id, l.name, l.sector_id, l.category_id
        ) s), '[]'::jsonb),
    'periods', COALESCE((
      SELECT jsonb_agg(s2.pp ORDER BY s2.pp->>'period_end' DESC)
        FROM (
          SELECT DISTINCT jsonb_build_object(
                   'reporting_period_id', fa.reporting_period_id,
                   'period_end', fa.period_end,
                   'period_label', fa.period_label) AS pp
            FROM facts fa
        ) s2), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.prudential_analytics_metric_context(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prudential_analytics_metric_context(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_analytics_metric_trend(
  _entity_id uuid, _metric_code text, _limit int DEFAULT 24)
RETURNS TABLE (
  entity_id uuid, filing_id uuid, filing_version_id uuid, reporting_period_id uuid,
  period_end date, period_label text, metric_code text,
  value_numeric numeric, availability text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT t.entity_id, t.filing_id, t.filing_version_id, t.reporting_period_id,
         t.period_end, t.period_label, t.metric_code, t.value_numeric, t.availability
    FROM (
      SELECT DISTINCT ON (c.reporting_period_id)
             c.entity_id, c.filing_id, c.filing_version_id, c.reporting_period_id,
             c.period_end, c.period_label, c.metric_code, c.value_numeric, c.availability
        FROM public.v_return_metric_facts_current c
       WHERE c.entity_id = _entity_id
         AND upper(c.metric_code) = upper(_metric_code)
         AND c.value_numeric IS NOT NULL
       ORDER BY c.reporting_period_id, c.filing_updated_at DESC NULLS LAST
    ) t
   ORDER BY t.period_end
   LIMIT GREATEST(COALESCE(_limit, 24), 1);
$$;
REVOKE ALL ON FUNCTION public.prudential_analytics_metric_trend(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prudential_analytics_metric_trend(uuid, text, int) TO authenticated, service_role;

-- Peer engine repointed at canonical facts (same signature, same controls).
CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(
  _period_end date, _ratio_key text,
  _sector_id uuid DEFAULT NULL::uuid, _entity_id uuid DEFAULT NULL::uuid,
  _min_peers integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sector uuid := _sector_id;
  v_category uuid := NULL;
  v_entity_value numeric := NULL;
  v_count int := 0;
  v_min int := GREATEST(COALESCE(_min_peers, 5), 1);
  v_stats jsonb;
  v_below int := 0;
  v_pct numeric := NULL;
BEGIN
  IF _entity_id IS NOT NULL THEN
    SELECT COALESCE(_sector_id, l.sector_id), l.category_id
      INTO v_sector, v_category
      FROM public.licensees l WHERE l.id = _entity_id;
  END IF;

  WITH peers AS (
    SELECT DISTINCT ON (c.entity_id) c.entity_id, c.value_numeric AS value
      FROM public.v_return_metric_facts_current c
      JOIN public.licensees l ON l.id = c.entity_id
     WHERE upper(c.metric_code) = upper(_ratio_key)
       AND c.period_end = _period_end
       AND c.value_numeric IS NOT NULL
       AND (v_sector IS NULL OR l.sector_id = v_sector)
       AND (v_category IS NULL OR l.category_id = v_category)
     ORDER BY c.entity_id, c.filing_updated_at DESC NULLS LAST
  )
  SELECT COUNT(*),
         MAX(CASE WHEN _entity_id IS NOT NULL AND entity_id = _entity_id THEN value END),
         jsonb_build_object(
           'min', MIN(value), 'max', MAX(value),
           'median', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value),
           'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value),
           'p90', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY value),
           'average', AVG(value))
    INTO v_count, v_entity_value, v_stats
    FROM peers;

  IF v_count < v_min THEN
    RETURN jsonb_build_object(
      'ratio_key', _ratio_key, 'period_end', _period_end,
      'state', 'INSUFFICIENT_PEER_DATA', 'peer_count', v_count,
      'min_peers', v_min, 'count', v_count,
      'entity_value', v_entity_value,
      'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category));
  END IF;

  IF v_entity_value IS NOT NULL THEN
    WITH peers AS (
      SELECT DISTINCT ON (c.entity_id) c.entity_id, c.value_numeric AS value
        FROM public.v_return_metric_facts_current c
        JOIN public.licensees l ON l.id = c.entity_id
       WHERE upper(c.metric_code) = upper(_ratio_key)
         AND c.period_end = _period_end
         AND c.value_numeric IS NOT NULL
         AND (v_sector IS NULL OR l.sector_id = v_sector)
         AND (v_category IS NULL OR l.category_id = v_category)
       ORDER BY c.entity_id, c.filing_updated_at DESC NULLS LAST
    )
    SELECT COUNT(*) INTO v_below FROM peers WHERE value < v_entity_value;
    v_pct := ROUND((v_below::numeric / v_count::numeric) * 10000) / 100;
  END IF;

  RETURN v_stats
    || jsonb_build_object(
         'ratio_key', _ratio_key, 'period_end', _period_end,
         'state', 'OK', 'peer_count', v_count, 'count', v_count,
         'min_peers', v_min, 'entity_value', v_entity_value,
         'percentile', v_pct,
         'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category));
END $function$;
REVOKE ALL ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) TO authenticated, service_role;