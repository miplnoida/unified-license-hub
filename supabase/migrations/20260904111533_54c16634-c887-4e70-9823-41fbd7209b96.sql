-- =====================================================================
-- AML/CFT completeness-engine hardening + policy-driven engine + simulation
-- No configuration is authored or activated. No business row is written.
-- =====================================================================

-- 1. Completeness mode on the configuration -----------------------------
ALTER TABLE public.supervisory_calculation_config
  ADD COLUMN IF NOT EXISTS completeness_mode text NOT NULL DEFAULT 'MIN_ANSWERED';

ALTER TABLE public.supervisory_calculation_config
  DROP CONSTRAINT IF EXISTS supervisory_calculation_config_completeness_chk;
ALTER TABLE public.supervisory_calculation_config
  ADD CONSTRAINT supervisory_calculation_config_completeness_chk
  CHECK (completeness_mode = ANY (ARRAY['MIN_ANSWERED'::text,'ALL_MANDATORY_APPLICABLE'::text]));

COMMENT ON COLUMN public.supervisory_calculation_config.completeness_mode IS
  'MIN_ANSWERED keeps the historical single-integer minimum. ALL_MANDATORY_APPLICABLE requires every mandatory, applicable question of a dimension to carry a valid response before the dimension is calculable; it is the only mode that is correct when dimensions publish different mandatory-question counts.';

-- 2. Band resolution against a policy document -------------------------
CREATE OR REPLACE FUNCTION public.supervisory_calc_band_of_policy(_bands jsonb, _kind text, _score numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT b->>'band_code'
    FROM jsonb_array_elements(COALESCE(_bands -> upper(_kind), '[]'::jsonb)) b
   WHERE _score IS NOT NULL
     AND _score >= (b->>'min_score')::numeric
     AND (_score < (b->>'max_score')::numeric
          OR ((b->>'max_score')::numeric = 100 AND _score <= 100))
   ORDER BY (b->>'min_score')::numeric
   LIMIT 1;
$fn$;

-- 3. Serialise an approved configuration into a policy document --------
CREATE OR REPLACE FUNCTION public.supervisory_calc_policy_from_config(_config_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'source', 'CONFIGURATION',
    'aggregation_method', c.aggregation_method,
    'completeness_mode', c.completeness_mode,
    'min_answered_questions', c.min_answered_questions,
    'na_denominator_handling', c.na_denominator_handling,
    'evidence_insufficiency_handling', c.evidence_insufficiency_handling,
    'critical_question_handling', c.critical_question_handling,
    'rounding_mode', c.rounding_mode,
    'rounding_decimals', c.rounding_decimals,
    'inherent_direction', c.inherent_direction,
    'recommendation_policy', c.recommendation_policy,
    'recommendation_threshold', c.recommendation_threshold,
    'override_threshold', c.override_threshold,
    'dimension_weight_mode', 'METHODOLOGY',
    'response_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('response_code', s.response_code, 'score', s.score,
               'excluded_from_denominator', s.excluded_from_denominator) ORDER BY s.response_code)
        FROM public.supervisory_calculation_response_score s WHERE s.config_id = c.id), '[]'::jsonb),
    'bands', jsonb_build_object(
      'INHERENT', COALESCE((SELECT jsonb_agg(jsonb_build_object('band_code', b.band_code,
                     'min_score', b.min_score, 'max_score', b.max_score) ORDER BY b.min_score)
                     FROM public.supervisory_calculation_band b
                    WHERE b.config_id = c.id AND b.band_kind = 'INHERENT'), '[]'::jsonb),
      'CONTROL',  COALESCE((SELECT jsonb_agg(jsonb_build_object('band_code', b.band_code,
                     'min_score', b.min_score, 'max_score', b.max_score) ORDER BY b.min_score)
                     FROM public.supervisory_calculation_band b
                    WHERE b.config_id = c.id AND b.band_kind = 'CONTROL'), '[]'::jsonb)),
    'matrix', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('inherent_band', m.inherent_band,
               'control_band', m.control_band, 'residual_rating', m.residual_rating))
        FROM public.supervisory_calculation_matrix_cell m WHERE m.config_id = c.id), '[]'::jsonb))
    FROM public.supervisory_calculation_config c WHERE c.id = _config_id;
