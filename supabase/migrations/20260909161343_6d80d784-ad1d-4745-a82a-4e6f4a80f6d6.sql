-- ===========================================================================
-- AML-06 wave 2: governed policy setters
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.supervisory_calc_config_draft_guard(_config_id uuid, _what text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _status text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN
    RAISE EXCEPTION '% may only be edited while the configuration is a draft', _what USING ERRCODE = '22023';
  END IF;
  RETURN _uid;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_config_draft_guard(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_question_weights_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _meth uuid; _n integer;
BEGIN
  _uid := public.supervisory_calc_config_draft_guard(_config_id, 'question weighting');
  SELECT methodology_id INTO _meth FROM public.supervisory_calculation_config WHERE id = _config_id;

  DELETE FROM public.supervisory_calculation_question_weight WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_question_weight(
    config_id, question_code, methodology_question_id, participation, weight, is_critical)
  SELECT _config_id, upper(btrim(r->>'question_code')),
         (SELECT mq.id FROM public.supervisory_methodology_question mq
           WHERE mq.methodology_id = _meth AND mq.question_code = upper(btrim(r->>'question_code')) LIMIT 1),
         COALESCE(NULLIF(upper(btrim(r->>'participation')),''),'SCORED'),
         NULLIF(r->>'weight','')::numeric,
         COALESCE((r->>'is_critical')::boolean,false)
    FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) r
   WHERE btrim(COALESCE(r->>'question_code','')) <> '';

  SELECT count(*) INTO _n FROM public.supervisory_calculation_question_weight WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'QUESTION_WEIGHTS_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_dimension_weights_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _meth uuid; _n integer;
BEGIN
  _uid := public.supervisory_calc_config_draft_guard(_config_id, 'dimension weighting');
  SELECT methodology_id INTO _meth FROM public.supervisory_calculation_config WHERE id = _config_id;

  DELETE FROM public.supervisory_calculation_dimension_weight WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_dimension_weight(
    config_id, dimension_code, methodology_dimension_id, contributes_to, weight,
    min_completeness_pct, aggregation_method)
  SELECT _config_id, upper(btrim(r->>'dimension_code')),
         (SELECT md.id FROM public.supervisory_methodology_dimension md
           WHERE md.methodology_id = _meth AND md.dimension_code = upper(btrim(r->>'dimension_code')) LIMIT 1),
         upper(btrim(r->>'contributes_to')),
         NULLIF(r->>'weight','')::numeric,
         NULLIF(r->>'min_completeness_pct','')::numeric,
         NULLIF(upper(btrim(COALESCE(r->>'aggregation_method',''))),'')
    FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) r
   WHERE btrim(COALESCE(r->>'dimension_code','')) <> ''
     AND btrim(COALESCE(r->>'contributes_to','')) <> '';

  SELECT count(*) INTO _n FROM public.supervisory_calculation_dimension_weight WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'DIMENSION_WEIGHTS_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_fact_rules_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _meth uuid; _n integer; _r jsonb; _rule_id uuid;
