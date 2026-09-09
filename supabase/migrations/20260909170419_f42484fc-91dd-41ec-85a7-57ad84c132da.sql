-- The calculation-run recorder referenced a non-existent `programme_id` column on
-- supervisory_assessment. The canonical programme linkage on an assessment is
-- assessment_programme_id / assessment_programme_version, and the question-plan
-- reference lives on supervisory_assessment_question_plan. Record all three so a
-- run snapshot is self-describing.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_calculation_run_record(_assessment_id uuid, _event_reason text DEFAULT 'MANUAL_RUN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _res jsonb; _inputs jsonb; _policy jsonb;
        _seq integer; _run_id uuid; _plan_version text;
BEGIN
  _uid := public.supervisory_calc_run_authority(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  _res := public.supervisory_calc_compute(_assessment_id);
  _inputs := public.supervisory_calc_inputs_snapshot(_assessment_id);
  _policy := CASE WHEN (_res->>'config_id') IS NOT NULL
                  THEN public.supervisory_calc_policy_from_config((_res->>'config_id')::uuid)
                  ELSE '{}'::jsonb END;

  SELECT max(p.programme_version) INTO _plan_version
    FROM public.supervisory_assessment_question_plan p
   WHERE p.assessment_id = _assessment_id;

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
    _a.assessment_programme_id, _a.assessment_programme_version, _plan_version,
    NULLIF(_res->>'config_id','')::uuid, NULLIF(_res->>'config_version','')::integer,
    NULLIF(_res->>'as_of','')::date, _res->>'status', _res->>'reason_code', _res->>'reason',
    NULLIF(_res->>'inherent_score','')::numeric, _res->>'inherent_band',
    NULLIF(_res->>'control_score','')::numeric, _res->>'control_band',
    _res->>'residual_rating', _res->>'recommended_rating',
    _inputs, _policy, _res,
    md5(_inputs::text), md5(_res::text), _uid, COALESCE(NULLIF(btrim(_event_reason),''),'MANUAL_RUN'))
  RETURNING id INTO _run_id;

  RETURN jsonb_build_object('run_id', _run_id, 'run_seq', _seq, 'result', _res);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_calculation_run_record(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_calculation_run_record(uuid, text) TO authenticated, service_role;