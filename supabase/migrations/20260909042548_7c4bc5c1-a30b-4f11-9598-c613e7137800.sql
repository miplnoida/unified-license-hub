-- AML-02 completion: full Studio authoring surface, governed and server-enforced.

ALTER TABLE public.supervisory_methodology_parameter
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS intended_usage text,
  ADD COLUMN IF NOT EXISTS applicability_guidance text;

ALTER TABLE public.supervisory_methodology_fact_requirement
  ADD COLUMN IF NOT EXISTS description text;

-- ------------------------------------------------ governed vocabulary source
CREATE OR REPLACE FUNCTION public.supervisory_methodology_vocabulary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  -- Observed governed content is the primary source; the documented floor keeps
  -- an empty methodology authorable. No policy enum is duplicated in the browser.
  SELECT jsonb_build_object(
    'question_class', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT question_class x FROM public.supervisory_methodology_question WHERE question_class IS NOT NULL
        UNION SELECT unnest(ARRAY['CORE','CONDITIONAL','ENHANCED'])) s),
    'axis', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT axis x FROM public.supervisory_methodology_question WHERE axis IS NOT NULL
        UNION SELECT unnest(ARRAY['INHERENT_RISK','CONTROL_EFFECTIVENESS'])) s),
    'effectiveness_focus', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT effectiveness_focus x FROM public.supervisory_methodology_question WHERE effectiveness_focus IS NOT NULL
        UNION SELECT unnest(ARRAY['DESIGN','IMPLEMENTATION','OPERATING_EFFECTIVENESS'])) s),
    'calculation_participation', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT calculation_participation x FROM public.supervisory_methodology_question WHERE calculation_participation IS NOT NULL
        UNION SELECT unnest(ARRAY['SCORED','INFORMATIONAL','GATING'])) s),
    'change_classification', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT change_classification x FROM public.supervisory_methodology_question WHERE change_classification IS NOT NULL
        UNION SELECT unnest(ARRAY['NEW','CARRIED_FORWARD','REWORDED','RETIRED'])) s),
    'evidence_basis', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT unnest(evidence_basis_types) x FROM public.supervisory_methodology_question WHERE evidence_basis_types IS NOT NULL
        UNION SELECT unnest(ARRAY['ENTERPRISE_DOCUMENT','SYSTEM_FACT','REGULATORY_RETURN','STRUCTURED_METRIC',
          'SUPERVISORY_SAMPLE','WORKPAPER','PRIOR_EXAMINATION','FINDING','REMEDIATION_RECORD','RFI_RESPONSE',
          'AUTHORISED_EXTERNAL_SOURCE'])) s),
    'dimension_group', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT dimension_group x FROM public.supervisory_methodology_dimension WHERE dimension_group IS NOT NULL
        UNION SELECT unnest(ARRAY['INHERENT_RISK','CONTROL_EFFECTIVENESS','OTHER'])) s),
    'dimension_kind', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT dimension_kind x FROM public.supervisory_methodology_dimension WHERE dimension_kind IS NOT NULL
        UNION SELECT unnest(ARRAY['INHERENT','CONTROL','COMPOSITE'])) s),
    'fact_data_type', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT data_type x FROM public.supervisory_methodology_fact_requirement WHERE data_type IS NOT NULL
        UNION SELECT unnest(ARRAY['NUMERIC','BOOLEAN','TEXT','DATE','RATIO','COUNT'])) s),
    'fact_definition_status', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT definition_status x FROM public.supervisory_methodology_fact_requirement WHERE definition_status IS NOT NULL
        UNION SELECT unnest(ARRAY['ATTRIBUTES_PENDING','ATTRIBUTES_COMPLETE'])) s),
    'fact_attribute_source', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT attribute_source x FROM public.supervisory_methodology_fact_requirement WHERE attribute_source IS NOT NULL
        UNION SELECT unnest(ARRAY['DECLARED','DERIVED','SYSTEM'])) s),
    'parameter_kind', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT parameter_kind x FROM public.supervisory_methodology_parameter WHERE parameter_kind IS NOT NULL
        UNION SELECT unnest(ARRAY['MATERIALITY','THRESHOLD','WEIGHTING'])) s),
    'parameter_data_type', (SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb) FROM (
        SELECT data_type x FROM public.supervisory_methodology_parameter WHERE data_type IS NOT NULL
        UNION SELECT unnest(ARRAY['NUMERIC','PERCENTAGE','CURRENCY','TEXT'])) s)
  ) INTO _v;
  RETURN _v;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_vocabulary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_vocabulary() TO authenticated, service_role;

-- ------------------------------------------------- governed creation from UI
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

  -- A regulator may only author its own methodology. Reference templates are
  -- platform policy content: their creation stays with platform authority.
  _origin := upper(COALESCE(_payload->>'origin','REGULATOR_AUTHORED'));
  IF _origin = 'MIPL_REFERENCE' THEN
    IF NOT public.is_super_admin(_uid) THEN
      RAISE EXCEPTION 'reference_creation_denied: only a platform administrator may create a MIPL reference template'
        USING ERRCODE = '42501'; END IF;
  ELSE
    _origin := 'REGULATOR_AUTHORED';
    IF _reg IS NULL THEN
      RAISE EXCEPTION 'regulator_id is required for a regulator-authored methodology' USING ERRCODE = '22023'; END IF;
    PERFORM public.user_has_regulator_authority(_uid, _reg);
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

