-- Input snapshot for a calculation run: exactly what the engine read.
CREATE OR REPLACE FUNCTION public.supervisory_calc_inputs_snapshot(_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'responses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('question_code', r.question_code, 'response', r.response,
               'methodology_dimension_id', r.methodology_dimension_id,
               'evidence_count', jsonb_array_length(COALESCE(r.evidence_refs,'[]'::jsonb)))
             ORDER BY r.question_code)
        FROM public.supervisory_assessment_question_response r
       WHERE r.assessment_id = _assessment_id), '[]'::jsonb),
    'facts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('fact_code', f.fact_code, 'data_type', f.data_type, 'unit', f.unit,
               'value_numeric', f.value_numeric, 'numerator', f.numerator, 'denominator', f.denominator,
               'period_start', f.period_start, 'period_end', f.period_end, 'source_type', f.source_type,
               'officer_overridden', f.officer_overridden) ORDER BY f.fact_code)
        FROM public.supervisory_assessment_fact f
       WHERE f.assessment_id = _assessment_id), '[]'::jsonb),
    'evidence_basis_count', (SELECT count(*) FROM public.supervisory_assessment_evidence_basis e
                              WHERE e.assessment_id = _assessment_id),
    'question_plan_count', (SELECT count(*) FROM public.supervisory_assessment_question_plan p
                             WHERE p.assessment_id = _assessment_id),
    'dimensions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dimension_code', d.dimension_code, 'is_applicable', d.is_applicable,
               'weight', d.weight) ORDER BY d.dimension_code)
        FROM public.supervisory_assessment_dimension d
       WHERE d.assessment_id = _assessment_id), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.supervisory_calc_inputs_snapshot(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.supervisory_calc_run_authority(_assessment_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _module text; _actions text[];
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _module := public.supervisory_domain_module(_a.domain_code);
  IF _module IS NULL THEN
    RAISE EXCEPTION 'unknown_domain: % is not a governed supervisory domain, calculation authority cannot be resolved',
      COALESCE(_a.domain_code,'(null)') USING ERRCODE = '22023';
  END IF;
  _actions := COALESCE(public.supervisory_domain_actions(_a.domain_code,'edit'), ARRAY[]::text[])
              || ARRAY[_module || '.manage_config'];
  _uid := public.supervisory_spine_require(_actions);
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: this assessment is outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  RETURN _uid;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_run_authority(uuid) FROM PUBLIC, anon;

-- Record an immutable calculation run.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_calculation_run_record(_assessment_id uuid, _event_reason text DEFAULT 'MANUAL_RUN')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _res jsonb; _inputs jsonb; _policy jsonb;
        _seq integer; _run_id uuid;
BEGIN
  _uid := public.supervisory_calc_run_authority(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  _res := public.supervisory_calc_compute(_assessment_id);
  _inputs := public.supervisory_calc_inputs_snapshot(_assessment_id);
  _policy := CASE WHEN (_res->>'config_id') IS NOT NULL
                  THEN public.supervisory_calc_policy_from_config((_res->>'config_id')::uuid)
                  ELSE '{}'::jsonb END;

  SELECT COALESCE(max(run_seq),0) + 1 INTO _seq
    FROM public.supervisory_assessment_calculation_run WHERE assessment_id = _assessment_id;

  INSERT INTO public.supervisory_assessment_calculation_run(
    assessment_id, run_seq, engine_version, methodology_id, methodology_version,
    programme_id, programme_version, question_plan_version,
    config_id, config_version, as_of, status, reason_code, reason,
    inherent_score, inherent_band, control_score, control_band, residual_rating, recommended_rating,
    inputs, policy_snapshot, trace, inputs_hash, result_hash, calculated_by, event_reason)
  VALUES (_assessment_id, _seq, COALESCE(_res->>'engine_version','UNKNOWN'),
    _a.methodology_id, _a.methodology_version,
    _a.programme_id, NULL, NULL,
    NULLIF(_res->>'config_id','')::uuid, NULLIF(_res->>'config_version','')::integer,
    NULLIF(_res->>'as_of','')::date, _res->>'status', _res->>'reason_code', _res->>'reason',
    NULLIF(_res->>'inherent_score','')::numeric, _res->>'inherent_band',
    NULLIF(_res->>'control_score','')::numeric, _res->>'control_band',
    _res->>'residual_rating', _res->>'recommended_rating',
    _inputs, _policy, _res,
    md5(_inputs::text), md5(_res::text), _uid, COALESCE(NULLIF(btrim(_event_reason),''),'MANUAL_RUN'))
  RETURNING id INTO _run_id;

  RETURN jsonb_build_object('run_id', _run_id, 'run_seq', _seq, 'result', _res);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_calculation_run_record(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_calculation_run_record(uuid, text) TO authenticated;

-- Propose a supervisory override of the calculated result.
CREATE OR REPLACE FUNCTION public.supervisory_calculation_override_propose(
  _assessment_id uuid, _proposed_rating text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _run public.supervisory_assessment_calculation_run;
        _ok boolean; _id uuid;
BEGIN
  _uid := public.supervisory_calc_run_authority(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'rationale_required: an override needs a written supervisory reason of at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;
  IF _run.id IS NULL THEN
    RAISE EXCEPTION 'no_calculation: record a calculation run before proposing an override' USING ERRCODE = '55000';
  END IF;
  IF _run.status <> 'CALCULATED' THEN
    RAISE EXCEPTION 'not_calculated: there is no calculated result to override (%).', _run.reason_code
      USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.supervisory_methodology m,
                      jsonb_array_elements(m.scoring_scale) x
                  WHERE m.id = _a.methodology_id AND x->>'code' = upper(btrim(_proposed_rating)))
    INTO _ok;
  IF NOT _ok THEN
    RAISE EXCEPTION 'invalid_rating: % is not on the scoring scale of the methodology bound to this assessment',
      COALESCE(_proposed_rating,'(null)') USING ERRCODE = '22023';
  END IF;

  IF upper(btrim(_proposed_rating)) = COALESCE(_run.recommended_rating,'') THEN
    RAISE EXCEPTION 'no_difference: the proposed rating equals the calculated recommendation, so there is nothing to override'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_override o
              WHERE o.assessment_id = _assessment_id AND o.status = 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'override_pending: an override proposal is already awaiting a decision' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.supervisory_assessment_calculation_override(
    assessment_id, run_id, computed_residual_rating, computed_recommended_rating,
    computed_inherent_band, computed_control_band, computed_result_hash,
    proposed_rating, rationale, status, proposed_by)
  VALUES (_assessment_id, _run.id, _run.residual_rating, _run.recommended_rating,
    _run.inherent_band, _run.control_band, _run.result_hash,
    upper(btrim(_proposed_rating)), btrim(_rationale), 'PENDING_APPROVAL', _uid)
  RETURNING id INTO _id;

  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calculation_override_propose(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_override_propose(uuid, text, text) TO authenticated;

-- A second person decides the override.
CREATE OR REPLACE FUNCTION public.supervisory_calculation_override_decide(
  _override_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _o public.supervisory_assessment_calculation_override; _dec text;
BEGIN
  SELECT * INTO _o FROM public.supervisory_assessment_calculation_override WHERE id = _override_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'not_found: override' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_calc_run_authority(_o.assessment_id);
  _dec := upper(btrim(COALESCE(_decision,'')));
  IF _dec NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'invalid_decision: an override is either approved or rejected' USING ERRCODE = '22023';
  END IF;
  IF _o.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'already_decided: this override is %', _o.status USING ERRCODE = '55000';
  END IF;
  IF _o.proposed_by IS NOT NULL AND _o.proposed_by = _uid THEN
    RAISE EXCEPTION 'maker_checker: the person who proposed an override may not decide it' USING ERRCODE = '42501';
  END IF;
  IF _dec = 'REJECTED' AND length(btrim(COALESCE(_note,''))) < 10 THEN
    RAISE EXCEPTION 'note_required: rejecting an override needs a written reason of at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.supervisory_assessment_calculation_override
     SET status = _dec, decided_by = _uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(_note,'')),'')
   WHERE id = _override_id;

  RETURN _dec;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calculation_override_decide(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_override_decide(uuid, text, text) TO authenticated;

-- Read model: latest run, trace and override history for one assessment.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_calculation_view(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _run jsonb; _runs jsonb; _ovr jsonb;
BEGIN
  IF NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: this assessment is outside your supervisory authority' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(r) INTO _run FROM public.supervisory_assessment_calculation_run r
   WHERE r.assessment_id = _assessment_id ORDER BY r.run_seq DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'run_seq',r.run_seq,'status',r.status,
           'reason_code',r.reason_code,'recommended_rating',r.recommended_rating,
           'residual_rating',r.residual_rating,'config_version',r.config_version,
           'engine_version',r.engine_version,'calculated_at',r.calculated_at,
           'event_reason',r.event_reason,'result_hash',r.result_hash) ORDER BY r.run_seq DESC), '[]'::jsonb)
    INTO _runs FROM public.supervisory_assessment_calculation_run r WHERE r.assessment_id = _assessment_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.proposed_at DESC), '[]'::jsonb)
    INTO _ovr FROM public.supervisory_assessment_calculation_override o WHERE o.assessment_id = _assessment_id;

  RETURN jsonb_build_object('latest_run', _run, 'runs', _runs, 'overrides', _ovr);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_calculation_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_calculation_view(uuid) TO authenticated;