-- AML-CLOSE-02 — Sector Overlay + Facts + Sources runtime authority

-- 1. The exact pinned component of a family, fail-closed on draft / unapproved / out-of-period.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_pinned_component_internal(_assessment_id uuid, _type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _snap public.supervisory_assessment_policy_snapshot; _b jsonb; _c public.supervisory_policy_component;
        _base jsonb;
BEGIN
  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  IF _snap.id IS NULL THEN
    RETURN jsonb_build_object('component_type', _type, 'status','NOT_GOVERNED', 'reason_code','NO_POLICY_BASIS',
      'reason','The assessment has no policy basis snapshot, so this configuration family does not govern it.');
  END IF;
  _base := jsonb_build_object('component_type', _type,
    'policy_profile_code', _snap.policy_profile_code, 'policy_profile_version', _snap.policy_profile_version,
    'resolved_as_of', _snap.resolved_as_of);
  SELECT x INTO _b FROM jsonb_array_elements(_snap.components) x WHERE x->>'component_type' = _type;
  IF _b IS NULL THEN
    RETURN _base || jsonb_build_object('status','NOT_GOVERNED','reason_code', _type || '_NOT_BOUND',
      'reason','The policy package pinned by this assessment binds no component of this family.');
  END IF;
  SELECT * INTO _c FROM public.supervisory_policy_component WHERE id = NULLIF(_b->>'component_id','')::uuid;
  IF _c.id IS NULL THEN
    RETURN _base || jsonb_build_object('status','UNAVAILABLE','reason_code','PINNED_POLICY_MISSING',
      'reason','The pinned component version can no longer be read.');
  END IF;
  _base := _base || jsonb_build_object('component_id', _c.id, 'code', _c.code,
    'component_version', _c.component_version, 'component_status', _c.status,
    'effective_from', _c.effective_from, 'effective_to', _c.effective_to);
  IF _c.component_type <> _type OR _c.domain_code <> _snap.domain_code THEN
    RETURN _base || jsonb_build_object('status','UNAVAILABLE','reason_code','PINNED_POLICY_MISMATCH',
      'reason','The pinned component does not belong to this family or domain.');
  END IF;
  IF _c.approved_at IS NULL OR _c.status NOT IN ('ACTIVE','SUPERSEDED','RETIRED') THEN
    RETURN _base || jsonb_build_object('status','UNAVAILABLE','reason_code','PINNED_POLICY_NOT_APPROVED',
      'reason','The pinned component is not an approved, activated version, so it cannot govern supervision.');
  END IF;
  IF (_c.effective_from IS NOT NULL AND _c.effective_from > _snap.resolved_as_of)
     OR (_c.effective_to IS NOT NULL AND _c.effective_to < _snap.resolved_as_of) THEN
    RETURN _base || jsonb_build_object('status','UNAVAILABLE','reason_code','PINNED_POLICY_NOT_EFFECTIVE',
      'reason', format('The pinned component was not in effect on %s, the date the assessment basis was resolved.', _snap.resolved_as_of));
  END IF;
  RETURN _base || jsonb_build_object('status','GOVERNED','reason_code','GOVERNED',
    'content', _c.content,
    'content_hash', public.supervisory_policy_component_content_hash(_type, _c.id));
END $$;

-- 2. Entity sector -> pinned sector overlay decision.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_sector_overlay_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _p jsonb; _sid uuid; _code text; _rule jsonb; _ctx jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _p := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'SECTOR_OVERLAY');

  _sid := _a.sector_id;
  IF _sid IS NULL THEN
    BEGIN
      _ctx := public.supervisory_methodology_context_internal(_a.entity_id, _a.domain_code, current_date);
      _sid := NULLIF(_ctx->>'sector_id','')::uuid;
    EXCEPTION WHEN OTHERS THEN _sid := NULL; END;
  END IF;
  IF _sid IS NOT NULL THEN
    _sid := public.sector_effective_id(_sid);
    SELECT code INTO _code FROM public.sectors WHERE id = _sid;
  END IF;
  _p := _p || jsonb_build_object('sector_id', _sid, 'sector_code', _code);

  IF _p->>'status' = 'NOT_GOVERNED' THEN
    RETURN _p || jsonb_build_object('applies', true, 'applicability', NULL);
  END IF;
  IF _p->>'status' <> 'GOVERNED' THEN
    RETURN (_p - 'content') || jsonb_build_object('applies', false);
  END IF;
  IF _code IS NULL THEN
    RETURN (_p - 'content') || jsonb_build_object('applies', false, 'reason_code','SECTOR_UNRESOLVED',
      'reason','The entity''s supervised sector could not be determined, so the sector overlay cannot be applied.');
  END IF;
  SELECT x INTO _rule FROM jsonb_array_elements(COALESCE(_p->'content'->'sectors','[]'::jsonb)) x
   WHERE upper(btrim(x->>'sector_code')) = upper(_code) LIMIT 1;
  IF _rule IS NULL THEN
    RETURN (_p - 'content') || jsonb_build_object('applies', false, 'reason_code','SECTOR_NOT_IN_OVERLAY',
      'reason', format('Sector %s is not covered by sector overlay %s %s.', _code, _p->>'code', _p->>'component_version'));
  END IF;
  IF upper(_rule->>'applicability') = 'NOT_APPLICABLE' THEN
    RETURN (_p - 'content') || jsonb_build_object('applies', false, 'applicability','NOT_APPLICABLE',
      'reason_code','SECTOR_NOT_APPLICABLE', 'note', _rule->>'note',
      'reason', format('Sector overlay %s %s marks sector %s as not applicable.', _p->>'code', _p->>'component_version', _code));
  END IF;
  RETURN (_p - 'content') || jsonb_build_object('applies', true,
    'applicability', upper(_rule->>'applicability'), 'note', _rule->>'note');
