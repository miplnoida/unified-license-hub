-- 1. Seed the setting
INSERT INTO public.site_settings(key, value)
VALUES ('prudential_peer_settings', jsonb_build_object('min_peers', 5))
ON CONFLICT (key) DO NOTHING;

-- 2. Reader helper (bypasses site_settings RLS so every peer caller can resolve it)
CREATE OR REPLACE FUNCTION public.prudential_min_peers()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((SELECT (value->>'min_peers')::int
                FROM public.site_settings
               WHERE key = 'prudential_peer_settings'), 5), 3)
$function$;

REVOKE ALL ON FUNCTION public.prudential_min_peers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_min_peers() TO authenticated, service_role;

-- 3. Guarded writer
CREATE OR REPLACE FUNCTION public.set_prudential_min_peers(_value integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _old integer;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  IF _value IS NULL OR _value < 3 OR _value > 50 THEN
    RAISE EXCEPTION 'Minimum peer count must be between 3 and 50';
  END IF;

  _old := public.prudential_min_peers();

  INSERT INTO public.site_settings(key, value)
  VALUES ('prudential_peer_settings', jsonb_build_object('min_peers', _value))
  ON CONFLICT (key) DO UPDATE
    SET value = COALESCE(public.site_settings.value, '{}'::jsonb) || jsonb_build_object('min_peers', _value);

  PERFORM public.log_compliance_audit('UPDATE','site_settings','prudential_peer_settings',
    jsonb_build_object('min_peers', _old), jsonb_build_object('min_peers', _value),
    'Minimum peer count for peer comparison updated', NULL, NULL,
    jsonb_build_object('event','PEER_MIN_PEERS_UPDATED'));

  RETURN _value;
END $function$;

REVOKE ALL ON FUNCTION public.set_prudential_min_peers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_prudential_min_peers(integer) TO authenticated, service_role;

-- 4. Peer snapshot: NULL _min_peers now means "use the configured value"; floor of 3 always applies
CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(
  _period_end date,
  _ratio_key text,
  _sector_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid,
  _min_peers integer DEFAULT NULL::integer)
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
  v_min int := GREATEST(COALESCE(_min_peers, public.prudential_min_peers(), 5), 3);
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

REVOKE ALL ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) TO authenticated, service_role;