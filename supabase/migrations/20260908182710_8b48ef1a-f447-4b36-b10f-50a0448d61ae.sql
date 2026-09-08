-- AML-02 — Enterprise Supervisory Methodology Studio: governed authoring surface.
-- Additive only. No existing table, column, function or row is dropped or renamed.

-- ---------------------------------------------------------------------------
-- 1. One authoring authority boundary for every Studio write
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_require_authoring(_methodology_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _m public.supervisory_methodology;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);

  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023';
  END IF;

  IF _m.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen; create a new methodology version to change content', _m.status
      USING ERRCODE = '22023';
  END IF;

  -- A MIPL reference template is platform-owned policy content. Regulator
  -- configuration authority does not extend to authoring it: a regulator
  -- changes reference content by adopting it first.
  IF _m.origin = 'MIPL_REFERENCE' AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'reference_authoring_denied: a MIPL reference template may only be authored by a platform administrator; adopt it for your regulator to author your own version'
      USING ERRCODE = '42501';
  END IF;

  RETURN _uid;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_require_authoring(uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Question authoring
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_save(
  _methodology_id uuid, _payload jsonb, _rationale text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _code text; _dim uuid; _dim_code text; _id uuid; _existing uuid;
        _expected timestamptz;
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
   WHERE methodology_id = _methodology_id AND dimension_code = _dim_code;
  IF _dim IS NULL THEN
    RAISE EXCEPTION 'not_found: dimension % in this methodology version', _dim_code USING ERRCODE = '22023'; END IF;

  -- Optimistic concurrency: the caller may pin the row it read.
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
    sort_order, active, question_class, provenance)
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
    COALESCE(NULLIF(_payload->>'sort_order','')::integer, 100),
    true,
    NULLIF(upper(COALESCE(_payload->>'question_class','')),''),
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
    sort_order = EXCLUDED.sort_order,
    question_class = COALESCE(EXCLUDED.question_class, supervisory_methodology_question.question_class),
    active = true,
    updated_at = now()
  RETURNING id INTO _id;

  -- Moving a question between dimensions is a governed relocation, not an insert.
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
END
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_retire(
  _methodology_id uuid, _question_code text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _code text := upper(btrim(COALESCE(_question_code,'')));
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required to retire a question'
      USING ERRCODE = '22023'; END IF;

  UPDATE public.supervisory_methodology_question
     SET active = false, updated_at = now()
   WHERE methodology_id = _methodology_id AND question_code = _code AND active
   RETURNING id INTO _id;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'not_found: active question % in this methodology version', _code
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_RETIRED', btrim(_rationale), _uid,
          jsonb_build_object('question_code', _code));
  RETURN _id;
END
$function$;

-- ---------------------------------------------------------------------------
-- 3. Dimension retirement with a dependency guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_retire(
  _methodology_id uuid, _dimension_code text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _open int; _code text := upper(btrim(COALESCE(_dimension_code,'')));
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required to retire a dimension'
      USING ERRCODE = '22023'; END IF;

  SELECT id INTO _id FROM public.supervisory_methodology_dimension
   WHERE methodology_id = _methodology_id AND dimension_code = _code AND active;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'not_found: active dimension % in this methodology version', _code
      USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO _open FROM public.supervisory_methodology_question
   WHERE methodology_dimension_id = _id AND active;
  IF _open > 0 THEN
    RAISE EXCEPTION 'dependency_blocked: dimension % still holds % active question(s); retire them first', _code, _open
      USING ERRCODE = '22023'; END IF;

  UPDATE public.supervisory_methodology_dimension SET active = false, updated_at = now() WHERE id = _id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'DIMENSION_RETIRED', btrim(_rationale), _uid,
          jsonb_build_object('dimension_code', _code));
  RETURN _id;
END
$function$;

-- ---------------------------------------------------------------------------
-- 4. Question ↔ fact requirement links
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_fact_link(
  _methodology_id uuid, _question_code text, _fact_code text, _is_required boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _qid uuid; _fid uuid; _id uuid;
        _q text := upper(btrim(COALESCE(_question_code,''))); _f text := upper(btrim(COALESCE(_fact_code,'')));
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);

  SELECT id INTO _qid FROM public.supervisory_methodology_question
   WHERE methodology_id = _methodology_id AND question_code = _q AND active;
  IF _qid IS NULL THEN
    RAISE EXCEPTION 'not_found: active question % in this methodology version', _q USING ERRCODE = '22023'; END IF;

  SELECT id INTO _fid FROM public.supervisory_methodology_fact_requirement
   WHERE methodology_id = _methodology_id AND fact_code = _f;
  IF _fid IS NULL THEN
    RAISE EXCEPTION 'not_found: fact requirement % in this methodology version; define it before linking', _f
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology_question_fact(question_id, fact_requirement_id, is_required)
  VALUES (_qid, _fid, COALESCE(_is_required, true))
  ON CONFLICT (question_id, fact_requirement_id) DO UPDATE SET is_required = EXCLUDED.is_required
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_FACT_LINKED', NULL, _uid,
          jsonb_build_object('question_code', _q, 'fact_code', _f, 'is_required', COALESCE(_is_required, true)));
  RETURN _id;
