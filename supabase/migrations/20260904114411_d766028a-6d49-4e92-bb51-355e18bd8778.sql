-- ============================================================================
-- AML/CFT assessment structural integrity closure
-- Dimension materialisation + response linkage + calculation outcome contract.
-- No supervisory policy value is authored here: no scores, bands, matrix cells,
-- effective-date rule, methodology version or rating is created or changed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Structural materialisation of the assessment working file.
--    Creates one empty dimension row per ACTIVE methodology dimension, bound
--    canonically. Never writes a rating, score, or judgement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_materialise_internal(
  _assessment_id uuid, _actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _created int := 0; _expected int := 0;
        _existing int := 0; _codes text[] := '{}';
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023';
  END IF;
  IF _a.methodology_id IS NULL THEN
    RETURN jsonb_build_object('status','NO_METHODOLOGY','assessment_id',_assessment_id,
      'expected',0,'existing',0,'created',0,'created_codes','[]'::jsonb,
      'reason','the assessment is not bound to a methodology version, so no dimension universe is defined');
  END IF;

  SELECT count(*) INTO _expected FROM public.supervisory_methodology_dimension md
   WHERE md.methodology_id = _a.methodology_id AND md.active;
  SELECT count(*) INTO _existing FROM public.supervisory_assessment_dimension sad
   WHERE sad.assessment_id = _assessment_id;

  WITH ins AS (
    INSERT INTO public.supervisory_assessment_dimension(
      assessment_id, methodology_dimension_id, dimension_code, dimension_group,
      weight, is_applicable, created_by)
    SELECT _assessment_id, md.id, md.dimension_code,
           COALESCE(md.dimension_group,'OTHER'), md.weight, true, _actor
      FROM public.supervisory_methodology_dimension md
     WHERE md.methodology_id = _a.methodology_id
       AND md.active
       AND NOT EXISTS (
         SELECT 1 FROM public.supervisory_assessment_dimension sad
          WHERE sad.assessment_id = _assessment_id
            AND sad.dimension_code = md.dimension_code)
     ORDER BY md.dimension_code
    RETURNING dimension_code)
  SELECT count(*), COALESCE(array_agg(dimension_code ORDER BY dimension_code),'{}')
    INTO _created, _codes FROM ins;

  RETURN jsonb_build_object('status', CASE WHEN _created > 0 THEN 'MATERIALISED' ELSE 'ALREADY_COMPLETE' END,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,
    'expected',_expected,'existing',_existing,'created',_created,
    'created_codes', to_jsonb(_codes));
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_dimension_materialise_internal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_assessment_dimension_materialise_internal(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_dimension_materialise_internal(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Creation materialises the working file in the same governed transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_create(_entity_id uuid, _domain_code text, _assessment_type text DEFAULT 'PERIODIC'::text, _period_start date DEFAULT NULL::date, _period_end date DEFAULT NULL::date, _methodology_id uuid DEFAULT NULL::uuid, _trigger_type text DEFAULT 'PERIODIC'::text, _trigger_signal_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text, _owner_id uuid DEFAULT NULL::uuid, _supersedes_id uuid DEFAULT NULL::uuid, _confidentiality text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _mv text; _struct jsonb;
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

  SELECT l.sector_id, s.regulator_id INTO _sector, _reg
    FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id
   WHERE l.id = _entity_id;
  IF _methodology_id IS NOT NULL THEN
    SELECT version INTO _mv FROM public.supervisory_methodology WHERE id = _methodology_id;
    IF _mv IS NULL THEN
      RAISE EXCEPTION 'not_found: methodology does not exist' USING ERRCODE = '22023';
    END IF;
  END IF;

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

  -- Structural completion: the working file exists in full from creation.
  _struct := public.supervisory_assessment_dimension_materialise_internal(_id, _uid);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'draft', _summary,
    jsonb_build_object('domain_code',_domain_code,'trigger_type',_trigger_type,'supersedes_id',_supersedes_id,
      'structure',_struct), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_assessment',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code,'entity_id',_entity_id,
      'dimensions_materialised',_struct->'created'),
    'Supervisory assessment ' || _ref || ' created');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','draft','domain_code',_domain_code,
    'structure',_struct);
END $function$;

-- ---------------------------------------------------------------------------
-- 3. The answer writer owns the linkage; it can no longer leave an orphan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_upsert(_assessment_id uuid, _question_id uuid, _response text, _observation text DEFAULT NULL::text, _evidence_refs jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _q public.supervisory_methodology_question;
        _m public.supervisory_methodology; _dim_code text; _dim_id uuid; _resp text; _id uuid;
        _actions text[]; _ad_id uuid; _md public.supervisory_methodology_dimension;
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

  SELECT * INTO _md FROM public.supervisory_methodology_dimension WHERE id = _q.methodology_dimension_id;
  IF _md.id IS NULL THEN
    RAISE EXCEPTION 'validation_required: the question is not bound to a methodology dimension'
      USING ERRCODE = '22023'; END IF;
  _dim_code := _md.dimension_code; _dim_id := _md.id;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _q.methodology_id;

  -- Structural guarantee: the answer's own dimension row must exist before the
  -- answer is written, so an answer can never be recorded unbound.
  SELECT id INTO _ad_id FROM public.supervisory_assessment_dimension
   WHERE assessment_id = _assessment_id AND dimension_code = _dim_code;
  IF _ad_id IS NULL THEN
    INSERT INTO public.supervisory_assessment_dimension(
      assessment_id, methodology_dimension_id, dimension_code, dimension_group,
      weight, is_applicable, created_by)
    VALUES (_assessment_id, _dim_id, _dim_code, COALESCE(_md.dimension_group,'OTHER'),
      _md.weight, true, _uid)
    RETURNING id INTO _ad_id;
  ELSIF EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension
                 WHERE id = _ad_id AND methodology_dimension_id IS NULL) THEN
    UPDATE public.supervisory_assessment_dimension
       SET methodology_dimension_id = _dim_id, updated_at = now()
     WHERE id = _ad_id AND methodology_dimension_id IS NULL;
  END IF;

  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, assessment_dimension_id, methodology_id, methodology_version,
    methodology_dimension_id, methodology_question_id, dimension_code, question_code,
    question_text, question_version, response, observation, evidence_refs, recorded_by, updated_by)
  VALUES (_assessment_id, _ad_id,
    _q.methodology_id, COALESCE(_a.methodology_version, _m.version),
    _dim_id, _q.id, _dim_code, _q.question_code, _q.prompt, _q.question_version,
    _resp, NULLIF(btrim(COALESCE(_observation,'')),''), COALESCE(_evidence_refs,'[]'::jsonb), _uid, _uid)
  ON CONFLICT (assessment_id, methodology_question_id) DO UPDATE
    SET response = EXCLUDED.response,
        observation = EXCLUDED.observation,
        evidence_refs = EXCLUDED.evidence_refs,
        assessment_dimension_id = EXCLUDED.assessment_dimension_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id, 'assessment_id', _assessment_id,
    'assessment_dimension_id', _ad_id,
    'question_code', _q.question_code, 'response', _resp);
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Database guard: an answer may not be unbound when binding is resolvable,
--    and may never point at another assessment's or another code's dimension.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_response_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE _ad public.supervisory_assessment_dimension; _code text; _resolvable uuid;
BEGIN
  IF NEW.assessment_dimension_id IS NOT NULL THEN
    SELECT * INTO _ad FROM public.supervisory_assessment_dimension WHERE id = NEW.assessment_dimension_id;
    IF _ad.id IS NULL THEN
      RAISE EXCEPTION 'response_link_invalid: assessment dimension % does not exist', NEW.assessment_dimension_id
        USING ERRCODE = '22023';
    END IF;
    IF _ad.assessment_id <> NEW.assessment_id THEN
      RAISE EXCEPTION 'response_link_cross_assessment: assessment dimension % belongs to assessment %, the response belongs to %',
        _ad.id, _ad.assessment_id, NEW.assessment_id USING ERRCODE = '22023';
    END IF;
    IF NEW.dimension_code IS NOT NULL AND _ad.dimension_code <> NEW.dimension_code THEN
      RAISE EXCEPTION 'response_link_code_mismatch: assessment dimension % is code %, the response is code %',
        _ad.id, _ad.dimension_code, NEW.dimension_code USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- No link supplied: mandatory whenever the assessment already carries the
  -- dimension row for this response's code. Legacy codes with no counterpart
  -- are left alone, never invented.
  _code := NEW.dimension_code;
  IF _code IS NOT NULL THEN
    SELECT id INTO _resolvable FROM public.supervisory_assessment_dimension
     WHERE assessment_id = NEW.assessment_id AND dimension_code = _code;
    IF _resolvable IS NOT NULL THEN
      RAISE EXCEPTION 'response_link_required: dimension % resolves to assessment dimension % and must be linked',
        _code, _resolvable USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS supervisory_assessment_response_link_guard_trg
  ON public.supervisory_assessment_question_response;
