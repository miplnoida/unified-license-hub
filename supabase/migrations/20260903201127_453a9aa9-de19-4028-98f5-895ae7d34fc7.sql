-- =============================================================================
-- Server-side supervisory calculation engine.
-- The database is the only producer of calculated_* values. Callers may not
-- supply, suppress or forge them.
-- =============================================================================

ALTER TABLE public.supervisory_assessment_dimension
  ADD COLUMN IF NOT EXISTS calculation_config_id uuid REFERENCES public.supervisory_calculation_config(id),
  ADD COLUMN IF NOT EXISTS calculation_status text,
  ADD COLUMN IF NOT EXISTS calculation_trace jsonb,
  ADD COLUMN IF NOT EXISTS calculated_at timestamptz;

CREATE TABLE public.supervisory_assessment_calculation (
  assessment_id uuid PRIMARY KEY REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  methodology_id uuid REFERENCES public.supervisory_methodology(id),
  methodology_version text,
  config_id uuid REFERENCES public.supervisory_calculation_config(id),
  config_version integer,
  as_of date,
  status text NOT NULL,
  inherent_score numeric(6,2),
  inherent_band text,
  control_score numeric(6,2),
  control_band text,
  residual_rating text,
  recommended_rating text,
  recommendation_policy text,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_calculation_status_chk
    CHECK (status = ANY (ARRAY['CALCULATED','NOT_CALCULABLE','NO_CONFIGURATION']))
);
GRANT SELECT ON public.supervisory_assessment_calculation TO authenticated;
GRANT ALL ON public.supervisory_assessment_calculation TO service_role;
ALTER TABLE public.supervisory_assessment_calculation ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_assessment_calculation_read ON public.supervisory_assessment_calculation
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view','market_conduct.run_conduct_analytics']));

-- --------------------------------------------------------------- helpers -----
CREATE OR REPLACE FUNCTION public.supervisory_calc_round(_v numeric, _mode text, _decimals integer)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE upper(COALESCE(_mode,'HALF_UP'))
           WHEN 'NONE'      THEN _v
           WHEN 'FLOOR'     THEN floor(_v * power(10, COALESCE(_decimals,1))) / power(10, COALESCE(_decimals,1))
           WHEN 'CEILING'   THEN ceil(_v * power(10, COALESCE(_decimals,1))) / power(10, COALESCE(_decimals,1))
           WHEN 'HALF_DOWN' THEN -round(-_v, COALESCE(_decimals,1))
           ELSE round(_v, COALESCE(_decimals,1))
         END;
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_calc_band_of(_config_id uuid, _kind text, _score numeric)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT b.band_code FROM public.supervisory_calculation_band b
   WHERE b.config_id = _config_id AND b.band_kind = upper(_kind)
     AND _score IS NOT NULL AND _score >= b.min_score AND _score <= b.max_score
   ORDER BY b.min_score LIMIT 1;
$function$;