$fn$;
REVOKE ALL ON FUNCTION public.supervisory_calc_policy_from_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_calc_policy_from_config(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_policy_from_config(uuid) TO authenticated, service_role;

-- 4. The single engine, driven by a policy document --------------------
CREATE OR REPLACE FUNCTION public.supervisory_calc_compute_policy(
  _assessment_id uuid, _policy jsonb, _as_of date,
  _config_id uuid DEFAULT NULL, _config_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _a public.supervisory_assessment; _m public.supervisory_methodology;
  _dims jsonb := '[]'::jsonb; _d record; _q record;
  _scores jsonb := COALESCE(_policy->'response_scores','[]'::jsonb);
  _bands  jsonb := COALESCE(_policy->'bands','{}'::jsonb);
  _matrix jsonb := COALESCE(_policy->'matrix','[]'::jsonb);
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
  _required text[]; _missing text[];
  _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
  _inh_score numeric; _ctl_score numeric; _inh_band text; _ctl_band text;
  _residual text; _rec text; _ord_num numeric := 0; _ord_den numeric := 0;
  _worst integer := 0; _thr integer; _weighted integer; _undecided text[] := '{}';
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
      'config_id',_config_id,'config_version',_config_version,'as_of',_as_of,'dimensions','[]'::jsonb,
      'undecided_parameters', to_jsonb(_undecided),
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
        'status','NOT_APPLICABLE',
        'reason','the supervisor recorded this dimension as not applicable to the entity, so it is excluded from the calculation');
      CONTINUE;
    END IF;

    _num := 0; _den := 0; _answered := 0; _qtrace := '[]'::jsonb;
    _ev_req := 0; _ev_sup := 0; _ev_ok := true; _capped := false;
    _required := '{}'; _missing := '{}';

    FOR _q IN
      SELECT r.question_code, r.response,
             (sc.s->>'score')::numeric AS score,
             COALESCE((sc.s->>'excluded_from_denominator')::boolean,false) AS excluded_from_denominator,
             jsonb_array_length(COALESCE(r.evidence_refs,'[]'::jsonb)) AS evidence_count,
             COALESCE(mq.min_evidence_count,0) AS evidence_required
        FROM public.supervisory_assessment_question_response r
        LEFT JOIN LATERAL (
          SELECT x AS s FROM jsonb_array_elements(_scores) x
           WHERE x->>'response_code' = r.response LIMIT 1) sc ON true
        LEFT JOIN public.supervisory_methodology_question mq
               ON mq.methodology_id = _a.methodology_id AND mq.question_code = r.question_code
       WHERE r.assessment_id = _assessment_id
         AND _d.methodology_dimension_id IS NOT NULL
         AND r.methodology_dimension_id = _d.methodology_dimension_id
       ORDER BY r.question_code
    LOOP
      IF _q.excluded_from_denominator THEN
        IF _na = 'INCLUDE_AS_ZERO' THEN _num := _num + 0; _den := _den + 1;
        ELSIF _na = 'INCLUDE_AS_FULL' THEN _num := _num + 100; _den := _den + 1;
        END IF;
      ELSIF _q.score IS NOT NULL THEN
        IF _agg = 'WORST_RESPONSE' THEN
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
                   'score',_q.score,'excluded',_q.excluded_from_denominator,
                   'evidence_required',_q.evidence_required,'evidence_supplied',COALESCE(_q.evidence_count,0));
    END LOOP;

    -- Generic completeness: every mandatory applicable question must carry a valid response.
    IF _mode = 'ALL_MANDATORY_APPLICABLE' AND _d.methodology_dimension_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(mq.question_code ORDER BY mq.question_code),'{}')
        INTO _required
        FROM public.supervisory_methodology_question mq
       WHERE mq.methodology_dimension_id = _d.methodology_dimension_id
         AND mq.active AND mq.mandatory;

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
              -- scored, counted response
              (NOT COALESCE((sc.s->>'excluded_from_denominator')::boolean,false)
                 AND (sc.s->>'score') IS NOT NULL)
              -- or a validly excluded Not Applicable carrying its required rationale
              OR (COALESCE((sc.s->>'excluded_from_denominator')::boolean,false)
                 AND mq2.allow_not_applicable
                 AND (NOT mq2.na_requires_rationale
                      OR length(btrim(COALESCE(r.observation,''))) >= 10))
            ));
    END IF;

    _treat := CASE WHEN _ev_ok THEN 'NONE' ELSE _evid END;

    IF (_mode = 'ALL_MANDATORY_APPLICABLE'
          AND (array_length(_missing,1) IS NOT NULL OR array_length(_required,1) IS NULL))
       OR (_mode = 'MIN_ANSWERED' AND _answered < _minq)
       OR _den = 0
       OR (NOT _ev_ok AND _evid = 'NOT_CALCULABLE') THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
        'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','NOT_CALCULABLE',
        'completeness_mode',_mode,
        'mandatory_questions', to_jsonb(_required),
        'missing_mandatory_questions', to_jsonb(_missing),
        'reason', CASE
          WHEN NOT _ev_ok AND _evid = 'NOT_CALCULABLE'
            THEN 'the configured evidence-insufficiency treatment makes this dimension not calculable'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_required,1) IS NULL
            THEN 'the methodology publishes no mandatory question for this dimension, so completeness cannot be established'
          WHEN _mode = 'ALL_MANDATORY_APPLICABLE' AND array_length(_missing,1) IS NOT NULL
            THEN format('%s mandatory applicable question(s) carry no valid response', array_length(_missing,1))
          ELSE 'no applicable answered question meets the minimum-answer rule' END,
        'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
        'evidence_treatment',_treat,'evidence_effect','dimension not calculated',
        'answered',_answered,'questions',_qtrace);
      CONTINUE;
    END IF;

    _raw := public.supervisory_calc_round(_num / _den, _rmode, _rdec);
    IF _d.dimension_kind = 'INHERENT' THEN
      _score := CASE WHEN _dir = 'INVERTED' THEN 100 - _raw ELSE _raw END;
    ELSE
      _score := _raw;
    END IF;

    IF NOT _ev_ok AND _evid = 'CAP_AT_MIDPOINT' THEN
      IF _d.dimension_kind = 'INHERENT' THEN
        IF _score < 50 THEN _score := 50; _capped := true; END IF;
      ELSE
        IF _score > 50 THEN _score := 50; _capped := true; END IF;
      END IF;
    END IF;

    _band := public.supervisory_calc_band_of_policy(_bands,
               CASE WHEN _d.dimension_kind = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END, _score);
    _w := CASE WHEN _wmode = 'EQUAL' THEN 1 ELSE COALESCE(_d.weight,_d.meth_weight,1) END;

    IF _d.dimension_kind = 'INHERENT' THEN
      _inh_num := _inh_num + _score * _w; _inh_den := _inh_den + _w;
    ELSE
      _ctl_num := _ctl_num + _score * _w; _ctl_den := _ctl_den + _w;
    END IF;

    _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
      'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','CALCULATED',
      'completeness_mode',_mode,'mandatory_questions',to_jsonb(_required),
      'weight',_w,'raw_score',_raw,'score',_score,'band',_band,'answered',_answered,
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
                    WHERE c->>'inherent_band' = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN d->>'band' ELSE _inh_band END
                      AND c->>'control_band'  = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN _ctl_band ELSE d->>'band' END
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

  RETURN jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(_dims) = 0 THEN 'NOT_CALCULABLE' ELSE 'CALCULATED' END,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,'config_id',_config_id,'config_version',_config_version,
    'as_of',_as_of,
    'parameters', jsonb_build_object('aggregation_method',_agg,
       'completeness_mode',_mode,
       'na_denominator_handling',_na,'min_answered_questions',_minq,
       'evidence_insufficiency_handling',_evid,'critical_question_handling',_crit,
       'inherent_direction',_dir,'rounding',_rmode||'/'||_rdec,
       'dimension_weight_mode',_wmode,
       'recommendation_policy',_rpol,'recommendation_threshold',_rthr,
       'override_threshold',_policy->>'override_threshold'),
    'inherent_score',_inh_score,'inherent_band',_inh_band,
    'control_score',_ctl_score,'control_band',_ctl_band,
    'residual_rating',_residual,'recommended_rating',_rec,
    'dimensions',_dims);
