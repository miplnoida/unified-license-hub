-- MC-09 — the sectors a market-conduct user may see, resolved server-side.
CREATE OR REPLACE FUNCTION public.market_conduct_visible_sectors(_user_id uuid, _regulator_id uuid DEFAULT NULL)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(s.id ORDER BY s.id), '{}'::uuid[])
    FROM public.sectors s
   WHERE (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
     AND public.regulatory_scope_allows(_user_id, 'market_conduct', 'view',
           s.regulator_id, s.id, NULL, NULL, _user_id);
$$;

REVOKE ALL ON FUNCTION public.market_conduct_visible_sectors(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.market_conduct_visible_sectors(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.market_conduct_visible_sectors(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_cross_entity_snapshot(_sector_id uuid DEFAULT NULL::uuid, _window_days integer DEFAULT 180, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid; _from date; _to date; _out jsonb; _sectors uuid[];
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  IF COALESCE(_window_days, 0) <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  -- Sector authority. A named sector must be inside the caller's remit. An
  -- unnamed sector means "everything I supervise": the permitted sectors are
  -- resolved server-side and the aggregation is confined to them, so a
  -- portfolio-scoped supervisor gets their own population rather than a refusal
  -- or somebody else's sector.
  IF public.is_super_admin(_uid) THEN
    _sectors := NULL;
  ELSIF _sector_id IS NOT NULL THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
             _regulator_id, _sector_id, NULL, NULL, _uid) THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
    _sectors := ARRAY[_sector_id];
  ELSE
    _sectors := public.market_conduct_visible_sectors(_uid, _regulator_id);
    IF _sectors IS NULL OR array_length(_sectors, 1) IS NULL THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  _to := current_date;
  _from := _to - _window_days;

  WITH scoped AS (
    SELECT c.id, c.licensee_id, l.sector_id, l.name AS entity_name,
           c.complaint_type_id, c.status, c.created_at, c.regulator_id
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
     WHERE c.created_at::date BETWEEN _from AND _to
       AND (_sectors IS NULL OR l.sector_id = ANY(_sectors))
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
  ),
  by_entity AS (
    SELECT s.licensee_id, s.entity_name AS licensee_name, count(*) AS complaint_count
      FROM scoped s
     WHERE s.licensee_id IS NOT NULL
     GROUP BY s.licensee_id, s.entity_name
  ),
  by_theme AS (
    SELECT COALESCE(t.name, 'Unclassified') AS theme,
           count(*) AS complaint_count,
           count(DISTINCT s.licensee_id) AS entity_count
      FROM scoped s LEFT JOIN public.complaint_types t ON t.id = s.complaint_type_id
     GROUP BY COALESCE(t.name, 'Unclassified')
  ),
  sig AS (
    SELECT count(*) AS signal_count, count(DISTINCT licensee_id) AS signal_entities
      FROM public.conduct_signals
     WHERE created_at::date BETWEEN _from AND _to
       AND (_sectors IS NULL OR sector_id = ANY(_sectors))
       AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  ),
  pat AS (
    SELECT count(*) AS pattern_count, count(DISTINCT licensee_id) AS pattern_entities
      FROM public.conduct_clusters
     WHERE created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
       AND (_sectors IS NULL OR licensee_id IN
              (SELECT id FROM public.licensees WHERE sector_id = ANY(_sectors)))
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id,
      'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END),
    'totals', jsonb_build_object(
      'complaints', (SELECT count(*) FROM scoped),
      'entities_with_complaints', (SELECT count(*) FROM by_entity),
      'signals', (SELECT signal_count FROM sig),
      'entities_with_signals', (SELECT signal_entities FROM sig),
      'patterns', (SELECT pattern_count FROM pat),
      'entities_with_patterns', (SELECT pattern_entities FROM pat)),
    'by_entity', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'licensee_id', licensee_id, 'licensee_name', licensee_name, 'complaint_count', complaint_count)
        ORDER BY complaint_count DESC, licensee_name)
      FROM by_entity), '[]'::jsonb),
    'by_theme', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'theme', theme, 'complaint_count', complaint_count, 'entity_count', entity_count)
        ORDER BY complaint_count DESC, theme)
      FROM by_theme), '[]'::jsonb),
    'cross_entity_themes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'theme', theme, 'complaint_count', complaint_count, 'entity_count', entity_count)
        ORDER BY entity_count DESC, complaint_count DESC)
      FROM by_theme WHERE entity_count >= 2), '[]'::jsonb),
    'method', 'Deterministic aggregation of recorded complaints, conduct signals and detected patterns for the stated window. No estimation and no AI involvement.'
  ) INTO _out;

  RETURN _out;
END $function$;

