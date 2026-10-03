CREATE OR REPLACE FUNCTION public.supervisory_methodology_create(_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _domain text; _origin text; _code text; _version text; _reg uuid; _id uuid;
BEGIN
  _domain := upper(btrim(COALESCE(_payload->>'domain_code','')));
  IF NOT public.supervisory_domain_valid(_domain) THEN
    RAISE EXCEPTION 'invalid_domain: %', _domain USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_domain_require_manage(_domain);

  _code    := upper(btrim(COALESCE(_payload->>'code','')));
  _version := btrim(COALESCE(_payload->>'version',''));
  _reg     := NULLIF(_payload->>'regulator_id','')::uuid;

  IF _code = '' OR _version = '' THEN
    RAISE EXCEPTION 'code and version are required' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_payload->>'name',''))) < 3 THEN
    RAISE EXCEPTION 'a methodology name is required' USING ERRCODE = '22023'; END IF;

  _origin := upper(COALESCE(_payload->>'origin','REGULATOR_AUTHORED'));
  IF _origin = 'MIPL_REFERENCE' THEN
    IF NOT public.is_super_admin(_uid) THEN
      RAISE EXCEPTION 'reference_creation_denied: only a platform administrator may create a MIPL reference template'
        USING ERRCODE = '42501'; END IF;
  ELSE
    _origin := 'REGULATOR_AUTHORED';
    IF _reg IS NULL THEN
      RAISE EXCEPTION 'regulator_id is required for a regulator-authored methodology' USING ERRCODE = '22023'; END IF;
    -- AML-CLOSE-02A: previously called a non-existent 2-argument overload, so every
    -- regulator-authored creation failed. The governed regulator-scoped check raises 42501.
    PERFORM public.supervisory_domain_require_manage_for_regulator(_domain, _reg);
  END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_methodology
              WHERE domain_code = _domain AND code = _code AND version = _version) THEN
    RAISE EXCEPTION 'duplicate_methodology: % % already exists in %', _code, _version, _domain
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology(
    code, domain_code, name, title, version, status, origin, regulator_id, sector_id,
    effective_from, definition, assessment_frequency_months, calculation_guidance,
    approval_required, created_by)
  VALUES (_code, _domain, btrim(_payload->>'name'), _payload->>'title', _version,
          'DRAFT', _origin, _reg, NULLIF(_payload->>'sector_id','')::uuid,
          NULLIF(_payload->>'effective_from','')::date,
          COALESCE(_payload->'definition','{}'::jsonb),
          NULLIF(_payload->>'assessment_frequency_months','')::integer,
          _payload->>'calculation_guidance', true, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'CREATED', 'DRAFT', 'Methodology version created', _uid,
          jsonb_build_object('origin', _origin, 'code', _code, 'version', _version));
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_governance_internal(_assessment_id uuid, _fact_code text, _method_type text, _source_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _ov jsonb; _fc jsonb; _sb jsonb; _item jsonb; _bindings jsonb; _match jsonb;
        _src text := upper(btrim(COALESCE(_source_type,''))); _allowed text;
BEGIN
  -- AML-CLOSE-02A: a retired methodology fact definition can no longer be recorded.
  IF EXISTS (SELECT 1 FROM public.supervisory_methodology_fact_requirement fr
               JOIN public.supervisory_assessment a ON a.methodology_id = fr.methodology_id
              WHERE a.id = _assessment_id AND upper(fr.fact_code) = upper(_fact_code)
                AND fr.definition_status = 'RETIRED') THEN
    RAISE EXCEPTION 'validation_required: % is a retired fact definition on this methodology version and cannot be recorded', _fact_code
      USING ERRCODE = '22023';
  END IF;

  _ov := public.supervisory_assessment_sector_overlay_internal(_assessment_id);
  IF NOT COALESCE((_ov->>'applies')::boolean, false) THEN
    RAISE EXCEPTION 'validation_required: %', COALESCE(_ov->>'reason','the sector overlay does not apply to this entity')
      USING ERRCODE = '22023';
  END IF;

  _fc := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'FACT_CONFIG');
  IF _fc->>'status' = 'UNAVAILABLE' THEN
    RAISE EXCEPTION 'validation_required: fact configuration cannot be used — %', _fc->>'reason' USING ERRCODE = '22023';
  END IF;
  IF _fc->>'status' = 'GOVERNED' THEN
    SELECT x INTO _item FROM jsonb_array_elements(COALESCE(_fc->'content'->'facts','[]'::jsonb)) x
     WHERE upper(btrim(x->>'fact_code')) = upper(_fact_code) LIMIT 1;
    IF _item IS NULL THEN
      RAISE EXCEPTION 'validation_required: % is not a permitted fact under fact configuration % %',
        _fact_code, _fc->>'code', _fc->>'component_version' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(_item->'sector_codes') = 'array' AND jsonb_array_length(_item->'sector_codes') > 0
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(_item->'sector_codes') s
                        WHERE upper(btrim(s)) = upper(COALESCE(_ov->>'sector_code',''))) THEN
      RAISE EXCEPTION 'validation_required: % does not apply to sector % under fact configuration % %',
        _fact_code, COALESCE(_ov->>'sector_code','(unresolved)'), _fc->>'code', _fc->>'component_version'
        USING ERRCODE = '22023';
    END IF;
    IF NOT public.supervisory_fact_type_compatible(_item->>'data_type', _method_type) THEN
      RAISE EXCEPTION 'validation_required: fact configuration declares % as %, which conflicts with the methodology type %',
        _fact_code, _item->>'data_type', _method_type USING ERRCODE = '22023';
    END IF;
  END IF;

  _sb := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'SOURCE_BINDING');
  IF _sb->>'status' = 'UNAVAILABLE' THEN
    RAISE EXCEPTION 'validation_required: source binding cannot be used — %', _sb->>'reason' USING ERRCODE = '22023';
  END IF;
  IF _sb->>'status' = 'GOVERNED' THEN
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _bindings
      FROM jsonb_array_elements(COALESCE(_sb->'content'->'bindings','[]'::jsonb)) x
     WHERE upper(btrim(x->>'fact_code')) = upper(_fact_code);
    IF jsonb_array_length(_bindings) > 0 THEN
      SELECT x INTO _match FROM jsonb_array_elements(_bindings) x
       WHERE upper(btrim(x->>'source_kind')) = _src LIMIT 1;
      IF _match IS NULL THEN
        SELECT string_agg(DISTINCT upper(x->>'source_kind'), ', ') INTO _allowed FROM jsonb_array_elements(_bindings) x;
        RAISE EXCEPTION 'validation_required: % is not a permitted source for %; source binding % % allows %',
          _src, _fact_code, _sb->>'code', _sb->>'component_version', _allowed USING ERRCODE = '22023';
      END IF;
    ELSIF _src NOT IN ('RETURN','FORM','MANUAL','EXTERNAL','DERIVED') THEN
      RAISE EXCEPTION 'validation_required: % is not a recognised source kind under source binding % % (RETURN, FORM, MANUAL, EXTERNAL, DERIVED)',
        _src, _sb->>'code', _sb->>'component_version' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sector_overlay', jsonb_build_object('status', _ov->>'status', 'code', _ov->>'code',
       'component_version', _ov->>'component_version', 'component_id', _ov->>'component_id',
       'content_hash', _ov->>'content_hash', 'sector_code', _ov->>'sector_code', 'applicability', _ov->>'applicability'),
    'fact_config', jsonb_build_object('status', _fc->>'status', 'code', _fc->>'code',
       'component_version', _fc->>'component_version', 'component_id', _fc->>'component_id',
       'content_hash', _fc->>'content_hash', 'is_required', COALESCE((_item->>'is_required')::boolean, false)),
    'source_binding', jsonb_build_object('status', _sb->>'status', 'code', _sb->>'code',
       'component_version', _sb->>'component_version', 'component_id', _sb->>'component_id',
       'content_hash', _sb->>'content_hash', 'source_kind', _match->>'source_kind',
       'source_reference', _match->>'source_reference'),
    'checked_at', now());
END $function$;