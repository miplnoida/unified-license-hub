CREATE OR REPLACE FUNCTION public.supervisory_attention_confirm_priority(_attention_id uuid, _confirmed_priority text, _rationale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_attention; _override boolean; _band text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.review','supervisory_spine.approve',
    'prudential_supervision.workflow_action','market_conduct.run_conduct_analytics','aml_supervision.approve']);
  SELECT * INTO _row FROM public.supervisory_attention WHERE id = _attention_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: attention' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a confirmation rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  _band := CASE upper(btrim(COALESCE(_confirmed_priority,'')))
             WHEN 'IMMEDIATE' THEN 'IMMEDIATE'
             WHEN 'CRITICAL'  THEN 'IMMEDIATE'
             WHEN 'HIGH'      THEN 'HIGH'
             WHEN 'PLANNED'   THEN 'PLANNED'
             WHEN 'MEDIUM'    THEN 'PLANNED'
             WHEN 'MONITOR'   THEN 'MONITOR'
             WHEN 'LOW'       THEN 'MONITOR'
             ELSE NULL END;
  IF _band IS NULL THEN
    RAISE EXCEPTION 'unsupported priority %', _confirmed_priority USING ERRCODE = '22023'; END IF;

  _override := _row.calculated_priority IS NOT NULL AND _row.calculated_priority <> _band;

  UPDATE public.supervisory_attention
     SET confirmed_priority = _band, confirmed_by = _uid, confirmed_at = now(),
         confirmation_rationale = btrim(_rationale), priority_overridden = _override,
         status = CASE WHEN status = 'OPEN' THEN 'PRIORITISED' ELSE status END,
         updated_at = now()
   WHERE id = _attention_id;

  INSERT INTO public.supervisory_attention_event(attention_id, event_type, from_state, to_state, rationale, detail, actor_id)
  VALUES (_attention_id, CASE WHEN _override THEN 'PRIORITY_OVERRIDDEN' ELSE 'PRIORITY_CONFIRMED' END,
    _row.status, 'PRIORITISED', btrim(_rationale),
    jsonb_build_object('calculated',_row.calculated_priority,'confirmed',_band), _uid);

  PERFORM public.log_compliance_audit(
    CASE WHEN _override THEN 'OVERRIDE' ELSE 'APPROVE' END,
    'supervisory_attention', _attention_id,
    jsonb_build_object('calculated_priority',_row.calculated_priority),
    jsonb_build_object('confirmed_priority',_band),
    'Supervisory attention ' || _row.reference || ' priority confirmed as ' || _band);

  RETURN jsonb_build_object('id',_attention_id,'reference',_row.reference,
    'confirmed_priority',_band,'overridden',_override);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_attention_confirm_priority(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_attention_confirm_priority(uuid, text, text) TO authenticated, service_role;