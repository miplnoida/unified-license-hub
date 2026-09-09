-- =====================================================================
-- AML-05 (part 2): readiness contract, read models, submission parity
-- =====================================================================

-- LEGACY-01/02: preserved evidence_refs continue to count alongside links
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_gaps_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH a AS (SELECT * FROM public.supervisory_assessment WHERE id = _assessment_id),
  q AS (
    SELECT qq.*, d.dimension_code, d.dimension_group, d.label AS dimension_label
      FROM public.supervisory_methodology_question qq
      JOIN public.supervisory_methodology_dimension d ON d.id = qq.methodology_dimension_id
      JOIN a ON a.methodology_id = qq.methodology_id
     WHERE qq.active AND qq.mandatory AND d.active
       AND (NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan pp
                         WHERE pp.assessment_id = _assessment_id)
            OR COALESCE(public.supervisory_assessment_question_plan_state(_assessment_id, qq.id),'')
               LIKE 'INCLUDED%')
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
                  AND public.supervisory_assessment_question_evidence_count(_assessment_id, q.id)
                      < GREATEST(q.min_evidence_count,1)
                  THEN 'evidence_missing'
             ELSE NULL
           END AS reason
      FROM q
      LEFT JOIN public.supervisory_assessment_question_response r
        ON r.assessment_id = _assessment_id AND r.methodology_question_id = q.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.dimension_group, g.dimension_code, g.question_code), '[]'::jsonb)
    FROM gaps g WHERE g.reason IS NOT NULL;
$function$;

-- READY: required-fact gaps for questions in scope
CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_gaps_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
           ORDER BY r.fact_code), '[]'::jsonb)
    FROM required r
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_fact f
                      WHERE f.assessment_id = _assessment_id AND f.fact_code = r.fact_code);
$function$;