REVOKE ALL ON FUNCTION public.supervisory_methodology_create(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_create(jsonb) TO authenticated, service_role;

-- ------------------------------------------------------ metadata authoring
CREATE OR REPLACE FUNCTION public.supervisory_methodology_metadata_save(_methodology_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _expected timestamptz;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);

  SELECT updated_at INTO _expected FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _payload ? 'expected_updated_at' THEN
    IF _expected IS DISTINCT FROM (_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'concurrent_update: this methodology changed since it was opened; reload before saving'
        USING ERRCODE = '40001'; END IF;
  END IF;

  -- Identity, origin, ownership and approval state are never UI-mutable.
  UPDATE public.supervisory_methodology SET
    name = COALESCE(NULLIF(btrim(_payload->>'name'),''), name),
    title = COALESCE(_payload->>'title', title),
    effective_from = COALESCE(NULLIF(_payload->>'effective_from','')::date, effective_from),
    effective_to = CASE WHEN _payload ? 'effective_to'
                        THEN NULLIF(_payload->>'effective_to','')::date ELSE effective_to END,
    assessment_frequency_months = COALESCE(NULLIF(_payload->>'assessment_frequency_months','')::integer,
                                           assessment_frequency_months),
    calculation_guidance = COALESCE(_payload->>'calculation_guidance', calculation_guidance),
    applicable_entity_types = CASE WHEN _payload ? 'applicable_entity_types'
      THEN COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(_payload->'applicable_entity_types') v), '{}')
      ELSE applicable_entity_types END,
    sector_id = CASE WHEN _payload ? 'sector_id' THEN NULLIF(_payload->>'sector_id','')::uuid ELSE sector_id END,
    definition = COALESCE(
      definition || jsonb_strip_nulls(jsonb_build_object(
        'description', _payload->>'description',
        'purpose', _payload->>'purpose',
        'scope', _payload->>'scope',
        'legal_basis', _payload->>'legal_basis',
        'notes', _payload->>'notes',
        'change_summary', _payload->>'change_summary',
        'sector_notes', _payload->>'sector_notes')), definition),
    updated_at = now()
  WHERE id = _methodology_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'METADATA_UPDATED', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid, _payload);
  RETURN _methodology_id;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_metadata_save(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_metadata_save(uuid, jsonb) TO authenticated, service_role;

-- --------------------------------------------------------- dimension studio
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_save(_methodology_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _code text; _group text; _kind text; _weight numeric;
        _vocab jsonb; _expected timestamptz; _existing uuid;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);

  _code  := upper(btrim(COALESCE(_payload->>'dimension_code','')));
  _group := upper(COALESCE(_payload->>'dimension_group','OTHER'));
  IF _code = '' THEN RAISE EXCEPTION 'dimension_code required' USING ERRCODE = '22023'; END IF;

  _kind := upper(COALESCE(_payload->>'dimension_kind',
    CASE _group WHEN 'INHERENT_RISK' THEN 'INHERENT'
                WHEN 'CONTROL_EFFECTIVENESS' THEN 'CONTROL' ELSE 'COMPOSITE' END));
  IF _kind NOT IN ('INHERENT','CONTROL','COMPOSITE') THEN
    RAISE EXCEPTION 'invalid_dimension_kind: %', _kind USING ERRCODE = '22023'; END IF;

  _weight := NULLIF(_payload->>'weight','')::numeric;
  IF _weight IS NOT NULL AND (_weight < 0 OR _weight > 100) THEN
    RAISE EXCEPTION 'invalid_weight: a dimension weight must be between 0 and 100' USING ERRCODE = '22023'; END IF;

  SELECT id, updated_at INTO _existing, _expected FROM public.supervisory_methodology_dimension
   WHERE methodology_id = _methodology_id AND dimension_code = _code;
  IF _payload ? 'expected_updated_at' AND _existing IS NOT NULL THEN
    IF _expected IS DISTINCT FROM (_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'concurrent_update: dimension % changed since it was opened; reload before saving', _code
        USING ERRCODE = '40001'; END IF;
  END IF;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count, provenance)
  VALUES (
    _methodology_id, _code, _group, _kind,
    COALESCE(NULLIF(btrim(_payload->>'label'),''), _code),
    _payload->>'description', _weight,
    COALESCE((_payload->>'evidence_required')::boolean, false),
    COALESCE(NULLIF(_payload->>'sort_order','')::integer, 100),
    COALESCE((_payload->>'active')::boolean, true),
    _payload->>'scoring_guidance',
    COALESCE(_payload->'mandatory_questions','[]'::jsonb),
    COALESCE(_payload->'data_sources','[]'::jsonb),
    _payload->>'evidence_requirements',
    COALESCE(NULLIF(_payload->>'min_evidence_count','')::integer, 0),
    COALESCE(_payload->'provenance','{}'::jsonb))
  ON CONFLICT (methodology_id, dimension_code) DO UPDATE SET
    dimension_group = EXCLUDED.dimension_group,
    dimension_kind = EXCLUDED.dimension_kind,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    weight = EXCLUDED.weight,
    evidence_required = EXCLUDED.evidence_required,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active,
    scoring_guidance = EXCLUDED.scoring_guidance,
    mandatory_questions = EXCLUDED.mandatory_questions,
    data_sources = EXCLUDED.data_sources,
    evidence_requirements = EXCLUDED.evidence_requirements,
    min_evidence_count = EXCLUDED.min_evidence_count,
    provenance = EXCLUDED.provenance,
    updated_at = now()
  RETURNING id INTO _id;

  IF _payload ? 'mandatory_questions' AND jsonb_array_length(COALESCE(_payload->'mandatory_questions','[]'::jsonb)) > 0 THEN
    PERFORM public.supervisory_methodology_question_sync(_id, _payload->'mandatory_questions');
  END IF;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id,
          CASE WHEN _existing IS NULL THEN 'DIMENSION_CREATED' ELSE 'DIMENSION_UPDATED' END,
          NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid,
          jsonb_build_object('dimension_code', _code, 'sort_order', _payload->>'sort_order'));
  RETURN _id;
