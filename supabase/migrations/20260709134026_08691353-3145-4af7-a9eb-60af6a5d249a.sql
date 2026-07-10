CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(_period_end date, _ratio_key text, _sector_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (rcr.return_id)
      rcr.return_id,
      rcr.value,
      rf.entity_id,
      rf.period_end_date,
      rf.sector_id
    FROM public.return_calculated_ratios rcr
    JOIN public.returns_filed rf ON rf.id = rcr.return_id
    WHERE rcr.ratio_key = _ratio_key
      AND rf.period_end_date = _period_end
      AND (_sector_id IS NULL OR rf.sector_id = _sector_id)
      AND rcr.value IS NOT NULL
    ORDER BY rcr.return_id, rcr.computed_at DESC
  )
  SELECT jsonb_build_object(
    'ratio_key', _ratio_key,
    'period_end', _period_end,
    'count', COUNT(*),
    'min', MIN(value),
    'median', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value),
    'p90', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY value),
    'max', MAX(value)
  )
  INTO v
  FROM latest;

  RETURN COALESCE(
    v,
    jsonb_build_object('ratio_key', _ratio_key, 'period_end', _period_end, 'count', 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date, text, uuid) TO service_role;