END
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_fact_unlink(
  _methodology_id uuid, _question_code text, _fact_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _n int;
        _q text := upper(btrim(COALESCE(_question_code,''))); _f text := upper(btrim(COALESCE(_fact_code,'')));
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);

  WITH removed AS (
    DELETE FROM public.supervisory_methodology_question_fact qf
     USING public.supervisory_methodology_question q,
           public.supervisory_methodology_fact_requirement f
     WHERE qf.question_id = q.id AND qf.fact_requirement_id = f.id
       AND q.methodology_id = _methodology_id AND q.question_code = _q
       AND f.methodology_id = _methodology_id AND f.fact_code = _f
    RETURNING qf.id)
  SELECT count(*) INTO _n FROM removed;

  IF _n = 0 THEN
    RAISE EXCEPTION 'not_found: no link between question % and fact %', _q, _f USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_FACT_UNLINKED', NULL, _uid,
          jsonb_build_object('question_code', _q, 'fact_code', _f));
  RETURN _n;
END
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_fact_requirement_delete(
  _methodology_id uuid, _fact_code text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _fid uuid; _links int; _f text := upper(btrim(COALESCE(_fact_code,'')));
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required to remove a fact requirement'
      USING ERRCODE = '22023'; END IF;

  SELECT id INTO _fid FROM public.supervisory_methodology_fact_requirement
   WHERE methodology_id = _methodology_id AND fact_code = _f;
  IF _fid IS NULL THEN
    RAISE EXCEPTION 'not_found: fact requirement %', _f USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO _links FROM public.supervisory_methodology_question_fact WHERE fact_requirement_id = _fid;
  IF _links > 0 THEN
    RAISE EXCEPTION 'dependency_blocked: fact % is still linked to % question(s); unlink them first', _f, _links
      USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_methodology_fact_requirement WHERE id = _fid;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'FACT_REQUIREMENT_REMOVED', btrim(_rationale), _uid,
          jsonb_build_object('fact_code', _f));
  RETURN _fid;
END
$function$;

