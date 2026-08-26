CREATE OR REPLACE FUNCTION public.conduct_cross_entity_compare(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 180,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _to date; _from date; _out jsonb;
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  IF COALESCE(_window_days, 0) <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
               _regulator_id, _sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _to := current_date;
  _from := _to - _window_days;

  WITH ents AS (
    SELECT l.id, l.name, l.sector_id
      FROM public.licensees l
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
  ),
  comp AS (
    SELECT c.licensee_id, count(*) AS complaints
      FROM public.complaints c
     WHERE c.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
       AND c.licensee_id IN (SELECT id FROM ents)
     GROUP BY c.licensee_id
  ),
  sg AS (
    SELECT s.licensee_id, count(*) AS signals
      FROM public.conduct_signals s
     WHERE s.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
       AND s.licensee_id IN (SELECT id FROM ents)
     GROUP BY s.licensee_id
  ),
  pt AS (
    SELECT k.licensee_id, count(*) AS patterns
      FROM public.conduct_clusters k
     WHERE k.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR k.regulator_id = _regulator_id)
       AND k.licensee_id IN (SELECT id FROM ents)
     GROUP BY k.licensee_id
  ),
  joined AS (
    SELECT e.id, e.name,
           COALESCE(comp.complaints, 0) AS complaints,
           COALESCE(sg.signals, 0) AS signals,
           COALESCE(pt.patterns, 0) AS patterns
      FROM ents e
      LEFT JOIN comp ON comp.licensee_id = e.id
      LEFT JOIN sg ON sg.licensee_id = e.id
      LEFT JOIN pt ON pt.licensee_id = e.id
  ),
  active AS (SELECT * FROM joined WHERE complaints > 0 OR signals > 0 OR patterns > 0),
  stats AS (
    SELECT count(*)::int AS population,
           round(COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY complaints), 0)::numeric, 2) AS median_complaints,
           round(COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY complaints), 0)::numeric, 2) AS upper_quartile_complaints,
           COALESCE(max(complaints), 0)::int AS highest_complaints
      FROM active
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id),
    'sector_measures', (SELECT to_jsonb(s) FROM stats s),
    'entities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'licensee_id', a.id, 'reference', a.name,
        'complaints', a.complaints, 'signals', a.signals, 'patterns', a.patterns,
        'above_sector_median', a.complaints > (SELECT median_complaints FROM stats),
        'above_upper_quartile', a.complaints > (SELECT upper_quartile_complaints FROM stats),
        'comparison_note', a.complaints || ' recorded complaints against a sector median of '
                           || (SELECT median_complaints FROM stats)
                           || ' and an upper quartile of '
                           || (SELECT upper_quartile_complaints FROM stats)
                           || ' for the same window.',
        'href', '/conduct/360/' || a.id)
        ORDER BY a.complaints DESC, a.signals DESC, a.name)
      FROM active a), '[]'::jsonb),
    'method', 'Counts of recorded complaints, conduct signals and detected patterns per entity for the stated window, compared with the median and upper quartile of entities in scope that have any recorded conduct activity. Positional comparison only: it is not a rating, score or finding.',
    'provenance', jsonb_build_object('source', 'conduct_cross_entity_compare',
                                     'content_class', 'fact', 'ai_content', false)
  ) INTO _out;

  RETURN _out;
END $$;