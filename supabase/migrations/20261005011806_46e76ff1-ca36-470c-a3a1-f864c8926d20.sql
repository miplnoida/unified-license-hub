CREATE OR REPLACE FUNCTION public.supervisory_calc_explain_internal(_r jsonb, _policy jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
-- AML-CLOSE-04: explains the aggregation the AML-06 engine performed, from the engine's own
-- per-dimension output, and withholds a result when any applicable dimension is not calculable.
DECLARE _dims jsonb := COALESCE(_r->'dimensions','[]'::jsonb);
        _side text; _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
        _out jsonb := '[]'::jsonb; d jsonb; _nc text;
BEGIN
  FOR d IN SELECT x FROM jsonb_array_elements(_dims) x LOOP
    IF d->>'status' = 'CALCULATED' THEN
      _side := CASE WHEN COALESCE(d->>'contributes_to', d->>'dimension_kind') = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END;
      IF _side = 'INHERENT' THEN
        _inh_num := _inh_num + (d->>'score')::numeric * (d->>'weight')::numeric; _inh_den := _inh_den + (d->>'weight')::numeric;
      ELSE
        _ctl_num := _ctl_num + (d->>'score')::numeric * (d->>'weight')::numeric; _ctl_den := _ctl_den + (d->>'weight')::numeric;
      END IF;
    END IF;
  END LOOP;

  FOR d IN SELECT x FROM jsonb_array_elements(_dims) x LOOP
    _side := CASE WHEN COALESCE(d->>'contributes_to', d->>'dimension_kind') = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END;
    _out := _out || CASE
      WHEN d->>'status' = 'CALCULATED' THEN d || jsonb_build_object('contribution','INCLUDED','side',_side,
        'weighted_contribution', (d->>'score')::numeric * (d->>'weight')::numeric,
        'weight_share', (d->>'weight')::numeric / NULLIF(CASE WHEN _side='INHERENT' THEN _inh_den ELSE _ctl_den END,0))
      WHEN d->>'status' = 'NOT_APPLICABLE' THEN d || jsonb_build_object('contribution','EXCLUDED_FROM_DENOMINATOR','side',_side)
      ELSE d || jsonb_build_object('contribution','NOT_CALCULABLE_BLOCKS_RESULT','side',_side) END;
  END LOOP;

  _r := _r || jsonb_build_object('dimensions', _out, 'engine_version', 'AML06.3',
    'aggregation', jsonb_build_object(
      'weight_treatment','RENORMALISED_OVER_CALCULATED_DIMENSIONS_OF_THE_SAME_SIDE',
      'excluded_treatment','NOT_APPLICABLE_AND_NOT_MATERIAL_DIMENSIONS_ARE_EXCLUDED_FROM_THE_DENOMINATOR',
      'not_calculable_treatment','ANY_NOT_CALCULABLE_APPLICABLE_DIMENSION_WITHHOLDS_THE_RESULT',
      'rounding', jsonb_build_object('mode',_policy->>'rounding_mode','decimals',(_policy->>'rounding_decimals')::int,
         'applied_at', jsonb_build_array('DIMENSION_RAW_SCORE','INHERENT_SCORE','CONTROL_SCORE'),
         'band_comparison','min_score <= score < max_score; a band whose max_score is 100 also includes 100'),
      'inherent', jsonb_build_object('numerator',_inh_num,'denominator',_inh_den,
         'unrounded', _inh_num / NULLIF(_inh_den,0), 'score',_r->'inherent_score','band',_r->'inherent_band',
         'direction',_policy->>'inherent_direction'),
      'control', jsonb_build_object('numerator',_ctl_num,'denominator',_ctl_den,
         'unrounded', _ctl_num / NULLIF(_ctl_den,0), 'score',_r->'control_score','band',_r->'control_band'),
      'residual', jsonb_build_object('mechanism','MATRIX_LOOKUP','inherent_band',_r->'inherent_band',
         'control_band',_r->'control_band','residual_rating',_r->'residual_rating'),
      'recommendation', jsonb_build_object('policy',_policy->>'recommendation_policy',
         'threshold',_policy->>'recommendation_threshold','result',_r->'recommended_rating'),
      'bands', COALESCE(_policy->'bands','{}'::jsonb)));

  IF _r->>'status' = 'CALCULATED' THEN
    SELECT string_agg((x->>'dimension_code') || ':' || COALESCE(x->>'reason_code','?'), ', ' ORDER BY x->>'dimension_code')
      INTO _nc FROM jsonb_array_elements(_out) x WHERE x->>'status' = 'NOT_CALCULABLE';
    IF _nc IS NOT NULL THEN
      _r := _r || jsonb_build_object('status','NOT_CALCULABLE','reason_code','DIMENSION_NOT_CALCULABLE',
        'reason', format('an applicable dimension cannot be calculated (%s); the result is withheld rather than renormalised over the remaining dimensions', _nc),
        'inherent_score',NULL,'inherent_band',NULL,'control_score',NULL,'control_band',NULL,
        'residual_rating',NULL,'recommended_rating',NULL);
    END IF;
  END IF;
  RETURN _r;
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_calc_explain_internal(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_explain_internal(jsonb, jsonb) TO service_role;

DO $mig$
DECLARE _src text; _anchor text;
BEGIN
  _src := pg_get_functiondef('public.supervisory_calc_compute_core(uuid)'::regprocedure);
  _anchor := $a$  _r := _r || jsonb_build_object('factors', _eval - 'by_dimension');$a$;
  IF position(_anchor in _src) = 0 THEN RAISE EXCEPTION 'anchor not found in compute_core'; END IF;
  IF position('supervisory_calc_explain_internal' in _src) = 0 THEN
    EXECUTE replace(_src, _anchor, _anchor || E'\n  _r := public.supervisory_calc_explain_internal(_r, _policy);');
  END IF;

  _src := pg_get_functiondef('public.supervisory_assessment_transition(uuid,text,text,text,date)'::regprocedure);
  _anchor := $a$  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;$a$;
  IF position(_anchor in _src) = 0 THEN RAISE EXCEPTION 'anchor not found in transition'; END IF;
  IF position('client_rating_refused' in _src) = 0 THEN
    EXECUTE replace(_src, _anchor, _anchor || $g$
  -- AML-CLOSE-04: an AML/CFT rating is never supplied by the caller; approval runs only through
  -- supervisory_assessment_approve, which binds the submitted calculation run and any approved override.
  IF _a.domain_code = 'AML_CFT' THEN
    IF _residual_rating IS NOT NULL THEN
      RAISE EXCEPTION 'client_rating_refused: an AML/CFT residual rating is derived by the server from the calculation run and cannot be supplied'
        USING ERRCODE = '42501';
    END IF;
    IF _to_status = 'approved' THEN
      RAISE EXCEPTION 'governed_approval_required: AML/CFT assessments are approved only through the governed review approval, which uses the calculated result'
        USING ERRCODE = '42501';
    END IF;
  END IF;$g$);
  END IF;
END $mig$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supervisory_assessment_calculation','supervisory_assessment_calculation_history',
    'supervisory_calculation_config','supervisory_calculation_band','supervisory_calculation_matrix_cell',
    'supervisory_calculation_response_score','supervisory_calculation_fact_rule','supervisory_calculation_fact_threshold',
    'supervisory_calculation_materiality_rule','supervisory_calculation_question_weight','supervisory_calculation_dimension_weight',
    'supervisory_calculation_applicability_rule','supervisory_calculation_event']
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, PUBLIC', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;