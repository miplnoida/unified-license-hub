CREATE OR REPLACE FUNCTION public.supervisory_calc_compute_policy(_assessment_id uuid, _policy jsonb, _as_of date, _config_id uuid DEFAULT NULL::uuid, _config_version integer DEFAULT NULL::integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _a public.supervisory_assessment; _m public.supervisory_methodology;
  _dims jsonb := '[]'::jsonb; _d record; _q record;
  _scores jsonb := COALESCE(_policy->'response_scores','[]'::jsonb);
  _bands  jsonb := COALESCE(_policy->'bands','{}'::jsonb);
  _matrix jsonb := COALESCE(_policy->'matrix','[]'::jsonb);
  _qw jsonb := COALESCE(_policy->'question_weights','[]'::jsonb);
  _dw jsonb := COALESCE(_policy->'dimension_weights','[]'::jsonb);
  _frules jsonb := COALESCE(_policy->'fact_rules','[]'::jsonb);
  _mat jsonb := COALESCE(_policy->'materiality','[]'::jsonb);
  _agg text := _policy->>'aggregation_method';
  _mode text := COALESCE(_policy->>'completeness_mode','MIN_ANSWERED');
  _minq integer := (_policy->>'min_answered_questions')::integer;
  _na text := _policy->>'na_denominator_handling';
  _evid text := _policy->>'evidence_insufficiency_handling';
  _crit text := _policy->>'critical_question_handling';
  _rmode text := _policy->>'rounding_mode';
  _rdec integer := (_policy->>'rounding_decimals')::integer;
  _dir text := _policy->>'inherent_direction';
  _rpol text := _policy->>'recommendation_policy';
  _rthr text := _policy->>'recommendation_threshold';
  _wmode text := COALESCE(_policy->>'dimension_weight_mode','METHODOLOGY');
  _num numeric; _den numeric; _answered integer; _w numeric;
  _ev_req integer; _ev_sup integer; _ev_ok boolean; _treat text;
  _raw numeric; _score numeric; _band text; _qtrace jsonb; _capped boolean;
  _required text[]; _missing text[]; _pubq integer;
  _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
  _inh_score numeric; _ctl_score numeric; _inh_band text; _ctl_band text;
  _residual text; _rec text; _ord_num numeric := 0; _ord_den numeric := 0;
  _worst integer := 0; _thr integer; _weighted integer; _undecided text[] := '{}';
  _n_total integer; _n_calc integer; _n_na integer; _n_notcalc integer;
  _status text; _reason_code text; _reason text;
  -- AML-06 extensions
  _kind text; _dwrow jsonb; _mincomp numeric; _agg_dim text;
  _ftrace jsonb; _fr record; _fact record; _fval numeric; _fscore numeric; _fband text;
  _fblock text; _fblock_reason text; _fw numeric;
  _mrule jsonb; _mtrace jsonb := '[]'::jsonb; _mval numeric; _mord integer; _cord integer; _mhit boolean;
  _engine text := 'AML06.1';
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _a.methodology_id;

  IF _agg   IS NULL THEN _undecided := array_append(_undecided,'aggregation_method'); END IF;
  IF _mode = 'MIN_ANSWERED' AND _minq IS NULL THEN
    _undecided := array_append(_undecided,'min_answered_questions'); END IF;
  IF _na    IS NULL THEN _undecided := array_append(_undecided,'na_denominator_handling'); END IF;
  IF _evid  IS NULL THEN _undecided := array_append(_undecided,'evidence_insufficiency_handling'); END IF;
  IF _crit  IS NULL THEN _undecided := array_append(_undecided,'critical_question_handling'); END IF;
  IF _rmode IS NULL THEN _undecided := array_append(_undecided,'rounding_mode'); END IF;
  IF _rdec  IS NULL THEN _undecided := array_append(_undecided,'rounding_decimals'); END IF;
  IF _dir   IS NULL THEN _undecided := array_append(_undecided,'inherent_direction'); END IF;
  IF _rpol  IS NULL THEN _undecided := array_append(_undecided,'recommendation_policy'); END IF;
  IF array_length(_undecided,1) IS NOT NULL THEN
    RETURN jsonb_build_object('status','CONFIGURATION_INCOMPLETE','assessment_id',_assessment_id,
      'engine_version',_engine,
      'config_id',_config_id,'config_version',_config_version,'as_of',_as_of,'dimensions','[]'::jsonb,
      'undecided_parameters', to_jsonb(_undecided),
      'reason_code','CONFIGURATION_INCOMPLETE',
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
    IF _d.is_applicable IS FALSE THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_APPLICABLE','reason_code','SUPERVISOR_MARKED_NOT_APPLICABLE',
        'reason','the supervisor recorded this dimension as not applicable to the entity, so it is excluded from the calculation');
      CONTINUE;
    END IF;

    -- Policy-owned contribution decision for this dimension.
    SELECT x INTO _dwrow FROM jsonb_array_elements(_dw) x
     WHERE upper(x->>'dimension_code') = upper(_d.dimension_code) LIMIT 1;
    _kind := COALESCE(_dwrow->>'contributes_to',
                      CASE WHEN _d.dimension_kind = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END);
    _mincomp := NULLIF(_dwrow->>'min_completeness_pct','')::numeric;
    _agg_dim := COALESCE(NULLIF(_dwrow->>'aggregation_method',''), _agg);

    IF _kind = 'EXCLUDED' THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_APPLICABLE','reason_code','EXCLUDED_BY_CALCULATION_POLICY',
        'reason','the approved calculation policy excludes this dimension from the score');
      CONTINUE;
    END IF;

    -- Unlinked dimension: no canonical methodology dimension, nothing to score.
    IF _d.methodology_dimension_id IS NULL THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_CALCULABLE','reason_code','DIMENSION_NOT_IN_METHODOLOGY',
        'reason','this dimension code has no counterpart in the methodology version bound to the assessment, so it carries no questions to score');
      CONTINUE;
    END IF;

    SELECT count(*) INTO _pubq FROM public.supervisory_methodology_question mq
     WHERE mq.methodology_dimension_id = _d.methodology_dimension_id AND mq.active;
    IF _pubq = 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_frules) f
                                  WHERE upper(COALESCE(f->>'target_dimension_code','')) = upper(_d.dimension_code)) THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_CALCULABLE','reason_code','METHODOLOGY_PUBLISHES_NO_QUESTION',
        'published_questions',0,
        'reason','the methodology version publishes no active question for this dimension, so no score can be derived from supervisory answers');
      CONTINUE;
    END IF;

    _num := 0; _den := 0; _answered := 0; _qtrace := '[]'::jsonb;
    _ev_req := 0; _ev_sup := 0; _ev_ok := true; _capped := false;
    _required := '{}'; _missing := '{}';
    _ftrace := '[]'::jsonb; _fblock := NULL; _fblock_reason := NULL;

    FOR _q IN
      SELECT r.question_code, r.response,
             (sc.s->>'score')::numeric AS score,
             COALESCE((sc.s->>'excluded_from_denominator')::boolean,false) AS excluded_from_denominator,
             jsonb_array_length(COALESCE(r.evidence_refs,'[]'::jsonb)) AS evidence_count,
             COALESCE(mq.min_evidence_count,0) AS evidence_required,
             COALESCE(qw.w->>'participation','SCORED') AS participation,
             NULLIF(qw.w->>'weight','')::numeric AS policy_weight,
             COALESCE((qw.w->>'is_critical')::boolean,false) AS policy_critical
        FROM public.supervisory_assessment_question_response r
        LEFT JOIN LATERAL (
          SELECT x AS s FROM jsonb_array_elements(_scores) x
           WHERE x->>'response_code' = r.response LIMIT 1) sc ON true
        LEFT JOIN LATERAL (
          SELECT x AS w FROM jsonb_array_elements(_qw) x
           WHERE upper(x->>'question_code') = upper(r.question_code) LIMIT 1) qw ON true
        LEFT JOIN public.supervisory_methodology_question mq
               ON mq.methodology_id = _a.methodology_id AND mq.question_code = r.question_code
       WHERE r.assessment_id = _assessment_id
         AND r.methodology_dimension_id = _d.methodology_dimension_id
       ORDER BY r.question_code
    LOOP
      _w := COALESCE(_q.policy_weight, 1);
      IF _q.participation = 'EXCLUDED' THEN
        _qtrace := _qtrace || jsonb_build_object('question_code',_q.question_code,'response',_q.response,
                     'score',_q.score,'excluded',true,'excluded_by','CALCULATION_POLICY',
                     'weight',NULL,
                     'evidence_required',_q.evidence_required,'evidence_supplied',COALESCE(_q.evidence_count,0));
        CONTINUE;
      END IF;

      IF _q.excluded_from_denominator THEN
        IF _na = 'INCLUDE_AS_ZERO' THEN _num := _num + 0; _den := _den + _w;
        ELSIF _na = 'INCLUDE_AS_FULL' THEN _num := _num + 100 * _w; _den := _den + _w;
        END IF;
      ELSIF _q.score IS NOT NULL THEN
        IF _agg_dim = 'WORST_RESPONSE' THEN
          _num := CASE WHEN _den = 0 THEN _q.score ELSE least(_num, _q.score) END; _den := 1;
        ELSE
          _num := _num + _q.score * _w; _den := _den + _w;
        END IF;
        _answered := _answered + 1;
        _ev_req := _ev_req + _q.evidence_required;
        _ev_sup := _ev_sup + COALESCE(_q.evidence_count,0);
        IF COALESCE(_q.evidence_count,0) < _q.evidence_required THEN _ev_ok := false; END IF;
      END IF;
      _qtrace := _qtrace || jsonb_build_object('question_code',_q.question_code,'response',_q.response,
                   'score',_q.score,'excluded',_q.excluded_from_denominator,
                   'weight',_w,'is_critical',_q.policy_critical,
                   'evidence_required',_q.evidence_required,'evidence_supplied',COALESCE(_q.evidence_count,0));
    END LOOP;

    -- Governed facts contributing to this dimension, transformed under the policy's own rules.
    FOR _fr IN
      SELECT upper(f->>'fact_code') AS fact_code, upper(f->>'data_type') AS data_type,
             NULLIF(f->>'unit','') AS unit, upper(f->>'direction') AS direction,
             upper(f->>'missing_handling') AS missing_handling,
             COALESCE((f->>'requires_period')::boolean,true) AS requires_period,
             COALESCE((f->>'requires_ratio_provenance')::boolean,false) AS requires_ratio_provenance,
             NULLIF(f->>'weight','')::numeric AS weight,
             COALESCE(f->'thresholds','[]'::jsonb) AS thresholds
        FROM jsonb_array_elements(_frules) f
       WHERE upper(COALESCE(f->>'target_dimension_code','')) = upper(_d.dimension_code)
       ORDER BY 1
    LOOP
      _fw := COALESCE(_fr.weight, 1);
      SELECT * INTO _fact FROM public.supervisory_assessment_fact af
       WHERE af.assessment_id = _assessment_id AND upper(af.fact_code) = _fr.fact_code
       ORDER BY af.updated_at DESC LIMIT 1;

      _fval := NULL;
      IF _fact.id IS NOT NULL THEN
        _fval := _fact.value_numeric;
        IF _fval IS NULL AND _fact.numerator IS NOT NULL AND COALESCE(_fact.denominator,0) <> 0 THEN
          _fval := (_fact.numerator / _fact.denominator)
                   * CASE WHEN _fr.data_type = 'PERCENTAGE' THEN 100 ELSE 1 END;
        END IF;
        IF _fval IS NULL AND _fr.data_type = 'BOOLEAN' AND _fact.value_boolean IS NOT NULL THEN
          _fval := CASE WHEN _fact.value_boolean THEN 1 ELSE 0 END;
        END IF;
      END IF;

      IF _fact.id IS NULL OR _fval IS NULL THEN
        IF _fr.missing_handling = 'NOT_CALCULABLE' THEN
          _fblock := 'FACT_UNAVAILABLE';
          _fblock_reason := format('the governed fact %s carries no usable value and the policy treats that as not calculable', _fr.fact_code);
          _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'outcome','NOT_CALCULABLE',
                       'reason_code','FACT_UNAVAILABLE');
          CONTINUE;
        ELSIF _fr.missing_handling = 'EXCLUDE' THEN
          _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'outcome','EXCLUDED',
                       'reason_code','FACT_UNAVAILABLE');
          CONTINUE;
        ELSE
          SELECT max((t->>'score')::numeric) INTO _fscore FROM jsonb_array_elements(_fr.thresholds) t;
          IF _fscore IS NULL THEN
            _fblock := 'FACT_NO_THRESHOLD';
            _fblock_reason := format('the policy publishes no threshold band for fact %s', _fr.fact_code);
            CONTINUE;
          END IF;
          _num := _num + _fscore * _fw; _den := _den + _fw;
          _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'outcome','TREATED_AS_HIGHEST_RISK',
                       'score',_fscore,'weight',_fw,'reason_code','FACT_UNAVAILABLE');
          CONTINUE;
        END IF;
      END IF;

      IF _fr.unit IS NOT NULL AND _fact.unit IS NOT NULL AND upper(_fact.unit) <> upper(_fr.unit) THEN
        _fblock := 'FACT_UNIT_MISMATCH';
        _fblock_reason := format('fact %s is recorded in %s but the policy expects %s', _fr.fact_code, _fact.unit, _fr.unit);
        _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'outcome','NOT_CALCULABLE',
                     'reason_code','FACT_UNIT_MISMATCH','recorded_unit',_fact.unit,'expected_unit',_fr.unit);
        CONTINUE;
      END IF;

      IF _fr.requires_period AND (_fact.period_start IS NULL OR _fact.period_end IS NULL) THEN
        _fblock := 'FACT_PERIOD_MISSING';
        _fblock_reason := format('fact %s carries no reporting period and the policy requires one', _fr.fact_code);
        _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'outcome','NOT_CALCULABLE',
                     'reason_code','FACT_PERIOD_MISSING');
        CONTINUE;
      END IF;

      IF _fr.requires_ratio_provenance AND (_fact.numerator IS NULL OR _fact.denominator IS NULL) THEN
        _fblock := 'FACT_PROVENANCE_MISSING';
        _fblock_reason := format('fact %s carries no numerator and denominator and the policy requires the ratio to be traceable', _fr.fact_code);
        _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'outcome','NOT_CALCULABLE',
                     'reason_code','FACT_PROVENANCE_MISSING');
        CONTINUE;
      END IF;

      SELECT upper(t->>'band_code'), (t->>'score')::numeric INTO _fband, _fscore
        FROM jsonb_array_elements(_fr.thresholds) t
       WHERE (NULLIF(t->>'min_value','') IS NULL OR _fval >= (t->>'min_value')::numeric)
         AND (NULLIF(t->>'max_value','') IS NULL OR _fval <  (t->>'max_value')::numeric)
       ORDER BY COALESCE(NULLIF(t->>'min_value','')::numeric, -1e18)
       LIMIT 1;

      IF _fband IS NULL THEN
        _fblock := 'FACT_NO_THRESHOLD';
        _fblock_reason := format('the policy publishes no threshold band covering the recorded value of fact %s', _fr.fact_code);
        _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'value',_fval,
                     'outcome','NOT_CALCULABLE','reason_code','FACT_NO_THRESHOLD');
        CONTINUE;
      END IF;

      _num := _num + _fscore * _fw; _den := _den + _fw;
      _ftrace := _ftrace || jsonb_build_object('fact_code',_fr.fact_code,'value',_fval,'unit',_fact.unit,
                   'direction',_fr.direction,'band',_fband,'score',_fscore,'weight',_fw,
                   'period_start',_fact.period_start,'period_end',_fact.period_end,
                   'source_type',_fact.source_type,'officer_overridden',_fact.officer_overridden,
                   'outcome','SCORED');
    END LOOP;

    -- Generic completeness: every mandatory applicable question must carry a valid response.
    IF _mode = 'ALL_MANDATORY_APPLICABLE' THEN
      SELECT COALESCE(array_agg(mq.question_code ORDER BY mq.question_code),'{}')
        INTO _required
        FROM public.supervisory_methodology_question mq
       WHERE mq.methodology_dimension_id = _d.methodology_dimension_id
         AND mq.active AND mq.mandatory
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_qw) x
                          WHERE upper(x->>'question_code') = upper(mq.question_code)
                            AND x->>'participation' = 'EXCLUDED');

      SELECT COALESCE(array_agg(rc ORDER BY rc),'{}') INTO _missing
        FROM unnest(_required) rc
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.supervisory_assessment_question_response r
           JOIN public.supervisory_methodology_question mq2 ON mq2.id = r.methodology_question_id
           LEFT JOIN LATERAL (SELECT x AS s FROM jsonb_array_elements(_scores) x
                               WHERE x->>'response_code' = r.response LIMIT 1) sc ON true
          WHERE r.assessment_id = _assessment_id
            AND r.question_code = rc
            AND sc.s IS NOT NULL
            AND (
              (NOT COALESCE((sc.s->>'excluded_from_denominator')::boolean,false)
                 AND (sc.s->>'score') IS NOT NULL)
              OR (COALESCE((sc.s->>'excluded_from_denominator')::boolean,false)
                 AND mq2.allow_not_applicable
                 AND (NOT mq2.na_requires_rationale
                      OR length(btrim(COALESCE(r.observation,''))) >= 10))
            ));
    END IF;

    _treat := CASE WHEN _ev_ok THEN 'NONE' ELSE _evid END;

    IF _fblock IS NOT NULL
       OR (_mode = 'ALL_MANDATORY_APPLICABLE'
             AND (array_length(_missing,1) IS NOT NULL OR array_length(_required,1) IS NULL))
       OR (_mode = 'MIN_ANSWERED' AND _answered < _minq)
       OR _den = 0
       OR (_mincomp IS NOT NULL AND _pubq > 0 AND (_answered::numeric * 100 / _pubq) < _mincomp)
       OR (NOT _ev_ok AND _evid = 'NOT_CALCULABLE') THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
        'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'contributes_to',_kind,'status','NOT_CALCULABLE',
        'completeness_mode',_mode,
        'published_questions',_pubq,
        'min_completeness_pct',_mincomp,
        'mandatory_questions', to_jsonb(_required),
        'missing_mandatory_questions', to_jsonb(_missing),
        'facts',_ftrace,
        'reason_code', CASE
          WHEN _fblock IS NOT NULL THEN _fblock
          WHEN NOT _ev_ok AND _evid = 'NOT_CALCULABLE' THEN 'EVIDENCE_INSUFFICIENT'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_required,1) IS NULL
            THEN 'METHODOLOGY_PUBLISHES_NO_MANDATORY_QUESTION'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_missing,1) IS NOT NULL
            THEN 'MANDATORY_QUESTIONS_UNANSWERED'
          WHEN _den = 0 AND _answered = 0 THEN 'NO_SCORED_RESPONSE'
          WHEN _mincomp IS NOT NULL AND _pubq > 0 AND (_answered::numeric * 100 / _pubq) < _mincomp
            THEN 'DIMENSION_COMPLETENESS_BELOW_POLICY'
          ELSE 'MINIMUM_ANSWERS_NOT_MET' END,
        'reason', CASE
          WHEN _fblock IS NOT NULL THEN _fblock_reason
          WHEN NOT _ev_ok AND _evid = 'NOT_CALCULABLE'
            THEN 'the configured evidence-insufficiency treatment makes this dimension not calculable'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_required,1) IS NULL
            THEN 'the methodology publishes no mandatory question for this dimension, so completeness cannot be established'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_missing,1) IS NOT NULL
            THEN format('%s mandatory applicable question(s) carry no valid response', array_length(_missing,1))
          WHEN _den = 0 AND _answered = 0
            THEN 'the supervisor has recorded no scored response for any question in this dimension'
          WHEN _mincomp IS NOT NULL AND _pubq > 0 AND (_answered::numeric * 100 / _pubq) < _mincomp
            THEN format('answered coverage is below the %s%% minimum the calculation policy sets for this dimension', _mincomp)
          ELSE 'no applicable answered question meets the minimum-answer rule' END,
        'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
        'evidence_treatment',_treat,'evidence_effect','dimension not calculated',
        'answered',_answered,'questions',_qtrace);
      CONTINUE;
    END IF;

    _raw := public.supervisory_calc_round(_num / _den, _rmode, _rdec);
    IF _kind = 'INHERENT' THEN
      _score := CASE WHEN _dir = 'INVERTED' THEN 100 - _raw ELSE _raw END;
    ELSE
      _score := _raw;
    END IF;

    IF NOT _ev_ok AND _evid = 'CAP_AT_MIDPOINT' THEN
      IF _kind = 'INHERENT' THEN
        IF _score < 50 THEN _score := 50; _capped := true; END IF;
      ELSE
        IF _score > 50 THEN _score := 50; _capped := true; END IF;
      END IF;
    END IF;

    _band := public.supervisory_calc_band_of_policy(_bands, _kind, _score);
    _w := CASE WHEN _dwrow->>'weight' IS NOT NULL THEN (_dwrow->>'weight')::numeric
               WHEN _wmode = 'EQUAL' THEN 1
               ELSE COALESCE(_d.weight,_d.meth_weight,1) END;

    IF _kind = 'INHERENT' THEN
      _inh_num := _inh_num + _score * _w; _inh_den := _inh_den + _w;
    ELSE
      _ctl_num := _ctl_num + _score * _w; _ctl_den := _ctl_den + _w;
    END IF;

    _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
      'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'contributes_to',_kind,'status','CALCULATED',
      'reason_code','CALCULATED',
      'completeness_mode',_mode,'mandatory_questions',to_jsonb(_required),
      'published_questions',_pubq,'min_completeness_pct',_mincomp,
      'weight',_w,'raw_score',_raw,'score',_score,'band',_band,'answered',_answered,
      'facts',_ftrace,
      'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
      'evidence_treatment',_treat,
      'evidence_effect', CASE WHEN _capped THEN 'score capped at the midpoint (50)'
                              WHEN NOT _ev_ok THEN 'flagged only; no effect on the calculated rating'
                              ELSE 'none' END,
      'critical_handling',_crit,'questions',_qtrace);
  END LOOP;

  IF _inh_den > 0 THEN
    _inh_score := public.supervisory_calc_round(_inh_num/_inh_den, _rmode, _rdec);
    _inh_band := public.supervisory_calc_band_of_policy(_bands,'INHERENT',_inh_score);
  END IF;
  IF _ctl_den > 0 THEN
    _ctl_score := public.supervisory_calc_round(_ctl_num/_ctl_den, _rmode, _rdec);
    _ctl_band := public.supervisory_calc_band_of_policy(_bands,'CONTROL',_ctl_score);
  END IF;

  IF _inh_band IS NOT NULL AND _ctl_band IS NOT NULL THEN
    SELECT c->>'residual_rating' INTO _residual FROM jsonb_array_elements(_matrix) c
     WHERE c->>'inherent_band' = _inh_band AND c->>'control_band' = _ctl_band LIMIT 1;
  END IF;

  SELECT jsonb_agg(
           CASE WHEN d->>'status' <> 'CALCULATED' THEN d
                ELSE d || jsonb_build_object('residual_rating',
                  (SELECT c->>'residual_rating' FROM jsonb_array_elements(_matrix) c
                    WHERE c->>'inherent_band' = CASE WHEN COALESCE(d->>'contributes_to', d->>'dimension_kind') = 'INHERENT' THEN d->>'band' ELSE _inh_band END
                      AND c->>'control_band'  = CASE WHEN COALESCE(d->>'contributes_to', d->>'dimension_kind') = 'INHERENT' THEN _ctl_band ELSE d->>'band' END
                    LIMIT 1))
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
    IF _rpol = 'HIGHEST_DIMENSION' THEN
      _weighted := _worst;
    ELSE
      _weighted := round(_ord_num/_ord_den)::int;
      IF _rpol = 'WEIGHTED_WITH_THRESHOLD' THEN
        SELECT (x->>'ordinal')::int INTO _thr FROM jsonb_array_elements(_m.scoring_scale) x
         WHERE x->>'code' = _rthr;
        IF _thr IS NOT NULL AND _worst >= _thr THEN _weighted := greatest(_weighted, _thr); END IF;
      END IF;
    END IF;
    SELECT x->>'code' INTO _rec FROM jsonb_array_elements(_m.scoring_scale) x
     WHERE (x->>'ordinal')::int = _weighted;
  END IF;

  -- Materiality rules may floor the recommended rating. Each decision is traced.
  IF _rec IS NOT NULL THEN
    FOR _mrule IN SELECT x FROM jsonb_array_elements(_mat) x ORDER BY x->>'parameter_code'
    LOOP
      _mval := NULL; _mhit := false;
      IF _mrule->>'fact_code' IS NOT NULL THEN
        SELECT COALESCE(af.value_numeric,
                 CASE WHEN af.numerator IS NOT NULL AND COALESCE(af.denominator,0) <> 0
                      THEN af.numerator / af.denominator END)
          INTO _mval
          FROM public.supervisory_assessment_fact af
         WHERE af.assessment_id = _assessment_id
           AND upper(af.fact_code) = upper(_mrule->>'fact_code')
         ORDER BY af.updated_at DESC LIMIT 1;
      END IF;

      IF _mval IS NULL THEN
        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code',
          'outcome','NOT_APPLIED','reason_code','FACT_UNAVAILABLE');
        CONTINUE;
      END IF;

      _mhit := CASE _mrule->>'comparator'
                 WHEN 'GTE' THEN _mval >= (_mrule->>'threshold_value')::numeric
                 WHEN 'GT'  THEN _mval >  (_mrule->>'threshold_value')::numeric
                 WHEN 'LTE' THEN _mval <= (_mrule->>'threshold_value')::numeric
                 WHEN 'LT'  THEN _mval <  (_mrule->>'threshold_value')::numeric
                 ELSE false END;

      IF NOT _mhit OR _mrule->>'adjustment_kind' <> 'FLOOR_AT_BAND' THEN
        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code',
          'value',_mval,'outcome','NOT_APPLIED',
          'reason_code', CASE WHEN _mhit THEN 'NO_ADJUSTMENT' ELSE 'THRESHOLD_NOT_MET' END);
        CONTINUE;
      END IF;

      SELECT (x->>'ordinal')::int INTO _mord FROM jsonb_array_elements(_m.scoring_scale) x
       WHERE x->>'code' = _mrule->>'adjustment_band';
      SELECT (x->>'ordinal')::int INTO _cord FROM jsonb_array_elements(_m.scoring_scale) x
       WHERE x->>'code' = _rec;

      IF _mord IS NULL THEN
        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code','value',_mval,
          'outcome','NOT_APPLIED','reason_code','BAND_NOT_ON_SCORING_SCALE');
      ELSIF _mord > COALESCE(_cord,0) THEN
        SELECT x->>'code' INTO _rec FROM jsonb_array_elements(_m.scoring_scale) x
         WHERE (x->>'ordinal')::int = _mord;
        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code','value',_mval,
          'outcome','APPLIED','floored_to',_rec,'from',(SELECT x->>'code' FROM jsonb_array_elements(_m.scoring_scale) x
             WHERE (x->>'ordinal')::int = _cord));
      ELSE
        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code','value',_mval,
          'outcome','NOT_APPLIED','reason_code','RECOMMENDATION_ALREADY_AT_OR_ABOVE_FLOOR');
      END IF;
    END LOOP;
  END IF;

  _n_total := jsonb_array_length(_dims);
  SELECT count(*) FILTER (WHERE d->>'status' = 'CALCULATED'),
         count(*) FILTER (WHERE d->>'status' = 'NOT_APPLICABLE'),
         count(*) FILTER (WHERE d->>'status' = 'NOT_CALCULABLE')
    INTO _n_calc, _n_na, _n_notcalc
    FROM jsonb_array_elements(_dims) d;

  IF _n_total = 0 THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_DIMENSIONS';
    _reason := 'the assessment carries no dimension row, so there is nothing to calculate';
  ELSIF COALESCE(_n_calc,0) = 0 THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_CALCULABLE_DIMENSION';
    _reason := 'no dimension of this assessment is calculable under the configuration in force';
  ELSIF _residual IS NULL AND _inh_band IS NOT NULL AND _ctl_band IS NOT NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_MATRIX_CELL';
    _reason := format('the residual matrix publishes no cell for inherent %s and control %s', _inh_band, _ctl_band);
  ELSIF _inh_band IS NULL OR _ctl_band IS NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'INCOMPLETE_DIMENSION_SIDES';
    _reason := 'a residual rating needs both an inherent and a control side, and one of them is not calculable';
  ELSIF _rec IS NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'NO_RECOMMENDATION';
    _reason := 'the recommendation policy produced no rating on the methodology scoring scale';
  ELSE
    _status := 'CALCULATED'; _reason_code := 'CALCULATED'; _reason := NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', _status, 'reason_code', _reason_code, 'reason', _reason,
    'engine_version', _engine,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,'config_id',_config_id,'config_version',_config_version,
    'as_of',_as_of,
    'dimension_summary', jsonb_build_object('total',_n_total,'calculated',COALESCE(_n_calc,0),
      'not_applicable',COALESCE(_n_na,0),'not_calculable',COALESCE(_n_notcalc,0)),
    'parameters', jsonb_build_object('aggregation_method',_agg,
       'completeness_mode',_mode,
       'na_denominator_handling',_na,'min_answered_questions',_minq,
       'evidence_insufficiency_handling',_evid,'critical_question_handling',_crit,
       'inherent_direction',_dir,'rounding',_rmode||'/'||_rdec,
       'dimension_weight_mode',_wmode,
       'question_weight_rows', jsonb_array_length(_qw),
       'dimension_weight_rows', jsonb_array_length(_dw),
       'fact_rule_rows', jsonb_array_length(_frules),
       'materiality_rows', jsonb_array_length(_mat),
       'recommendation_policy',_rpol,'recommendation_threshold',_rthr,
       'override_threshold',_policy->>'override_threshold'),
    'materiality', _mtrace,
    'inherent_score',_inh_score,'inherent_band',_inh_band,
    'control_score',_ctl_score,'control_band',_ctl_band,
    'residual_rating',_residual,'recommended_rating',_rec,
    'dimensions',_dims);
END $function$;