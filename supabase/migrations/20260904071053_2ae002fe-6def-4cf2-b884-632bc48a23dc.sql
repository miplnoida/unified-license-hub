-- =====================================================================
-- 1. Canonical resolver: assessment methodology + dimension_code -> methodology dimension
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_resolve(
  _methodology_id uuid, _dimension_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT md.id FROM public.supervisory_methodology_dimension md
   WHERE md.methodology_id = _methodology_id
     AND md.dimension_code = upper(btrim(_dimension_code));
$$;

-- =====================================================================
-- 2. Database integrity guard on supervisory_assessment_dimension
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _meth uuid; _canon uuid; _md public.supervisory_methodology_dimension;
BEGIN
  SELECT methodology_id INTO _meth FROM public.supervisory_assessment WHERE id = NEW.assessment_id;

  IF NEW.methodology_dimension_id IS NOT NULL THEN
    SELECT * INTO _md FROM public.supervisory_methodology_dimension WHERE id = NEW.methodology_dimension_id;
    IF _md.id IS NULL THEN
      RAISE EXCEPTION 'dimension_link_invalid: methodology dimension % does not exist', NEW.methodology_dimension_id
        USING ERRCODE = '22023';
    END IF;
    IF _meth IS NULL OR _md.methodology_id <> _meth THEN
      RAISE EXCEPTION 'dimension_link_cross_methodology: methodology dimension % belongs to methodology %, the assessment is bound to %',
        _md.id, _md.methodology_id, COALESCE(_meth::text,'(none)') USING ERRCODE = '22023';
    END IF;
    IF _md.dimension_code <> NEW.dimension_code THEN
      RAISE EXCEPTION 'dimension_link_code_mismatch: methodology dimension % is code %, the assessment dimension is code %',
        _md.id, _md.dimension_code, NEW.dimension_code USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- No link supplied: on a methodology-bound assessment the link is mandatory
  -- whenever the canonical dimension is resolvable. Codes with no counterpart in
  -- the bound methodology are left as-is (legacy rows), never invented.
  IF _meth IS NOT NULL THEN
    _canon := public.supervisory_methodology_dimension_resolve(_meth, NEW.dimension_code);
    IF _canon IS NOT NULL AND TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'dimension_link_required: dimension % resolves to methodology dimension % and must be linked',
        NEW.dimension_code, _canon USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supervisory_assessment_dimension_link_guard_trg ON public.supervisory_assessment_dimension;
CREATE TRIGGER supervisory_assessment_dimension_link_guard_trg
  BEFORE INSERT OR UPDATE OF methodology_dimension_id, dimension_code, assessment_id
  ON public.supervisory_assessment_dimension
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_dimension_link_guard();

-- =====================================================================
-- 3. Server-authoritative dimension writer
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_upsert(
  _assessment_id uuid, _dimension_code text, _dimension_group text DEFAULT 'OTHER'::text,
  _inherent_rating text DEFAULT NULL::text, _control_rating text DEFAULT NULL::text,
  _residual_rating text DEFAULT NULL::text, _weight numeric DEFAULT NULL::numeric,
  _score numeric DEFAULT NULL::numeric, _rationale text DEFAULT NULL::text,
  _methodology_dimension_id uuid DEFAULT NULL::uuid, _evidence_refs jsonb DEFAULT NULL::jsonb,
  _source_facts text DEFAULT NULL::text, _supervisory_commentary text DEFAULT NULL::text,
  _exceptions text DEFAULT NULL::text, _trend text DEFAULT NULL::text, _confidence text DEFAULT NULL::text,
  _data_quality text DEFAULT NULL::text, _is_applicable boolean DEFAULT NULL::boolean,
  _calculated_inherent_rating text DEFAULT NULL::text, _calculated_control_rating text DEFAULT NULL::text,
  _calculated_residual_rating text DEFAULT NULL::text, _calculated_score numeric DEFAULT NULL::numeric,
  _override_reason text DEFAULT NULL::text, _proposed_examination_scope boolean DEFAULT NULL::boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid; _forged boolean; _calc jsonb;
        _row public.supervisory_assessment_dimension; _code text; _canon uuid;
        _md public.supervisory_methodology_dimension; _asserted boolean := false;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment',
    'aml_supervision.create','aml_supervision.edit','aml_supervision.approve',
    'market_conduct.run_conduct_analytics']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  _code := upper(btrim(COALESCE(_dimension_code,'')));
  IF _code = '' THEN RAISE EXCEPTION 'dimension_code is required' USING ERRCODE = '22023'; END IF;

  -- Canonical binding: the assessment's own methodology + the dimension code.
  -- The caller-supplied id is only ever a consistency assertion.
  IF _a.methodology_id IS NOT NULL THEN
    _canon := public.supervisory_methodology_dimension_resolve(_a.methodology_id, _code);
    IF _canon IS NULL THEN
      RAISE EXCEPTION 'dimension_not_in_methodology: % is not a dimension of the methodology bound to this assessment (%)',
        _code, COALESCE(_a.methodology_version,'?') USING ERRCODE = '22023';
    END IF;
    IF _methodology_dimension_id IS NOT NULL THEN
      _asserted := true;
      SELECT * INTO _md FROM public.supervisory_methodology_dimension WHERE id = _methodology_dimension_id;
      IF _md.id IS NULL THEN
        RAISE EXCEPTION 'dimension_link_invalid: methodology dimension % does not exist', _methodology_dimension_id
          USING ERRCODE = '22023';
      END IF;
      IF _md.methodology_id <> _a.methodology_id THEN
        RAISE EXCEPTION 'dimension_link_cross_methodology: methodology dimension % belongs to another methodology', _md.id
          USING ERRCODE = '22023';
      END IF;
      IF _md.dimension_code <> _code THEN
        RAISE EXCEPTION 'dimension_link_code_mismatch: methodology dimension % is code %, requested %', _md.id, _md.dimension_code, _code
          USING ERRCODE = '22023';
      END IF;
      IF _md.id <> _canon THEN
        RAISE EXCEPTION 'dimension_link_not_canonical: methodology dimension % is not the canonical dimension % for code %',
          _md.id, _canon, _code USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF _methodology_dimension_id IS NOT NULL THEN
    RAISE EXCEPTION 'assessment_not_methodology_bound: a methodology dimension cannot be linked to an assessment with no methodology'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (public.supervisory_rating_valid(_inherent_rating, _a.domain_code)
          AND public.supervisory_rating_valid(_control_rating, _a.domain_code)
          AND public.supervisory_rating_valid(_residual_rating, _a.domain_code)) THEN
    RAISE EXCEPTION 'invalid_rating: ratings must use the canonical supervisory rating scale'
      USING ERRCODE = '22023'; END IF;

  _forged := _calculated_inherent_rating IS NOT NULL OR _calculated_control_rating IS NOT NULL
          OR _calculated_residual_rating IS NOT NULL OR _calculated_score IS NOT NULL;

  INSERT INTO public.supervisory_assessment_dimension(
    assessment_id, methodology_dimension_id, dimension_code, dimension_group, weight,
    inherent_rating, control_rating, residual_rating, score, rationale, evidence_refs, created_by,
    is_applicable, source_facts, supervisory_commentary, exceptions, trend, confidence, data_quality,
    override_reason, proposed_examination_scope)
  VALUES (_assessment_id, _canon, _code, COALESCE(_dimension_group,'OTHER'),
    _weight, _inherent_rating, _control_rating, _residual_rating, _score, _rationale,
    COALESCE(_evidence_refs,'[]'::jsonb), _uid,
    COALESCE(_is_applicable,true), _source_facts, _supervisory_commentary, _exceptions,
    upper(_trend), upper(_confidence), upper(_data_quality),
    NULLIF(btrim(COALESCE(_override_reason,'')),''), COALESCE(_proposed_examination_scope,false))
  ON CONFLICT (assessment_id, dimension_code) DO UPDATE
    SET dimension_group = EXCLUDED.dimension_group, weight = EXCLUDED.weight,
        inherent_rating = EXCLUDED.inherent_rating, control_rating = EXCLUDED.control_rating,
        residual_rating = EXCLUDED.residual_rating, score = EXCLUDED.score,
        rationale = EXCLUDED.rationale, evidence_refs = EXCLUDED.evidence_refs,
        is_applicable = EXCLUDED.is_applicable, source_facts = EXCLUDED.source_facts,
        supervisory_commentary = EXCLUDED.supervisory_commentary, exceptions = EXCLUDED.exceptions,
        trend = EXCLUDED.trend, confidence = EXCLUDED.confidence, data_quality = EXCLUDED.data_quality,
        override_reason = EXCLUDED.override_reason,
        proposed_examination_scope = EXCLUDED.proposed_examination_scope,
        methodology_dimension_id = COALESCE(EXCLUDED.methodology_dimension_id, supervisory_assessment_dimension.methodology_dimension_id),
        updated_at = now()
  RETURNING id INTO _id;

  IF _forged THEN
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_dimension', _id,
      jsonb_build_object('rejected_calculated_inherent',_calculated_inherent_rating,
        'rejected_calculated_control',_calculated_control_rating,
        'rejected_calculated_residual',_calculated_residual_rating,
        'rejected_calculated_score',_calculated_score),
      '{}'::jsonb,
      'Caller-supplied calculated ratings were ignored; the server recalculated from the approved methodology configuration.');
  END IF;

  _calc := public.supervisory_calc_materialise(_assessment_id, 'ASSESSMENT_EDIT', _uid);
  SELECT * INTO _row FROM public.supervisory_assessment_dimension WHERE id = _id;

  IF _row.is_overridden THEN
    PERFORM public.log_compliance_audit('OVERRIDE','supervisory_assessment_dimension', _id,
      jsonb_build_object('calculated_residual',_row.calculated_residual_rating,
                         'calculated_inherent',_row.calculated_inherent_rating,
                         'calculated_control',_row.calculated_control_rating),
      jsonb_build_object('judged_residual',_row.residual_rating,
                         'judged_inherent',_row.inherent_rating,
                         'judged_control',_row.control_rating),
      'Supervisory override of the calculated rating: ' || COALESCE(_row.override_reason,''));
  END IF;

  RETURN jsonb_build_object('id',_id,'assessment_id',_assessment_id,
    'dimension_code',_code,'methodology_dimension_id',_canon,
    'caller_link_asserted',_asserted,
    'is_overridden',_row.is_overridden,
    'calculation_status',_row.calculation_status,
    'calculated_residual_rating',_row.calculated_residual_rating,
    'calculated_score',_row.calculated_score,
    'caller_calculated_ignored',_forged);
