CREATE OR REPLACE FUNCTION public.supervisory_assessment_structure_backfill(
  _domain_code text, _dry_run boolean DEFAULT true, _rationale text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _module text; _a record; _r record; _res jsonb; _miss int;
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

    SELECT count(*) INTO _miss
      FROM public.supervisory_methodology_dimension md
     WHERE md.methodology_id = _a.methodology_id AND md.active
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension sad
                        WHERE sad.assessment_id = _a.id AND sad.dimension_code = md.dimension_code);

    IF _miss = 0 THEN _already := _already + 1; CONTINUE; END IF;

    _dims_missing := _dims_missing + _miss;

    IF _dry_run THEN
      _plan := _plan || jsonb_build_object('assessment_id',_a.id,'assessment_reference',_a.reference,
        'status',_a.status,'expected',_a.expected,'existing',_a.actual,'missing',_miss,
        'action','WOULD_MATERIALISE_MISSING_DIMENSIONS');
    ELSE
      _res := public.supervisory_assessment_dimension_materialise_internal(_a.id, _uid);
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
    CASE WHEN _dry_run THEN 'EXPORT' ELSE 'UPDATE' END,
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
