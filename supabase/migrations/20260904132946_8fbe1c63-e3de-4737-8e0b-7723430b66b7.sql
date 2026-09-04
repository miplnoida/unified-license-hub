-- 1. Shared entity-context resolution helper (no authority checks: internal only)
CREATE OR REPLACE FUNCTION public.supervisory_methodology_context_internal(
  _entity_id uuid, _domain_code text, _as_of date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d text; _asof date; _sector uuid; _reg uuid; _found boolean := false;
  _res jsonb; _mid uuid; _meth jsonb;
BEGIN
  _d := upper(btrim(COALESCE(_domain_code,'')));
  _asof := COALESCE(_as_of, current_date);

  SELECT true, l.sector_id, s.regulator_id INTO _found, _sector, _reg
    FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id
   WHERE l.id = _entity_id;

  IF NOT COALESCE(_found,false) THEN
    RETURN jsonb_build_object('status','ENTITY_NOT_FOUND','entity_id',_entity_id,
      'domain_code',_d,'as_of',_asof,'sector_id',NULL,'regulator_id',NULL,
      'methodology_id',NULL,'methodology_version',NULL,'methodology',NULL,
      'reason','the entity does not exist');
  END IF;

  _res := public.supervisory_methodology_resolve_detail(_d, _sector, _asof, _reg);
  _mid := NULLIF(_res->>'methodology_id','')::uuid;

  IF _mid IS NOT NULL THEN
    SELECT jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'version',m.version,
             'status',m.status,'effective_from',m.effective_from,'effective_to',m.effective_to,
             'sector_id',m.sector_id,'regulator_id',m.regulator_id)
      INTO _meth FROM public.supervisory_methodology m WHERE m.id = _mid;
  END IF;

  RETURN jsonb_build_object(
    'status', _res->>'status',
    'entity_id', _entity_id,
    'domain_code', _d,
    'as_of', _asof,
    'sector_id', _sector,
    'regulator_id', _reg,
    'methodology_id', _mid,
    'methodology_version', _res->>'methodology_version',
    'methodology', _meth,
    'candidate_count', _res->'candidate_count',
    'reason', _res->>'reason',
    'resolution', _res - 'candidates');