END $$;

-- 3. Data-type compatibility between FACT_CONFIG vocabulary and methodology types.
CREATE OR REPLACE FUNCTION public.supervisory_fact_type_compatible(_config_type text, _method_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(COALESCE(_config_type,''))
    WHEN '' THEN true
    WHEN 'PERCENT' THEN lower(COALESCE(_method_type,'')) LIKE '%percent%'
    WHEN 'NUMBER' THEN lower(COALESCE(_method_type,'')) ~ '(numeric|number|decimal|integer|whole|currency|ratio|amount|count)'
    WHEN 'BOOLEAN' THEN lower(COALESCE(_method_type,'')) ~ '(bool|yes)'
    WHEN 'DATE' THEN lower(COALESCE(_method_type,'')) LIKE '%date%'
    WHEN 'TEXT' THEN lower(COALESCE(_method_type,'')) ~ '(text|string|enum|code|category|list)'
    ELSE false END
$$;

-- 4. Governance check for one fact write. Raises on refusal, returns provenance.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_governance_internal(
  _assessment_id uuid, _fact_code text, _method_type text, _source_type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ov jsonb; _fc jsonb; _sb jsonb; _item jsonb; _bindings jsonb; _match jsonb;
        _src text := upper(btrim(COALESCE(_source_type,''))); _allowed text;
BEGIN
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
END $$;

-- 5. Fact capture: enforce governance and persist provenance.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_set(_assessment_id uuid, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment;
        _fr public.supervisory_methodology_fact_requirement;
        _typed jsonb; _src text; _auto boolean; _id uuid; _num numeric; _den numeric;
        _existing public.supervisory_assessment_fact; _sysval jsonb; _gov jsonb;
BEGIN
  _uid := public.supervisory_assessment_execution_require_edit(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  IF NULLIF(_payload->>'fact_requirement_id','') IS NOT NULL THEN
    SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement
     WHERE id = (_payload->>'fact_requirement_id')::uuid;
  ELSIF NULLIF(_payload->>'fact_code','') IS NOT NULL AND _a.methodology_id IS NOT NULL THEN
    SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement
     WHERE methodology_id = _a.methodology_id AND fact_code = _payload->>'fact_code';
  END IF;
  IF _fr.id IS NULL THEN
    RAISE EXCEPTION 'validation_required: the fact is not defined by the methodology version attached to this assessment'
      USING ERRCODE = '22023';
  END IF;
  IF _a.methodology_id IS NOT NULL AND _fr.methodology_id <> _a.methodology_id THEN
    RAISE EXCEPTION 'validation_required: the fact requirement belongs to a different methodology version'
      USING ERRCODE = '22023';
  END IF;

  _typed := public.supervisory_assessment_fact_typed_value(_fr.data_type, _payload);

  _num := NULLIF(_payload->>'numerator','')::numeric;
  _den := NULLIF(_payload->>'denominator','')::numeric;
  IF (_fr.numerator_basis IS NOT NULL OR _fr.denominator_basis IS NOT NULL)
     AND (_num IS NULL OR _den IS NULL) THEN
    RAISE EXCEPTION 'validation_required: this fact requires a numerator and a denominator, not a bare ratio'
      USING ERRCODE = '22023';
  END IF;
  IF _den IS NOT NULL AND _den = 0 THEN
    RAISE EXCEPTION 'validation_required: a denominator of zero cannot support a ratio' USING ERRCODE = '22023';
  END IF;

  _src := upper(btrim(COALESCE(_payload->>'source_type','')));
  IF _src = '' THEN
    RAISE EXCEPTION 'validation_required: state where this value came from' USING ERRCODE = '22023';
  END IF;
  IF _fr.source_type_expectation IS NOT NULL AND array_length(_fr.source_type_expectation,1) > 0
     AND NOT (_src = ANY (_fr.source_type_expectation)) THEN
    RAISE EXCEPTION 'validation_required: % is not an accepted source for %', _src, _fr.fact_code
      USING ERRCODE = '22023';
  END IF;

  -- AML-CLOSE-02: pinned sector overlay / fact configuration / source binding
  _gov := public.supervisory_assessment_fact_governance_internal(_assessment_id, _fr.fact_code, _fr.data_type, _src);

  _auto := COALESCE((_payload->>'auto_prefilled')::boolean, false);
  IF _auto AND NOT COALESCE(_fr.auto_prefill_allowed, false) THEN
    RAISE EXCEPTION 'validation_required: the methodology does not permit auto-prefill for %', _fr.fact_code
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _existing FROM public.supervisory_assessment_fact
   WHERE assessment_id = _assessment_id AND fact_code = _fr.fact_code;

  _sysval := CASE WHEN _auto THEN jsonb_build_object(
      'value', _payload->>'value', 'numerator', _num, 'denominator', _den,
      'source_type', _src, 'source_reference', _payload->>'source_reference',
      'as_of_date', _payload->>'as_of_date',
      'extraction_timestamp', COALESCE(NULLIF(_payload->>'extraction_timestamp','')::timestamptz, now()))
    ELSE _existing.system_value END;

  INSERT INTO public.supervisory_assessment_fact(
    assessment_id, entity_id, methodology_id, fact_requirement_id, fact_code, data_type, unit,
    value_numeric, value_text, value_date, value_boolean, numerator, denominator,
    period_start, period_end, as_of_date, source_type, source_reference, source_object_type,
    source_object_id, source_timestamp, extraction_timestamp, auto_prefilled, system_value,
    provenance, note, recorded_by)
  VALUES (_assessment_id, _a.entity_id, _fr.methodology_id, _fr.id, _fr.fact_code, _fr.data_type,
    COALESCE(NULLIF(_payload->>'unit',''), _fr.unit),
    (_typed->>'value_numeric')::numeric, _typed->>'value_text',
    (_typed->>'value_date')::date, (_typed->>'value_boolean')::boolean, _num, _den,
    NULLIF(_payload->>'period_start','')::date, NULLIF(_payload->>'period_end','')::date,
    NULLIF(_payload->>'as_of_date','')::date, _src,
    NULLIF(btrim(COALESCE(_payload->>'source_reference','')),''),
    NULLIF(_payload->>'source_object_type',''), NULLIF(_payload->>'source_object_id','')::uuid,
    NULLIF(_payload->>'source_timestamp','')::timestamptz,
    COALESCE(NULLIF(_payload->>'extraction_timestamp','')::timestamptz, CASE WHEN _auto THEN now() END),
    _auto, _sysval,
    jsonb_build_object('recorded_by', _uid, 'recorded_at', now(), 'basis',
      CASE WHEN _auto THEN 'AUTO_PREFILL' ELSE 'OFFICER_RECORDED' END, 'governance', _gov),
    NULLIF(btrim(COALESCE(_payload->>'note','')),''), _uid)
  ON CONFLICT (assessment_id, fact_code) DO UPDATE
    SET fact_requirement_id = EXCLUDED.fact_requirement_id,
        data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
        value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
        value_date = EXCLUDED.value_date, value_boolean = EXCLUDED.value_boolean,
        numerator = EXCLUDED.numerator, denominator = EXCLUDED.denominator,
        period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
        as_of_date = EXCLUDED.as_of_date, source_type = EXCLUDED.source_type,
        source_reference = EXCLUDED.source_reference,
        source_object_type = EXCLUDED.source_object_type,
        source_object_id = EXCLUDED.source_object_id,
        source_timestamp = EXCLUDED.source_timestamp,
        extraction_timestamp = EXCLUDED.extraction_timestamp,
        auto_prefilled = EXCLUDED.auto_prefilled,
        system_value = EXCLUDED.system_value,
        provenance = EXCLUDED.provenance, note = EXCLUDED.note, updated_at = now()
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, CASE WHEN _auto THEN 'FACT_AUTO_PREFILLED' ELSE 'FACT_RECORDED' END,
    format('%s recorded', _fr.fact_code),
    jsonb_build_object('fact_id', _id, 'fact_code', _fr.fact_code, 'source_type', _src,
      'auto_prefilled', _auto, 'governance', _gov), _uid);

  RETURN jsonb_build_object('fact_id', _id, 'fact_code', _fr.fact_code,
    'auto_prefilled', _auto, 'response_recorded', false, 'governance', _gov);
END $function$;

-- 6. Fact correction: same governance on the final source.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_override(_fact_id uuid, _payload jsonb, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _f public.supervisory_assessment_fact;
        _fr public.supervisory_methodology_fact_requirement; _typed jsonb; _num numeric; _den numeric;
        _src text; _gov jsonb;
BEGIN
  SELECT * INTO _f FROM public.supervisory_assessment_fact WHERE id = _fact_id;
  IF _f.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment fact' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_assessment_execution_require_edit(_f.assessment_id);

  SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement WHERE id = _f.fact_requirement_id;
  IF _fr.id IS NULL THEN
    RAISE EXCEPTION 'validation_required: the fact is no longer defined by the methodology' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(_fr.officer_edit_allowed, true) THEN
    RAISE EXCEPTION 'validation_required: the methodology does not permit an officer value for %', _fr.fact_code
      USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'validation_required: a reason of at least 10 characters is required to change a prefilled value'
      USING ERRCODE = '22023';
  END IF;

  _typed := public.supervisory_assessment_fact_typed_value(_f.data_type, _payload);
  _num := NULLIF(_payload->>'numerator','')::numeric;
  _den := NULLIF(_payload->>'denominator','')::numeric;
  IF (_fr.numerator_basis IS NOT NULL OR _fr.denominator_basis IS NOT NULL)
     AND (_num IS NULL OR _den IS NULL) THEN
    RAISE EXCEPTION 'validation_required: this fact requires a numerator and a denominator, not a bare ratio'
      USING ERRCODE = '22023';
  END IF;

  _src := COALESCE(NULLIF(upper(btrim(COALESCE(_payload->>'source_type',''))),''), 'OFFICER_ENTERED');
  _gov := public.supervisory_assessment_fact_governance_internal(_f.assessment_id, _fr.fact_code, _fr.data_type, _src);

  UPDATE public.supervisory_assessment_fact
     SET system_value = COALESCE(system_value, jsonb_build_object(
           'value', COALESCE(value_numeric::text, value_text, value_date::text, value_boolean::text),
           'numerator', numerator, 'denominator', denominator,
           'source_type', source_type, 'source_reference', source_reference,
           'as_of_date', as_of_date, 'extraction_timestamp', extraction_timestamp)),
         value_numeric = (_typed->>'value_numeric')::numeric,
         value_text = _typed->>'value_text',
         value_date = (_typed->>'value_date')::date,
         value_boolean = (_typed->>'value_boolean')::boolean,
         numerator = COALESCE(_num, numerator),
         denominator = COALESCE(_den, denominator),
         officer_overridden = true,
         override_reason = btrim(_reason),
         overridden_by = _uid,
         overridden_at = now(),
         source_type = _src,
         source_reference = COALESCE(NULLIF(btrim(COALESCE(_payload->>'source_reference','')),''), source_reference),
         provenance = provenance || jsonb_build_object('override',
           jsonb_build_object('by', _uid, 'at', now(), 'reason', btrim(_reason)), 'governance', _gov),
         updated_at = now()
   WHERE id = _fact_id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_f.assessment_id, 'FACT_OVERRIDDEN', btrim(_reason),
    jsonb_build_object('fact_id', _fact_id, 'fact_code', _f.fact_code, 'governance', _gov), _uid);

  RETURN jsonb_build_object('fact_id', _fact_id, 'fact_code', _f.fact_code, 'officer_overridden', true);
END $function$;

-- 7. Missing information: methodology-required facts plus FACT_CONFIG mandatory facts.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_gaps_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _base jsonb; _fc jsonb; _extra jsonb;
BEGIN
  WITH a AS (SELECT * FROM public.supervisory_assessment WHERE id = _assessment_id),
  scoped AS (
    SELECT qq.id AS question_id, qq.question_code
      FROM public.supervisory_methodology_question qq
      JOIN a ON a.methodology_id = qq.methodology_id
     WHERE qq.active
       AND (NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan pp
                         WHERE pp.assessment_id = _assessment_id)
            OR COALESCE(public.supervisory_assessment_question_plan_state(_assessment_id, qq.id),'')
               LIKE 'INCLUDED%')
  ),
  required AS (
    SELECT DISTINCT fr.id AS fact_requirement_id, fr.fact_code, fr.label, s.question_code
      FROM public.supervisory_methodology_question_fact qf
      JOIN scoped s ON s.question_id = qf.question_id
      JOIN public.supervisory_methodology_fact_requirement fr ON fr.id = qf.fact_requirement_id
     WHERE COALESCE(qf.is_required, false) AND COALESCE(fr.is_required, false)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fact_requirement_id', r.fact_requirement_id, 'fact_code', r.fact_code,
           'label', r.label, 'question_code', r.question_code, 'reason', 'fact_missing')
           ORDER BY r.fact_code), '[]'::jsonb) INTO _base
    FROM required r
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_fact f
                      WHERE f.assessment_id = _assessment_id AND f.fact_code = r.fact_code);

  _fc := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'FACT_CONFIG');
  IF _fc->>'status' <> 'GOVERNED' THEN RETURN _base; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fact_requirement_id', fr.id, 'fact_code', fr.fact_code, 'label', fr.label,
           'question_code', NULL, 'reason', 'fact_missing',
           'required_by', format('%s %s', _fc->>'code', _fc->>'component_version'))
           ORDER BY fr.fact_code), '[]'::jsonb) INTO _extra
    FROM jsonb_array_elements(COALESCE(_fc->'content'->'facts','[]'::jsonb)) x
    JOIN public.supervisory_assessment a ON a.id = _assessment_id
    JOIN public.supervisory_methodology_fact_requirement fr
      ON fr.methodology_id = a.methodology_id AND upper(fr.fact_code) = upper(btrim(x->>'fact_code'))
   WHERE COALESCE((x->>'is_required')::boolean, false)
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_fact f
                      WHERE f.assessment_id = _assessment_id AND f.fact_code = fr.fact_code)
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_base) b WHERE b->>'fact_code' = fr.fact_code);
  RETURN _base || _extra;