-- Resolves the calculation configuration in force for an assessment.
CREATE OR REPLACE FUNCTION public.supervisory_calc_config_for(_assessment_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _as_of date; _id uuid;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL OR _a.methodology_id IS NULL THEN RETURN NULL; END IF;
  _as_of := public.supervisory_methodology_as_of(_a.domain_code,
              _a.created_at::date, _a.assessment_date, _a.period_end, NULL, NULL);
  SELECT c.id INTO _id FROM public.supervisory_calculation_config c
   WHERE c.methodology_id = _a.methodology_id AND c.status = 'ACTIVE'
     AND (c.effective_from IS NULL OR c.effective_from <= _as_of)
     AND (c.effective_to IS NULL OR c.effective_to >= _as_of)
   ORDER BY c.config_version DESC LIMIT 1;
  RETURN _id;
END $function$;

-- =============================================================================
-- Pure computation. Reads responses + approved configuration. Writes nothing.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supervisory_calc_compute(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _a public.supervisory_assessment; _c public.supervisory_calculation_config;
  _m public.supervisory_methodology; _cfg uuid; _dims jsonb := '[]'::jsonb;
  _d record; _q record; _num numeric; _den numeric; _answered integer; _crit boolean;
  _raw numeric; _score numeric; _band text; _qtrace jsonb;
  _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
  _inh_score numeric; _ctl_score numeric; _inh_band text; _ctl_band text;
  _residual text; _rec text; _ord_num numeric := 0; _ord_den numeric := 0;
  _worst integer := 0; _worst_crit integer := 0; _thr integer; _weighted integer;
  _out jsonb; _as_of date;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _cfg := public.supervisory_calc_config_for(_assessment_id);
  _as_of := public.supervisory_methodology_as_of(_a.domain_code,
              _a.created_at::date, _a.assessment_date, _a.period_end, NULL, NULL);
  IF _cfg IS NULL THEN
    RETURN jsonb_build_object('status','NO_CONFIGURATION','assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'as_of',_as_of,'dimensions','[]'::jsonb,
      'reason','the methodology version bound to this assessment publishes no active calculation configuration');
  END IF;
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _cfg;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _a.methodology_id;

  -- pass 1: per-dimension raw score
  FOR _d IN
    SELECT sad.id, sad.dimension_code, sad.dimension_group, sad.weight, sad.is_applicable,
           sad.methodology_dimension_id, md.dimension_kind, md.weight AS meth_weight,
           md.min_evidence_count
      FROM public.supervisory_assessment_dimension sad
      LEFT JOIN public.supervisory_methodology_dimension md ON md.id = sad.methodology_dimension_id
     WHERE sad.assessment_id = _assessment_id
     ORDER BY sad.dimension_code
  LOOP
    _num := 0; _den := 0; _answered := 0; _crit := false; _qtrace := '[]'::jsonb;
    FOR _q IN
      SELECT r.question_code, r.response, s.score, s.excluded_from_denominator,
             s.is_critical_floor, jsonb_array_length(r.evidence_refs) AS evidence_count
        FROM public.supervisory_assessment_question_response r
        LEFT JOIN public.supervisory_calculation_response_score s
               ON s.config_id = _cfg AND s.response_code = r.response
       WHERE r.assessment_id = _assessment_id
         AND (_d.methodology_dimension_id IS NOT NULL AND r.methodology_dimension_id = _d.methodology_dimension_id)
       ORDER BY r.question_code
    LOOP
      IF _q.excluded_from_denominator THEN
        IF _c.na_denominator_handling = 'INCLUDE_AS_ZERO' THEN
          _num := _num + 0; _den := _den + 1;
        ELSIF _c.na_denominator_handling = 'INCLUDE_AS_FULL' THEN
          _num := _num + 100; _den := _den + 1;
        END IF;
      ELSIF _q.score IS NOT NULL THEN
        IF _c.aggregation_method = 'WORST_RESPONSE' THEN
          _num := CASE WHEN _den = 0 THEN _q.score ELSE least(_num, _q.score) END;
          _den := 1;
        ELSE
          _num := _num + _q.score; _den := _den + 1;
        END IF;
        _answered := _answered + 1;
      END IF;
      IF COALESCE(_q.is_critical_floor,false) THEN _crit := true; END IF;
      _qtrace := _qtrace || jsonb_build_object('question_code',_q.question_code,'response',_q.response,
                   'score',_q.score,'excluded',COALESCE(_q.excluded_from_denominator,false),
                   'critical',COALESCE(_q.is_critical_floor,false),'evidence_count',_q.evidence_count);
    END LOOP;

    IF _answered < _c.min_answered_questions OR _den = 0 THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
        'dimension_kind',_d.dimension_kind,'status','NOT_CALCULABLE',
        'reason','no applicable answered question meets the minimum-answer rule',
        'questions',_qtrace);
      CONTINUE;
    END IF;

    _raw := public.supervisory_calc_round(_num / _den, _c.rounding_mode, _c.rounding_decimals);
    IF _d.dimension_kind = 'INHERENT' THEN
      _score := CASE WHEN _c.inherent_direction = 'INVERTED' THEN 100 - _raw ELSE _raw END;
      _band := public.supervisory_calc_band_of(_cfg,'INHERENT',_score);
      _inh_num := _inh_num + _score * COALESCE(_d.weight,_d.meth_weight,1);
      _inh_den := _inh_den + COALESCE(_d.weight,_d.meth_weight,1);
    ELSE
      _score := _raw;
      _band := public.supervisory_calc_band_of(_cfg,'CONTROL',_score);
      _ctl_num := _ctl_num + _score * COALESCE(_d.weight,_d.meth_weight,1);
      _ctl_den := _ctl_den + COALESCE(_d.weight,_d.meth_weight,1);
    END IF;

    _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
      'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','CALCULATED',
      'weight',COALESCE(_d.weight,_d.meth_weight),'raw_score',_raw,'score',_score,'band',_band,
      'critical_triggered',_crit,'answered',_answered,
      'evidence_sufficient',true,'questions',_qtrace);
  END LOOP;

  IF _inh_den > 0 THEN
    _inh_score := public.supervisory_calc_round(_inh_num/_inh_den, _c.rounding_mode, _c.rounding_decimals);
    _inh_band := public.supervisory_calc_band_of(_cfg,'INHERENT',_inh_score);
  END IF;
  IF _ctl_den > 0 THEN
    _ctl_score := public.supervisory_calc_round(_ctl_num/_ctl_den, _c.rounding_mode, _c.rounding_decimals);
    _ctl_band := public.supervisory_calc_band_of(_cfg,'CONTROL',_ctl_score);
  END IF;

  IF _inh_band IS NOT NULL AND _ctl_band IS NOT NULL THEN
    SELECT residual_rating INTO _residual FROM public.supervisory_calculation_matrix_cell
     WHERE config_id = _cfg AND inherent_band = _inh_band AND control_band = _ctl_band;
  END IF;

  -- per-dimension residual: the dimension's own band on its axis, the
  -- assessment-level band on the other axis, read from the published matrix.
  SELECT jsonb_agg(
           CASE WHEN d->>'status' <> 'CALCULATED' THEN d
                ELSE d || jsonb_build_object('residual_rating',
                  (SELECT mc.residual_rating FROM public.supervisory_calculation_matrix_cell mc
                    WHERE mc.config_id = _cfg
                      AND mc.inherent_band = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN d->>'band' ELSE _inh_band END
                      AND mc.control_band  = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN _ctl_band ELSE d->>'band' END))
           END ORDER BY d->>'dimension_code')
    INTO _dims FROM jsonb_array_elements(_dims) d;
  _dims := COALESCE(_dims,'[]'::jsonb);

  -- overall recommendation from the configured policy
  FOR _q IN
    SELECT (SELECT (x->>'ordinal')::int FROM jsonb_array_elements(_m.scoring_scale) x
             WHERE x->>'code' = d->>'residual_rating') AS ord,
           COALESCE((d->>'weight')::numeric,1) AS w,
           COALESCE((d->>'critical_triggered')::boolean,false) AS crit
      FROM jsonb_array_elements(_dims) d
     WHERE d->>'residual_rating' IS NOT NULL
  LOOP
    IF _q.ord IS NOT NULL THEN
      _ord_num := _ord_num + _q.ord * _q.w; _ord_den := _ord_den + _q.w;
      _worst := greatest(_worst, _q.ord);
      IF _q.crit THEN _worst_crit := greatest(_worst_crit, _q.ord); END IF;
    END IF;
  END LOOP;

  IF _ord_den > 0 THEN
    _weighted := round(_ord_num/_ord_den)::int;
    IF _c.recommendation_policy IN ('HIGHEST_MATERIAL_DIMENSION','WORST_OF_N') THEN
      _weighted := _worst;
    ELSIF _c.recommendation_policy = 'WEIGHTED_WITH_CRITICAL_FLOOR' THEN
      _weighted := greatest(_weighted, _worst_crit);
    ELSIF _c.recommendation_policy = 'WEIGHTED_WITH_THRESHOLD' THEN
      SELECT (x->>'ordinal')::int INTO _thr FROM jsonb_array_elements(_m.scoring_scale) x
       WHERE x->>'code' = _c.recommendation_threshold;
      IF _thr IS NOT NULL AND _worst >= _thr THEN _weighted := greatest(_weighted, _thr); END IF;
    END IF;
    SELECT x->>'code' INTO _rec FROM jsonb_array_elements(_m.scoring_scale) x
     WHERE (x->>'ordinal')::int = _weighted;
  END IF;

  _out := jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(_dims) = 0 THEN 'NOT_CALCULABLE' ELSE 'CALCULATED' END,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,'config_id',_cfg,'config_version',_c.config_version,
    'as_of',_as_of,
    'parameters', jsonb_build_object('aggregation_method',_c.aggregation_method,
       'na_denominator_handling',_c.na_denominator_handling,'min_answered_questions',_c.min_answered_questions,
       'inherent_direction',_c.inherent_direction,'rounding',_c.rounding_mode||'/'||_c.rounding_decimals,
       'recommendation_policy',_c.recommendation_policy,'recommendation_threshold',_c.recommendation_threshold,
       'override_threshold',_c.override_threshold),
    'inherent_score',_inh_score,'inherent_band',_inh_band,
    'control_score',_ctl_score,'control_band',_ctl_band,
    'residual_rating',_residual,'recommended_rating',_rec,
    'dimensions',_dims);
  RETURN _out;