END $function$;

-- ------------------------------------------------- semantic profile studio
CREATE OR REPLACE FUNCTION public.supervisory_methodology_semantic_profile_set(_methodology_id uuid, _payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _m public.supervisory_methodology; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    IF upper(btrim(COALESCE(r->>'semantic_code',''))) = '' THEN
      RAISE EXCEPTION 'semantic_code required' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(COALESCE(r->'response_meaning','{}'::jsonb)) <> 'object'
       OR COALESCE(r->'response_meaning','{}'::jsonb) = '{}'::jsonb THEN
      RAISE EXCEPTION 'response_meaning must state the supervisory meaning of each response for %',
        upper(r->>'semantic_code') USING ERRCODE = '22023'; END IF;

    INSERT INTO public.supervisory_methodology_semantic_profile(
      methodology_id, domain_code, semantic_code, label, description, response_meaning, provenance)
    VALUES (_methodology_id, _m.domain_code, upper(btrim(r->>'semantic_code')),
            COALESCE(NULLIF(btrim(r->>'label'),''), upper(r->>'semantic_code')), r->>'description',
            r->'response_meaning', COALESCE(r->'provenance','{}'::jsonb))
    ON CONFLICT (methodology_id, semantic_code) DO UPDATE SET
      label = EXCLUDED.label, description = EXCLUDED.description,
      response_meaning = EXCLUDED.response_meaning, provenance = EXCLUDED.provenance,
      active = true, updated_at = now();
    _n := _n + 1;

    INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, actor_id, detail)
    VALUES (_methodology_id, 'SEMANTIC_PROFILE_SAVED', _uid,
            jsonb_build_object('semantic_code', upper(r->>'semantic_code')));
  END LOOP;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_semantic_profile_retire(
  _methodology_id uuid, _semantic_code text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _code text; _deps integer;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  _code := upper(btrim(COALESCE(_semantic_code,'')));
  SELECT id INTO _id FROM public.supervisory_methodology_semantic_profile
   WHERE methodology_id = _methodology_id AND semantic_code = _code;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'not_found: semantic profile %', _code USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO _deps FROM public.supervisory_methodology_question q
   WHERE q.response_semantics_profile_id = _id AND q.active;
  IF _deps > 0 THEN
    RAISE EXCEPTION 'dependency_blocked: % active question(s) use semantic profile %; reassign them first', _deps, _code
      USING ERRCODE = '22023'; END IF;

  UPDATE public.supervisory_methodology_semantic_profile
     SET active = false, updated_at = now() WHERE id = _id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'SEMANTIC_PROFILE_RETIRED', btrim(_rationale), _uid,
          jsonb_build_object('semantic_code', _code));
  RETURN _id;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_semantic_profile_retire(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_semantic_profile_retire(uuid, text, text) TO authenticated, service_role;

-- ------------------------------------------------------- fact definition studio
CREATE OR REPLACE FUNCTION public.supervisory_methodology_fact_requirement_set(_methodology_id uuid, _payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    IF upper(btrim(COALESCE(r->>'fact_code',''))) = '' THEN
      RAISE EXCEPTION 'fact_code required' USING ERRCODE = '22023'; END IF;
    IF r ? 'materiality_parameter_code' AND NULLIF(upper(btrim(r->>'materiality_parameter_code')),'') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_parameter p
                        WHERE p.methodology_id = _methodology_id
                          AND p.parameter_code = upper(btrim(r->>'materiality_parameter_code'))) THEN
      RAISE EXCEPTION 'invalid_parameter_reference: % is not defined on this methodology version',
        upper(btrim(r->>'materiality_parameter_code')) USING ERRCODE = '22023'; END IF;

    INSERT INTO public.supervisory_methodology_fact_requirement(
      methodology_id, fact_code, label, description, data_type, unit, numerator_basis,
      denominator_basis, period_expectation, source_type_expectation, materiality_parameter_code,
      is_required, auto_prefill_allowed, officer_edit_allowed, attribute_source,
      definition_status, provenance)
    VALUES (_methodology_id, upper(btrim(r->>'fact_code')), r->>'label', r->>'description',
            r->>'data_type', r->>'unit', r->>'numerator_basis', r->>'denominator_basis',
            r->>'period_expectation',
            CASE WHEN r ? 'source_type_expectation'
              THEN ARRAY(SELECT jsonb_array_elements_text(r->'source_type_expectation')) END,
            NULLIF(upper(COALESCE(r->>'materiality_parameter_code','')),''),
            COALESCE((r->>'is_required')::boolean, true),
            COALESCE((r->>'auto_prefill_allowed')::boolean, false),
            COALESCE((r->>'officer_edit_allowed')::boolean, true),
            COALESCE(r->>'attribute_source','DECLARED'),
            COALESCE(r->>'definition_status','ATTRIBUTES_PENDING'),
            COALESCE(r->'provenance','{}'::jsonb))
    ON CONFLICT (methodology_id, fact_code) DO UPDATE SET
      label = EXCLUDED.label, description = EXCLUDED.description,
      data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
      numerator_basis = EXCLUDED.numerator_basis, denominator_basis = EXCLUDED.denominator_basis,
      period_expectation = EXCLUDED.period_expectation,
      source_type_expectation = EXCLUDED.source_type_expectation,
      materiality_parameter_code = EXCLUDED.materiality_parameter_code,
      is_required = EXCLUDED.is_required, auto_prefill_allowed = EXCLUDED.auto_prefill_allowed,
      officer_edit_allowed = EXCLUDED.officer_edit_allowed,
      attribute_source = EXCLUDED.attribute_source,
      definition_status = EXCLUDED.definition_status,
      provenance = EXCLUDED.provenance, updated_at = now();
    _n := _n + 1;

    INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, actor_id, detail)
    VALUES (_methodology_id, 'FACT_REQUIREMENT_SAVED', _uid,
            jsonb_build_object('fact_code', upper(r->>'fact_code')));
  END LOOP;
  RETURN _n;