END $function$;

-- =====================================================================
-- 4. Governed deterministic link repair
-- =====================================================================
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

  -- ---- question-response provenance reconciliation -------------------
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
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_dimension', NULL,
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

REVOKE ALL ON FUNCTION public.supervisory_assessment_dimension_relink(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_dimension_relink(text, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_methodology_dimension_resolve(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_dimension_resolve(uuid, text) TO authenticated, service_role;

-- =====================================================================
-- 5. NOT_CALCULABLE acceptance requires configuration provenance
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_calc_outcome_acceptable(
  _status text, _residual_rating text, _config_id uuid, _trace jsonb, _calculated_at timestamp with time zone)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _status = 'CALCULATED' THEN
      _residual_rating IS NOT NULL
      AND _config_id IS NOT NULL
      AND _trace IS NOT NULL AND _trace <> '{}'::jsonb
      AND _calculated_at IS NOT NULL
    -- NOT_CALCULABLE: no rating, but the engine had already resolved the
    -- governed configuration, version and as-of date before it could
    -- legitimately conclude that nothing is calculable.
    WHEN _status = 'NOT_CALCULABLE' THEN
      _residual_rating IS NULL
      AND _config_id IS NOT NULL
      AND _calculated_at IS NOT NULL
      AND _trace IS NOT NULL
      AND length(btrim(COALESCE(_trace->>'reason',''))) >= 5
      AND COALESCE(_trace->>'config_version','') <> ''
      AND COALESCE(_trace->>'as_of','') <> ''
      AND COALESCE(_trace->>'methodology_version','') <> ''
    -- NO_CONFIGURATION / NO_EFFECTIVE_DATE_RULE / CONFIGURATION_INCOMPLETE / NULL
    ELSE false
  END;
$function$;

-- =====================================================================
-- 6. Governed recalculation materialises NOT_CALCULABLE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_calculation_recalculate(
  _domain_code text, _rationale text, _config_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid, _dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a record; _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension;
        _considered int := 0; _recalculated int := 0; _blocked int := 0;
        _not_calculable int := 0; _no_config int := 0; _no_rule int := 0; _incomplete int := 0;
        _other_config int := 0; _dims int := 0; _items jsonb := '[]'::jsonb;
        _blockers jsonb := '[]'::jsonb; _needs boolean; _module text; _status text;
BEGIN
  _module := public.supervisory_domain_module(_domain_code);
  IF _module IS NULL THEN
    RAISE EXCEPTION 'unknown_domain: % is not a governed supervisory domain',
      COALESCE(_domain_code, '(null)') USING ERRCODE = '22023';
  END IF;
  _uid := public.supervisory_spine_require(ARRAY[_module || '.manage_config']);

  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  FOR _a IN
    SELECT s.id, s.entity_id, s.status, s.methodology_id
      FROM public.supervisory_assessment s
     WHERE upper(s.domain_code) = upper(_domain_code)
       AND (_entity_id IS NULL OR s.entity_id = _entity_id)
     ORDER BY s.created_at
  LOOP
    _considered := _considered + 1;
    _r := public.supervisory_calc_compute(_a.id);
    IF _config_id IS NOT NULL AND NULLIF(_r->>'config_id','')::uuid IS DISTINCT FROM _config_id THEN
      _other_config := _other_config + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','OTHER_CONFIGURATION');
      CONTINUE;
    END IF;

    _status := _r->>'status';

    IF _status = 'NO_CONFIGURATION' THEN
      _no_config := _no_config + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','NO_CONFIGURATION','reason',_r->>'reason');
      CONTINUE;
    ELSIF _status = 'NO_EFFECTIVE_DATE_RULE' THEN
      _no_rule := _no_rule + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','NO_EFFECTIVE_DATE_RULE','reason',_r->>'reason');
      CONTINUE;
    ELSIF _status = 'CONFIGURATION_INCOMPLETE' THEN
      _incomplete := _incomplete + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','CONFIGURATION_INCOMPLETE','reason',_r->>'reason');
      CONTINUE;
    ELSIF _status = 'NOT_CALCULABLE' THEN
      -- A governed non-calculable outcome: no calculated rating exists, so no
      -- override review is possible or required. The outcome is recorded with
      -- its configuration/version/as-of provenance; no rating is fabricated.
      _not_calculable := _not_calculable + 1;
      IF NOT _dry_run THEN
        PERFORM public.supervisory_calc_materialise(_a.id, 'GOVERNED_RECALCULATION', _uid);
      END IF;
      _items := _items || jsonb_build_object('assessment_id',_a.id,
        'result', CASE WHEN _dry_run THEN 'WOULD_RECORD_NOT_CALCULABLE' ELSE 'RECORDED_NOT_CALCULABLE' END,
        'reason',_r->>'reason','config_id',_r->>'config_id',
        'config_version',_r->>'config_version','as_of',_r->>'as_of');
      CONTINUE;
    ELSIF _status <> 'CALCULATED' THEN
      RAISE EXCEPTION 'unknown_calculation_status: % is not a recognised calculation outcome for assessment %',
        COALESCE(_status,'(null)'), _a.id USING ERRCODE = '22023';
    END IF;

    _needs := false;
    FOR _d IN SELECT * FROM jsonb_array_elements(_r->'dimensions') LOOP
      SELECT * INTO _row FROM public.supervisory_assessment_dimension
       WHERE id = (_d->>'assessment_dimension_id')::uuid;
      IF _row.id IS NULL THEN CONTINUE; END IF;
      IF _d->>'residual_rating' IS NOT NULL AND _row.residual_rating IS NOT NULL
         AND upper(_d->>'residual_rating') <> upper(_row.residual_rating)
         AND length(btrim(COALESCE(_row.override_reason,''))) < 10 THEN
        _needs := true;
        _blockers := _blockers || jsonb_build_object('assessment_id',_a.id,
          'dimension_code',_row.dimension_code,'judged',_row.residual_rating,
          'calculated',_d->>'residual_rating');
      END IF;
    END LOOP;

    IF _needs THEN
      _blocked := _blocked + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','BLOCKED_REVIEW_REQUIRED');
      CONTINUE;
    END IF;

    _dims := _dims + jsonb_array_length(_r->'dimensions');
    IF NOT _dry_run THEN
      PERFORM public.supervisory_calc_materialise(_a.id, 'GOVERNED_RECALCULATION', _uid);
    END IF;
    _recalculated := _recalculated + 1;
    _items := _items || jsonb_build_object('assessment_id',_a.id,
      'result', CASE WHEN _dry_run THEN 'WOULD_CALCULATE' ELSE 'RECALCULATED' END,
      'config_id',_r->>'config_id','config_version',_r->>'config_version','as_of',_r->>'as_of');
  END LOOP;

  IF NOT _dry_run THEN
    INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status,
      rationale, actor_id, detail)
    VALUES (_config_id, 'RECALCULATION', NULL, NULL, btrim(_rationale), _uid,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,'entity_id',_entity_id,
        'considered',_considered,'recalculated',_recalculated,'blocked',_blocked,
        'not_calculable',_not_calculable,'no_configuration',_no_config,
        'no_effective_date_rule',_no_rule,'configuration_incomplete',_incomplete,
        'dimensions',_dims));
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_calculation', NULL,
      '{}'::jsonb,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,'config_id',_config_id,
        'entity_id',_entity_id,'recalculated',_recalculated,'blocked',_blocked,
        'not_calculable',_not_calculable),
      'Governed recalculation of supervisory calculated ratings: ' || btrim(_rationale));
  END IF;

  RETURN jsonb_build_object('dry_run',_dry_run,'domain_code',upper(_domain_code),'module',_module,
    'config_id',_config_id,'entity_id',_entity_id,'considered',_considered,
    'recalculated',_recalculated,'blocked_review_required',_blocked,
    'not_calculable',_not_calculable,'no_configuration',_no_config,
    'no_effective_date_rule',_no_rule,'configuration_incomplete',_incomplete,
    'other_configuration',_other_config,
    'skipped',_no_config + _no_rule + _incomplete + _other_config,
    'dimensions_affected',_dims,'items',_items,'blockers',_blockers,
    'actor_id',_uid,'rationale',btrim(_rationale),'at',now());
END
$function$;