BEGIN
  _uid := public.supervisory_calc_config_draft_guard(_config_id, 'fact transformation rules');
  SELECT methodology_id INTO _meth FROM public.supervisory_calculation_config WHERE id = _config_id;

  DELETE FROM public.supervisory_calculation_fact_rule WHERE config_id = _config_id;
  FOR _r IN SELECT x FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) x
             WHERE btrim(COALESCE(x->>'fact_code','')) <> ''
  LOOP
    INSERT INTO public.supervisory_calculation_fact_rule(
      config_id, fact_code, fact_requirement_id, data_type, unit, direction, missing_handling,
      requires_period, requires_ratio_provenance, target_dimension_code, weight, notes)
    VALUES (_config_id, upper(btrim(_r->>'fact_code')),
      (SELECT fr.id FROM public.supervisory_methodology_fact_requirement fr
        WHERE fr.methodology_id = _meth AND fr.fact_code = upper(btrim(_r->>'fact_code')) LIMIT 1),
      upper(btrim(_r->>'data_type')), NULLIF(btrim(COALESCE(_r->>'unit','')),''),
      upper(btrim(_r->>'direction')), upper(btrim(_r->>'missing_handling')),
      COALESCE((_r->>'requires_period')::boolean, true),
      COALESCE((_r->>'requires_ratio_provenance')::boolean, false),
      NULLIF(upper(btrim(COALESCE(_r->>'target_dimension_code',''))),''),
      NULLIF(_r->>'weight','')::numeric, NULLIF(_r->>'notes',''))
    RETURNING id INTO _rule_id;

    INSERT INTO public.supervisory_calculation_fact_threshold(
      fact_rule_id, band_code, min_value, max_value, score, sort_order)
    SELECT _rule_id, upper(btrim(t->>'band_code')),
           NULLIF(t->>'min_value','')::numeric, NULLIF(t->>'max_value','')::numeric,
           (t->>'score')::numeric, COALESCE((t->>'sort_order')::int, 0)
      FROM jsonb_array_elements(COALESCE(_r->'thresholds','[]'::jsonb)) t
     WHERE btrim(COALESCE(t->>'band_code','')) <> '' AND NULLIF(t->>'score','') IS NOT NULL;
  END LOOP;

  SELECT count(*) INTO _n FROM public.supervisory_calculation_fact_rule WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'FACT_RULES_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_materiality_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _n integer;
BEGIN
  _uid := public.supervisory_calc_config_draft_guard(_config_id, 'materiality rules');

  DELETE FROM public.supervisory_calculation_materiality_rule WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_materiality_rule(
    config_id, parameter_code, fact_code, comparator, threshold_value, unit,
    adjustment_kind, adjustment_band, rationale)
  SELECT _config_id, upper(btrim(r->>'parameter_code')),
         NULLIF(upper(btrim(COALESCE(r->>'fact_code',''))),''),
         upper(btrim(r->>'comparator')), (r->>'threshold_value')::numeric,
         NULLIF(btrim(COALESCE(r->>'unit','')),''),
         upper(btrim(r->>'adjustment_kind')),
         NULLIF(upper(btrim(COALESCE(r->>'adjustment_band',''))),''),
         btrim(r->>'rationale')
    FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) r
   WHERE btrim(COALESCE(r->>'parameter_code','')) <> '';

  SELECT count(*) INTO _n FROM public.supervisory_calculation_materiality_rule WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'MATERIALITY_RULES_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;