END $function$;

-- --------------------------------------------- parameter DEFINITION studio
-- Definition authoring only. A regulator-approved policy value belongs to the
-- calculation / materiality policy layer and is unreachable from the Studio.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_parameter_set(_methodology_id uuid, _payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    IF r ? 'value_numeric' OR r ? 'value_text' OR r ? 'approval_status' THEN
      RAISE EXCEPTION 'parameter_value_authority_denied: the Methodology Studio authors parameter definitions only; a regulator-approved policy value is set through the calculation / materiality policy process'
        USING ERRCODE = '42501'; END IF;
    IF upper(btrim(COALESCE(r->>'parameter_code',''))) = '' THEN
      RAISE EXCEPTION 'parameter_code required' USING ERRCODE = '22023'; END IF;

    INSERT INTO public.supervisory_methodology_parameter(
      methodology_id, parameter_code, parameter_kind, label, description, intended_usage,
      applicability_guidance, data_type, unit, approval_status, provenance)
    VALUES (_methodology_id, upper(btrim(r->>'parameter_code')),
            COALESCE(upper(NULLIF(r->>'parameter_kind','')),'MATERIALITY'),
            r->>'label', r->>'description', r->>'intended_usage', r->>'applicability_guidance',
            r->>'data_type', r->>'unit', 'UNAPPROVED', COALESCE(r->'provenance','{}'::jsonb))
    ON CONFLICT (methodology_id, parameter_code) DO UPDATE SET
      parameter_kind = EXCLUDED.parameter_kind, label = EXCLUDED.label,
      description = EXCLUDED.description, intended_usage = EXCLUDED.intended_usage,
      applicability_guidance = EXCLUDED.applicability_guidance,
      data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
      provenance = EXCLUDED.provenance, updated_at = now();
    _n := _n + 1;

    INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, actor_id, detail)
    VALUES (_methodology_id, 'PARAMETER_DEFINITION_SAVED', _uid,
            jsonb_build_object('parameter_code', upper(r->>'parameter_code')));
  END LOOP;
  RETURN _n;
END $function$;

