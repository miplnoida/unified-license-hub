CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_relink(
  _domain_code text, _dry_run boolean DEFAULT true, _rationale text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _module text; _r record;
        _considered int := 0; _exact int := 0; _repairable int := 0; _ambiguous int := 0;
        _unmatched int := 0; _cross int := 0; _code_mismatch int := 0; _no_meth int := 0;
        _repaired int := 0; _resp_ok int := 0; _resp_repaired int := 0; _resp_conflict int := 0;
        _resp_orphan int := 0; _proposed jsonb := '[]'::jsonb; _conflicts jsonb := '[]'::jsonb;
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

  FOR _r IN
    SELECT d.id did, d.dimension_code, d.methodology_dimension_id cur_link,
           a.id aid, a.reference, a.status, a.methodology_id,
           (SELECT count(*) FROM public.supervisory_methodology_dimension md
             WHERE md.methodology_id = a.methodology_id AND md.dimension_code = d.dimension_code) cand,
           public.supervisory_methodology_dimension_resolve(a.methodology_id, d.dimension_code) canon,
           (SELECT md.methodology_id FROM public.supervisory_methodology_dimension md
             WHERE md.id = d.methodology_dimension_id) link_meth,
           (SELECT md.dimension_code FROM public.supervisory_methodology_dimension md
             WHERE md.id = d.methodology_dimension_id) link_code
      FROM public.supervisory_assessment a
      JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
     WHERE upper(a.domain_code) = upper(_domain_code)
     ORDER BY a.created_at, d.dimension_code
  LOOP
    _considered := _considered + 1;

    IF _r.methodology_id IS NULL THEN
      _no_meth := _no_meth + 1; CONTINUE;
    END IF;

    IF _r.cur_link IS NOT NULL THEN
      IF _r.link_meth IS DISTINCT FROM _r.methodology_id THEN
        _cross := _cross + 1;
        _conflicts := _conflicts || jsonb_build_object('assessment_dimension_id',_r.did,
          'dimension_code',_r.dimension_code,'classification','CROSS_METHODOLOGY_MISMATCH');
      ELSIF _r.link_code IS DISTINCT FROM _r.dimension_code THEN
        _code_mismatch := _code_mismatch + 1;
        _conflicts := _conflicts || jsonb_build_object('assessment_dimension_id',_r.did,
          'dimension_code',_r.dimension_code,'classification','CODE_MISMATCH');
      ELSE
        _exact := _exact + 1;
      END IF;
      CONTINUE;
    END IF;

    IF _r.cand > 1 THEN
      _ambiguous := _ambiguous + 1;
      _conflicts := _conflicts || jsonb_build_object('assessment_dimension_id',_r.did,
        'dimension_code',_r.dimension_code,'classification','AMBIGUOUS','candidates',_r.cand);
      CONTINUE;
    END IF;

    IF _r.canon IS NULL THEN
      _unmatched := _unmatched + 1;
      _conflicts := _conflicts || jsonb_build_object('assessment_dimension_id',_r.did,
        'assessment_reference',_r.reference,'dimension_code',_r.dimension_code,
        'classification','NO_MATCH',
        'reason','no dimension with this code exists in the methodology bound to the assessment');
      CONTINUE;
    END IF;

    _repairable := _repairable + 1;
    _proposed := _proposed || jsonb_build_object('assessment_dimension_id',_r.did,
      'assessment_id',_r.aid,'assessment_reference',_r.reference,'status',_r.status,
      'dimension_code',_r.dimension_code,'old_link',NULL,'new_link',_r.canon);

    IF NOT _dry_run THEN
      UPDATE public.supervisory_assessment_dimension
         SET methodology_dimension_id = _r.canon, updated_at = now()
       WHERE id = _r.did AND methodology_dimension_id IS NULL;
      IF FOUND THEN
        _repaired := _repaired + 1;
        PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_dimension', _r.did,
          jsonb_build_object('methodology_dimension_id',NULL),
          jsonb_build_object('methodology_dimension_id',_r.canon,
            'dimension_code',_r.dimension_code,'assessment_id',_r.aid,
            'methodology_id',_r.methodology_id),
          'Governed deterministic methodology dimension relink: ' || btrim(_rationale));
      END IF;
    END IF;
  END LOOP;

  FOR _r IN
    SELECT q.id qid, q.assessment_id, q.dimension_code, q.assessment_dimension_id,
           q.methodology_id qmeth, q.methodology_dimension_id qmd,
           a.methodology_id ameth,
           d.id canon_ad, d.methodology_dimension_id canon_md
      FROM public.supervisory_assessment_question_response q
      JOIN public.supervisory_assessment a ON a.id = q.assessment_id
      LEFT JOIN public.supervisory_assessment_dimension d
             ON d.assessment_id = q.assessment_id AND d.dimension_code = q.dimension_code
     WHERE upper(a.domain_code) = upper(_domain_code)
  LOOP
    IF _r.canon_ad IS NULL THEN
      _resp_orphan := _resp_orphan + 1; CONTINUE;
    END IF;
    IF _r.qmeth IS DISTINCT FROM _r.ameth
       OR (_r.canon_md IS NOT NULL AND _r.qmd IS DISTINCT FROM _r.canon_md)
       OR (_r.assessment_dimension_id IS NOT NULL AND _r.assessment_dimension_id <> _r.canon_ad) THEN
      _resp_conflict := _resp_conflict + 1;
      _conflicts := _conflicts || jsonb_build_object('response_id',_r.qid,
        'dimension_code',_r.dimension_code,'classification','RESPONSE_PROVENANCE_CONFLICT');
      CONTINUE;
    END IF;
    IF _r.assessment_dimension_id IS NULL THEN
      IF NOT _dry_run THEN
        UPDATE public.supervisory_assessment_question_response
           SET assessment_dimension_id = _r.canon_ad, updated_at = now()
         WHERE id = _r.qid AND assessment_dimension_id IS NULL;
      END IF;
      _resp_repaired := _resp_repaired + 1;
    ELSE
      _resp_ok := _resp_ok + 1;
    END IF;
  END LOOP;

  IF NOT _dry_run THEN
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_dimension', NULL::uuid,
      '{}'::jsonb,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,
        'considered',_considered,'repaired',_repaired,'responses_repaired',_resp_repaired),
      'Governed deterministic linkage repair: ' || btrim(_rationale));
  END IF;

  RETURN jsonb_build_object('dry_run',_dry_run,'domain_code',upper(_domain_code),'module',_module,
    'considered',_considered,'exact_matches',_exact,'repairable',_repairable,'repaired',_repaired,
    'ambiguous',_ambiguous,'unmatched',_unmatched,
    'cross_methodology_conflicts',_cross,'code_mismatch_conflicts',_code_mismatch,
    'not_methodology_bound',_no_meth,
    'responses_already_linked',_resp_ok,'responses_repairable',_resp_repaired,
    'response_link_conflicts',_resp_conflict,'responses_without_assessment_dimension',_resp_orphan,
    'proposed_updates',_proposed,'conflicts',_conflicts,
    'actor_id',_uid,'rationale',btrim(_rationale),'at',now());
END $function$;