END $function$;

-- =============================================================================
-- Writer: stores the calculation and enforces override discipline.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_calculate(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension; _ov boolean;
        _uid uuid := auth.uid(); _a public.supervisory_assessment;
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

  -- no configuration: the server records that no calculation exists and clears
  -- any previously stored calculated value. Nothing is invented.
  IF _r->>'status' = 'NO_CONFIGURATION' THEN
    UPDATE public.supervisory_assessment_dimension
       SET calculated_inherent_rating = NULL, calculated_control_rating = NULL,
           calculated_residual_rating = NULL, calculated_score = NULL,
           calculation_config_id = NULL, calculation_status = 'NO_CONFIGURATION',
           calculation_trace = jsonb_build_object('reason', _r->>'reason'),
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
      calculated_inherent_rating = CASE WHEN _d->>'dimension_kind' = 'INHERENT' THEN _d->>'band' ELSE _r->>'inherent_band' END,
      calculated_control_rating  = CASE WHEN _d->>'dimension_kind' = 'INHERENT' THEN _r->>'control_band' ELSE _d->>'band' END,
      calculated_residual_rating = _d->>'residual_rating',
      calculated_score = NULLIF(_d->>'score','')::numeric,
      calculation_config_id = NULLIF(_r->>'config_id','')::uuid,
      calculation_status = _d->>'status',
      calculation_trace = _d || jsonb_build_object('parameters', _r->'parameters',
                             'assessment_inherent_band', _r->>'inherent_band',
                             'assessment_control_band', _r->>'control_band',
                             'config_version', _r->>'config_version',
                             'methodology_version', _r->>'methodology_version'),
      calculated_at = now(),
      is_overridden = _ov,
      override_reason = CASE WHEN _ov THEN _row.override_reason ELSE NULL END,
      overridden_by = CASE WHEN _ov THEN COALESCE(_row.overridden_by, _uid) ELSE NULL END,
      overridden_at = CASE WHEN _ov THEN COALESCE(_row.overridden_at, now()) ELSE NULL END
    WHERE id = _row.id;
  END LOOP;

  RETURN _r;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_calc_compute(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_calculate(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calc_config_for(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calc_band_of(uuid, text, numeric) FROM anon;