-- ------------------------------------------------------ complete question save
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_save(
  _methodology_id uuid, _payload jsonb, _rationale text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _code text; _dim uuid; _dim_code text; _id uuid; _existing uuid;
        _expected timestamptz; _class text; _sem uuid; _sem_code text;
        _participation text; _axis text; _basis text[]; _vocab jsonb; _bad text;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);

  _code := upper(btrim(COALESCE(_payload->>'question_code','')));
  IF _code = '' THEN RAISE EXCEPTION 'question_code required' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_payload->>'prompt',''))) < 10 THEN
    RAISE EXCEPTION 'a question prompt of at least 10 characters is required for %', _code
      USING ERRCODE = '22023'; END IF;

  _dim_code := upper(btrim(COALESCE(_payload->>'dimension_code','')));
  IF _dim_code = '' THEN RAISE EXCEPTION 'dimension_code required for %', _code USING ERRCODE = '22023'; END IF;
  SELECT id INTO _dim FROM public.supervisory_methodology_dimension
   WHERE methodology_id = _methodology_id AND dimension_code = _dim_code AND active;
  IF _dim IS NULL THEN
    RAISE EXCEPTION 'not_found: active dimension % in this methodology version', _dim_code USING ERRCODE = '22023'; END IF;

  _class := NULLIF(upper(btrim(COALESCE(_payload->>'question_class',''))),'');
  _participation := NULLIF(upper(btrim(COALESCE(_payload->>'calculation_participation',''))),'');
  _axis := NULLIF(upper(btrim(COALESCE(_payload->>'axis',''))),'');

  -- A conditional question without a resolution rule is structurally incomplete.
  IF _class = 'CONDITIONAL'
     AND COALESCE(btrim(_payload->>'trigger_condition'),'') = ''
     AND COALESCE(_payload->'applicability_rule','{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'conditional_question_incomplete: % is classified CONDITIONAL and must state a trigger condition or applicability rule', _code
      USING ERRCODE = '22023'; END IF;

  IF _participation = 'SCORED' AND _axis IS NULL THEN
    RAISE EXCEPTION 'scored_question_without_axis: % participates in scoring and must be assigned an axis', _code
      USING ERRCODE = '22023'; END IF;

  -- Response semantics must be owned by this same methodology version.
  _sem_code := NULLIF(upper(btrim(COALESCE(_payload->>'response_semantics_code',''))),'');
  IF _sem_code IS NOT NULL THEN
    SELECT id INTO _sem FROM public.supervisory_methodology_semantic_profile
     WHERE methodology_id = _methodology_id AND semantic_code = _sem_code AND active;
    IF _sem IS NULL THEN
      RAISE EXCEPTION 'invalid_semantic_profile: % is not an active semantic profile of this methodology version', _sem_code
        USING ERRCODE = '22023'; END IF;
  END IF;

  IF _payload ? 'evidence_basis_types' THEN
    _basis := ARRAY(SELECT jsonb_array_elements_text(_payload->'evidence_basis_types'));
    _vocab := (SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) FROM jsonb_array_elements_text(
                 public.supervisory_methodology_vocabulary()->'evidence_basis') v);
    SELECT x INTO _bad FROM unnest(_basis) x
     WHERE NOT (_vocab @> to_jsonb(x)) LIMIT 1;
    IF _bad IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_evidence_basis: % is not a governed evidence basis category', _bad
        USING ERRCODE = '22023'; END IF;
  END IF;

  IF COALESCE((_payload->>'allow_not_applicable')::boolean, false) = false
     AND COALESCE(btrim(_payload->>'na_conditions'),'') <> '' THEN
    RAISE EXCEPTION 'invalid_na_configuration: % records "not applicable" conditions but does not permit "not applicable"', _code
      USING ERRCODE = '22023'; END IF;

  SELECT id, updated_at INTO _existing, _expected FROM public.supervisory_methodology_question
   WHERE methodology_id = _methodology_id AND question_code = _code;
  IF _payload ? 'expected_updated_at' AND _existing IS NOT NULL THEN
    IF _expected IS DISTINCT FROM (_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'concurrent_update: question % changed since it was opened; reload before saving', _code
        USING ERRCODE = '40001'; END IF;
  END IF;

  INSERT INTO public.supervisory_methodology_question(
    methodology_id, methodology_dimension_id, question_code, prompt, guidance,
    supervisory_intent, response_options, mandatory, requires_observation,
    requires_evidence, min_evidence_count, allow_not_applicable, na_requires_rationale,
    na_conditions, minimum_evidence_note, evidence_basis_types, sort_order, active,
    question_class, axis, effectiveness_focus, calculation_participation,
    response_semantics_code, response_semantics_profile_id, trigger_condition,
    applicability_rule, sector_applicability, sector_classification, sector_notes,
    supervisory_judgement_required, factual_auto_prefill_possible, standards_reference,
    change_classification, predecessor_mapping, provenance)
  VALUES (
    _methodology_id, _dim, _code, btrim(_payload->>'prompt'), _payload->>'guidance',
    _payload->>'supervisory_intent',
    CASE WHEN _payload ? 'response_options'
      THEN ARRAY(SELECT jsonb_array_elements_text(_payload->'response_options')) END,
    COALESCE((_payload->>'mandatory')::boolean, true),
    COALESCE((_payload->>'requires_observation')::boolean, false),
    COALESCE((_payload->>'requires_evidence')::boolean, false),
    COALESCE(NULLIF(_payload->>'min_evidence_count','')::integer, 0),
    COALESCE((_payload->>'allow_not_applicable')::boolean, false),
    COALESCE((_payload->>'na_requires_rationale')::boolean, true),
    NULLIF(btrim(COALESCE(_payload->>'na_conditions','')),''),
    NULLIF(btrim(COALESCE(_payload->>'minimum_evidence_note','')),''),
    _basis,
    COALESCE(NULLIF(_payload->>'sort_order','')::integer, 100),
    true, _class, _axis,
    NULLIF(upper(btrim(COALESCE(_payload->>'effectiveness_focus',''))),''),
    _participation, _sem_code, _sem,
    NULLIF(btrim(COALESCE(_payload->>'trigger_condition','')),''),
    COALESCE(_payload->'applicability_rule','{}'::jsonb),
    NULLIF(btrim(COALESCE(_payload->>'sector_applicability','')),''),
    NULLIF(btrim(COALESCE(_payload->>'sector_classification','')),''),
    NULLIF(btrim(COALESCE(_payload->>'sector_notes','')),''),
    COALESCE((_payload->>'supervisory_judgement_required')::boolean, false),
    COALESCE((_payload->>'factual_auto_prefill_possible')::boolean, false),
    NULLIF(btrim(COALESCE(_payload->>'standards_reference','')),''),
    NULLIF(upper(btrim(COALESCE(_payload->>'change_classification',''))),''),
    NULLIF(btrim(COALESCE(_payload->>'predecessor_mapping','')),''),
    COALESCE(_payload->'provenance','{}'::jsonb))
  ON CONFLICT (methodology_dimension_id, question_code) DO UPDATE SET
    prompt = EXCLUDED.prompt,
    guidance = EXCLUDED.guidance,
    supervisory_intent = EXCLUDED.supervisory_intent,
    response_options = EXCLUDED.response_options,
    mandatory = EXCLUDED.mandatory,
    requires_observation = EXCLUDED.requires_observation,
    requires_evidence = EXCLUDED.requires_evidence,
    min_evidence_count = EXCLUDED.min_evidence_count,
    allow_not_applicable = EXCLUDED.allow_not_applicable,
    na_requires_rationale = EXCLUDED.na_requires_rationale,
    na_conditions = EXCLUDED.na_conditions,
    minimum_evidence_note = EXCLUDED.minimum_evidence_note,
    evidence_basis_types = COALESCE(EXCLUDED.evidence_basis_types, supervisory_methodology_question.evidence_basis_types),
    sort_order = EXCLUDED.sort_order,
    question_class = COALESCE(EXCLUDED.question_class, supervisory_methodology_question.question_class),
    axis = COALESCE(EXCLUDED.axis, supervisory_methodology_question.axis),
    effectiveness_focus = COALESCE(EXCLUDED.effectiveness_focus, supervisory_methodology_question.effectiveness_focus),
    calculation_participation = COALESCE(EXCLUDED.calculation_participation, supervisory_methodology_question.calculation_participation),
    response_semantics_code = COALESCE(EXCLUDED.response_semantics_code, supervisory_methodology_question.response_semantics_code),
    response_semantics_profile_id = COALESCE(EXCLUDED.response_semantics_profile_id, supervisory_methodology_question.response_semantics_profile_id),
    trigger_condition = EXCLUDED.trigger_condition,
    applicability_rule = EXCLUDED.applicability_rule,
    sector_applicability = EXCLUDED.sector_applicability,
    sector_classification = EXCLUDED.sector_classification,
    sector_notes = EXCLUDED.sector_notes,
    supervisory_judgement_required = EXCLUDED.supervisory_judgement_required,
    factual_auto_prefill_possible = EXCLUDED.factual_auto_prefill_possible,
    standards_reference = EXCLUDED.standards_reference,
    change_classification = COALESCE(EXCLUDED.change_classification, supervisory_methodology_question.change_classification),
    predecessor_mapping = EXCLUDED.predecessor_mapping,
    active = true,
    updated_at = now()
  RETURNING id INTO _id;

  IF _existing IS NOT NULL AND _id IS DISTINCT FROM _existing THEN
    RAISE EXCEPTION 'question % already exists in another dimension of this version; retire it there before recreating it', _code
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id,
          CASE WHEN _existing IS NULL THEN 'QUESTION_CREATED' ELSE 'QUESTION_UPDATED' END,
          NULLIF(btrim(COALESCE(_rationale,'')),''), _uid,
          jsonb_build_object('question_code', _code, 'dimension_code', _dim_code));
  RETURN _id;