-- ===========================================================================
-- AML-06 wave 2: policy completeness validation for the new sections
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.supervisory_calculation_policy_problems(_config_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(p), '{}'::text[]) FROM (
    -- question participation must cover every active scoring question of the methodology
    SELECT 'every active methodology question needs a participation decision; missing: '
           || string_agg(mq.question_code, ', ' ORDER BY mq.question_code) AS p
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology_question mq ON mq.methodology_id = c.methodology_id AND mq.active
     WHERE c.id = _config_id
       AND EXISTS (SELECT 1 FROM public.supervisory_calculation_question_weight w WHERE w.config_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_question_weight w
                        WHERE w.config_id = c.id AND w.question_code = mq.question_code)
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a scored question must carry a positive weight: ' || string_agg(w.question_code, ', ' ORDER BY w.question_code)
      FROM public.supervisory_calculation_question_weight w
     WHERE w.config_id = _config_id AND w.participation = 'SCORED' AND w.weight IS NOT NULL AND w.weight <= 0
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a question weighting row names a question the methodology does not publish: '
           || string_agg(w.question_code, ', ' ORDER BY w.question_code)
      FROM public.supervisory_calculation_question_weight w
     WHERE w.config_id = _config_id AND w.methodology_question_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    -- dimension contribution must cover every methodology dimension once declared
    SELECT 'every methodology dimension needs a contribution decision; missing: '
           || string_agg(md.dimension_code, ', ' ORDER BY md.dimension_code)
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology_dimension md ON md.methodology_id = c.methodology_id
     WHERE c.id = _config_id
       AND EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d WHERE d.config_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d
                        WHERE d.config_id = c.id AND d.dimension_code = md.dimension_code)
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a dimension weighting row names a dimension the methodology does not publish: '
           || string_agg(d.dimension_code, ', ' ORDER BY d.dimension_code)
      FROM public.supervisory_calculation_dimension_weight d
     WHERE d.config_id = _config_id AND d.methodology_dimension_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'the dimension contribution decisions leave the ' || side || ' side with no dimension'
      FROM (SELECT 'inherent' AS side WHERE EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d WHERE d.config_id = _config_id)
              AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d
                               WHERE d.config_id = _config_id AND d.contributes_to = 'INHERENT')
            UNION ALL
            SELECT 'control' WHERE EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d WHERE d.config_id = _config_id)
              AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d
                               WHERE d.config_id = _config_id AND d.contributes_to = 'CONTROL')) s
    UNION ALL
    -- fact rules
    SELECT 'a fact rule names a fact the methodology does not require: '
           || string_agg(f.fact_code, ', ' ORDER BY f.fact_code)
      FROM public.supervisory_calculation_fact_rule f
     WHERE f.config_id = _config_id AND f.fact_requirement_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a ratio or percentage fact rule must state its unit: ' || string_agg(f.fact_code, ', ' ORDER BY f.fact_code)
      FROM public.supervisory_calculation_fact_rule f
     WHERE f.config_id = _config_id AND f.data_type IN ('RATIO','PERCENTAGE','AMOUNT') AND f.unit IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a fact rule unit disagrees with the methodology fact definition: '
           || string_agg(f.fact_code, ', ' ORDER BY f.fact_code)
      FROM public.supervisory_calculation_fact_rule f
      JOIN public.supervisory_methodology_fact_requirement fr ON fr.id = f.fact_requirement_id
     WHERE f.config_id = _config_id AND fr.unit IS NOT NULL AND f.unit IS NOT NULL AND fr.unit <> f.unit
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a fact rule needs at least one threshold band: ' || string_agg(f.fact_code, ', ' ORDER BY f.fact_code)
      FROM public.supervisory_calculation_fact_rule f
     WHERE f.config_id = _config_id
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_fact_threshold t WHERE t.fact_rule_id = f.id)
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a fact rule that contributes to a dimension must name a dimension the methodology publishes: '
           || string_agg(f.fact_code, ', ' ORDER BY f.fact_code)
      FROM public.supervisory_calculation_fact_rule f
      JOIN public.supervisory_calculation_config c ON c.id = f.config_id
     WHERE f.config_id = _config_id AND f.target_dimension_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_dimension md
                        WHERE md.methodology_id = c.methodology_id AND md.dimension_code = f.target_dimension_code)
    HAVING count(*) > 0
    UNION ALL
    SELECT 'the threshold bands of a fact rule overlap: ' || string_agg(DISTINCT f.fact_code, ', ')
      FROM public.supervisory_calculation_fact_threshold a
      JOIN public.supervisory_calculation_fact_threshold b
        ON b.fact_rule_id = a.fact_rule_id AND b.id <> a.id
      JOIN public.supervisory_calculation_fact_rule f ON f.id = a.fact_rule_id
     WHERE f.config_id = _config_id
       AND COALESCE(a.min_value, -1e18) < COALESCE(b.max_value, 1e18)
       AND COALESCE(b.min_value, -1e18) < COALESCE(a.max_value, 1e18)
    HAVING count(*) > 0
    UNION ALL
    SELECT 'the threshold bands of a fact rule leave a gap: ' || string_agg(DISTINCT f.fact_code, ', ')
      FROM public.supervisory_calculation_fact_threshold a
      JOIN public.supervisory_calculation_fact_rule f ON f.id = a.fact_rule_id
     WHERE f.config_id = _config_id AND a.max_value IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.supervisory_calculation_fact_threshold z
                    WHERE z.fact_rule_id = a.fact_rule_id AND COALESCE(z.min_value, -1e18) > a.max_value)
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_fact_threshold n
                        WHERE n.fact_rule_id = a.fact_rule_id AND n.min_value = a.max_value)
    HAVING count(*) > 0
    UNION ALL
    -- materiality
    SELECT 'a materiality rule that floors a result must name the band to floor at: '
           || string_agg(m.parameter_code, ', ' ORDER BY m.parameter_code)
      FROM public.supervisory_calculation_materiality_rule m
     WHERE m.config_id = _config_id AND m.adjustment_kind = 'FLOOR_AT_BAND' AND m.adjustment_band IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a materiality rule reads a fact that carries no transformation rule: '
           || string_agg(m.fact_code, ', ' ORDER BY m.fact_code)
      FROM public.supervisory_calculation_materiality_rule m
     WHERE m.config_id = _config_id AND m.fact_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_fact_rule f
                        WHERE f.config_id = m.config_id AND f.fact_code = m.fact_code)
    HAVING count(*) > 0
  ) q;
