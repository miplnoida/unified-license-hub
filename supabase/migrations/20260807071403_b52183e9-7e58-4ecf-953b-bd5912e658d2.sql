CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(
  _period_end date,
  _ratio_key text,
  _sector_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid,
  _min_peers integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Set-based peer population (one latest value per entity). Deliberately no
  -- temp table: this function is STABLE and must not perform DDL.
  WITH peers AS (
    SELECT DISTINCT ON (rf.entity_id) rf.entity_id, rcr.value
      FROM public.return_calculated_ratios rcr
      JOIN public.returns_filed rf ON rf.id = rcr.return_id
      JOIN public.licensees l ON l.id = rf.entity_id
     WHERE rcr.ratio_key = _ratio_key
       AND rf.period_end_date = _period_end
       AND rcr.value IS NOT NULL
       AND (v_sector IS NULL OR l.sector_id = v_sector)
       AND (v_category IS NULL OR l.category_id = v_category)
     ORDER BY rf.entity_id, rcr.computed_at DESC
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
      'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category)
    );
  END IF;

  IF v_entity_value IS NOT NULL THEN
    WITH peers AS (
      SELECT DISTINCT ON (rf.entity_id) rf.entity_id, rcr.value
        FROM public.return_calculated_ratios rcr
        JOIN public.returns_filed rf ON rf.id = rcr.return_id
        JOIN public.licensees l ON l.id = rf.entity_id
       WHERE rcr.ratio_key = _ratio_key
         AND rf.period_end_date = _period_end
         AND rcr.value IS NOT NULL
         AND (v_sector IS NULL OR l.sector_id = v_sector)
         AND (v_category IS NULL OR l.category_id = v_category)
       ORDER BY rf.entity_id, rcr.computed_at DESC
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