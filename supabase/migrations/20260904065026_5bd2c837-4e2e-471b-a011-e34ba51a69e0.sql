-- ============================================================================
-- AML/CFT POLICY DECISION PACK — CORRECTNESS CLOSURE
-- 1. canonical definition of an acceptable governed calculation outcome
-- 2. non-calculable provenance is preserved (configuration, version, as-of)
-- No AML/CFT calculation policy content is authored, approved or activated.
-- ============================================================================

-- ---------------------------------------------------------------- 1. contract
CREATE OR REPLACE FUNCTION public.supervisory_calc_outcome_acceptable(
  _status text, _residual_rating text, _config_id uuid, _trace jsonb, _calculated_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- A. CALCULATED: a complete, attributable calculated recommendation.
    WHEN _status = 'CALCULATED' THEN
      _residual_rating IS NOT NULL
      AND _config_id IS NOT NULL
      AND _trace IS NOT NULL AND _trace <> '{}'::jsonb
      AND _calculated_at IS NOT NULL
    -- B. NOT_CALCULABLE: no rating, but a governed recorded reason.
    WHEN _status = 'NOT_CALCULABLE' THEN
      _residual_rating IS NULL
      AND _calculated_at IS NOT NULL
      AND _trace IS NOT NULL
      AND length(btrim(COALESCE(_trace->>'reason',''))) >= 5
    -- Everything else (NULL / NO_CONFIGURATION / NO_EFFECTIVE_DATE_RULE /
    -- CONFIGURATION_INCOMPLETE) is not an acceptable certification outcome.
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.supervisory_calc_outcome_acceptable(text,text,uuid,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_outcome_acceptable(text,text,uuid,jsonb,timestamptz) TO authenticated, service_role;
COMMENT ON FUNCTION public.supervisory_calc_outcome_acceptable(text,text,uuid,jsonb,timestamptz) IS
  'Canonical certification contract for a governed calculation outcome on an assessment dimension. CALCULATED requires a rating, a configuration id, a trace and a timestamp; NOT_CALCULABLE requires no rating, a recorded reason and a timestamp; every other status (never calculated, NO_CONFIGURATION, NO_EFFECTIVE_DATE_RULE, CONFIGURATION_INCOMPLETE) is unacceptable. Pure logic: reads no table.';

-- ------------------------------------------------- 2. non-calculable provenance
CREATE OR REPLACE FUNCTION public.supervisory_calc_materialise(
  _assessment_id uuid, _event_reason text, _actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension; _ov boolean;
        _uid uuid := COALESCE(_actor_id, auth.uid()); _a public.supervisory_assessment;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _r := public.supervisory_calc_compute(_assessment_id);

  INSERT INTO public.supervisory_assessment_calculation(
    assessment_id, methodology_id, methodology_version, config_id, config_version, as_of, status,
    inherent_score, inherent_band, control_score, control_band, residual_rating,
    recommended_rating, recommendation_policy, trace, calculated_at)
  VALUES (_assessment_id, _a.methodology_id, _a.methodology_version,
    NULLIF(_r->>'config_id','')::uuid, NULLIF(_r->>'config_version','')::int,
    NULLIF(_r->>'as_of','')::date, _r->>'status',
    NULLIF(_r->>'inherent_score','')::numeric, _r->>'inherent_band',
    NULLIF(_r->>'control_score','')::numeric, _r->>'control_band',
    _r->>'residual_rating', _r->>'recommended_rating', _r->'parameters'->>'recommendation_policy',
    _r, now())
  ON CONFLICT (assessment_id) DO UPDATE SET
    methodology_id = EXCLUDED.methodology_id, methodology_version = EXCLUDED.methodology_version,
    config_id = EXCLUDED.config_id, config_version = EXCLUDED.config_version, as_of = EXCLUDED.as_of,
    status = EXCLUDED.status, inherent_score = EXCLUDED.inherent_score, inherent_band = EXCLUDED.inherent_band,
    control_score = EXCLUDED.control_score, control_band = EXCLUDED.control_band,
    residual_rating = EXCLUDED.residual_rating, recommended_rating = EXCLUDED.recommended_rating,
    recommendation_policy = EXCLUDED.recommendation_policy, trace = EXCLUDED.trace,
    calculated_at = now();

  INSERT INTO public.supervisory_assessment_calculation_history(
    assessment_id, methodology_id, methodology_version, config_id, config_version, as_of, status,
    inherent_score, inherent_band, control_score, control_band, residual_rating, recommended_rating,
    trace, trace_hash, event_reason, actor_id, calculated_at)
  VALUES (_assessment_id, _a.methodology_id, _a.methodology_version,
    NULLIF(_r->>'config_id','')::uuid, NULLIF(_r->>'config_version','')::int,
    NULLIF(_r->>'as_of','')::date, _r->>'status',
    NULLIF(_r->>'inherent_score','')::numeric, _r->>'inherent_band',
    NULLIF(_r->>'control_score','')::numeric, _r->>'control_band',
    _r->>'residual_rating', _r->>'recommended_rating',
    _r, md5(_r::text), COALESCE(NULLIF(btrim(_event_reason),''),'CALCULATION'), _uid, now());

  IF _r->>'status' <> 'CALCULATED' THEN
    -- No rating is produced, and none is invented. Where a configuration and an
    -- as-of date did resolve, that provenance is RETAINED so the recorded
    -- non-calculable outcome remains attributable to the governed parameters in
    -- force. NO_CONFIGURATION / NO_EFFECTIVE_DATE_RULE naturally carry none.
    UPDATE public.supervisory_assessment_dimension
       SET calculated_inherent_rating = NULL, calculated_control_rating = NULL,
           calculated_residual_rating = NULL, calculated_score = NULL,
           calculation_config_id = NULLIF(_r->>'config_id','')::uuid,
           calculation_status = _r->>'status',
           calculation_trace = jsonb_strip_nulls(jsonb_build_object(
                                'status', _r->>'status',
                                'reason', _r->>'reason',
                                'undecided_parameters', _r->'undecided_parameters',
                                'config_id', _r->>'config_id',
                                'config_version', _r->>'config_version',
                                'as_of', _r->>'as_of',
                                'methodology_id', _r->>'methodology_id',
                                'methodology_version', _r->>'methodology_version',
                                'event_reason', COALESCE(NULLIF(btrim(_event_reason),''),'CALCULATION'))),
           calculated_at = now(), is_overridden = false, override_reason = NULL,
           overridden_by = NULL, overridden_at = NULL
     WHERE assessment_id = _assessment_id;
    RETURN _r;
  END IF;

  FOR _d IN SELECT * FROM jsonb_array_elements(_r->'dimensions') LOOP
    SELECT * INTO _row FROM public.supervisory_assessment_dimension
     WHERE id = (_d->>'assessment_dimension_id')::uuid;
    IF _row.id IS NULL THEN CONTINUE; END IF;

    _ov := (_d->>'status' = 'CALCULATED') AND (
             (_d->>'residual_rating' IS NOT NULL AND _row.residual_rating IS NOT NULL
                AND upper(_d->>'residual_rating') <> upper(_row.residual_rating))
          OR (_d->>'dimension_kind' = 'INHERENT' AND _d->>'band' IS NOT NULL AND _row.inherent_rating IS NOT NULL
                AND upper(_d->>'band') <> upper(_row.inherent_rating))
          OR (_d->>'dimension_kind' <> 'INHERENT' AND _d->>'band' IS NOT NULL AND _row.control_rating IS NOT NULL
                AND upper(_d->>'band') <> upper(_row.control_rating)));

    IF _ov AND length(btrim(COALESCE(_row.override_reason,''))) < 10 THEN
      RAISE EXCEPTION 'override_reason_required: dimension % departs from the calculated recommendation and needs a recorded reason of at least 10 characters',
        _row.dimension_code USING ERRCODE = '22023';
    END IF;

    UPDATE public.supervisory_assessment_dimension SET
      calculated_inherent_rating = CASE WHEN _d->>'status' <> 'CALCULATED' THEN NULL
             WHEN _d->>'dimension_kind' = 'INHERENT' THEN _d->>'band' ELSE _r->>'inherent_band' END,
      calculated_control_rating  = CASE WHEN _d->>'status' <> 'CALCULATED' THEN NULL
             WHEN _d->>'dimension_kind' = 'INHERENT' THEN _r->>'control_band' ELSE _d->>'band' END,
      calculated_residual_rating = CASE WHEN _d->>'status' = 'CALCULATED' THEN _d->>'residual_rating' ELSE NULL END,
      calculated_score = CASE WHEN _d->>'status' = 'CALCULATED' THEN NULLIF(_d->>'score','')::numeric ELSE NULL END,
      -- provenance is retained for a NOT_CALCULABLE dimension too
      calculation_config_id = NULLIF(_r->>'config_id','')::uuid,
      calculation_status = _d->>'status',
      calculation_trace = _d || jsonb_build_object('parameters', _r->'parameters',
                             'assessment_inherent_band', _r->>'inherent_band',
                             'assessment_control_band', _r->>'control_band',
                             'config_id', _r->>'config_id',
                             'config_version', _r->>'config_version',
                             'methodology_version', _r->>'methodology_version',
                             'as_of', _r->>'as_of',
                             'event_reason', COALESCE(NULLIF(btrim(_event_reason),''),'CALCULATION')),
      calculated_at = now(),
      is_overridden = _ov,
      override_reason = CASE WHEN _ov THEN _row.override_reason ELSE NULL END,
      overridden_by = CASE WHEN _ov THEN COALESCE(_row.overridden_by, _uid) ELSE NULL END,
      overridden_at = CASE WHEN _ov THEN COALESCE(_row.overridden_at, now()) ELSE NULL END
    WHERE id = _row.id;
  END LOOP;

  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_materialise(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_materialise(uuid,text,uuid) TO service_role;
COMMENT ON FUNCTION public.supervisory_calc_materialise(uuid,text,uuid) IS
  'Internal authoritative writer of calculated_*; not executable by application roles. Reached only through governed operations. A non-calculable outcome retains configuration/version/as-of provenance and a recorded reason, and never carries a rating.';
