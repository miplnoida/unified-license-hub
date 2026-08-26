-- MC-11 — Freshness re-check for management reporting narratives.
CREATE OR REPLACE FUNCTION public.conduct_reporting_ai_refresh_staleness(_insight_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_ai_insights; _fp text; _state text;
        _pack_id uuid; _pack_version integer;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'insight_not_found' USING ERRCODE = 'P0002'; END IF;
  IF _row.subject_type <> 'management_report' THEN
    RAISE EXCEPTION 'not_a_reporting_narrative' USING ERRCODE = '22023'; END IF;

  _pack_id := NULLIF(_row.subject_population ->> 'pack_id','')::uuid;
  _pack_version := NULLIF(_row.subject_population ->> 'pack_version','')::integer;

  IF _pack_id IS NOT NULL THEN
    SELECT v.facts_signature INTO _fp
      FROM public.conduct_evidence_pack_versions v
     WHERE v.pack_id = _pack_id
       AND v.version = COALESCE(_pack_version,
             (SELECT p.current_version FROM public.conduct_evidence_packs p WHERE p.id = _pack_id));
  ELSE
    SELECT d ->> 'facts_signature' INTO _fp
      FROM public.conduct_mi_dashboard(_row.window_start, _row.window_end, _row.sector_id, _row.regulator_id) d;
  END IF;

  _state := CASE WHEN _fp IS NOT NULL AND _fp = _row.snapshot_fingerprint THEN 'CURRENT' ELSE 'STALE' END;

  UPDATE public.conduct_ai_insights
     SET staleness_state = _state, staleness_checked_at = now()
   WHERE id = _insight_id;

  RETURN jsonb_build_object(
    'insight_id', _insight_id,
    'staleness_state', _state,
    'recorded_fingerprint', _row.snapshot_fingerprint,
    'current_fingerprint', _fp,
    'basis', CASE WHEN _pack_id IS NOT NULL THEN 'evidence_pack_version' ELSE 'conduct_mi_dashboard' END,
    'checked_at', now());
END $$;

REVOKE ALL ON FUNCTION public.conduct_reporting_ai_refresh_staleness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_ai_refresh_staleness(uuid) TO authenticated;