$$;
REVOKE ALL ON FUNCTION public.supervisory_calculation_policy_problems(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_validate(_config_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v jsonb; _extra text[]; _problems jsonb;
BEGIN
  _v := public.supervisory_calculation_config_validate_core(_config_id);
  _extra := public.supervisory_calculation_config_score_problems(_config_id)
            || public.supervisory_calculation_policy_problems(_config_id);
  IF array_length(_extra,1) IS NULL THEN RETURN _v; END IF;
  _problems := COALESCE(_v->'problems','[]'::jsonb) || to_jsonb(_extra);
  RETURN jsonb_build_object('ok', jsonb_array_length(_problems) = 0, 'problems', _problems);
END $$;

-- ===========================================================================
-- AML-06 wave 2: the policy passed to the engine now carries the new sections
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.supervisory_calc_policy_from_config(_config_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'dimension_weight_mode',
      CASE WHEN EXISTS (SELECT 1 FROM public.supervisory_calculation_dimension_weight d WHERE d.config_id = c.id)
           THEN 'POLICY' ELSE 'METHODOLOGY' END,
    'response_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('response_code', s.response_code, 'score', s.score,
               'excluded_from_denominator', s.excluded_from_denominator) ORDER BY s.response_code)
        FROM public.supervisory_calculation_response_score s WHERE s.config_id = c.id), '[]'::jsonb),
    'question_weights', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('question_code', w.question_code, 'participation', w.participation,
               'weight', w.weight, 'is_critical', w.is_critical) ORDER BY w.question_code)
        FROM public.supervisory_calculation_question_weight w WHERE w.config_id = c.id), '[]'::jsonb),
    'dimension_weights', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dimension_code', d.dimension_code, 'contributes_to', d.contributes_to,
               'weight', d.weight, 'min_completeness_pct', d.min_completeness_pct,
               'aggregation_method', d.aggregation_method) ORDER BY d.dimension_code)
        FROM public.supervisory_calculation_dimension_weight d WHERE d.config_id = c.id), '[]'::jsonb),
    'fact_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('fact_code', f.fact_code, 'data_type', f.data_type, 'unit', f.unit,
               'direction', f.direction, 'missing_handling', f.missing_handling,
               'requires_period', f.requires_period, 'requires_ratio_provenance', f.requires_ratio_provenance,
               'target_dimension_code', f.target_dimension_code, 'weight', f.weight,
               'thresholds', COALESCE((SELECT jsonb_agg(jsonb_build_object('band_code', t.band_code,
                        'min_value', t.min_value, 'max_value', t.max_value, 'score', t.score)
                        ORDER BY t.sort_order, t.band_code)
                      FROM public.supervisory_calculation_fact_threshold t WHERE t.fact_rule_id = f.id), '[]'::jsonb))
             ORDER BY f.fact_code)
        FROM public.supervisory_calculation_fact_rule f WHERE f.config_id = c.id), '[]'::jsonb),
    'materiality', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('parameter_code', m.parameter_code, 'fact_code', m.fact_code,
               'comparator', m.comparator, 'threshold_value', m.threshold_value, 'unit', m.unit,
               'adjustment_kind', m.adjustment_kind, 'adjustment_band', m.adjustment_band)
             ORDER BY m.parameter_code)
        FROM public.supervisory_calculation_materiality_rule m WHERE m.config_id = c.id), '[]'::jsonb),
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
$$;