END $function$;

-- ------------------------------------------------------- stricter validation
CREATE OR REPLACE FUNCTION public.supervisory_methodology_validate(_methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _m public.supervisory_methodology; _f jsonb := '[]'::jsonb; _n int; _txt text; _vocab jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501'; END IF;

  _vocab := public.supervisory_methodology_vocabulary();

  FOR _txt, _n IN
    SELECT d.dimension_group, count(*)
      FROM public.supervisory_methodology_dimension d
     WHERE d.methodology_id = _methodology_id AND d.active AND d.weight IS NOT NULL
     GROUP BY d.dimension_group
    HAVING round(sum(d.weight), 4) <> 100
  LOOP
    _f := _f || jsonb_build_object('code','DIMENSION_WEIGHT_SUM','severity','BLOCKING','object','DIMENSION',
      'subject', _txt, 'count', _n, 'message', format('Weighted dimensions in group %s do not total 100.', _txt));
  END LOOP;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_dimension d
   WHERE d.methodology_id = _methodology_id AND d.active
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question q
                      WHERE q.methodology_dimension_id = d.id AND q.active);
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','DIMENSION_WITHOUT_QUESTION','severity','BLOCKING',
    'object','DIMENSION','subject',NULL,'count',_n,
    'message', format('%s active dimension(s) hold no active question.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_dimension d
   WHERE d.methodology_id = _methodology_id AND d.active
     AND (d.dimension_kind IS NULL OR NOT (_vocab->'dimension_kind') @> to_jsonb(d.dimension_kind));
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','INVALID_DIMENSION_KIND','severity','BLOCKING',
    'object','DIMENSION','subject',NULL,'count',_n,
    'message', format('%s active dimension(s) carry no recognised dimension kind.', _n)); END IF;

  SELECT count(*) INTO _n FROM (
    SELECT q.question_code FROM public.supervisory_methodology_question q
     WHERE q.methodology_id = _methodology_id AND q.active
     GROUP BY q.question_code HAVING count(*) > 1) s;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','DUPLICATE_QUESTION_CODE','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question code(s) appear more than once in this version.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.response_semantics_profile_id IS NULL;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','QUESTION_WITHOUT_SEMANTICS','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s active question(s) carry no response semantics profile.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.response_semantics_profile_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_semantic_profile sp
                      WHERE sp.id = q.response_semantics_profile_id
                        AND sp.methodology_id = _methodology_id AND sp.active);
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','INVALID_SEMANTIC_PROFILE','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question(s) reference a semantic profile that is retired or owned by another version.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_semantic_profile sp
   WHERE sp.methodology_id = _methodology_id AND sp.active
     AND COALESCE(sp.response_meaning,'{}'::jsonb) = '{}'::jsonb;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','SEMANTIC_PROFILE_MALFORMED','severity','BLOCKING',
    'object','SEMANTIC','subject',NULL,'count',_n,
    'message', format('%s semantic profile(s) state no response meaning.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND q.calculation_participation = 'SCORED' AND q.axis IS NULL;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','SCORED_QUESTION_WITHOUT_AXIS','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s scored question(s) are not assigned to an assessment axis.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.question_class IS NOT NULL
     AND NOT (_vocab->'question_class') @> to_jsonb(q.question_class);
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','INVALID_QUESTION_CLASSIFICATION','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question(s) carry an unrecognised classification.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.question_class = 'CONDITIONAL'
     AND COALESCE(btrim(q.trigger_condition),'') = ''
     AND COALESCE(q.applicability_rule,'{}'::jsonb) = '{}'::jsonb;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','CONDITIONAL_WITHOUT_TRIGGER','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s conditional question(s) state no trigger condition or applicability rule.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND NOT q.allow_not_applicable AND COALESCE(btrim(q.na_conditions),'') <> '';
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','INVALID_NA_CONFIGURATION','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question(s) record "not applicable" conditions without permitting "not applicable".', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.evidence_basis_types IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(q.evidence_basis_types) b
                  WHERE NOT (_vocab->'evidence_basis') @> to_jsonb(b));
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','INVALID_EVIDENCE_BASIS','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question(s) accept an evidence basis category that is not governed.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question_fact qf
    JOIN public.supervisory_methodology_question q ON q.id = qf.question_id
    JOIN public.supervisory_methodology_fact_requirement fr ON fr.id = qf.fact_requirement_id
   WHERE q.methodology_id = _methodology_id AND fr.methodology_id <> q.methodology_id;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','CROSS_METHODOLOGY_FACT_LINK','severity','BLOCKING',
    'object','FACT','subject',NULL,'count',_n,
    'message', format('%s question/fact link(s) cross methodology versions.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_fact_requirement fr
   WHERE fr.methodology_id = _methodology_id AND fr.materiality_parameter_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_parameter p
                      WHERE p.methodology_id = _methodology_id
                        AND p.parameter_code = fr.materiality_parameter_code);
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','BROKEN_PARAMETER_REFERENCE','severity','BLOCKING',
    'object','PARAMETER','subject',NULL,'count',_n,
    'message', format('%s fact definition(s) reference a parameter that is not defined on this version.', _n)); END IF;

  -- Advisory: guidance completeness and future policy-layer work.
  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.question_class IS NULL;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','QUESTION_WITHOUT_CLASS','severity','ADVISORY',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s active question(s) are not classified as core, conditional or enhanced.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND q.requires_evidence AND COALESCE(q.min_evidence_count, 0) = 0;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','EVIDENCE_WITHOUT_MINIMUM','severity','ADVISORY',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question(s) require evidence but set no minimum number of items.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND q.allow_not_applicable AND COALESCE(btrim(q.na_conditions),'') = '';
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','NA_WITHOUT_CONDITIONS','severity','ADVISORY',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s question(s) permit "not applicable" without stating the conditions.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_fact_requirement f
   WHERE f.methodology_id = _methodology_id AND COALESCE(f.definition_status,'') <> 'ATTRIBUTES_COMPLETE';
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','FACT_DEFINITION_INCOMPLETE','severity','ADVISORY',
    'object','FACT','subject',NULL,'count',_n,
    'message', format('%s fact requirement(s) have incomplete attribute definitions.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_fact_requirement f
   WHERE f.methodology_id = _methodology_id AND f.is_required
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question_fact qf
                      WHERE qf.fact_requirement_id = f.id);
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','REQUIRED_FACT_UNLINKED','severity','ADVISORY',
    'object','FACT','subject',NULL,'count',_n,
    'message', format('%s required fact requirement(s) are linked to no question.', _n)); END IF;

  -- A parameter's approved policy VALUE belongs to the calculation / materiality
  -- policy layer, not to methodology structure. Its absence is advisory here.
  SELECT count(*) INTO _n FROM public.supervisory_methodology_parameter p
   WHERE p.methodology_id = _methodology_id AND COALESCE(p.approval_status,'') <> 'APPROVED';
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','PARAMETER_UNAPPROVED','severity','ADVISORY',
    'object','PARAMETER','subject',NULL,'count',_n,
    'message', format('%s parameter definition(s) have no approved policy value yet. A policy value is approved in the calculation / materiality policy layer and does not block methodology structure.', _n)); END IF;

  RETURN jsonb_build_object(
    'methodology_id', _m.id,
    'status', _m.status,
    'origin', _m.origin,
    'generated_at', now(),
    'blocking_count', (SELECT count(*) FROM jsonb_array_elements(_f) x WHERE x->>'severity' = 'BLOCKING'),
    'advisory_count', (SELECT count(*) FROM jsonb_array_elements(_f) x WHERE x->>'severity' = 'ADVISORY'),
    'findings', _f,
    'note', 'Blocking structural findings prevent this version being submitted for review or approved. Advisory findings do not.');
