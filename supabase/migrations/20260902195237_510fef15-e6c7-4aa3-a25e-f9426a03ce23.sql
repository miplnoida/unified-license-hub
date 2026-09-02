ALTER TABLE public.supervisory_attention DROP CONSTRAINT IF EXISTS conduct_attention_source_chk;
ALTER TABLE public.supervisory_attention
  ADD CONSTRAINT supervisory_attention_source_chk
  CHECK (source_type = ANY (ARRAY[
    'emerging_risk','cross_entity_theme','conduct_360','entity_signal','complaint_pattern',
    'finding','material_change','supervisory_assessment','unresolved_remediation','other',
    'return_breach','ewi_signal','aml_risk','conduct_signal','resilience_incident',
    'fit_and_proper_concern','enforcement_outcome','other_governed_source']));

ALTER TABLE public.supervisory_attention DROP CONSTRAINT IF EXISTS conduct_attention_urgency_chk;
ALTER TABLE public.supervisory_attention
  ADD CONSTRAINT supervisory_attention_urgency_chk
  CHECK (urgency = ANY (ARRAY['routine','elevated','urgent','low','medium','high','severe']));

CREATE OR REPLACE FUNCTION public.supervisory_attention_open(_title text, _domain_code text, _supervisory_basis text, _origin_kind text, _entity_ids uuid[] DEFAULT NULL::uuid[], _assessment_id uuid DEFAULT NULL::uuid, _assessment_dimension_id uuid DEFAULT NULL::uuid, _signal_id uuid DEFAULT NULL::uuid, _complaint_id uuid DEFAULT NULL::uuid, _examination_id uuid DEFAULT NULL::uuid, _external_reference text DEFAULT NULL::text, _materiality text DEFAULT 'medium'::text, _urgency text DEFAULT 'medium'::text, _owner_id uuid DEFAULT NULL::uuid, _team_id uuid DEFAULT NULL::uuid, _target_review_date date DEFAULT NULL::date, _theme text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _entities uuid[]; _e uuid;
        _source_type text; _urg text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF length(btrim(COALESCE(_supervisory_basis,''))) < 20 THEN
    RAISE EXCEPTION 'a supervisory basis of at least 20 characters is required' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023'; END IF;

  _entities := COALESCE(_entity_ids,'{}');
  IF _assessment_id IS NOT NULL AND COALESCE(array_length(_entities,1),0) = 0 THEN
    SELECT ARRAY[entity_id] INTO _entities FROM public.supervisory_assessment WHERE id = _assessment_id;
  END IF;
  IF _assessment_id IS NULL AND _assessment_dimension_id IS NULL AND _signal_id IS NULL
     AND _complaint_id IS NULL AND _examination_id IS NULL
     AND _external_reference IS NULL THEN
    RAISE EXCEPTION 'attention requires a governed origin (assessment, dimension, signal, complaint, examination or external reference)'
      USING ERRCODE = '22023'; END IF;

  FOREACH _e IN ARRAY _entities LOOP
    PERFORM public.supervisory_entity_scope_check(_uid, _e);
  END LOOP;
  IF COALESCE(array_length(_entities,1),0) > 0 THEN
    SELECT l.sector_id, s.regulator_id INTO _sector, _reg
      FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id WHERE l.id = _entities[1];
  END IF;

  -- legacy conduct vocabulary is written alongside the enterprise origin_kind
  _source_type := lower(COALESCE(_origin_kind,'OTHER_GOVERNED_SOURCE'));
  _urg := CASE lower(COALESCE(_urgency,'medium'))
            WHEN 'low' THEN 'routine' WHEN 'medium' THEN 'elevated'
            WHEN 'high' THEN 'urgent' WHEN 'severe' THEN 'urgent'
            ELSE lower(_urgency) END;

  _ref := 'SA-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_attention_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_attention(
    reference, regulator_id, sector_id, title, source_type, source_module, source_id,
    source_reference, supervisory_basis, entity_ids, sector_ids, theme, linked_evidence,
    materiality, urgency, breadth, owner_id, team_id, target_review_date,
    domain_code, origin_kind, created_by)
  VALUES (_ref, _reg, _sector, btrim(_title), _source_type, lower(_domain_code),
    COALESCE(_assessment_id,_signal_id,_complaint_id,_examination_id), _external_reference,
    btrim(_supervisory_basis), _entities,
    CASE WHEN _sector IS NULL THEN '{}'::uuid[] ELSE ARRAY[_sector] END,
    nullif(btrim(COALESCE(_theme,'')),''), '[]'::jsonb,
    COALESCE(_materiality,'medium'), _urg,
    GREATEST(COALESCE(array_length(_entities,1),0),1), COALESCE(_owner_id,_uid), _team_id,
    _target_review_date, _domain_code, _origin_kind, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_attention_origin(attention_id, origin_kind, assessment_id,
    assessment_dimension_id, signal_id, examination_id, complaint_id, external_reference, created_by)
  VALUES (_id, _origin_kind, _assessment_id, _assessment_dimension_id, _signal_id,
    _examination_id, _complaint_id, _external_reference, _uid);

  INSERT INTO public.supervisory_attention_event(attention_id, event_type, to_state, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'OPEN', btrim(_supervisory_basis),
    jsonb_build_object('domain_code',_domain_code,'origin_kind',_origin_kind,'assessment_id',_assessment_id), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_attention',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code,'origin_kind',_origin_kind),
    'Supervisory attention ' || _ref || ' opened');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','OPEN','domain_code',_domain_code);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_attention_open(text,text,text,text,uuid[],uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_attention_open(text,text,text,text,uuid[],uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,date,text) TO authenticated, service_role;