END
$function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_context_internal(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_methodology_context_internal(uuid, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_context_internal(uuid, text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_context_internal(uuid, text, date) TO service_role;

-- 2. Governed preview operation for screens
CREATE OR REPLACE FUNCTION public.supervisory_methodology_resolve_for_entity(
  _entity_id uuid, _domain_code text, _as_of date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _ctx jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY[
    'aml_supervision.view','aml_supervision.create','aml_supervision.approve',
    'prudential_supervision.view','prudential_supervision.record_camels_assessment',
    'market_conduct.view','market_conduct.run_conduct_analytics',
    'supervisory_spine.view','supervisory_spine.create']);

  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  -- The preview never reconstructs supervisory context in the browser: sector,
  -- regulator and the effective date rule are all server-derived, through the
  -- same helper `supervisory_assessment_create` uses.
  _ctx := public.supervisory_methodology_context_internal(_entity_id, _domain_code, _as_of);
  IF _ctx->>'status' = 'ENTITY_NOT_FOUND' THEN
    RAISE EXCEPTION 'entity_not_found: the entity does not exist' USING ERRCODE = '22023';
  END IF;
  RETURN _ctx;
END
$function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve_for_entity(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve_for_entity(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_resolve_for_entity(uuid, text, date) TO authenticated, service_role;

-- 3. Create delegates its entity context and resolution to the same helper
CREATE OR REPLACE FUNCTION public.supervisory_assessment_create(_entity_id uuid, _domain_code text, _assessment_type text DEFAULT 'PERIODIC'::text, _period_start date DEFAULT NULL::date, _period_end date DEFAULT NULL::date, _methodology_id uuid DEFAULT NULL::uuid, _trigger_type text DEFAULT 'PERIODIC'::text, _trigger_signal_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text, _owner_id uuid DEFAULT NULL::uuid, _supersedes_id uuid DEFAULT NULL::uuid, _confidentiality text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _mv text; _struct jsonb;
  _ctx jsonb; _res jsonb; _resolved uuid; _asof date;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create','aml_supervision.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  IF NOT public.supervisory_domain_applicable(_entity_id, _domain_code) THEN
    RAISE EXCEPTION 'domain_not_applicable: % supervision has been determined not to apply to this entity; record a governed perimeter determination before assessing it', _domain_code
      USING ERRCODE = '22023';
  END IF;

  -- The methodology version is the server's determination, resolved as at the
  -- execution date per the approved methodology-resolution decision, through the
  -- same entity-context helper the preview uses. A caller-supplied id is a
  -- consistency assertion only, never a selection.
  _asof := current_date;
  _ctx := public.supervisory_methodology_context_internal(_entity_id, _domain_code, _asof);
  IF _ctx->>'status' = 'ENTITY_NOT_FOUND' THEN
    RAISE EXCEPTION 'entity_not_found: the entity does not exist' USING ERRCODE = '22023';
  END IF;
  _sector := NULLIF(_ctx->>'sector_id','')::uuid;
  _reg    := NULLIF(_ctx->>'regulator_id','')::uuid;
  _res    := _ctx->'resolution';

  IF _ctx->>'status' = 'AMBIGUOUS' THEN
    RAISE EXCEPTION 'methodology_ambiguous: %', _ctx->>'reason' USING ERRCODE = '22023';
  END IF;

  _resolved := NULLIF(_ctx->>'methodology_id','')::uuid;

  IF _resolved IS NULL THEN
    RAISE EXCEPTION 'methodology_unavailable: no ACTIVE % methodology version applies to this entity on %; a methodology owner must publish an applicable version before an assessment can be created',
      upper(_domain_code), _asof USING ERRCODE = '22023';
  END IF;

  IF _methodology_id IS NOT NULL AND _methodology_id <> _resolved THEN
    RAISE EXCEPTION 'methodology_selection_mismatch: the supplied methodology version is not the version the canonical resolver selects for this entity, sector, regulator and date (resolved %)', _resolved
      USING ERRCODE = '22023';
  END IF;

  _methodology_id := _resolved;
  _mv := _ctx->>'methodology_version';

  _ref := 'SUP-' || _domain_code || '-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.supervisory_assessment_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_assessment(
    reference, entity_id, domain_code, assessment_type, methodology_id, methodology_version,
    period_start, period_end, trigger_type, trigger_signal_id, summary, owner_id,
    regulator_id, sector_id, supersedes_id, confidentiality, origin_provenance, created_by)
  VALUES (_ref, _entity_id, _domain_code, COALESCE(_assessment_type,'PERIODIC'), _methodology_id, _mv,
    _period_start, _period_end, COALESCE(_trigger_type,'PERIODIC'), _trigger_signal_id, _summary,
    COALESCE(_owner_id,_uid), _reg, _sector, _supersedes_id,
    COALESCE(_confidentiality, CASE WHEN _domain_code = 'AML_CFT' THEN 'CONFIDENTIAL' ELSE 'STANDARD' END),
    'GOVERNED', _uid)
  RETURNING id INTO _id;

  _struct := public.supervisory_assessment_dimension_materialise_internal(_id, _uid);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'draft', _summary,
    jsonb_build_object('domain_code',_domain_code,'trigger_type',_trigger_type,'supersedes_id',_supersedes_id,
      'structure',_struct,'methodology_resolution',_res), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_assessment',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code,'entity_id',_entity_id,
      'methodology_id',_methodology_id,'methodology_version',_mv,
      'methodology_resolution','SERVER_RESOLVED',
      'dimensions_materialised',_struct->'created'),
    'Supervisory assessment ' || _ref || ' created');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','draft','domain_code',_domain_code,
    'methodology_id',_methodology_id,'methodology_version',_mv,
    'methodology_resolution',_res,
    'structure',_struct);
END
$function$;