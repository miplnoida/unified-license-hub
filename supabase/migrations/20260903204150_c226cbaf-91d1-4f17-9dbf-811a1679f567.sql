CREATE OR REPLACE FUNCTION public.supervisory_calc_compute(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _a public.supervisory_assessment; _c public.supervisory_calculation_config;
  _m public.supervisory_methodology; _cfg uuid; _dims jsonb := '[]'::jsonb;
  _d record; _q record; _num numeric; _den numeric; _answered integer;
  _ev_req integer; _ev_sup integer; _ev_ok boolean; _treat text;
  _raw numeric; _score numeric; _band text; _qtrace jsonb; _capped boolean;
  _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
  _inh_score numeric; _ctl_score numeric; _inh_band text; _ctl_band text;
  _residual text; _rec text; _ord_num numeric := 0; _ord_den numeric := 0;
  _worst integer := 0; _thr integer; _weighted integer; _as_of date; _missing text[] := '{}';
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _as_of := public.supervisory_calc_as_of_for(_assessment_id);

  IF _as_of IS NULL THEN
    RETURN jsonb_build_object('status','NO_EFFECTIVE_DATE_RULE','assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'dimensions','[]'::jsonb,
      'reason', format('domain %s has no recorded effective-date rule, so no authoritative as-of date exists', _a.domain_code));
  END IF;

  _cfg := public.supervisory_calc_config_for(_assessment_id);
  IF _cfg IS NULL THEN
    RETURN jsonb_build_object('status','NO_CONFIGURATION','assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'as_of',_as_of,'dimensions','[]'::jsonb,
      'reason','no approved calculation configuration was in force on the authoritative as-of date');
  END IF;
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _cfg;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _a.methodology_id;

  IF _c.aggregation_method IS NULL THEN _missing := array_append(_missing, 'aggregation_method'); END IF;
  IF _c.min_answered_questions IS NULL THEN _missing := array_append(_missing, 'min_answered_questions'); END IF;
  IF _c.na_denominator_handling IS NULL THEN _missing := array_append(_missing, 'na_denominator_handling'); END IF;
  IF _c.evidence_insufficiency_handling IS NULL THEN _missing := array_append(_missing, 'evidence_insufficiency_handling'); END IF;
  IF _c.critical_question_handling IS NULL THEN _missing := array_append(_missing, 'critical_question_handling'); END IF;
  IF _c.rounding_mode IS NULL THEN _missing := array_append(_missing, 'rounding_mode'); END IF;
  IF _c.rounding_decimals IS NULL THEN _missing := array_append(_missing, 'rounding_decimals'); END IF;
  IF _c.inherent_direction IS NULL THEN _missing := array_append(_missing, 'inherent_direction'); END IF;
  IF _c.recommendation_policy IS NULL THEN _missing := array_append(_missing, 'recommendation_policy'); END IF;
  IF array_length(_missing,1) IS NOT NULL THEN
    RETURN jsonb_build_object('status','CONFIGURATION_INCOMPLETE','assessment_id',_assessment_id,
      'config_id',_cfg,'config_version',_c.config_version,'as_of',_as_of,'dimensions','[]'::jsonb,
      'undecided_parameters', to_jsonb(_missing),
      'reason','the in-force calculation configuration leaves a required supervisory parameter undecided');
  END IF;

  FOR _d IN
    SELECT sad.id, sad.dimension_code, sad.dimension_group, sad.weight, sad.is_applicable,
           sad.methodology_dimension_id, md.dimension_kind, md.weight AS meth_weight
      FROM public.supervisory_assessment_dimension sad
      LEFT JOIN public.supervisory_methodology_dimension md ON md.id = sad.methodology_dimension_id
     WHERE sad.assessment_id = _assessment_id
     ORDER BY sad.dimension_code
  LOOP
    _num := 0; _den := 0; _answered := 0; _qtrace := '[]'::jsonb;
    _ev_req := 0; _ev_sup := 0; _ev_ok := true; _capped := false;
    FOR _q IN
      SELECT r.question_code, r.response, s.score, s.excluded_from_denominator,
             jsonb_array_length(COALESCE(r.evidence_refs,'[]'::jsonb)) AS evidence_count,
             COALESCE(mq.min_evidence_count,0) AS evidence_required
        FROM public.supervisory_assessment_question_response r
        LEFT JOIN public.supervisory_calculation_response_score s
               ON s.config_id = _cfg AND s.response_code = r.response
        LEFT JOIN public.supervisory_methodology_question mq
               ON mq.methodology_id = _a.methodology_id AND mq.question_code = r.question_code
       WHERE r.assessment_id = _assessment_id
         AND _d.methodology_dimension_id IS NOT NULL
         AND r.methodology_dimension_id = _d.methodology_dimension_id
       ORDER BY r.question_code
    LOOP
      IF COALESCE(_q.excluded_from_denominator,false) THEN
        IF _c.na_denominator_handling = 'INCLUDE_AS_ZERO' THEN _num := _num + 0; _den := _den + 1;
        ELSIF _c.na_denominator_handling = 'INCLUDE_AS_FULL' THEN _num := _num + 100; _den := _den + 1;
        END IF;
      ELSIF _q.score IS NOT NULL THEN
        IF _c.aggregation_method = 'WORST_RESPONSE' THEN
          _num := CASE WHEN _den = 0 THEN _q.score ELSE least(_num, _q.score) END; _den := 1;
        ELSE
          _num := _num + _q.score; _den := _den + 1;
        END IF;
        _answered := _answered + 1;
        _ev_req := _ev_req + _q.evidence_required;
        _ev_sup := _ev_sup + COALESCE(_q.evidence_count,0);
        IF COALESCE(_q.evidence_count,0) < _q.evidence_required THEN _ev_ok := false; END IF;
      END IF;
      _qtrace := _qtrace || jsonb_build_object('question_code',_q.question_code,'response',_q.response,
                   'score',_q.score,'excluded',COALESCE(_q.excluded_from_denominator,false),
                   'evidence_required',_q.evidence_required,'evidence_supplied',COALESCE(_q.evidence_count,0));
    END LOOP;

    _treat := CASE WHEN _ev_ok THEN 'NONE' ELSE _c.evidence_insufficiency_handling END;

    IF _answered < _c.min_answered_questions OR _den = 0
       OR (NOT _ev_ok AND _c.evidence_insufficiency_handling = 'NOT_CALCULABLE') THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
        'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','NOT_CALCULABLE',
        'reason', CASE WHEN NOT _ev_ok AND _c.evidence_insufficiency_handling = 'NOT_CALCULABLE'
                       THEN 'the configured evidence-insufficiency treatment makes this dimension not calculable'
                       ELSE 'no applicable answered question meets the minimum-answer rule' END,
        'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
        'evidence_treatment',_treat,'evidence_effect','dimension not calculated',
        'answered',_answered,'questions',_qtrace);
      CONTINUE;
    END IF;

    _raw := public.supervisory_calc_round(_num / _den, _c.rounding_mode, _c.rounding_decimals);
    IF _d.dimension_kind = 'INHERENT' THEN
      _score := CASE WHEN _c.inherent_direction = 'INVERTED' THEN 100 - _raw ELSE _raw END;
    ELSE
      _score := _raw;
    END IF;

    IF NOT _ev_ok AND _c.evidence_insufficiency_handling = 'CAP_AT_MIDPOINT' THEN
      IF _d.dimension_kind = 'INHERENT' THEN
        IF _score < 50 THEN _score := 50; _capped := true; END IF;
      ELSE
        IF _score > 50 THEN _score := 50; _capped := true; END IF;
      END IF;
    END IF;

    _band := public.supervisory_calc_band_of(_cfg,
               CASE WHEN _d.dimension_kind = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END, _score);
    IF _d.dimension_kind = 'INHERENT' THEN
      _inh_num := _inh_num + _score * COALESCE(_d.weight,_d.meth_weight,1);
      _inh_den := _inh_den + COALESCE(_d.weight,_d.meth_weight,1);
    ELSE
      _ctl_num := _ctl_num + _score * COALESCE(_d.weight,_d.meth_weight,1);
      _ctl_den := _ctl_den + COALESCE(_d.weight,_d.meth_weight,1);
    END IF;

    _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
      'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','CALCULATED',
      'weight',COALESCE(_d.weight,_d.meth_weight),'raw_score',_raw,'score',_score,'band',_band,
      'answered',_answered,
      'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
      'evidence_treatment',_treat,
      'evidence_effect', CASE WHEN _capped THEN 'score capped at the midpoint (50)'
                              WHEN NOT _ev_ok THEN 'flagged only; no effect on the calculated rating'
                              ELSE 'none' END,
      'critical_handling',_c.critical_question_handling,
      'questions',_qtrace);
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

  FOR _q IN
    SELECT (SELECT (x->>'ordinal')::int FROM jsonb_array_elements(_m.scoring_scale) x
             WHERE x->>'code' = d->>'residual_rating') AS ord,
           COALESCE((d->>'weight')::numeric,1) AS w
      FROM jsonb_array_elements(_dims) d
     WHERE d->>'residual_rating' IS NOT NULL
  LOOP
    IF _q.ord IS NOT NULL THEN
      _ord_num := _ord_num + _q.ord * _q.w; _ord_den := _ord_den + _q.w;
      _worst := greatest(_worst, _q.ord);
    END IF;
  END LOOP;

  IF _ord_den > 0 THEN
    IF _c.recommendation_policy = 'HIGHEST_MATERIAL_DIMENSION' THEN
      _weighted := _worst;
    ELSE
      _weighted := round(_ord_num/_ord_den)::int;
      IF _c.recommendation_policy = 'WEIGHTED_WITH_THRESHOLD' THEN
        SELECT (x->>'ordinal')::int INTO _thr FROM jsonb_array_elements(_m.scoring_scale) x
         WHERE x->>'code' = _c.recommendation_threshold;
        IF _thr IS NOT NULL AND _worst >= _thr THEN _weighted := greatest(_weighted, _thr); END IF;
      END IF;
    END IF;
    SELECT x->>'code' INTO _rec FROM jsonb_array_elements(_m.scoring_scale) x
     WHERE (x->>'ordinal')::int = _weighted;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(_dims) = 0 THEN 'NOT_CALCULABLE' ELSE 'CALCULATED' END,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,'config_id',_cfg,'config_version',_c.config_version,
    'as_of',_as_of,
    'parameters', jsonb_build_object('aggregation_method',_c.aggregation_method,
       'na_denominator_handling',_c.na_denominator_handling,'min_answered_questions',_c.min_answered_questions,
       'evidence_insufficiency_handling',_c.evidence_insufficiency_handling,
       'critical_question_handling',_c.critical_question_handling,
       'inherent_direction',_c.inherent_direction,'rounding',_c.rounding_mode||'/'||_c.rounding_decimals,
       'recommendation_policy',_c.recommendation_policy,'recommendation_threshold',_c.recommendation_threshold,
       'override_threshold',_c.override_threshold),
    'inherent_score',_inh_score,'inherent_band',_inh_band,
    'control_score',_ctl_score,'control_band',_ctl_band,
    'residual_rating',_residual,'recommended_rating',_rec,
    'dimensions',_dims);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_compute(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_validate(_config_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c public.supervisory_calculation_config; _m public.supervisory_methodology;
        _problems text[] := '{}'; _risk text[]; _ctrl text[]; _resp text[]; _need integer; _have integer;
        _kind text; _vocab text[]; _prev numeric; _b record; _quantum numeric; _first boolean;
BEGIN
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _c.methodology_id;

  IF _c.aggregation_method IS NULL THEN _problems := array_append(_problems, 'the question aggregation method has not been decided'); END IF;
  IF _c.min_answered_questions IS NULL THEN _problems := array_append(_problems, 'the minimum number of answered questions has not been decided'); END IF;
  IF _c.na_denominator_handling IS NULL THEN _problems := array_append(_problems, 'the treatment of not-applicable answers has not been decided'); END IF;
  IF _c.evidence_insufficiency_handling IS NULL THEN _problems := array_append(_problems, 'the treatment of insufficient evidence has not been decided'); END IF;
  IF _c.critical_question_handling IS NULL THEN _problems := array_append(_problems, 'the treatment of critical questions has not been decided'); END IF;
  IF _c.rounding_mode IS NULL THEN _problems := array_append(_problems, 'the rounding mode has not been decided'); END IF;
  IF _c.rounding_decimals IS NULL THEN _problems := array_append(_problems, 'the score precision has not been decided'); END IF;
  IF _c.inherent_direction IS NULL THEN _problems := array_append(_problems, 'the inherent-score direction has not been decided'); END IF;
  IF _c.recommendation_policy IS NULL THEN _problems := array_append(_problems, 'the overall recommendation policy has not been decided'); END IF;
  IF _c.effective_from IS NULL THEN _problems := array_append(_problems, 'an effective-from date is required'); END IF;

  SELECT array_agg(x->>'code' ORDER BY (x->>'ordinal')::int)
    INTO _risk FROM jsonb_array_elements(_m.scoring_scale) x;
  SELECT array_agg(v) INTO _ctrl
    FROM jsonb_array_elements_text(COALESCE(_m.definition->'control_scale','[]'::jsonb)) v;
  IF _risk IS NULL OR array_length(_risk,1) = 0 THEN
    _problems := array_append(_problems, 'the methodology publishes no risk rating scale'); END IF;
  IF _ctrl IS NULL OR array_length(_ctrl,1) = 0 THEN
    _problems := array_append(_problems, 'the methodology publishes no control effectiveness scale'); END IF;

  SELECT array_agg(DISTINCT o) INTO _resp
    FROM public.supervisory_methodology_question q, unnest(q.response_options) o
   WHERE q.methodology_id = _c.methodology_id AND q.active;
  IF _resp IS NULL THEN
    _problems := array_append(_problems, 'the methodology publishes no question response options');
  ELSIF EXISTS (
    SELECT 1 FROM unnest(_resp) o
     WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_response_score s
                        WHERE s.config_id = _config_id AND s.response_code = o)) THEN
    _problems := array_append(_problems, 'every permitted question response must be scored or explicitly excluded');
  END IF;

  _quantum := CASE WHEN _c.rounding_decimals IS NULL THEN NULL
                   ELSE 1 / power(10, _c.rounding_decimals)::numeric END;
  FOREACH _kind IN ARRAY ARRAY['INHERENT','CONTROL'] LOOP
    _vocab := CASE WHEN _kind = 'INHERENT' THEN _risk ELSE _ctrl END;
    IF _vocab IS NULL THEN CONTINUE; END IF;
    SELECT count(*) INTO _have FROM public.supervisory_calculation_band
      WHERE config_id = _config_id AND band_kind = _kind;
    IF _have = 0 THEN
      _problems := array_append(_problems, lower(_kind) || ' bands are not defined');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_calculation_band b
                WHERE b.config_id = _config_id AND b.band_kind = _kind
                  AND NOT (b.band_code = ANY (_vocab))) THEN
      _problems := array_append(_problems, lower(_kind) || ' bands use a code outside the published vocabulary');
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(_vocab) v
                WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_band b
                                   WHERE b.config_id = _config_id AND b.band_kind = _kind AND b.band_code = v)) THEN
      _problems := array_append(_problems, lower(_kind) || ' bands do not cover every published rating');
    END IF;
    _prev := NULL; _first := true;
    FOR _b IN SELECT b.min_score, b.max_score FROM public.supervisory_calculation_band b
               WHERE b.config_id = _config_id AND b.band_kind = _kind ORDER BY b.min_score LOOP
      IF _first THEN
        IF _b.min_score <> 0 THEN _problems := array_append(_problems, lower(_kind) || ' bands do not start at 0'); END IF;
        _first := false;
      ELSIF _b.min_score <> _prev THEN
        _problems := array_append(_problems, format('%s bands leave a gap or overlap at %s: the next band must start exactly where the previous one ends',
                                          lower(_kind), _prev));
      END IF;
      IF _b.max_score <= _b.min_score THEN
        _problems := array_append(_problems, lower(_kind) || ' bands contain an empty interval');
      END IF;
      _prev := _b.max_score;
    END LOOP;
    IF _prev IS DISTINCT FROM 100 THEN
      _problems := array_append(_problems, lower(_kind) || ' bands do not reach 100');
    END IF;
    IF _quantum IS NOT NULL AND _quantum > 0 AND EXISTS (
      SELECT 1 FROM public.supervisory_calculation_band b
       WHERE b.config_id = _config_id AND b.band_kind = _kind
         AND (mod(b.min_score, _quantum) <> 0 OR mod(b.max_score, _quantum) <> 0)) THEN
      _problems := array_append(_problems, format('%s band boundaries must be multiples of the configured precision (%s)',
                                        lower(_kind), _quantum));
    END IF;
  END LOOP;

  IF _risk IS NOT NULL AND _ctrl IS NOT NULL THEN
    _need := array_length(_risk,1) * array_length(_ctrl,1);
    SELECT count(*) INTO _have FROM public.supervisory_calculation_matrix_cell WHERE config_id = _config_id;
    IF _have <> _need THEN
      _problems := array_append(_problems, format('the residual matrix must publish all %s cells (%s present)', _need, _have));
    END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_calculation_matrix_cell m
                WHERE m.config_id = _config_id
                  AND (NOT (m.inherent_band = ANY (_risk)) OR NOT (m.control_band = ANY (_ctrl))
                       OR NOT (m.residual_rating = ANY (_risk)))) THEN
      _problems := array_append(_problems, 'the residual matrix uses a band or rating outside the published vocabulary');
    END IF;
  END IF;

  IF _c.recommendation_policy = 'WEIGHTED_WITH_THRESHOLD'
     AND COALESCE(btrim(_c.recommendation_threshold),'') = '' THEN
    _problems := array_append(_problems, 'the chosen recommendation policy requires a threshold rating');
  END IF;

  IF _m.domain_code IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.supervisory_domain_calculation_rule r
       WHERE r.domain_code = upper(_m.domain_code)) THEN
    _problems := array_append(_problems, format('domain %s has no recorded effective-date rule', upper(_m.domain_code)));
  END IF;

  RETURN jsonb_build_object('ok', array_length(_problems,1) IS NULL,
                            'problems', to_jsonb(COALESCE(_problems,'{}'::text[])));
END $$;