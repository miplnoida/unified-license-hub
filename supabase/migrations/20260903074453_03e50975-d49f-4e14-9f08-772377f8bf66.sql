-- ============================================================================
-- W4 P0 corrections — supervisory assessment question governance
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Domain-derived permission resolution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_domain_actions(_domain_code text, _intent text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(COALESCE(_domain_code,'')) 
    WHEN 'AML_CFT' THEN CASE lower(_intent)
        WHEN 'view' THEN ARRAY['aml_supervision.view']
        WHEN 'edit' THEN ARRAY['aml_supervision.edit']
        WHEN 'confidential' THEN ARRAY['aml_supervision.view_confidential']
      END
    WHEN 'PRUDENTIAL' THEN CASE lower(_intent)
        WHEN 'view' THEN ARRAY['prudential_supervision.view']
        WHEN 'edit' THEN ARRAY['prudential_supervision.record_camels_assessment']
        WHEN 'confidential' THEN ARRAY['prudential_supervision.view_confidential']
      END
    WHEN 'MARKET_CONDUCT' THEN CASE lower(_intent)
        WHEN 'view' THEN ARRAY['market_conduct.view','market_conduct.run_conduct_analytics']
        WHEN 'edit' THEN ARRAY['market_conduct.edit','market_conduct.run_conduct_analytics']
        WHEN 'confidential' THEN ARRAY['market_conduct.view_confidential']
      END
    ELSE CASE lower(_intent)
        WHEN 'view' THEN ARRAY['supervisory_spine.view']
        WHEN 'edit' THEN ARRAY['supervisory_spine.edit']
        WHEN 'confidential' THEN ARRAY['supervisory_spine.view_confidential']
      END
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.supervisory_domain_actions(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_actions(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Question catalogue is the single source of truth
--    The JSONB column is retained as a COMPATIBILITY_SNAPSHOT only.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.supervisory_methodology_dimension.mandatory_questions IS
  'COMPATIBILITY_SNAPSHOT (read-only). Authoritative question catalogue is public.supervisory_methodology_question. Writes are mirrored by supervisory_methodology_question_sync().';

COMMENT ON TABLE public.supervisory_methodology_question IS
  'Authoritative normalised supervisory question catalogue. One row per methodology dimension question.';

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_sync(
  _dimension_id uuid,
  _questions jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d public.supervisory_methodology_dimension;
  _n integer := 0;
  _codes text[] := ARRAY[]::text[];
  r record;
  _code text;
  _prompt text;
BEGIN
  SELECT * INTO _d FROM public.supervisory_methodology_dimension WHERE id = _dimension_id;
  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'not_found: methodology dimension' USING ERRCODE = '22023';
  END IF;

  IF _questions IS NULL OR jsonb_typeof(_questions) <> 'array'
     OR jsonb_array_length(_questions) = 0 THEN
    -- Never destructive: an absent or empty snapshot leaves the catalogue intact.
    RETURN 0;
  END IF;

  FOR r IN
    SELECT elem, ord FROM jsonb_array_elements(_questions) WITH ORDINALITY AS t(elem, ord)
  LOOP
    IF jsonb_typeof(r.elem) = 'string' THEN
      _code := NULL;
      _prompt := btrim(r.elem #>> '{}');
    ELSE
      _code := NULLIF(btrim(upper(COALESCE(r.elem->>'question_code', r.elem->>'code',''))),'');
      _prompt := NULLIF(btrim(COALESCE(r.elem->>'prompt', r.elem->>'text',
                                       r.elem->>'question', r.elem->>'label','')),'');
    END IF;

    IF _prompt IS NULL OR _prompt = '' THEN
      CONTINUE;
    END IF;
    _code := COALESCE(_code, 'Q' || r.ord::text);
    _codes := _codes || _code;

    INSERT INTO public.supervisory_methodology_question(
      methodology_id, methodology_dimension_id, question_code, prompt, guidance,
      mandatory, requires_observation, requires_evidence, min_evidence_count,
      allow_not_applicable, na_requires_rationale, sort_order, active)
    VALUES (
      _d.methodology_id, _d.id, _code, _prompt,
      CASE WHEN jsonb_typeof(r.elem) = 'object' THEN r.elem->>'guidance' END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'mandatory')::boolean, true) ELSE true END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'requires_observation')::boolean, true) ELSE true END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'requires_evidence')::boolean, COALESCE(_d.evidence_required,false))
           ELSE COALESCE(_d.evidence_required,false) END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'min_evidence_count')::integer, COALESCE(_d.min_evidence_count,0))
           ELSE COALESCE(_d.min_evidence_count,0) END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'allow_not_applicable')::boolean, true) ELSE true END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'na_requires_rationale')::boolean, true) ELSE true END,
      (r.ord * 10)::integer,
      true)
    ON CONFLICT (methodology_dimension_id, question_code) DO UPDATE SET
      prompt = EXCLUDED.prompt,
      guidance = EXCLUDED.guidance,
      mandatory = EXCLUDED.mandatory,
      requires_observation = EXCLUDED.requires_observation,
      requires_evidence = EXCLUDED.requires_evidence,
      min_evidence_count = EXCLUDED.min_evidence_count,
      allow_not_applicable = EXCLUDED.allow_not_applicable,
      na_requires_rationale = EXCLUDED.na_requires_rationale,
      sort_order = EXCLUDED.sort_order,
      active = true,
      updated_at = now();

    _n := _n + 1;
  END LOOP;

  -- Questions removed from the configured set are retired, never deleted.
  UPDATE public.supervisory_methodology_question
     SET active = false, updated_at = now()
   WHERE methodology_dimension_id = _d.id
     AND active
     AND NOT (question_code = ANY (_codes));

  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_sync(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_sync(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_sync(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_sync(uuid, jsonb) TO service_role;

-- Deterministic, idempotent backfill of the legacy JSONB snapshot.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_backfill()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _total integer := 0; r record;
BEGIN
  FOR r IN
    SELECT d.id, d.mandatory_questions
      FROM public.supervisory_methodology_dimension d
     WHERE jsonb_typeof(d.mandatory_questions) = 'array'
       AND jsonb_array_length(d.mandatory_questions) > 0
     ORDER BY d.methodology_id, d.sort_order, d.dimension_code
  LOOP
    _total := _total + public.supervisory_methodology_question_sync(r.id, r.mandatory_questions);
  END LOOP;
  RETURN _total;
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_backfill() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_backfill() FROM anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_question_backfill() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_backfill() TO service_role;

SELECT public.supervisory_methodology_question_backfill();

-- ---------------------------------------------------------------------------
-- 3. Configuration write paths maintain the catalogue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_save(_methodology_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _status text; _id uuid; _code text; _group text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  _code  := upper(COALESCE(_payload->>'dimension_code',''));
  _group := upper(COALESCE(_payload->>'dimension_group','OTHER'));
  IF _code = '' THEN RAISE EXCEPTION 'dimension_code required' USING ERRCODE = '22023'; END IF;

  -- an ACTIVE/APPROVED version may only toggle activation, never re-score history
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    IF (_payload ? 'weight') OR (_payload ? 'dimension_group') OR (_payload ? 'label')
       OR (_payload ? 'mandatory_questions') THEN
      RAISE EXCEPTION 'methodology_immutable: create a new methodology version to change dimension scoring or questions'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_methodology_dimension
       SET active = COALESCE((_payload->>'active')::boolean, active), updated_at = now()
     WHERE methodology_id = _methodology_id AND dimension_code = _code
     RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'not_found: dimension' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
    VALUES (_methodology_id, 'DIMENSION_TOGGLED', 'Dimension activation changed', _uid, _payload);
    RETURN _id;
  END IF;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count)
  VALUES (
    _methodology_id, _code, _group,
    COALESCE(_payload->>'dimension_kind',
      CASE _group WHEN 'INHERENT_RISK' THEN 'INHERENT'
                  WHEN 'CONTROL_EFFECTIVENESS' THEN 'CONTROL' ELSE 'COMPOSITE' END),
    COALESCE(_payload->>'label', _code),
    _payload->>'description',
    NULLIF(_payload->>'weight','')::numeric,
    COALESCE((_payload->>'evidence_required')::boolean, false),
    COALESCE(NULLIF(_payload->>'sort_order','')::integer, 100),
    COALESCE((_payload->>'active')::boolean, true),
    _payload->>'scoring_guidance',
    COALESCE(_payload->'mandatory_questions','[]'::jsonb),
    COALESCE(_payload->'data_sources','[]'::jsonb),
    _payload->>'evidence_requirements',
    COALESCE(NULLIF(_payload->>'min_evidence_count','')::integer, 0))
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
    updated_at = now()
  RETURNING id INTO _id;

  -- Mirror the configured question set into the authoritative catalogue.
  IF _payload ? 'mandatory_questions' THEN
    PERFORM public.supervisory_methodology_question_sync(_id, _payload->'mandatory_questions');
  END IF;

  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_new_version(_methodology_id uuid, _new_version text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _src public.supervisory_methodology; _new_id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT * INTO _src FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology(
    code, domain_code, name, title, version, status, sector_id, regulator_id,
    definition, assessment_frequency_months, applicable_entity_types, applicable_sector_ids,
    scoring_scale, override_threshold, approval_required, next_review_rule,
    calculation_guidance, supersedes_id, created_by)
  VALUES (_src.code, _src.domain_code, _src.name, _src.title, _new_version, 'DRAFT',
    _src.sector_id, _src.regulator_id, _src.definition, _src.assessment_frequency_months,
    _src.applicable_entity_types, _src.applicable_sector_ids, _src.scoring_scale,
    _src.override_threshold, _src.approval_required, _src.next_review_rule,
    _src.calculation_guidance, _src.id, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count)
  SELECT _new_id, dimension_code, dimension_group, dimension_kind, label, description,
         weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
         data_sources, evidence_requirements, min_evidence_count
    FROM public.supervisory_methodology_dimension WHERE methodology_id = _methodology_id;

  -- Carry the authoritative question catalogue across to the new draft version.
  INSERT INTO public.supervisory_methodology_question(
    methodology_id, methodology_dimension_id, question_code, prompt, guidance,
    response_options, mandatory, requires_observation, requires_evidence,
    min_evidence_count, allow_not_applicable, na_requires_rationale,
    question_version, sort_order, active)
  SELECT _new_id, nd.id, q.question_code, q.prompt, q.guidance,
         q.response_options, q.mandatory, q.requires_observation, q.requires_evidence,
         q.min_evidence_count, q.allow_not_applicable, q.na_requires_rationale,
         q.question_version, q.sort_order, q.active
    FROM public.supervisory_methodology_question q
    JOIN public.supervisory_methodology_dimension od ON od.id = q.methodology_dimension_id
    JOIN public.supervisory_methodology_dimension nd
      ON nd.methodology_id = _new_id AND nd.dimension_code = od.dimension_code
   WHERE q.methodology_id = _methodology_id
  ON CONFLICT (methodology_dimension_id, question_code) DO NOTHING;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'VERSION_CREATED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('supersedes_id', _methodology_id, 'version', _new_version));

  RETURN _new_id;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Read authority for question responses — follows the parent assessment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_readable(_uid uuid, _assessment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _a public.supervisory_assessment;
BEGIN
  IF _uid IS NULL OR _assessment_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RETURN false; END IF;

  -- domain view permission
  IF NOT public.has_any_permission(_uid, public.supervisory_domain_actions(_a.domain_code, 'view')) THEN
    RETURN false;
  END IF;

  -- entity supervisory scope
  IF _a.entity_id IS NOT NULL
     AND NOT public.has_permission(_uid, 'supervisory_spine', 'view_all_entities')
     AND NOT public.has_permission(_uid, 'prudential_supervision', 'view_all_entities')
     AND NOT public.user_has_entity_assignment(_uid, _a.entity_id) THEN
    RETURN false;
  END IF;

  -- confidentiality boundary: confidential-view authority, or the case owner/author
  IF upper(COALESCE(_a.confidentiality,'')) IN ('CONFIDENTIAL','RESTRICTED','SECRET') THEN
    IF public.has_any_permission(_uid, public.supervisory_domain_actions(_a.domain_code, 'confidential'))
       OR _a.owner_id = _uid OR _a.created_by = _uid THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_readable(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_readable(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS supervisory_assessment_question_response_read
  ON public.supervisory_assessment_question_response;

CREATE POLICY supervisory_assessment_question_response_read
  ON public.supervisory_assessment_question_response
  FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

-- ---------------------------------------------------------------------------
-- 5. Split the gap check: internal completeness helper + authorized read RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_gaps_internal(_assessment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (SELECT * FROM public.supervisory_assessment WHERE id = _assessment_id),
  q AS (
    SELECT qq.*, d.dimension_code, d.dimension_group, d.label AS dimension_label
      FROM public.supervisory_methodology_question qq
      JOIN public.supervisory_methodology_dimension d ON d.id = qq.methodology_dimension_id
      JOIN a ON a.methodology_id = qq.methodology_id
     WHERE qq.active AND qq.mandatory AND d.active
  ),
  gaps AS (
    SELECT q.dimension_code, q.dimension_group, q.dimension_label, q.question_code,
           q.prompt AS question_text, q.id AS question_id,
           CASE
             WHEN r.id IS NULL THEN 'unanswered'
             WHEN q.requires_observation
                  AND length(btrim(COALESCE(r.observation,''))) < 10
                  AND r.response <> 'NOT_APPLICABLE' THEN 'observation_missing'
             WHEN r.response = 'NOT_APPLICABLE' AND q.na_requires_rationale
                  AND length(btrim(COALESCE(r.observation,''))) < 10 THEN 'na_rationale_missing'
             WHEN q.requires_evidence AND r.response <> 'NOT_APPLICABLE'
                  AND public.jsonb_array_len_safe(r.evidence_refs) < GREATEST(q.min_evidence_count,1)
                  THEN 'evidence_missing'
             ELSE NULL
           END AS reason
      FROM q
      LEFT JOIN public.supervisory_assessment_question_response r
        ON r.assessment_id = _assessment_id AND r.methodology_question_id = q.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.dimension_group, g.dimension_code, g.question_code), '[]'::jsonb)
    FROM gaps g WHERE g.reason IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps_internal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps_internal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps_internal(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_gaps(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  RETURN public.supervisory_assessment_question_gaps_internal(_assessment_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps(uuid) TO authenticated, service_role;

-- Submission guard now uses the internal helper (no authorization side effects).
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_completeness_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _gaps jsonb; _n integer; _detail text;
BEGIN
  IF NEW.status = 'submitted' AND COALESCE(OLD.status,'') <> 'submitted' THEN
    _gaps := public.supervisory_assessment_question_gaps_internal(NEW.id);
    _n := public.jsonb_array_len_safe(_gaps);
    IF _n > 0 THEN
      SELECT string_agg(format('%s %s (%s)', g->>'dimension_code', g->>'question_code', g->>'reason'), '; ')
        INTO _detail
        FROM jsonb_array_elements(_gaps) g;
      RAISE EXCEPTION 'mandatory_questions_incomplete: % mandatory supervisory question(s) are outstanding — %', _n, _detail
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Domain-specific write authority for question responses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_upsert(
  _assessment_id uuid, _question_id uuid, _response text,
  _observation text DEFAULT NULL::text, _evidence_refs jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _q public.supervisory_methodology_question;
        _m public.supervisory_methodology; _dim_code text; _dim_id uuid; _resp text; _id uuid;
        _actions text[];
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  -- Edit authority must belong to the assessment's own supervisory domain.
  _actions := public.supervisory_domain_actions(_a.domain_code, 'edit');
  IF NOT public.is_super_admin(_uid) AND NOT public.has_any_permission(_uid, _actions) THEN
    RAISE EXCEPTION 'not_authorized: % required', array_to_string(_actions, ' or ')
      USING ERRCODE = '42501';
  END IF;

  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  SELECT * INTO _q FROM public.supervisory_methodology_question WHERE id = _question_id;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology question' USING ERRCODE = '22023'; END IF;
  IF NOT _q.active THEN
    RAISE EXCEPTION 'validation_required: this question has been retired from the methodology'
      USING ERRCODE = '22023'; END IF;
  IF _a.methodology_id IS NOT NULL AND _q.methodology_id <> _a.methodology_id THEN
    RAISE EXCEPTION 'validation_required: the question does not belong to the methodology version attached to this assessment'
      USING ERRCODE = '22023'; END IF;

  _resp := upper(btrim(COALESCE(_response,'')));
  IF NOT (_resp = ANY (_q.response_options)) THEN
    RAISE EXCEPTION 'validation_required: % is not a permitted response for this question', _resp
      USING ERRCODE = '22023'; END IF;
  IF _resp = 'NOT_APPLICABLE' AND NOT _q.allow_not_applicable THEN
    RAISE EXCEPTION 'validation_required: the methodology does not permit Not Applicable for this question'
      USING ERRCODE = '22023'; END IF;
  IF _resp = 'NOT_APPLICABLE' AND _q.na_requires_rationale
     AND length(btrim(COALESCE(_observation,''))) < 10 THEN
    RAISE EXCEPTION 'validation_required: a rationale of at least 10 characters is required to mark this question Not Applicable'
      USING ERRCODE = '22023'; END IF;

  SELECT d.dimension_code, d.id INTO _dim_code, _dim_id
    FROM public.supervisory_methodology_dimension d WHERE d.id = _q.methodology_dimension_id;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _q.methodology_id;

  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, assessment_dimension_id, methodology_id, methodology_version,
    methodology_dimension_id, methodology_question_id, dimension_code, question_code,
    question_text, question_version, response, observation, evidence_refs, recorded_by, updated_by)
  VALUES (_assessment_id,
    (SELECT id FROM public.supervisory_assessment_dimension
      WHERE assessment_id = _assessment_id AND dimension_code = _dim_code),
    _q.methodology_id, COALESCE(_a.methodology_version, _m.version),
    _dim_id, _q.id, _dim_code, _q.question_code, _q.prompt, _q.question_version,
    _resp, NULLIF(btrim(COALESCE(_observation,'')),''), COALESCE(_evidence_refs,'[]'::jsonb), _uid, _uid)
  ON CONFLICT (assessment_id, methodology_question_id) DO UPDATE
    SET response = EXCLUDED.response,
        observation = EXCLUDED.observation,
        evidence_refs = EXCLUDED.evidence_refs,
        assessment_dimension_id = COALESCE(EXCLUDED.assessment_dimension_id,
          supervisory_assessment_question_response.assessment_dimension_id),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id, 'assessment_id', _assessment_id,
    'question_code', _q.question_code, 'response', _resp);
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_upsert(uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_question_upsert(uuid, uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_upsert(uuid, uuid, text, text, jsonb) TO authenticated, service_role;