CREATE OR REPLACE FUNCTION public.conduct_cross_entity_compare(_sector_id uuid DEFAULT NULL::uuid, _window_days integer DEFAULT 180, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _to date; _from date; _out jsonb; _sectors uuid[];
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  IF COALESCE(_window_days, 0) <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  IF public.is_super_admin(_uid) THEN
    _sectors := NULL;
  ELSIF _sector_id IS NOT NULL THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
             _regulator_id, _sector_id, NULL, NULL, _uid) THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
    _sectors := ARRAY[_sector_id];
  ELSE
    _sectors := public.market_conduct_visible_sectors(_uid, _regulator_id);
    IF _sectors IS NULL OR array_length(_sectors, 1) IS NULL THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  _to := current_date;
  _from := _to - _window_days;

  WITH ents AS (
    SELECT l.id, l.name, l.sector_id
      FROM public.licensees l
     WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
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
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id,
      'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END),
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
END $function$;

CREATE OR REPLACE FUNCTION public.conduct_intel_theme_snapshot(_theme text, _sector_id uuid DEFAULT NULL::uuid, _window_days integer DEFAULT 180, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid; _to date; _from date; _pfrom date; _pto date; _out jsonb; _sectors uuid[];
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  IF COALESCE(btrim(_theme), '') = '' THEN
    RAISE EXCEPTION 'theme_required: a conduct theme must be stated' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(_window_days, 0) <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  IF public.is_super_admin(_uid) THEN
    _sectors := NULL;
  ELSIF _sector_id IS NOT NULL THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
             _regulator_id, _sector_id, NULL, NULL, _uid) THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
    _sectors := ARRAY[_sector_id];
  ELSE
    _sectors := public.market_conduct_visible_sectors(_uid, _regulator_id);
    IF _sectors IS NULL OR array_length(_sectors, 1) IS NULL THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  _to := current_date;
  _from := _to - _window_days;
  _pto := _from - 1;
  _pfrom := _pto - _window_days;

  WITH matched AS (
    SELECT c.id, c.complaint_number, c.subject, c.status, c.severity, c.created_at,
           c.licensee_id, l.name AS licensee_name, l.sector_id, c.regulator_id
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
      LEFT JOIN public.complaint_types t ON t.id = c.complaint_type_id
     WHERE COALESCE(t.name, 'Unclassified') = _theme
       AND (_sectors IS NULL OR l.sector_id = ANY(_sectors))
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
  ),
  cur AS (SELECT * FROM matched WHERE created_at::date BETWEEN _from AND _to),
  prv AS (SELECT * FROM matched WHERE created_at::date BETWEEN _pfrom AND _pto),
  pop AS (
    SELECT licensee_id, licensee_name, count(*) AS complaint_count
      FROM cur WHERE licensee_id IS NOT NULL
     GROUP BY licensee_id, licensee_name
  ),
  sig AS (
    SELECT s.id, s.reference, s.title, s.severity, s.status, s.created_at, s.licensee_id
      FROM public.conduct_signals s
     WHERE s.created_at::date BETWEEN _from AND _to
       AND s.licensee_id IN (SELECT licensee_id FROM pop)
       AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
  ),
  pat AS (
    SELECT k.id, k.reference, k.title, k.severity, k.status, k.metric, k.metric_value,
           k.threshold_value, k.distinct_entity_count, k.created_at, k.licensee_id
      FROM public.conduct_clusters k
     WHERE k.created_at::date BETWEEN _from AND _to
       AND (k.licensee_id IN (SELECT licensee_id FROM pop)
            OR (k.distinct_entity_count > 1
                AND (_sectors IS NULL OR k.licensee_id IS NULL OR k.licensee_id IN
                       (SELECT id FROM public.licensees WHERE sector_id = ANY(_sectors)))))
       AND (_regulator_id IS NULL OR k.regulator_id = _regulator_id)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'theme', _theme,
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'comparison_window', jsonb_build_object('from', _pfrom, 'to', _pto),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id,
      'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END),
    'totals', jsonb_build_object(
      'complaints', (SELECT count(*) FROM cur),
      'entities', (SELECT count(*) FROM pop),
      'signals', (SELECT count(*) FROM sig),
      'patterns', (SELECT count(*) FROM pat)),
    'movement', jsonb_build_object(
      'complaints_current', (SELECT count(*) FROM cur),
      'complaints_previous', (SELECT count(*) FROM prv),
      'complaints_change', (SELECT count(*) FROM cur) - (SELECT count(*) FROM prv),
      'entities_current', (SELECT count(*) FROM pop),
      'entities_previous', (SELECT count(DISTINCT licensee_id) FROM prv WHERE licensee_id IS NOT NULL),
      'direction', CASE
         WHEN (SELECT count(*) FROM cur) > (SELECT count(*) FROM prv) THEN 'increase'
         WHEN (SELECT count(*) FROM cur) < (SELECT count(*) FROM prv) THEN 'decrease'
         ELSE 'unchanged' END,
      'method', 'Recorded complaint volume in the stated window compared with the immediately preceding window of equal length. Movement is a count difference only and establishes no cause.'),
    'entities', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', COALESCE(licensee_name, 'Unnamed entity'),
         'licensee_id', licensee_id,
         'complaint_count', complaint_count,
         'href', '/conduct/360/' || licensee_id)
         ORDER BY complaint_count DESC, licensee_name) FROM pop), '[]'::jsonb)),
    'complaints', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', complaint_number, 'title', subject, 'status', status,
         'severity', severity, 'recorded_at', created_at,
         'licensee_name', licensee_name,
         'href', '/complaints/' || id)
         ORDER BY created_at DESC) FROM cur), '[]'::jsonb)),
    'signals', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', reference, 'title', title, 'severity', severity, 'status', status,
         'recorded_at', created_at, 'href', '/conduct/signals/' || id)
         ORDER BY created_at DESC) FROM sig), '[]'::jsonb)),
    'patterns', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', reference, 'title', title, 'severity', severity, 'status', status,
         'measure', metric, 'measured_value', metric_value, 'threshold', threshold_value,
         'entities_involved', distinct_entity_count,
         'recorded_at', created_at, 'href', '/conduct/patterns/' || id)
         ORDER BY created_at DESC) FROM pat), '[]'::jsonb)),
    'method', 'Deterministic aggregation of recorded complaints, conduct signals and detected patterns for the stated theme and window. No estimation, no scoring and no AI involvement.',
    'provenance', jsonb_build_object('source', 'conduct_intel_theme_snapshot',
                                     'content_class', 'fact', 'ai_content', false)
  ) INTO _out;

  RETURN _out;
END $function$;