END $$;

-- 8. Assessment creation: refuse when the pinned overlay excludes the entity's sector.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_snapshot_stamp_internal(_assessment_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _ctx jsonb; _res jsonb; _comp jsonb; _prof jsonb;
        _id uuid; _hash text; _meth jsonb; _prog jsonb; _calc jsonb; _ov jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id) THEN
    RETURN jsonb_build_object('stamped', false, 'reason_code','ALREADY_STAMPED');
  END IF;

  _ctx := public.supervisory_methodology_context_internal(_a.entity_id, _a.domain_code, current_date);
  _res := public.supervisory_policy_profile_effective_internal(
            _a.domain_code, NULLIF(_ctx->>'regulator_id','')::uuid,
            NULLIF(_ctx->>'sector_id','')::uuid, current_date);

  IF _res->>'status' <> 'RESOLVED' THEN
    IF (_res->>'reason_code') = 'NO_ACTIVE_PROFILE_CONFIGURED' THEN
      INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
      VALUES (_assessment_id, 'POLICY_BASIS_UNAVAILABLE',
        'No active regulator-owned policy profile is configured for this domain, so no policy basis snapshot was taken.',
        _res, auth.uid());
      RETURN jsonb_build_object('stamped', false, 'reason_code', _res->>'reason_code',
                                'reason', _res->>'reason');
    END IF;
    RAISE EXCEPTION 'policy_profile_%: %', lower(_res->>'status'), _res->>'reason' USING ERRCODE = '22023';
  END IF;

  _prof := _res->'profile';
  _comp := _res->'components';

  IF NOT (public.supervisory_policy_profile_compatibility((_prof->>'policy_profile_id')::uuid)->>'compatible')::boolean THEN
    RAISE EXCEPTION 'policy_profile_incompatible: the active policy profile % % does not pass cross-component compatibility validation',
      _prof->>'code', _prof->>'profile_version' USING ERRCODE = '22023';
  END IF;

  SELECT x INTO _meth FROM jsonb_array_elements(_comp) x WHERE x->>'component_type' = 'METHODOLOGY';
  SELECT x INTO _prog FROM jsonb_array_elements(_comp) x WHERE x->>'component_type' = 'ASSESSMENT_PROGRAMME';
  SELECT x INTO _calc FROM jsonb_array_elements(_comp) x WHERE x->>'component_type' = 'CALCULATION_CONFIG';

  _hash := md5((_prof->>'policy_profile_id')||'|'||(_prof->>'profile_version')||'|'||
    COALESCE((SELECT string_agg((x->>'component_type')||':'||COALESCE(x->>'component_version','')||':'||
                                COALESCE(x->>'content_hash',''), ',' ORDER BY x->>'component_type')
                FROM jsonb_array_elements(_comp) x), ''));

  INSERT INTO public.supervisory_assessment_policy_snapshot(
    assessment_id, domain_code, policy_profile_id, policy_profile_code, policy_profile_version,
    policy_profile_origin, regulator_id, sector_id, resolved_as_of, resolved_by,
    methodology_id, methodology_code, methodology_version,
    programme_set_id, programme_code, programme_version,
    calculation_config_id, calculation_config_version,
    components, resolution, content_hash)
  VALUES (
    _assessment_id, _a.domain_code, (_prof->>'policy_profile_id')::uuid, _prof->>'code',
    _prof->>'profile_version', _prof->>'origin',
    NULLIF(_prof->>'regulator_id','')::uuid, NULLIF(_prof->>'sector_id','')::uuid,
    current_date, auth.uid(),
    NULLIF(_meth->>'component_id','')::uuid, _meth->>'component_code', _meth->>'component_version',
    NULLIF(_prog->>'component_id','')::uuid, _prog->>'component_code', _prog->>'component_version',
    NULLIF(_calc->>'component_id','')::uuid, _calc->>'component_version',
    _comp, _res - 'candidates', _hash)
  RETURNING id INTO _id;

  -- AML-CLOSE-02: the pinned sector overlay must admit the entity's sector.
  _ov := public.supervisory_assessment_sector_overlay_internal(_assessment_id);
  IF NOT COALESCE((_ov->>'applies')::boolean, false) THEN
    RAISE EXCEPTION 'validation_required: %', COALESCE(_ov->>'reason','the sector overlay does not apply to this entity')
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, 'POLICY_BASIS_STAMPED',
    'The governing policy profile and every bound component version were recorded as the immutable policy basis of this assessment.',
    jsonb_build_object('snapshot_id', _id, 'policy_profile_id', _prof->>'policy_profile_id',
      'policy_profile_code', _prof->>'code', 'policy_profile_version', _prof->>'profile_version',
      'content_hash', _hash, 'components', _comp, 'sector_overlay', _ov), auth.uid());

  RETURN jsonb_build_object('stamped', true, 'snapshot_id', _id,
    'policy_profile_id', _prof->>'policy_profile_id',
    'policy_profile_version', _prof->>'profile_version', 'content_hash', _hash,
    'sector_overlay', _ov);