CREATE TRIGGER supervisory_assessment_response_link_guard_trg
  BEFORE INSERT OR UPDATE ON public.supervisory_assessment_question_response
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_response_link_guard();

-- ---------------------------------------------------------------------------
-- 5. Governed, idempotent structural repair for assessments that already exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_structure_backfill(
  _domain_code text, _dry_run boolean DEFAULT true, _rationale text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _module text; _a record; _r record; _res jsonb;
        _assessments int := 0; _no_meth int := 0; _already int := 0;
        _dims_missing int := 0; _dims_created int := 0;
        _resp_considered int := 0; _resp_repairable int := 0; _resp_repaired int := 0;
        _resp_unresolvable int := 0; _resp_conflict int := 0;
        _plan jsonb := '[]'::jsonb; _conflicts jsonb := '[]'::jsonb;
BEGIN
  _module := public.supervisory_domain_module(_domain_code);
  IF _module IS NULL THEN
    RAISE EXCEPTION 'unknown_domain: % is not a governed supervisory domain', COALESCE(_domain_code,'(null)')
      USING ERRCODE = '22023';
  END IF;
  _uid := public.supervisory_spine_require(ARRAY[_module || '.manage_config']);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  -- (a) dimension universe
  FOR _a IN
    SELECT a.id, a.reference, a.status, a.methodology_id, a.methodology_version,
           (SELECT count(*) FROM public.supervisory_methodology_dimension md
             WHERE md.methodology_id = a.methodology_id AND md.active) expected,
           (SELECT count(*) FROM public.supervisory_assessment_dimension sad
             WHERE sad.assessment_id = a.id) actual
      FROM public.supervisory_assessment a
     WHERE upper(a.domain_code) = upper(_domain_code)
     ORDER BY a.created_at
  LOOP
    _assessments := _assessments + 1;
    IF _a.methodology_id IS NULL THEN _no_meth := _no_meth + 1; CONTINUE; END IF;

    IF _a.expected <= _a.actual AND NOT EXISTS (
      SELECT 1 FROM public.supervisory_methodology_dimension md
       WHERE md.methodology_id = _a.methodology_id AND md.active
         AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension sad
                          WHERE sad.assessment_id = _a.id AND sad.dimension_code = md.dimension_code))
    THEN
      _already := _already + 1; CONTINUE;
    END IF;

    IF _dry_run THEN
      SELECT count(*) INTO _r FROM (SELECT 1) z; -- no-op, keeps _r typed usage explicit
      _dims_missing := _dims_missing + (
        SELECT count(*) FROM public.supervisory_methodology_dimension md
         WHERE md.methodology_id = _a.methodology_id AND md.active
           AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension sad
                            WHERE sad.assessment_id = _a.id AND sad.dimension_code = md.dimension_code));
      _plan := _plan || jsonb_build_object('assessment_id',_a.id,'assessment_reference',_a.reference,
        'status',_a.status,'expected',_a.expected,'existing',_a.actual,
        'action','WOULD_MATERIALISE_MISSING_DIMENSIONS');
    ELSE
      _res := public.supervisory_assessment_dimension_materialise_internal(_a.id, _uid);
      _dims_missing := _dims_missing + (_res->>'created')::int;
      _dims_created := _dims_created + (_res->>'created')::int;
      IF (_res->>'created')::int > 0 THEN
        INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
        VALUES (_a.id, 'STRUCTURE_REPAIRED', _rationale, _res, _uid);
        PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment',_a.id,
          jsonb_build_object('dimensions',_a.actual),
          jsonb_build_object('dimensions',(_res->>'expected')::int,'created',_res->'created_codes'),
          'Assessment ' || _a.reference || ': missing methodology dimensions materialised');
      END IF;
      _plan := _plan || (_res || jsonb_build_object('assessment_reference',_a.reference));
    END IF;
  END LOOP;

  -- (b) unbound answers
  FOR _r IN
    SELECT r.id rid, r.assessment_id, r.dimension_code, r.question_code,
           a.reference, a.methodology_id a_meth, r.methodology_id r_meth,
           (SELECT sad.id FROM public.supervisory_assessment_dimension sad
             WHERE sad.assessment_id = r.assessment_id AND sad.dimension_code = r.dimension_code) target
      FROM public.supervisory_assessment_question_response r
      JOIN public.supervisory_assessment a ON a.id = r.assessment_id
     WHERE upper(a.domain_code) = upper(_domain_code)
       AND r.assessment_dimension_id IS NULL
     ORDER BY a.created_at, r.dimension_code, r.question_code
  LOOP
    _resp_considered := _resp_considered + 1;
    IF _r.r_meth IS DISTINCT FROM _r.a_meth THEN
      _resp_conflict := _resp_conflict + 1;
      _conflicts := _conflicts || jsonb_build_object('response_id',_r.rid,
        'assessment_reference',_r.reference,'dimension_code',_r.dimension_code,
        'classification','CROSS_METHODOLOGY');
      CONTINUE;
    END IF;
    IF _r.target IS NULL THEN
      _resp_unresolvable := _resp_unresolvable + 1;
      _conflicts := _conflicts || jsonb_build_object('response_id',_r.rid,
        'assessment_reference',_r.reference,'dimension_code',_r.dimension_code,
        'classification','NO_ASSESSMENT_DIMENSION',
        'reason','the assessment carries no dimension row with this code and the methodology publishes none');
      CONTINUE;
    END IF;
    _resp_repairable := _resp_repairable + 1;
    IF NOT _dry_run THEN
      UPDATE public.supervisory_assessment_question_response
         SET assessment_dimension_id = _r.target, updated_at = now()
       WHERE id = _r.rid AND assessment_dimension_id IS NULL;
      IF FOUND THEN
        _resp_repaired := _resp_repaired + 1;
        PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_question_response',_r.rid,
          jsonb_build_object('assessment_dimension_id',NULL),
          jsonb_build_object('assessment_dimension_id',_r.target,
            'dimension_code',_r.dimension_code,'question_code',_r.question_code,
            'assessment_id',_r.assessment_id),
          'Answer ' || _r.question_code || ' bound to its assessment dimension');
      END IF;
    END IF;
  END LOOP;

  PERFORM public.log_compliance_audit(
    CASE WHEN _dry_run THEN 'ACCESS_DENIED' ELSE 'UPDATE' END,
    'supervisory_assessment', NULL, NULL,
    jsonb_build_object('domain_code',_domain_code,'dry_run',_dry_run,
      'assessments',_assessments,'dimensions_created',_dims_created,
      'responses_repaired',_resp_repaired,'rationale',_rationale),
    'Supervisory assessment structural backfill for ' || _domain_code);

  RETURN jsonb_build_object('domain_code',_domain_code,'dry_run',_dry_run,
    'assessments_considered',_assessments,'assessments_without_methodology',_no_meth,
    'assessments_already_complete',_already,
    'dimensions_missing',_dims_missing,'dimensions_created',_dims_created,
    'responses_unbound',_resp_considered,'responses_repairable',_resp_repairable,
    'responses_repaired',_resp_repaired,'responses_unresolvable',_resp_unresolvable,
    'responses_conflicting',_resp_conflict,
    'plan',_plan,'conflicts',_conflicts);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_structure_backfill(text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_assessment_structure_backfill(text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_structure_backfill(text, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Calculation outcome contract: machine-readable reason codes, an explicit
--    "methodology publishes no scoring question" outcome, and an assessment
--    status that is CALCULATED only when a recommendation was actually produced.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_calc_compute_policy(_assessment_id uuid, _policy jsonb, _as_of date, _config_id uuid DEFAULT NULL::uuid, _config_version integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _a public.supervisory_assessment; _m public.supervisory_methodology;
  _dims jsonb := '[]'::jsonb; _d record; _q record;
  _scores jsonb := COALESCE(_policy->'response_scores','[]'::jsonb);
  _bands  jsonb := COALESCE(_policy->'bands','{}'::jsonb);
  _matrix jsonb := COALESCE(_policy->'matrix','[]'::jsonb);
  _agg text := _policy->>'aggregation_method';
  _mode text := COALESCE(_policy->>'completeness_mode','MIN_ANSWERED');
  _minq integer := (_policy->>'min_answered_questions')::integer;
  _na text := _policy->>'na_denominator_handling';
  _evid text := _policy->>'evidence_insufficiency_handling';
  _crit text := _policy->>'critical_question_handling';
  _rmode text := _policy->>'rounding_mode';
  _rdec integer := (_policy->>'rounding_decimals')::integer;
  _dir text := _policy->>'inherent_direction';
  _rpol text := _policy->>'recommendation_policy';
  _rthr text := _policy->>'recommendation_threshold';
  _wmode text := COALESCE(_policy->>'dimension_weight_mode','METHODOLOGY');
  _num numeric; _den numeric; _answered integer; _w numeric;
  _ev_req integer; _ev_sup integer; _ev_ok boolean; _treat text;
  _raw numeric; _score numeric; _band text; _qtrace jsonb; _capped boolean;
  _required text[]; _missing text[]; _pubq integer;
  _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
  _inh_score numeric; _ctl_score numeric; _inh_band text; _ctl_band text;
  _residual text; _rec text; _ord_num numeric := 0; _ord_den numeric := 0;
  _worst integer := 0; _thr integer; _weighted integer; _undecided text[] := '{}';
  _n_total integer; _n_calc integer; _n_na integer; _n_notcalc integer;
  _status text; _reason_code text; _reason text;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _a.methodology_id;

  IF _agg   IS NULL THEN _undecided := array_append(_undecided,'aggregation_method'); END IF;
  IF _mode = 'MIN_ANSWERED' AND _minq IS NULL THEN
    _undecided := array_append(_undecided,'min_answered_questions'); END IF;
  IF _na    IS NULL THEN _undecided := array_append(_undecided,'na_denominator_handling'); END IF;
  IF _evid  IS NULL THEN _undecided := array_append(_undecided,'evidence_insufficiency_handling'); END IF;
  IF _crit  IS NULL THEN _undecided := array_append(_undecided,'critical_question_handling'); END IF;
  IF _rmode IS NULL THEN _undecided := array_append(_undecided,'rounding_mode'); END IF;
  IF _rdec  IS NULL THEN _undecided := array_append(_undecided,'rounding_decimals'); END IF;
  IF _dir   IS NULL THEN _undecided := array_append(_undecided,'inherent_direction'); END IF;
  IF _rpol  IS NULL THEN _undecided := array_append(_undecided,'recommendation_policy'); END IF;
  IF array_length(_undecided,1) IS NOT NULL THEN
    RETURN jsonb_build_object('status','CONFIGURATION_INCOMPLETE','assessment_id',_assessment_id,
      'config_id',_config_id,'config_version',_config_version,'as_of',_as_of,'dimensions','[]'::jsonb,
      'undecided_parameters', to_jsonb(_undecided),
      'reason_code','CONFIGURATION_INCOMPLETE',
      'reason','the in-force calculation configuration leaves a required supervisory parameter undecided');
  END IF;

  FOR _d IN
    SELECT sad.id, sad.dimension_code, sad.dimension_group, sad.weight, sad.is_applicable,
           sad.methodology_dimension_id, md.dimension_kind, md.weight AS meth_weight
      FROM public.supervisory_assessment_dimension sad
      LEFT JOIN public.supervisory_methodology_dimension md ON md.id = sad.methodology_dimension_id
     WHERE sad.assessment_id = _assessment_id
     ORDER BY sad.dimension_code
  LOOP
    IF _d.is_applicable IS FALSE THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_APPLICABLE','reason_code','SUPERVISOR_MARKED_NOT_APPLICABLE',
        'reason','the supervisor recorded this dimension as not applicable to the entity, so it is excluded from the calculation');
      CONTINUE;
    END IF;

    -- Unlinked dimension: no canonical methodology dimension, nothing to score.
    IF _d.methodology_dimension_id IS NULL THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_CALCULABLE','reason_code','DIMENSION_NOT_IN_METHODOLOGY',
        'reason','this dimension code has no counterpart in the methodology version bound to the assessment, so it carries no questions to score');
      CONTINUE;
    END IF;

    -- Methodology publishes no active scoring question for this dimension.
    SELECT count(*) INTO _pubq FROM public.supervisory_methodology_question mq
     WHERE mq.methodology_dimension_id = _d.methodology_dimension_id AND mq.active;
    IF _pubq = 0 THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_CALCULABLE','reason_code','METHODOLOGY_PUBLISHES_NO_QUESTION',
        'published_questions',0,
        'reason','the methodology version publishes no active question for this dimension, so no score can be derived from supervisory answers');
      CONTINUE;
    END IF;

    _num := 0; _den := 0; _answered := 0; _qtrace := '[]'::jsonb;
    _ev_req := 0; _ev_sup := 0; _ev_ok := true; _capped := false;
    _required := '{}'; _missing := '{}';

    FOR _q IN
      SELECT r.question_code, r.response,
             (sc.s->>'score')::numeric AS score,
             COALESCE((sc.s->>'excluded_from_denominator')::boolean,false) AS excluded_from_denominator,
             jsonb_array_length(COALESCE(r.evidence_refs,'[]'::jsonb)) AS evidence_count,
             COALESCE(mq.min_evidence_count,0) AS evidence_required
        FROM public.supervisory_assessment_question_response r
        LEFT JOIN LATERAL (
          SELECT x AS s FROM jsonb_array_elements(_scores) x
           WHERE x->>'response_code' = r.response LIMIT 1) sc ON true
        LEFT JOIN public.supervisory_methodology_question mq
               ON mq.methodology_id = _a.methodology_id AND mq.question_code = r.question_code
       WHERE r.assessment_id = _assessment_id
         AND r.methodology_dimension_id = _d.methodology_dimension_id
       ORDER BY r.question_code
    LOOP
      IF _q.excluded_from_denominator THEN
        IF _na = 'INCLUDE_AS_ZERO' THEN _num := _num + 0; _den := _den + 1;
        ELSIF _na = 'INCLUDE_AS_FULL' THEN _num := _num + 100; _den := _den + 1;
        END IF;
      ELSIF _q.score IS NOT NULL THEN
        IF _agg = 'WORST_RESPONSE' THEN
          _num := CASE WHEN _den = 0 THEN _q.score ELSE least(_num, _q.score) END; _den := 1;
        ELSE
          _num := _num + _q.score; _den := _den + 1;
        END IF;
        _answered := _answered + 1;
        _ev_req := _ev_req + _q.evidence_required;
        _ev_sup := _ev_sup + COALESCE(_q.evidence_count,0);
        IF COALESCE(_q.evidence_count,0) < _q.evidence_required THEN _ev_ok := false; END IF;
      END IF;
      _qtrace := _qtrace || jsonb_build_object('question_code',_q.question_code,'response',_q.response,
                   'score',_q.score,'excluded',_q.excluded_from_denominator,
                   'evidence_required',_q.evidence_required,'evidence_supplied',COALESCE(_q.evidence_count,0));
    END LOOP;

    -- Generic completeness: every mandatory applicable question must carry a valid response.
    IF _mode = 'ALL_MANDATORY_APPLICABLE' THEN
      SELECT COALESCE(array_agg(mq.question_code ORDER BY mq.question_code),'{}')
        INTO _required
        FROM public.supervisory_methodology_question mq
       WHERE mq.methodology_dimension_id = _d.methodology_dimension_id
         AND mq.active AND mq.mandatory;

      SELECT COALESCE(array_agg(rc ORDER BY rc),'{}') INTO _missing
        FROM unnest(_required) rc
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.supervisory_assessment_question_response r
           JOIN public.supervisory_methodology_question mq2 ON mq2.id = r.methodology_question_id
           LEFT JOIN LATERAL (SELECT x AS s FROM jsonb_array_elements(_scores) x
                               WHERE x->>'response_code' = r.response LIMIT 1) sc ON true
          WHERE r.assessment_id = _assessment_id
            AND r.question_code = rc
            AND sc.s IS NOT NULL
            AND (
              (NOT COALESCE((sc.s->>'excluded_from_denominator')::boolean,false)
                 AND (sc.s->>'score') IS NOT NULL)
              OR (COALESCE((sc.s->>'excluded_from_denominator')::boolean,false)
                 AND mq2.allow_not_applicable
                 AND (NOT mq2.na_requires_rationale
                      OR length(btrim(COALESCE(r.observation,''))) >= 10))
            ));
    END IF;

    _treat := CASE WHEN _ev_ok THEN 'NONE' ELSE _evid END;

    IF (_mode = 'ALL_MANDATORY_APPLICABLE'
          AND (array_length(_missing,1) IS NOT NULL OR array_length(_required,1) IS NULL))
       OR (_mode = 'MIN_ANSWERED' AND _answered < _minq)
       OR _den = 0
       OR (NOT _ev_ok AND _evid = 'NOT_CALCULABLE') THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
        'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','NOT_CALCULABLE',
        'completeness_mode',_mode,
        'published_questions',_pubq,
        'mandatory_questions', to_jsonb(_required),
        'missing_mandatory_questions', to_jsonb(_missing),
        'reason_code', CASE
          WHEN NOT _ev_ok AND _evid = 'NOT_CALCULABLE' THEN 'EVIDENCE_INSUFFICIENT'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_required,1) IS NULL
            THEN 'METHODOLOGY_PUBLISHES_NO_MANDATORY_QUESTION'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_missing,1) IS NOT NULL
            THEN 'MANDATORY_QUESTIONS_UNANSWERED'
          WHEN _den = 0 AND _answered = 0 THEN 'NO_SCORED_RESPONSE'
          ELSE 'MINIMUM_ANSWERS_NOT_MET' END,
        'reason', CASE
          WHEN NOT _ev_ok AND _evid = 'NOT_CALCULABLE'
            THEN 'the configured evidence-insufficiency treatment makes this dimension not calculable'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_required,1) IS NULL
            THEN 'the methodology publishes no mandatory question for this dimension, so completeness cannot be established'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_missing,1) IS NOT NULL
            THEN format('%s mandatory applicable question(s) carry no valid response', array_length(_missing,1))
          WHEN _den = 0 AND _answered = 0
            THEN 'the supervisor has recorded no scored response for any question in this dimension'
          ELSE 'no applicable answered question meets the minimum-answer rule' END,
        'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
        'evidence_treatment',_treat,'evidence_effect','dimension not calculated',
        'answered',_answered,'questions',_qtrace);
      CONTINUE;
    END IF;

    _raw := public.supervisory_calc_round(_num / _den, _rmode, _rdec);
    IF _d.dimension_kind = 'INHERENT' THEN
      _score := CASE WHEN _dir = 'INVERTED' THEN 100 - _raw ELSE _raw END;
    ELSE
      _score := _raw;
    END IF;

    IF NOT _ev_ok AND _evid = 'CAP_AT_MIDPOINT' THEN
      IF _d.dimension_kind = 'INHERENT' THEN
        IF _score < 50 THEN _score := 50; _capped := true; END IF;
      ELSE
        IF _score > 50 THEN _score := 50; _capped := true; END IF;
      END IF;
    END IF;

    _band := public.supervisory_calc_band_of_policy(_bands,
               CASE WHEN _d.dimension_kind = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END, _score);
    _w := CASE WHEN _wmode = 'EQUAL' THEN 1 ELSE COALESCE(_d.weight,_d.meth_weight,1) END;

    IF _d.dimension_kind = 'INHERENT' THEN
      _inh_num := _inh_num + _score * _w; _inh_den := _inh_den + _w;
    ELSE
      _ctl_num := _ctl_num + _score * _w; _ctl_den := _ctl_den + _w;
    END IF;

    _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
      'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','CALCULATED',
      'reason_code','CALCULATED',
      'completeness_mode',_mode,'mandatory_questions',to_jsonb(_required),
      'published_questions',_pubq,
      'weight',_w,'raw_score',_raw,'score',_score,'band',_band,'answered',_answered,
      'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
      'evidence_treatment',_treat,
      'evidence_effect', CASE WHEN _capped THEN 'score capped at the midpoint (50)'
                              WHEN NOT _ev_ok THEN 'flagged only; no effect on the calculated rating'
                              ELSE 'none' END,
      'critical_handling',_crit,'questions',_qtrace);
  END LOOP;

  IF _inh_den > 0 THEN
    _inh_score := public.supervisory_calc_round(_inh_num/_inh_den, _rmode, _rdec);
    _inh_band := public.supervisory_calc_band_of_policy(_bands,'INHERENT',_inh_score);
  END IF;
  IF _ctl_den > 0 THEN
    _ctl_score := public.supervisory_calc_round(_ctl_num/_ctl_den, _rmode, _rdec);
    _ctl_band := public.supervisory_calc_band_of_policy(_bands,'CONTROL',_ctl_score);
  END IF;

  IF _inh_band IS NOT NULL AND _ctl_band IS NOT NULL THEN
    SELECT c->>'residual_rating' INTO _residual FROM jsonb_array_elements(_matrix) c
     WHERE c->>'inherent_band' = _inh_band AND c->>'control_band' = _ctl_band LIMIT 1;
  END IF;

  SELECT jsonb_agg(
           CASE WHEN d->>'status' <> 'CALCULATED' THEN d
                ELSE d || jsonb_build_object('residual_rating',
                  (SELECT c->>'residual_rating' FROM jsonb_array_elements(_matrix) c
                    WHERE c->>'inherent_band' = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN d->>'band' ELSE _inh_band END
                      AND c->>'control_band'  = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN _ctl_band ELSE d->>'band' END
                    LIMIT 1))
           END ORDER BY d->>'dimension_code')
    INTO _dims FROM jsonb_array_elements(_dims) d;
  _dims := COALESCE(_dims,'[]'::jsonb);

  FOR _q IN
    SELECT (SELECT (x->>'ordinal')::int FROM jsonb_array_elements(_m.scoring_scale) x
             WHERE x->>'code' = d->>'residual_rating') AS ord,
           COALESCE((d->>'weight')::numeric,1) AS w
      FROM jsonb_array_elements(_dims) d
     WHERE d->>'residual_rating' IS NOT NULL
  LOOP
    IF _q.ord IS NOT NULL THEN
      _ord_num := _ord_num + _q.ord * _q.w; _ord_den := _ord_den + _q.w;
      _worst := greatest(_worst, _q.ord);
    END IF;
  END LOOP;

  IF _ord_den > 0 THEN
    IF _rpol = 'HIGHEST_DIMENSION' THEN
      _weighted := _worst;
    ELSE
      _weighted := round(_ord_num/_ord_den)::int;
      IF _rpol = 'WEIGHTED_WITH_THRESHOLD' THEN
        SELECT (x->>'ordinal')::int INTO _thr FROM jsonb_array_elements(_m.scoring_scale) x
         WHERE x->>'code' = _rthr;
        IF _thr IS NOT NULL AND _worst >= _thr THEN _weighted := greatest(_weighted, _thr); END IF;
      END IF;
    END IF;
    SELECT x->>'code' INTO _rec FROM jsonb_array_elements(_m.scoring_scale) x
     WHERE (x->>'ordinal')::int = _weighted;
  END IF;

  -- Assessment-level outcome. CALCULATED only when a recommendation was produced.
  _n_total := jsonb_array_length(_dims);
  SELECT count(*) FILTER (WHERE d->>'status' = 'CALCULATED'),
         count(*) FILTER (WHERE d->>'status' = 'NOT_APPLICABLE'),
         count(*) FILTER (WHERE d->>'status' = 'NOT_CALCULABLE')
    INTO _n_calc, _n_na, _n_notcalc
    FROM jsonb_array_elements(_dims) d;

  IF _n_total = 0 THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_DIMENSIONS';
    _reason := 'the assessment carries no dimension row, so there is nothing to calculate';
  ELSIF COALESCE(_n_calc,0) = 0 THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_CALCULABLE_DIMENSION';
    _reason := 'no dimension of this assessment is calculable under the configuration in force';
  ELSIF _residual IS NULL AND _inh_band IS NOT NULL AND _ctl_band IS NOT NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_MATRIX_CELL';
    _reason := format('the residual matrix publishes no cell for inherent %s and control %s', _inh_band, _ctl_band);
  ELSIF _inh_band IS NULL OR _ctl_band IS NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'INCOMPLETE_DIMENSION_SIDES';
    _reason := 'a residual rating needs both an inherent and a control side, and one of them is not calculable';
  ELSIF _rec IS NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_RECOMMENDATION';
    _reason := 'the recommendation policy produced no rating on the methodology scoring scale';
  ELSE
    _status := 'CALCULATED'; _reason_code := 'CALCULATED'; _reason := NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', _status, 'reason_code', _reason_code, 'reason', _reason,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,'config_id',_config_id,'config_version',_config_version,
    'as_of',_as_of,
    'dimension_summary', jsonb_build_object('total',_n_total,'calculated',COALESCE(_n_calc,0),
      'not_applicable',COALESCE(_n_na,0),'not_calculable',COALESCE(_n_notcalc,0)),
    'parameters', jsonb_build_object('aggregation_method',_agg,
       'completeness_mode',_mode,
       'na_denominator_handling',_na,'min_answered_questions',_minq,
       'evidence_insufficiency_handling',_evid,'critical_question_handling',_crit,
       'inherent_direction',_dir,'rounding',_rmode||'/'||_rdec,
       'dimension_weight_mode',_wmode,
       'recommendation_policy',_rpol,'recommendation_threshold',_rthr,
       'override_threshold',_policy->>'override_threshold'),
    'inherent_score',_inh_score,'inherent_band',_inh_band,
    'control_score',_ctl_score,'control_band',_ctl_band,
    'residual_rating',_residual,'recommended_rating',_rec,
    'dimensions',_dims);
END $function$;
