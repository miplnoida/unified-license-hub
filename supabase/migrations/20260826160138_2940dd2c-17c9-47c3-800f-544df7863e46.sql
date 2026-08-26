CREATE OR REPLACE FUNCTION public.conduct_ai_insight_review(_insight_id uuid, _action text, _rationale text DEFAULT NULL::text, _human_output jsonb DEFAULT NULL::jsonb, _superseded_by_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.conduct_ai_insights; _after public.conduct_ai_insights; _from text; _to text;
BEGIN
  IF _action NOT IN ('accept','modify','reject','supersede') THEN
    RAISE EXCEPTION 'unsupported_review_action: %', _action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'insight_not_found' USING ERRCODE = 'P0002';
  END IF;

  _uid := public.conduct_pattern_require(ARRAY['manage_complaints','run_conduct_analytics','approve']);

  -- authority + regulatory scope for the subject the advisory item addresses
  IF COALESCE(_row.subject_type, 'entity') = 'entity' THEN
    PERFORM public.conduct_360_snapshot(_row.entity_id, _row.window_start, _row.window_end);
  ELSIF _row.subject_type = 'emerging_risk' THEN
    PERFORM public.conduct_emerging_risk_guard(_row.emerging_risk_id,
              ARRAY['manage_complaints','run_conduct_analytics']);
  ELSIF NOT public.is_super_admin(_uid)
        AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
                  _row.regulator_id, _row.sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: subject out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _from := _row.review_state;
  IF _from = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'insight_superseded: no further review is permitted' USING ERRCODE = '22023';
  END IF;
  IF _action IN ('modify','reject') AND COALESCE(btrim(_rationale), '') = '' THEN
    RAISE EXCEPTION 'rationale_required: % requires a written rationale', _action USING ERRCODE = '22023';
  END IF;
  IF _action = 'modify' AND (_human_output IS NULL OR _human_output = '{}'::jsonb) THEN
    RAISE EXCEPTION 'human_output_required: modify requires the supervisor''s revised text' USING ERRCODE = '22023';
  END IF;

  _to := CASE _action WHEN 'accept' THEN 'ACCEPTED' WHEN 'modify' THEN 'MODIFIED'
                      WHEN 'reject' THEN 'REJECTED' ELSE 'SUPERSEDED' END;

  UPDATE public.conduct_ai_insights
     SET review_state = _to,
         human_output = CASE WHEN _action = 'modify' THEN _human_output ELSE human_output END,
         human_rationale = COALESCE(nullif(btrim(COALESCE(_rationale,'')),''), human_rationale),
         reviewed_by = _uid, reviewed_at = now(),
         superseded_by_id = CASE WHEN _action = 'supersede' THEN _superseded_by_id ELSE superseded_by_id END,
         updated_at = now()
   WHERE id = _insight_id;

  INSERT INTO public.conduct_ai_review_events(
    conduct_ai_insight_id, action, rationale, from_state, to_state, human_output, actor_id)
  VALUES (_insight_id, _action, nullif(btrim(COALESCE(_rationale,'')),''), _from, _to, _human_output, _uid);

  UPDATE public.ai_insights
     SET review_status = CASE _action WHEN 'accept' THEN 'accepted' WHEN 'modify' THEN 'overridden'
                                      WHEN 'reject' THEN 'dismissed' ELSE 'dismissed' END,
         reviewer_id = _uid, reviewed_at = now(), updated_at = now()
   WHERE id = _row.insight_id;

  -- Read the row back and state explicitly that the original AI wording is
  -- byte-identical to what was generated. Human review never rewrites it.
  SELECT * INTO _after FROM public.conduct_ai_insights WHERE id = _insight_id;

  RETURN jsonb_build_object('insight_id', _insight_id, 'from_state', _from,
                            'to_state', _to, 'actor_id', _uid,
                            'ai_output_preserved', (_after.ai_output = _row.ai_output),
                            'human_output_recorded', (_after.human_output IS NOT NULL));
END $function$;