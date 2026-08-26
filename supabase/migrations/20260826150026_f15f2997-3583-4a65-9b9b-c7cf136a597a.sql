-- MC-09 fixes: lock the new registers down to read-only for signed-in staff
-- (project default privileges had granted full access), and derive sector from
-- the entity record because complaints carry no sector column.
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['conduct_emerging_risks','conduct_emerging_risk_records','conduct_emerging_risk_events'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', _t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', _t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.conduct_cross_entity_snapshot(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 180,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid; _from date; _to date; _out jsonb;
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

  WITH scoped AS (
    SELECT c.id, c.licensee_id, l.sector_id, l.entity_name,
           c.complaint_type_id, c.status, c.created_at, c.regulator_id
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
     WHERE c.created_at::date BETWEEN _from AND _to
       AND (_sector_id IS NULL OR l.sector_id = _sector_id)
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
       AND (_sector_id IS NULL OR sector_id = _sector_id)
       AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  ),
  pat AS (
    SELECT count(*) AS pattern_count, count(DISTINCT licensee_id) AS pattern_entities
      FROM public.conduct_clusters
     WHERE created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id),
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
END $$;