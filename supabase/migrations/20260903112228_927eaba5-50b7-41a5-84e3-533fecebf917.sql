CREATE OR REPLACE FUNCTION public.supervisory_intervention_link_activity(_intervention_id uuid, _activity_kind text, _activity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_intervention; _ref text; _route text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.workflow_action',
    'prudential_supervision.manage_examination','market_conduct.run_conduct_analytics',
    'aml_supervision.approve','aml_supervision.examine','inspection_management.edit']);
  SELECT * INTO _row FROM public.supervisory_intervention WHERE id = _intervention_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: intervention' USING ERRCODE = '22023'; END IF;
  IF _row.status NOT IN ('ENDORSED','ACTIVE') THEN
    RAISE EXCEPTION 'intervention must be endorsed before a canonical activity is linked (current %)', _row.status
      USING ERRCODE = '55000'; END IF;

  IF _activity_kind = 'examination' THEN
    SELECT reference INTO _ref FROM public.examinations WHERE id = _activity_id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'not_found: examination %', _activity_id USING ERRCODE = '22023'; END IF;
    _route := '/supervision/examinations/' || _activity_id::text;
    UPDATE public.supervisory_intervention
       SET examination_id = _activity_id, thematic_review_id = NULL, investigation_id = NULL,
           canonical_module = 'examinations', canonical_record_id = _activity_id,
           canonical_reference = _ref, canonical_route = _route, updated_at = now()
     WHERE id = _intervention_id;
    UPDATE public.examinations
       SET intervention_id = _intervention_id, plan_id = COALESCE(plan_id, _row.plan_id),
           origin_provenance = 'GOVERNED', updated_at = now()
     WHERE id = _activity_id;
  ELSIF _activity_kind = 'thematic_review' THEN
    SELECT COALESCE(code, title) INTO _ref FROM public.thematic_reviews WHERE id = _activity_id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'not_found: thematic review %', _activity_id USING ERRCODE = '22023'; END IF;
    _route := '/supervision/thematic-reviews/' || _activity_id::text;
    UPDATE public.supervisory_intervention
       SET thematic_review_id = _activity_id, examination_id = NULL, investigation_id = NULL,
           canonical_module = 'thematic_reviews', canonical_record_id = _activity_id,
           canonical_reference = _ref, canonical_route = _route, updated_at = now()
     WHERE id = _intervention_id;
  ELSIF _activity_kind = 'investigation' THEN
    SELECT COALESCE(code, id::text) INTO _ref FROM public.conduct_investigations WHERE id = _activity_id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'not_found: investigation %', _activity_id USING ERRCODE = '22023'; END IF;
    _route := '/conduct/investigations/' || _activity_id::text;
    UPDATE public.supervisory_intervention
       SET investigation_id = _activity_id, examination_id = NULL, thematic_review_id = NULL,
           canonical_module = 'conduct_investigations', canonical_record_id = _activity_id,
           canonical_reference = _ref, canonical_route = _route, updated_at = now()
     WHERE id = _intervention_id;
  ELSE
    RAISE EXCEPTION 'unsupported canonical activity kind %', _activity_kind USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_intervention_event(intervention_id, event_type, rationale, actor_id)
  VALUES (_intervention_id, 'CANONICAL_ACTIVITY_LINKED',
    'Linked ' || _activity_kind || ' ' || _ref, _uid);
  PERFORM public.log_compliance_audit('UPDATE','supervisory_intervention',_intervention_id, NULL,
    jsonb_build_object('activity_kind',_activity_kind,'activity_id',_activity_id),
    'Intervention ' || _row.reference || ' linked to ' || _activity_kind || ' ' || _ref);

  RETURN jsonb_build_object('id',_intervention_id,'activity_kind',_activity_kind,
    'activity_id',_activity_id,'activity_reference',_ref);
END $function$;