-- READY-01..: the single readiness contract
CREATE OR REPLACE FUNCTION public.supervisory_assessment_readiness_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.supervisory_assessment; _gaps jsonb; _facts jsonb;
        _plan_rows int; _checks jsonb := '[]'::jsonb; _blocking int := 0;
        _unanswered jsonb; _obs jsonb; _ev jsonb; _dim_total int; _dim_done int;
        _dq int; _ovr int;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  _gaps := public.supervisory_assessment_question_gaps_internal(_assessment_id);
  _facts := public.supervisory_assessment_fact_gaps_internal(_assessment_id);
  SELECT count(*) INTO _plan_rows FROM public.supervisory_assessment_question_plan
   WHERE assessment_id = _assessment_id;

  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO _unanswered
    FROM jsonb_array_elements(_gaps) g WHERE g->>'reason' = 'unanswered';
  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO _obs
    FROM jsonb_array_elements(_gaps) g WHERE g->>'reason' IN ('observation_missing','na_rationale_missing');
  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO _ev
    FROM jsonb_array_elements(_gaps) g WHERE g->>'reason' = 'evidence_missing';

  SELECT count(*), count(*) FILTER (WHERE residual_rating IS NOT NULL OR score IS NOT NULL)
    INTO _dim_total, _dim_done
    FROM public.supervisory_assessment_dimension
   WHERE assessment_id = _assessment_id AND COALESCE(is_applicable, true);

  SELECT count(*) FILTER (WHERE source_reference IS NULL AND source_object_id IS NULL),
         count(*) FILTER (WHERE officer_overridden)
    INTO _dq, _ovr
    FROM public.supervisory_assessment_fact WHERE assessment_id = _assessment_id;

  _checks := jsonb_build_array(
    jsonb_build_object('key','METHODOLOGY_BINDING',
      'label','Methodology version attached',
      'status', CASE WHEN _a.methodology_id IS NOT NULL THEN 'OK' ELSE 'ATTENTION' END,
      'blocking', false, 'count', 0,
      'detail', CASE WHEN _a.methodology_id IS NOT NULL THEN 'Bound to the exact methodology version used at creation.'
                     ELSE 'No methodology version is attached to this assessment.' END,
      'items','[]'::jsonb),
    jsonb_build_object('key','QUESTION_PLAN',
      'label','Governed question plan',
      'status', CASE WHEN _plan_rows > 0 THEN 'OK' ELSE 'ATTENTION' END,
      'blocking', false, 'count', _plan_rows,
      'detail', CASE WHEN _plan_rows > 0
                     THEN format('%s question(s) resolved in the governed plan.', _plan_rows)
                     ELSE 'No governed question plan is resolved; all mandatory methodology questions apply.' END,
      'items','[]'::jsonb),
    jsonb_build_object('key','QUESTION_ANSWERS','label','Questions answered',
      'status', CASE WHEN public.jsonb_array_len_safe(_unanswered) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_unanswered) > 0,
      'count', public.jsonb_array_len_safe(_unanswered),
      'detail','Every mandatory question in scope must carry a supervisory answer.',
      'items', _unanswered),
    jsonb_build_object('key','OBSERVATIONS','label','Observations and not-applicable reasons',
      'status', CASE WHEN public.jsonb_array_len_safe(_obs) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_obs) > 0,
      'count', public.jsonb_array_len_safe(_obs),
      'detail','A written observation or not-applicable reason is required where the methodology says so.',
      'items', _obs),
    jsonb_build_object('key','EVIDENCE','label','Governed evidence basis',
      'status', CASE WHEN public.jsonb_array_len_safe(_ev) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_ev) > 0,
      'count', public.jsonb_array_len_safe(_ev),
      'detail','Questions the methodology marks as evidence-based must cite governed evidence.',
      'items', _ev),
    jsonb_build_object('key','REQUIRED_FACTS','label','Required structured facts',
      'status', CASE WHEN public.jsonb_array_len_safe(_facts) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_facts) > 0,
      'count', public.jsonb_array_len_safe(_facts),
      'detail','Facts the methodology requires for questions in scope must be recorded with provenance.',
      'items', _facts),
    jsonb_build_object('key','DIMENSION_RATINGS','label','Dimension ratings recorded',
      'status', CASE WHEN _dim_total = 0 THEN 'UNKNOWN'
                     WHEN _dim_done >= _dim_total THEN 'OK' ELSE 'ATTENTION' END,
      'blocking', false, 'count', GREATEST(_dim_total - _dim_done, 0),
      'detail', format('%s of %s applicable dimension(s) rated.', _dim_done, _dim_total),
      'items','[]'::jsonb),
    jsonb_build_object('key','DATA_QUALITY','label','Fact provenance and officer changes',
      'status', CASE WHEN _dq > 0 THEN 'ATTENTION' ELSE 'OK' END,
      'blocking', false, 'count', _dq,
      'detail', format('%s recorded fact(s) without a source reference; %s officer change(s) on prefilled values.', _dq, _ovr),
      'items','[]'::jsonb)
  );

  SELECT count(*) INTO _blocking FROM jsonb_array_elements(_checks) c
   WHERE (c->>'blocking')::boolean;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'status', _a.status,
    'methodology_id', _a.methodology_id,
    'plan_mode', CASE WHEN _plan_rows > 0 THEN 'GOVERNED_PLAN' ELSE 'LEGACY_ALL_MANDATORY' END,
    'checks', _checks,
    'blocking_check_count', _blocking,
    'outstanding_question_count', public.jsonb_array_len_safe(_gaps),
    'outstanding_fact_count', public.jsonb_array_len_safe(_facts),
    'can_submit', _blocking = 0,
    'submission_gate', CASE WHEN _blocking = 0 THEN 'READY' ELSE 'BLOCKED' END,
    'evaluated_at', now());
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_readiness(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  RETURN public.supervisory_assessment_readiness_internal(_assessment_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_readiness(uuid) TO authenticated;

-- READY-06: submission uses the same contract
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_completeness_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _gaps jsonb; _n integer; _detail text; _facts jsonb; _fn integer;
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
    _facts := public.supervisory_assessment_fact_gaps_internal(NEW.id);
    _fn := public.jsonb_array_len_safe(_facts);
    IF _fn > 0 THEN
      SELECT string_agg(format('%s (%s)', f->>'fact_code', f->>'reason'), '; ') INTO _detail
        FROM jsonb_array_elements(_facts) f;
      RAISE EXCEPTION 'required_facts_incomplete: % required fact(s) are outstanding — %', _fn, _detail
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_execution(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.supervisory_assessment; _out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'dimension_code', row->>'question_code'), '[]'::jsonb)
    INTO _out
  FROM (
    SELECT jsonb_build_object(
      'question_id', q.id, 'question_code', q.question_code, 'prompt', q.prompt,
      'dimension_id', d.id, 'dimension_code', d.dimension_code, 'dimension_group', d.dimension_group,
      'mandatory', q.mandatory, 'requires_observation', q.requires_observation,
      'requires_evidence', q.requires_evidence,
      'min_evidence_count', GREATEST(COALESCE(q.min_evidence_count,0), CASE WHEN q.requires_evidence THEN 1 ELSE 0 END),
      'permitted_evidence_types', COALESCE(to_jsonb(q.evidence_basis_types), 'null'::jsonb),
      'plan_state', public.supervisory_assessment_question_plan_state(_assessment_id, q.id),
      'response', r.response, 'observation', r.observation,
      'legacy_evidence_count', public.jsonb_array_len_safe(r.evidence_refs),
      'governed_evidence_count', (SELECT count(*) FROM public.supervisory_assessment_question_evidence e
                                   WHERE e.assessment_id = _assessment_id AND e.methodology_question_id = q.id),
      'evidence_count', public.supervisory_assessment_question_evidence_count(_assessment_id, q.id),
      'required_facts', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'fact_requirement_id', fr.id, 'fact_code', fr.fact_code, 'label', fr.label,
          'data_type', fr.data_type, 'unit', fr.unit, 'is_required', COALESCE(qf.is_required,false) AND COALESCE(fr.is_required,false),
          'auto_prefill_allowed', fr.auto_prefill_allowed, 'officer_edit_allowed', fr.officer_edit_allowed,
          'recorded', f.id IS NOT NULL, 'fact_id', f.id,
          'value', COALESCE(f.value_numeric::text, f.value_text, f.value_date::text, f.value_boolean::text),
          'officer_overridden', f.officer_overridden) ORDER BY fr.fact_code), '[]'::jsonb)
        FROM public.supervisory_methodology_question_fact qf
        JOIN public.supervisory_methodology_fact_requirement fr ON fr.id = qf.fact_requirement_id
        LEFT JOIN public.supervisory_assessment_fact f
          ON f.assessment_id = _assessment_id AND f.fact_code = fr.fact_code
       WHERE qf.question_id = q.id),
      'answerable', (public.supervisory_assessment_question_plan_state(_assessment_id, q.id) IS NULL
                     OR public.supervisory_assessment_question_plan_state(_assessment_id, q.id) LIKE 'INCLUDED%')
    ) AS row
      FROM public.supervisory_methodology_question q
      JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
      LEFT JOIN public.supervisory_assessment_question_response r
        ON r.assessment_id = _assessment_id AND r.methodology_question_id = q.id
     WHERE q.methodology_id = _a.methodology_id AND q.active AND d.active
       AND (NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan pp
                         WHERE pp.assessment_id = _assessment_id)
            OR COALESCE(public.supervisory_assessment_question_plan_state(_assessment_id, q.id),'')
               LIKE 'INCLUDED%')
  ) s;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_execution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_execution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_register(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _out jsonb; _uid uuid; _entity uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT entity_id INTO _entity FROM public.supervisory_assessment WHERE id = _assessment_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'evidence_type', b.evidence_type, 'type_label', t.label,
    'source_object_type', b.source_object_type, 'source_object_id', b.source_object_id,
    'source_reference', b.source_reference, 'title', b.title, 'note', b.note,
    'period_start', b.period_start, 'period_end', b.period_end, 'as_of_date', b.as_of_date,
    'retrieved_at', b.retrieved_at, 'source_timestamp', b.source_timestamp,
    'origin', b.origin, 'recorded_by', b.recorded_by, 'created_at', b.created_at,
    -- SEC: never reveal a source the reader is not authorised to see
    'source_accessible', COALESCE((public.supervisory_evidence_source_resolve(
        _uid, b.evidence_type, b.source_object_id, _entity)->>'readable')::boolean, false),
    'questions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'link_id', qe.id, 'question_id', qe.methodology_question_id,
        'question_code', qe.question_code, 'relevance_note', qe.relevance_note) ORDER BY qe.question_code), '[]'::jsonb)
       FROM public.supervisory_assessment_question_evidence qe WHERE qe.evidence_id = b.id),
    'dimensions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'link_id', de.id, 'dimension_id', de.methodology_dimension_id,
        'dimension_code', de.dimension_code) ORDER BY de.dimension_code), '[]'::jsonb)
       FROM public.supervisory_assessment_dimension_evidence de WHERE de.evidence_id = b.id)
  ) ORDER BY b.created_at), '[]'::jsonb) INTO _out
    FROM public.supervisory_assessment_evidence_basis b
    LEFT JOIN public.supervisory_evidence_basis_type t ON t.code = b.evidence_type
   WHERE b.assessment_id = _assessment_id;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_register(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_register(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_register(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _out jsonb; _a public.supervisory_assessment;
BEGIN
  IF auth.uid() IS NULL OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fact_requirement_id', fr.id, 'fact_code', fr.fact_code, 'label', fr.label,
    'description', fr.description, 'data_type', fr.data_type, 'unit', COALESCE(f.unit, fr.unit),
    'is_required', COALESCE(fr.is_required,false),
    'auto_prefill_allowed', COALESCE(fr.auto_prefill_allowed,false),
    'officer_edit_allowed', COALESCE(fr.officer_edit_allowed,true),
    'numerator_basis', fr.numerator_basis, 'denominator_basis', fr.denominator_basis,
    'source_type_expectation', COALESCE(to_jsonb(fr.source_type_expectation),'null'::jsonb),
    'definition_status', fr.definition_status,
    'fact_id', f.id, 'recorded', f.id IS NOT NULL,
    'value', COALESCE(f.value_numeric::text, f.value_text, f.value_date::text, f.value_boolean::text),
    'value_numeric', f.value_numeric, 'value_text', f.value_text,
    'value_date', f.value_date, 'value_boolean', f.value_boolean,
    'numerator', f.numerator, 'denominator', f.denominator,
    'period_start', f.period_start, 'period_end', f.period_end, 'as_of_date', f.as_of_date,
    'source_type', f.source_type, 'source_reference', f.source_reference,
    'extraction_timestamp', f.extraction_timestamp, 'auto_prefilled', f.auto_prefilled,
    'system_value', f.system_value, 'officer_overridden', f.officer_overridden,
    'override_reason', f.override_reason, 'overridden_at', f.overridden_at,
    'note', f.note, 'updated_at', f.updated_at
  ) ORDER BY fr.fact_code), '[]'::jsonb) INTO _out
    FROM public.supervisory_methodology_fact_requirement fr
    LEFT JOIN public.supervisory_assessment_fact f
      ON f.assessment_id = _assessment_id AND f.fact_code = fr.fact_code
   WHERE fr.methodology_id = _a.methodology_id;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_register(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_fact_register(uuid) TO authenticated;