END
$fn$;
REVOKE ALL ON FUNCTION public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer) TO authenticated, service_role;

-- 5. The production entry point now delegates to the single engine -----
CREATE OR REPLACE FUNCTION public.supervisory_calc_compute_core(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _a public.supervisory_assessment; _cfg uuid; _c public.supervisory_calculation_config;
        _as_of date; _policy jsonb;
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
  _policy := public.supervisory_calc_policy_from_config(_cfg);
  RETURN public.supervisory_calc_compute_policy(_assessment_id, _policy, _as_of, _cfg, _c.config_version);
END
$fn$;

-- 6. Read-only candidate-policy simulation ------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_calc_simulate(
  _domain_code text, _policy jsonb, _entity_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _module text; _uid uuid; _a record; _r jsonb; _as_of date;
        _rule text := COALESCE(_policy->>'effective_date_rule','EXPLICIT_AS_OF');
        _out jsonb := '[]'::jsonb;
BEGIN
  _module := public.supervisory_domain_module(_domain_code);
  IF _module IS NULL THEN
    RAISE EXCEPTION 'unknown_domain: % is not a governed supervisory domain', COALESCE(_domain_code,'(null)')
      USING ERRCODE = '22023';
  END IF;
  _uid := public.supervisory_spine_require(ARRAY[_module || '.manage_config']);

  FOR _a IN
    SELECT sa.id, sa.reference, sa.entity_id, sa.status, sa.assessment_type,
           sa.assessment_date, sa.period_end, sa.created_at,
           sa.inherent_rating, sa.control_rating, sa.residual_rating
      FROM public.supervisory_assessment sa
     WHERE upper(sa.domain_code) = upper(_domain_code)
       AND (_entity_id IS NULL OR sa.entity_id = _entity_id)
     ORDER BY sa.reference
  LOOP
    _as_of := CASE _rule
      WHEN 'PERIOD_END' THEN _a.period_end
      WHEN 'ASSESSMENT_DATE' THEN _a.assessment_date
      WHEN 'EXPLICIT_AS_OF' THEN COALESCE(_a.assessment_date, _a.period_end)
      ELSE COALESCE(_a.assessment_date, _a.period_end, _a.created_at::date) END;

    _r := public.supervisory_calc_compute_policy(_a.id, _policy, _as_of, NULL, NULL);

    _out := _out || jsonb_build_object(
      'assessment_id',_a.id,'reference',_a.reference,'entity_id',_a.entity_id,
      'assessment_status',_a.status,'assessment_type',_a.assessment_type,'as_of',_as_of,
      'judged_inherent_rating',_a.inherent_rating,'judged_control_rating',_a.control_rating,
      'judged_residual_rating',_a.residual_rating,
      'result',_r);
  END LOOP;

  RETURN jsonb_build_object(
    'mode','SIMULATION',
    'persisted',false,
    'notice','CALIBRATION SIMULATION ONLY — no calculation outcome, rating or assessment was written',
    'domain_code', upper(_domain_code),
    'effective_date_rule',_rule,
    'simulated_by',_uid,
    'assessments',_out);
END
$fn$;
REVOKE ALL ON FUNCTION public.supervisory_calc_simulate(text,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_calc_simulate(text,jsonb,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_simulate(text,jsonb,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.supervisory_calc_simulate(text,jsonb,uuid) IS
  'Read-only calibration simulation. Declared STABLE so the database itself refuses any write from this path. Requires the domain module manage_config authority.';

-- 7. Retirement lifecycle preconditions --------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_lifecycle(
  _config_id uuid, _to_status text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid; _c public.supervisory_calculation_config; _to text := upper(btrim(_to_status)); _v jsonb;
        _pred public.supervisory_calculation_config;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _c.status = 'RETIRED' THEN
    RAISE EXCEPTION 'a retired configuration is final and cannot change status' USING ERRCODE = '22023';
  END IF;

  IF _to = 'REVIEW' THEN
    IF _c.status <> 'DRAFT' THEN RAISE EXCEPTION 'only a draft may be submitted for approval' USING ERRCODE = '22023'; END IF;
    _v := public.supervisory_calculation_config_validate(_config_id);
    IF NOT (_v->>'ok')::boolean THEN
      RAISE EXCEPTION 'the configuration is incomplete: %', (_v->'problems')::text USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'REVIEW', submitted_by = _uid, submitted_at = now() WHERE id = _config_id;

  ELSIF _to = 'APPROVED' THEN
    IF _c.status <> 'REVIEW' THEN RAISE EXCEPTION 'only a configuration under review may be approved' USING ERRCODE = '22023'; END IF;
    IF _uid = COALESCE(_c.submitted_by, _c.created_by) THEN
      RAISE EXCEPTION 'the approver must be a different person from the author' USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'APPROVED', approved_by = _uid, approved_at = now() WHERE id = _config_id;

  ELSIF _to = 'RETURNED' OR _to = 'DRAFT' THEN
    IF _c.status NOT IN ('REVIEW','APPROVED') THEN RAISE EXCEPTION 'only a submitted configuration may be returned' USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL,
           approved_by = NULL, approved_at = NULL WHERE id = _config_id;
    _to := 'DRAFT';

  ELSIF _to = 'ACTIVE' THEN
    IF _c.status <> 'APPROVED' THEN RAISE EXCEPTION 'only an approved configuration may be activated' USING ERRCODE = '22023'; END IF;
    IF _c.effective_from IS NULL THEN
      RAISE EXCEPTION 'a configuration cannot be activated without an effective-from date' USING ERRCODE = '22023'; END IF;
    SELECT * INTO _pred FROM public.supervisory_calculation_config
     WHERE methodology_id = _c.methodology_id AND status = 'ACTIVE' AND id <> _config_id
     ORDER BY effective_from DESC NULLS LAST LIMIT 1;
    IF _pred.id IS NOT NULL THEN
      IF _pred.effective_from IS NULL OR _pred.effective_from >= _c.effective_from THEN
        RAISE EXCEPTION 'the successor must take effect after the configuration it replaces (predecessor effective from %)', _pred.effective_from
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.supervisory_calculation_config
         SET status = 'SUPERSEDED', superseded_at = now(), effective_to = _c.effective_from
       WHERE id = _pred.id;
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'ACTIVE', activated_at = now() WHERE id = _config_id;

  ELSIF _to = 'RETIRED' THEN
    IF _c.status NOT IN ('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED') THEN
      RAISE EXCEPTION 'a configuration in status % cannot be retired', _c.status USING ERRCODE = '22023';
    END IF;
    IF _c.status = 'ACTIVE' AND EXISTS (
         SELECT 1 FROM public.supervisory_assessment_calculation ac WHERE ac.config_id = _c.id) THEN
      RAISE EXCEPTION 'this configuration is in force and has already produced calculation outcomes, so it must be replaced by a successor configuration rather than retired'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'RETIRED',
           effective_to = CASE WHEN _c.status = 'ACTIVE' THEN COALESCE(_c.effective_to, current_date) ELSE _c.effective_to END
     WHERE id = _config_id;
  ELSE
    RAISE EXCEPTION 'unsupported target status %', _to USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_config_id, 'LIFECYCLE', _c.status, _to, btrim(_rationale), _uid);
  RETURN _config_id;
END
$fn$;

-- 8. Validation understands the completeness mode ----------------------
CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_validate_core(_config_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _c public.supervisory_calculation_config; _m public.supervisory_methodology;
        _problems text[] := '{}'; _risk text[]; _ctrl text[]; _resp text[]; _need integer; _have integer;
        _kind text; _vocab text[]; _prev numeric; _b record; _quantum numeric; _first boolean;
BEGIN
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _c.methodology_id;

  IF _c.aggregation_method IS NULL THEN _problems := array_append(_problems, 'the question aggregation method has not been decided'); END IF;
  IF _c.completeness_mode IS NULL THEN _problems := array_append(_problems, 'the dimension completeness rule has not been decided'); END IF;
  IF _c.completeness_mode = 'MIN_ANSWERED' AND _c.min_answered_questions IS NULL THEN
    _problems := array_append(_problems, 'the minimum number of answered questions has not been decided'); END IF;
  IF _c.completeness_mode = 'MIN_ANSWERED' AND EXISTS (
      SELECT 1 FROM (
        SELECT d.id, count(*) FILTER (WHERE q.mandatory AND q.active) n
          FROM public.supervisory_methodology_dimension d
          LEFT JOIN public.supervisory_methodology_question q ON q.methodology_dimension_id = d.id
         WHERE d.methodology_id = _c.methodology_id AND d.active
         GROUP BY d.id) x
       WHERE x.n > 0
       GROUP BY () HAVING count(DISTINCT x.n) > 1) THEN
    _problems := array_append(_problems,
      'the dimensions of this methodology publish different mandatory-question counts, so a single minimum-answer figure cannot enforce completeness: use the all-mandatory-applicable rule');
  END IF;
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
       WHERE upper(r.domain_code) = upper(_m.domain_code)) THEN
    _problems := array_append(_problems, 'the supervisory domain has no recorded effective-date rule, so no authoritative as-of date exists');
  END IF;

  RETURN jsonb_build_object('ok', array_length(_problems,1) IS NULL,
    'config_id', _config_id, 'problems', to_jsonb(_problems));
END
$fn$;