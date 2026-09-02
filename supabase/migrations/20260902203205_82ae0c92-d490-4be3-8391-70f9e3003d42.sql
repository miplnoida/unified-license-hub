CREATE OR REPLACE FUNCTION public.supervisory_rating_valid(_rating text, _domain_code text DEFAULT 'AML_CFT')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- the canonical scale is enforced for AML/CFT; other domains retain the
  -- rating vocabulary they were certified with in Epic 2.
  SELECT _rating IS NULL
      OR upper(COALESCE(_domain_code,'')) <> 'AML_CFT'
      OR EXISTS (SELECT 1 FROM public.supervisory_rating_scale s
                  WHERE s.code = upper(_rating) AND s.is_active);
$$;
REVOKE ALL ON FUNCTION public.supervisory_rating_valid(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_rating_valid(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_upsert(
  _assessment_id uuid, _dimension_code text, _dimension_group text DEFAULT 'OTHER',
  _inherent_rating text DEFAULT NULL, _control_rating text DEFAULT NULL,
  _residual_rating text DEFAULT NULL, _weight numeric DEFAULT NULL, _score numeric DEFAULT NULL,
  _rationale text DEFAULT NULL, _methodology_dimension_id uuid DEFAULT NULL,
  _evidence_refs jsonb DEFAULT NULL,
  _source_facts text DEFAULT NULL, _supervisory_commentary text DEFAULT NULL,
  _exceptions text DEFAULT NULL, _trend text DEFAULT NULL, _confidence text DEFAULT NULL,
  _data_quality text DEFAULT NULL, _is_applicable boolean DEFAULT NULL,
  _calculated_inherent_rating text DEFAULT NULL, _calculated_control_rating text DEFAULT NULL,
  _calculated_residual_rating text DEFAULT NULL, _calculated_score numeric DEFAULT NULL,
  _override_reason text DEFAULT NULL, _proposed_examination_scope boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid; _override boolean;
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

  _override := (_calculated_residual_rating IS NOT NULL AND _residual_rating IS NOT NULL
                AND upper(_calculated_residual_rating) <> upper(_residual_rating))
            OR (_calculated_inherent_rating IS NOT NULL AND _inherent_rating IS NOT NULL
                AND upper(_calculated_inherent_rating) <> upper(_inherent_rating))
            OR (_calculated_control_rating IS NOT NULL AND _control_rating IS NOT NULL
                AND upper(_calculated_control_rating) <> upper(_control_rating));
  IF _override AND length(btrim(COALESCE(_override_reason,''))) < 10 THEN
    RAISE EXCEPTION 'override_reason_required: departing from the calculated rating requires a recorded reason'
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_assessment_dimension(
    assessment_id, methodology_dimension_id, dimension_code, dimension_group, weight,
    inherent_rating, control_rating, residual_rating, score, rationale, evidence_refs, created_by,
    is_applicable, source_facts, supervisory_commentary, exceptions, trend, confidence, data_quality,
    calculated_inherent_rating, calculated_control_rating, calculated_residual_rating, calculated_score,
    is_overridden, override_reason, overridden_by, overridden_at, proposed_examination_scope)
  VALUES (_assessment_id, _methodology_dimension_id, _dimension_code, COALESCE(_dimension_group,'OTHER'),
    _weight, _inherent_rating, _control_rating, _residual_rating, _score, _rationale,
    COALESCE(_evidence_refs,'[]'::jsonb), _uid,
    COALESCE(_is_applicable,true), _source_facts, _supervisory_commentary, _exceptions,
    upper(_trend), upper(_confidence), upper(_data_quality),
    _calculated_inherent_rating, _calculated_control_rating, _calculated_residual_rating, _calculated_score,
    _override, CASE WHEN _override THEN btrim(_override_reason) END,
    CASE WHEN _override THEN _uid END, CASE WHEN _override THEN now() END,
    COALESCE(_proposed_examination_scope,false))
  ON CONFLICT (assessment_id, dimension_code) DO UPDATE
    SET dimension_group = EXCLUDED.dimension_group, weight = EXCLUDED.weight,
        inherent_rating = EXCLUDED.inherent_rating, control_rating = EXCLUDED.control_rating,
        residual_rating = EXCLUDED.residual_rating, score = EXCLUDED.score,
        rationale = EXCLUDED.rationale, evidence_refs = EXCLUDED.evidence_refs,
        is_applicable = EXCLUDED.is_applicable, source_facts = EXCLUDED.source_facts,
        supervisory_commentary = EXCLUDED.supervisory_commentary, exceptions = EXCLUDED.exceptions,
        trend = EXCLUDED.trend, confidence = EXCLUDED.confidence, data_quality = EXCLUDED.data_quality,
        calculated_inherent_rating = EXCLUDED.calculated_inherent_rating,
        calculated_control_rating = EXCLUDED.calculated_control_rating,
        calculated_residual_rating = EXCLUDED.calculated_residual_rating,
        calculated_score = EXCLUDED.calculated_score,
        is_overridden = EXCLUDED.is_overridden, override_reason = EXCLUDED.override_reason,
        overridden_by = EXCLUDED.overridden_by, overridden_at = EXCLUDED.overridden_at,
        proposed_examination_scope = EXCLUDED.proposed_examination_scope,
        methodology_dimension_id = COALESCE(EXCLUDED.methodology_dimension_id, supervisory_assessment_dimension.methodology_dimension_id),
        updated_at = now()
  RETURNING id INTO _id;

  IF _override THEN
    PERFORM public.log_compliance_audit('OVERRIDE','supervisory_assessment_dimension', _id,
      jsonb_build_object('calculated_residual',_calculated_residual_rating),
      jsonb_build_object('approved_residual',_residual_rating),
      'Supervisory override of the calculated rating: ' || btrim(COALESCE(_override_reason,'')));
  END IF;

  RETURN jsonb_build_object('id',_id,'assessment_id',_assessment_id,
    'dimension_code',_dimension_code,'is_overridden',_override);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_dimension_upsert(
  uuid, text, text, text, text, text, numeric, numeric, text, uuid, jsonb,
  text, text, text, text, text, text, boolean, text, text, text, numeric, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_dimension_upsert(
  uuid, text, text, text, text, text, numeric, numeric, text, uuid, jsonb,
  text, text, text, text, text, text, boolean, text, text, text, numeric, text, boolean
) TO authenticated, service_role;