-- ---------------------------------------------------------------------------
-- 5. Validation service (informational; the action RPCs stay the enforcement point)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_validate(_methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _m public.supervisory_methodology; _f jsonb := '[]'::jsonb; _n int; _txt text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501'; END IF;

  -- Dimension weights must total 100 within each weighted group.
  FOR _txt, _n IN
    SELECT d.dimension_group, count(*)
      FROM public.supervisory_methodology_dimension d
     WHERE d.methodology_id = _methodology_id AND d.active AND d.weight IS NOT NULL
     GROUP BY d.dimension_group
    HAVING round(sum(d.weight), 4) <> 100
  LOOP
    _f := _f || jsonb_build_object(
      'code', 'DIMENSION_WEIGHT_SUM', 'severity', 'BLOCKING', 'object', 'DIMENSION',
      'subject', _txt, 'count', _n,
      'message', format('Weighted dimensions in group %s do not total 100.', _txt));
  END LOOP;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_dimension d
   WHERE d.methodology_id = _methodology_id AND d.active
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question q
                      WHERE q.methodology_dimension_id = d.id AND q.active);
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'DIMENSION_WITHOUT_QUESTION', 'severity', 'BLOCKING', 'object', 'DIMENSION',
    'subject', NULL, 'count', _n,
    'message', format('%s active dimension(s) hold no active question.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.response_semantics_profile_id IS NULL;
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'QUESTION_WITHOUT_SEMANTICS', 'severity', 'BLOCKING', 'object', 'QUESTION',
    'subject', NULL, 'count', _n,
    'message', format('%s active question(s) carry no response semantics profile.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND q.calculation_participation = 'SCORED' AND q.axis IS NULL;
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'SCORED_QUESTION_WITHOUT_AXIS', 'severity', 'BLOCKING', 'object', 'QUESTION',
    'subject', NULL, 'count', _n,
    'message', format('%s scored question(s) are not assigned to an assessment axis.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.question_class IS NULL;
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'QUESTION_WITHOUT_CLASS', 'severity', 'ADVISORY', 'object', 'QUESTION',
    'subject', NULL, 'count', _n,
    'message', format('%s active question(s) are not classified as core, conditional or enhanced.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND q.requires_evidence AND COALESCE(q.min_evidence_count, 0) = 0;
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'EVIDENCE_WITHOUT_MINIMUM', 'severity', 'ADVISORY', 'object', 'QUESTION',
    'subject', NULL, 'count', _n,
    'message', format('%s question(s) require evidence but set no minimum number of items.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active
     AND q.allow_not_applicable AND COALESCE(btrim(q.na_conditions),'') = '';
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'NA_WITHOUT_CONDITIONS', 'severity', 'ADVISORY', 'object', 'QUESTION',
    'subject', NULL, 'count', _n,
    'message', format('%s question(s) permit "not applicable" without stating the conditions.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_fact_requirement f
   WHERE f.methodology_id = _methodology_id AND COALESCE(f.definition_status,'') <> 'ATTRIBUTES_COMPLETE';
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'FACT_DEFINITION_INCOMPLETE', 'severity', 'ADVISORY', 'object', 'FACT',
    'subject', NULL, 'count', _n,
    'message', format('%s fact requirement(s) have incomplete attribute definitions.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_fact_requirement f
   WHERE f.methodology_id = _methodology_id AND f.is_required
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question_fact qf
                      WHERE qf.fact_requirement_id = f.id);
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'REQUIRED_FACT_UNLINKED', 'severity', 'ADVISORY', 'object', 'FACT',
    'subject', NULL, 'count', _n,
    'message', format('%s required fact requirement(s) are linked to no question.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_parameter p
   WHERE p.methodology_id = _methodology_id AND COALESCE(p.approval_status,'') <> 'APPROVED';
  IF _n > 0 THEN _f := _f || jsonb_build_object(
    'code', 'PARAMETER_UNAPPROVED', 'severity', 'BLOCKING', 'object', 'PARAMETER',
    'subject', NULL, 'count', _n,
    'message', format('%s parameter(s) are not approved supervisory policy values.', _n)); END IF;

  RETURN jsonb_build_object(
    'methodology_id', _m.id,
    'status', _m.status,
    'origin', _m.origin,
    'generated_at', now(),
    'blocking_count', (SELECT count(*) FROM jsonb_array_elements(_f) x WHERE x->>'severity' = 'BLOCKING'),
    'advisory_count', (SELECT count(*) FROM jsonb_array_elements(_f) x WHERE x->>'severity' = 'ADVISORY'),
    'findings', _f,
    'note', 'Validation is informational. The governed action operations remain the enforcement point.');
END
$function$;

-- ---------------------------------------------------------------------------
-- 6. Server-authoritative Studio capabilities
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_studio_capabilities(_methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _base jsonb; _m public.supervisory_methodology; _uid uuid := auth.uid();
        _edit boolean; _reason text; _author boolean; _super boolean;
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

  RETURN _base || jsonb_build_object(
    'can_author', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_dimensions', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_questions', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_semantics', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_facts', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'can_author_parameters', jsonb_build_object('allowed', _author, 'reason', CASE WHEN _author THEN NULL ELSE _reason END),
    'requires_retirement_rationale', true);
END
$function$;

-- ---------------------------------------------------------------------------
-- 7. Execution grants — signed-in officers only, never anonymous
-- ---------------------------------------------------------------------------
DO $$
DECLARE _sig text;
BEGIN
  FOR _sig IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (
       'supervisory_methodology_question_save',
       'supervisory_methodology_question_retire',
       'supervisory_methodology_dimension_retire',
       'supervisory_methodology_question_fact_link',
       'supervisory_methodology_question_fact_unlink',
       'supervisory_methodology_fact_requirement_delete',
       'supervisory_methodology_validate',
       'supervisory_methodology_studio_capabilities')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', _sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _sig);
  END LOOP;
END $$;