END $function$;

-- 9. Read model for the assessment screen.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_configuration_authority(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _ov jsonb; _fc jsonb; _sb jsonb; _facts jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  _ov := public.supervisory_assessment_sector_overlay_internal(_assessment_id);
  _fc := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'FACT_CONFIG');
  _sb := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'SOURCE_BINDING');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fact_code', fr.fact_code, 'label', fr.label, 'data_type', fr.data_type,
      'permitted', CASE WHEN _fc->>'status' = 'GOVERNED' THEN cfg.item IS NOT NULL
                        WHEN _fc->>'status' = 'UNAVAILABLE' THEN false ELSE true END,
      'required', COALESCE(fr.is_required,false) OR COALESCE((cfg.item->>'is_required')::boolean,false),
      'sector_codes', cfg.item->'sector_codes',
      'allowed_sources', (SELECT jsonb_agg(jsonb_build_object('source_kind', upper(b->>'source_kind'),
                                   'source_reference', b->>'source_reference'))
                            FROM jsonb_array_elements(COALESCE(_sb->'content'->'bindings','[]'::jsonb)) b
                           WHERE _sb->>'status' = 'GOVERNED'
                             AND upper(btrim(b->>'fact_code')) = upper(fr.fact_code)),
      'recorded', f.id IS NOT NULL, 'source_type', f.source_type,
      'governance', f.provenance->'governance') ORDER BY fr.fact_code), '[]'::jsonb) INTO _facts
    FROM public.supervisory_methodology_fact_requirement fr
    LEFT JOIN LATERAL (SELECT x AS item FROM jsonb_array_elements(COALESCE(_fc->'content'->'facts','[]'::jsonb)) x
                        WHERE _fc->>'status' = 'GOVERNED' AND upper(btrim(x->>'fact_code')) = upper(fr.fact_code)
                        LIMIT 1) cfg ON true
    LEFT JOIN public.supervisory_assessment_fact f ON f.assessment_id = _assessment_id AND f.fact_code = fr.fact_code
   WHERE fr.methodology_id = _a.methodology_id;

  RETURN jsonb_build_object('assessment_id', _assessment_id, 'generated_at', now(),
    'sector_overlay', _ov,
    'fact_config', _fc - 'content',
    'source_binding', _sb - 'content',
    'methodology_fact_count', (SELECT count(*) FROM public.supervisory_methodology_fact_requirement WHERE methodology_id = _a.methodology_id),
    'facts', _facts);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_pinned_component_internal(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_sector_overlay_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_governance_internal(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_fact_type_compatible(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_gaps_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_snapshot_stamp_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_configuration_authority(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_configuration_authority(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_pinned_component_internal(uuid, text),
  public.supervisory_assessment_sector_overlay_internal(uuid),
  public.supervisory_assessment_fact_governance_internal(uuid, text, text, text),
  public.supervisory_assessment_configuration_authority(uuid) TO service_role;

UPDATE public.supervisory_policy_component_type
   SET is_runtime_consumed = true, updated_at = now(),
       capability_note = CASE component_type
         WHEN 'SECTOR_OVERLAY' THEN 'Runtime-consumed (AML-CLOSE-02): the overlay pinned in the assessment policy basis decides whether the entity''s sector is in scope; creation and fact capture are refused when it is not.'
         WHEN 'FACT_CONFIG' THEN 'Runtime-consumed (AML-CLOSE-02): when pinned, only listed methodology facts may be recorded, sector restrictions and declared types are enforced, and mandatory facts count as missing information.'
         WHEN 'SOURCE_BINDING' THEN 'Runtime-consumed (AML-CLOSE-02): when pinned, a fact''s stated source must match a bound source kind; the binding is stored with the fact.'
       END
 WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING');