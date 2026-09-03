-- The governed dimension write no longer trusts caller-supplied calculated_*.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_upsert(
  _assessment_id uuid, _dimension_code text, _dimension_group text DEFAULT 'OTHER'::text,
  _inherent_rating text DEFAULT NULL::text, _control_rating text DEFAULT NULL::text,
  _residual_rating text DEFAULT NULL::text, _weight numeric DEFAULT NULL::numeric,
  _score numeric DEFAULT NULL::numeric, _rationale text DEFAULT NULL::text,
  _methodology_dimension_id uuid DEFAULT NULL::uuid, _evidence_refs jsonb DEFAULT NULL::jsonb,
  _source_facts text DEFAULT NULL::text, _supervisory_commentary text DEFAULT NULL::text,
  _exceptions text DEFAULT NULL::text, _trend text DEFAULT NULL::text,
  _confidence text DEFAULT NULL::text, _data_quality text DEFAULT NULL::text,
  _is_applicable boolean DEFAULT NULL::boolean,
  _calculated_inherent_rating text DEFAULT NULL::text, _calculated_control_rating text DEFAULT NULL::text,
  _calculated_residual_rating text DEFAULT NULL::text, _calculated_score numeric DEFAULT NULL::numeric,
  _override_reason text DEFAULT NULL::text, _proposed_examination_scope boolean DEFAULT NULL::boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid; _forged boolean; _calc jsonb; _row public.supervisory_assessment_dimension;
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

  IF NOT (public.supervisory_rating_valid(_inherent_rating, _a.domain_code)
          AND public.supervisory_rating_valid(_control_rating, _a.domain_code)
          AND public.supervisory_rating_valid(_residual_rating, _a.domain_code)) THEN
    RAISE EXCEPTION 'invalid_rating: ratings must use the canonical supervisory rating scale'
      USING ERRCODE = '22023'; END IF;

  -- CALC-02: calculated ratings are never accepted from a caller.
  _forged := _calculated_inherent_rating IS NOT NULL OR _calculated_control_rating IS NOT NULL
          OR _calculated_residual_rating IS NOT NULL OR _calculated_score IS NOT NULL;

  INSERT INTO public.supervisory_assessment_dimension(
    assessment_id, methodology_dimension_id, dimension_code, dimension_group, weight,
    inherent_rating, control_rating, residual_rating, score, rationale, evidence_refs, created_by,
    is_applicable, source_facts, supervisory_commentary, exceptions, trend, confidence, data_quality,
    override_reason, proposed_examination_scope)
  VALUES (_assessment_id, _methodology_dimension_id, _dimension_code, COALESCE(_dimension_group,'OTHER'),
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

  -- The server is the only producer of calculated_* and of override status.
  _calc := public.supervisory_assessment_calculate(_assessment_id);
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
    'dimension_code',_dimension_code,'is_overridden',_row.is_overridden,
    'calculation_status',_row.calculation_status,
    'calculated_residual_rating',_row.calculated_residual_rating,
    'calculated_score',_row.calculated_score,
    'caller_calculated_ignored',_forged);
END $function$;

-- No unauthenticated execution of the new governed operations.
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_upsert(uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_response_scores_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_bands_set(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_matrix_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_validate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_lifecycle(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_domain_calculation_rule_set(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_as_of(text, date, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calc_compute(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_calculate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calc_config_for(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calc_band_of(uuid, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_calc_round(numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_config_upsert(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_response_scores_set(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_bands_set(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_matrix_set(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_config_validate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_config_lifecycle(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_calculation_rule_set(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_as_of(text, date, date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_compute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_calculate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_config_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_band_of(uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_round(numeric, text, integer) TO authenticated;