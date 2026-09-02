CREATE OR REPLACE FUNCTION public.supervisory_plan_open(_title text, _domain_code text, _factual_basis text, _objective text, _attention_id uuid DEFAULT NULL::uuid, _assessment_ids uuid[] DEFAULT NULL::uuid[], _entity_ids uuid[] DEFAULT NULL::uuid[], _planning_period text DEFAULT 'annual'::text, _period_label text DEFAULT NULL::text, _lead_officer_id uuid DEFAULT NULL::uuid, _team_id uuid DEFAULT NULL::uuid, _start_date date DEFAULT NULL::date, _target_completion date DEFAULT NULL::date, _next_review_date date DEFAULT NULL::date, _priority text DEFAULT NULL::text, _theme text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _ref text; _att public.supervisory_attention;
        _entities uuid[]; _e uuid; _a uuid; _sector uuid; _reg uuid; _prio text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF length(btrim(COALESCE(_factual_basis,''))) < 20 THEN
    RAISE EXCEPTION 'a factual basis of at least 20 characters is required' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023'; END IF;

  _entities := COALESCE(_entity_ids,'{}');
  IF _attention_id IS NOT NULL THEN
    SELECT * INTO _att FROM public.supervisory_attention WHERE id = _attention_id;
    IF _att.id IS NULL THEN RAISE EXCEPTION 'not_found: attention' USING ERRCODE = '22023'; END IF;
    IF COALESCE(array_length(_entities,1),0) = 0 THEN _entities := _att.entity_ids; END IF;
    _prio := COALESCE(_priority, _att.confirmed_priority);
  ELSE
    _prio := _priority;
  END IF;
  IF _prio IS NOT NULL THEN
    _prio := CASE upper(btrim(_prio))
               WHEN 'IMMEDIATE' THEN 'IMMEDIATE' WHEN 'CRITICAL' THEN 'IMMEDIATE'
               WHEN 'HIGH' THEN 'HIGH'
               WHEN 'PLANNED' THEN 'PLANNED' WHEN 'MEDIUM' THEN 'PLANNED'
               WHEN 'MONITOR' THEN 'MONITOR' WHEN 'LOW' THEN 'MONITOR'
               ELSE NULL END;
    IF _prio IS NULL THEN
      RAISE EXCEPTION 'unsupported priority %', _priority USING ERRCODE = '22023'; END IF;
  END IF;

  FOREACH _e IN ARRAY _entities LOOP
    PERFORM public.supervisory_entity_scope_check(_uid, _e);
  END LOOP;
  IF COALESCE(array_length(_entities,1),0) > 0 THEN
    SELECT l.sector_id, s.regulator_id INTO _sector, _reg
      FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id WHERE l.id = _entities[1];
  END IF;

  _ref := 'SP-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_plan_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_plan(
    reference, regulator_id, sector_id, title, objective, objective_source, scope,
    attention_id, theme, entity_ids, sector_ids, factual_basis, priority, planning_period,
    period_label, lead_officer_id, team_id, start_date, target_completion, next_review_date,
    domain_code, created_by)
  VALUES (_ref, _reg, _sector, btrim(_title), nullif(btrim(COALESCE(_objective,'')),''), 'human',
    NULL, _attention_id, nullif(btrim(COALESCE(_theme,'')),''), _entities,
    CASE WHEN _sector IS NULL THEN '{}'::uuid[] ELSE ARRAY[_sector] END,
    btrim(_factual_basis), _prio, COALESCE(_planning_period,'annual'), _period_label,
    COALESCE(_lead_officer_id,_uid), _team_id, _start_date, _target_completion, _next_review_date,
    _domain_code, _uid)
  RETURNING id INTO _id;

  IF _assessment_ids IS NOT NULL THEN
    FOREACH _a IN ARRAY _assessment_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment WHERE id = _a) THEN
        RAISE EXCEPTION 'not_found: assessment %', _a USING ERRCODE = '22023'; END IF;
      INSERT INTO public.supervisory_plan_assessment(plan_id, assessment_id, created_by)
      VALUES (_id, _a, _uid) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.supervisory_plan_event(plan_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'DRAFT', btrim(_factual_basis),
    jsonb_build_object('domain_code',_domain_code,'attention_id',_attention_id,
      'assessment_ids', to_jsonb(COALESCE(_assessment_ids,'{}'::uuid[]))), _uid);

  IF _attention_id IS NOT NULL THEN
    UPDATE public.supervisory_attention
       SET status = CASE WHEN status IN ('OPEN','PRIORITISED') THEN 'PLANNED' ELSE status END,
           updated_at = now()
     WHERE id = _attention_id;
    INSERT INTO public.supervisory_attention_event(attention_id, event_type, rationale, detail, actor_id)
    VALUES (_attention_id, 'PLAN_LINKED', 'Supervisory plan ' || _ref || ' created',
      jsonb_build_object('plan_id',_id,'plan_reference',_ref), _uid);
  END IF;

  PERFORM public.log_compliance_audit('CREATE','supervisory_plan',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code),
    'Supervisory plan ' || _ref || ' created');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','DRAFT','domain_code',_domain_code);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_plan_open(text,text,text,text,uuid,uuid[],uuid[],text,text,uuid,uuid,date,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_open(text,text,text,text,uuid,uuid[],uuid[],text,text,uuid,uuid,date,date,date,text,text) TO authenticated, service_role;