END $function$;

-- ------------------------------------------- lifecycle honours the validation gate
CREATE OR REPLACE FUNCTION public.supervisory_methodology_lifecycle(
  _methodology_id uuid, _to_status text, _rationale text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_methodology; _allowed boolean; _to text; _perm text;
        _approval uuid; _val jsonb; _block int;
BEGIN
  _to := upper(COALESCE(_to_status,''));
  SELECT * INTO _row FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_methodology_require_manage(_methodology_id);

  _allowed := CASE _row.status
    WHEN 'DRAFT'    THEN _to = 'REVIEW'
    WHEN 'REVIEW'   THEN _to IN ('APPROVED','DRAFT')
    WHEN 'APPROVED' THEN _to = 'ACTIVE'
    WHEN 'ACTIVE'   THEN _to = 'RETIRED'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','RETIRED') AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  -- Structural readiness is enforced by the server, not by a disabled button.
  IF _to IN ('REVIEW','APPROVED') THEN
    _val := public.supervisory_methodology_validate(_methodology_id);
    _block := COALESCE((_val->>'blocking_count')::int, 0);
    IF _block > 0 THEN
      RAISE EXCEPTION 'validation_blocked: % blocking structural finding(s) must be resolved before % (%)',
        _block, _to,
        (SELECT string_agg(DISTINCT x->>'code', ', ') FROM jsonb_array_elements(_val->'findings') x
          WHERE x->>'severity' = 'BLOCKING')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _to IN ('APPROVED','ACTIVE') AND _row.origin = 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_template_not_adoptable_in_place: % % is a MIPL reference template; a regulator must adopt it through supervisory_methodology_adopt_reference before it can be approved or activated',
      _row.code, _row.version USING ERRCODE = '42501';
  END IF;

  IF _to = 'APPROVED' THEN
    PERFORM public.supervisory_methodology_require_regulator_approval(_methodology_id);
    SELECT methodology_approval_permission INTO _perm
      FROM public.supervisory_domain_authority WHERE domain_code = _row.domain_code;

    IF _row.created_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the author of a methodology version cannot approve it'
        USING ERRCODE = '42501'; END IF;
    IF _row.reviewed_by IS NOT NULL AND _row.reviewed_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the reviewer who submitted this version cannot also approve it'
        USING ERRCODE = '42501'; END IF;

    UPDATE public.supervisory_methodology_regulator_approval
       SET is_current = false, updated_at = now()
     WHERE methodology_id = _methodology_id AND is_current;

    INSERT INTO public.supervisory_methodology_regulator_approval(
      methodology_id, regulator_id, decision, authority_permission,
      submitted_by, decided_by, rationale, is_current)
    VALUES (_methodology_id, _row.regulator_id, 'APPROVED', _perm,
            _row.reviewed_by, _uid, btrim(_rationale), true)
    RETURNING id INTO _approval;
  END IF;

  IF _to = 'ACTIVE' THEN
    SELECT id INTO _approval FROM public.supervisory_methodology_regulator_approval
     WHERE methodology_id = _methodology_id AND is_current AND decision = 'APPROVED';
    IF _approval IS NULL THEN
      RAISE EXCEPTION 'activation_refused: no current regulator approval is recorded for % %',
        _row.code, _row.version USING ERRCODE = '42501'; END IF;

    UPDATE public.supervisory_methodology
       SET status = 'SUPERSEDED', effective_to = COALESCE(effective_to, current_date), updated_at = now()
     WHERE domain_code = _row.domain_code
       AND COALESCE(sector_id::text,'*') = COALESCE(_row.sector_id::text,'*')
       AND COALESCE(regulator_id::text,'*') = COALESCE(_row.regulator_id::text,'*')
       AND status = 'ACTIVE' AND id <> _methodology_id;
  END IF;

  UPDATE public.supervisory_methodology SET
    status = _to,
    reviewed_by  = CASE WHEN _to = 'REVIEW'   THEN _uid ELSE reviewed_by END,
    reviewed_at  = CASE WHEN _to = 'REVIEW'   THEN now() ELSE reviewed_at END,
    approved_by  = CASE WHEN _to = 'APPROVED' THEN _uid ELSE approved_by END,
    approved_at  = CASE WHEN _to = 'APPROVED' THEN now() ELSE approved_at END,
    activated_at = CASE WHEN _to = 'ACTIVE'   THEN now() ELSE activated_at END,
    retired_at   = CASE WHEN _to = 'RETIRED'  THEN now() ELSE retired_at END,
    effective_from = CASE WHEN _to = 'ACTIVE' THEN COALESCE(effective_from, current_date) ELSE effective_from END,
    updated_at = now()
  WHERE id = _methodology_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_methodology_id, 'LIFECYCLE', _row.status, _to, btrim(_rationale), _uid,
          jsonb_build_object('regulator_approval_id', _approval, 'authority_permission', _perm));

  RETURN jsonb_build_object('id', _methodology_id, 'status', _to, 'regulator_approval_id', _approval);
END $function$;

-- ------------------------------------------------ extended capability contract
CREATE OR REPLACE FUNCTION public.supervisory_methodology_studio_capabilities(_methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _base jsonb; _m public.supervisory_methodology; _uid uuid := auth.uid();
        _edit boolean; _reason text; _author boolean; _super boolean;
        _val jsonb; _block int := 0; _submit boolean; _submit_reason text; _refdec boolean;
BEGIN
  _base := public.supervisory_methodology_action_capabilities(_methodology_id);
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _methodology_id;

  _super := public.is_super_admin(_uid);
  _edit  := COALESCE((_base #>> '{can_edit,allowed}')::boolean, false);
  _reason := _base #>> '{can_edit,reason}';

  _author := _edit AND (_m.origin <> 'MIPL_REFERENCE' OR _super);
  IF _edit AND NOT _author THEN
    _reason := 'A MIPL reference template may only be authored by a platform administrator; adopt it for your regulator to author your own version.';
  END IF;

  -- Reference decisions on a MIPL template stay with platform authority.
  _refdec := _author;

  _val := public.supervisory_methodology_validate(_methodology_id);
  _block := COALESCE((_val->>'blocking_count')::int, 0);

  _submit := _author AND _m.status = 'DRAFT' AND _block = 0;
  _submit_reason := CASE
    WHEN NOT _author THEN _reason
    WHEN _m.status <> 'DRAFT' THEN format('Only a draft version may be submitted for review; this version is %s.', _m.status)
    WHEN _block > 0 THEN format('%s blocking structural finding(s) must be resolved before this version can be submitted for review.', _block)
    ELSE NULL END;

  RETURN _base || jsonb_build_object(
    'can_author', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_edit_metadata', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_dimensions', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_questions', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_semantics', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_facts', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_parameters', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_reference_decisions', jsonb_build_object('allowed', _refdec, 'reason', CASE WHEN _refdec THEN NULL ELSE _reason END),
    'can_create_version', _base -> 'can_new_version',
    'can_submit', jsonb_build_object('allowed', _submit, 'reason', _submit_reason),
    'can_validate', jsonb_build_object('allowed', true, 'reason', NULL),
    'can_set_parameter_values', jsonb_build_object('allowed', false,
      'reason', 'A regulator-approved parameter value is set in the calculation / materiality policy layer, never in the Methodology Studio.'),
    'blocking_validation_count', _block,
    'requires_retirement_rationale', true);
END $function$;
