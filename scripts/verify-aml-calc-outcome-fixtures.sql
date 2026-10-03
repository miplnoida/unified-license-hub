-- AML/CFT calculation outcome and boundary fixtures (OUTC gates).
--
-- Two contracts are proven here with explicit fixtures:
--
--  1. AMLH-09 acceptance semantics. An approved dimension must carry a GOVERNED
--     CALCULATION OUTCOME, which is either a complete CALCULATED result or an
--     explicit NOT_CALCULABLE result with a recorded reason. The acceptance rule
--     lives in exactly one place — public.supervisory_calc_outcome_acceptable —
--     and OUTC-01..OUTC-08 exercise it case by case so that no rating is ever
--     required (and therefore never fabricated) for a non-calculable dimension.
--
--  2. The configuration effective interval is HALF-OPEN: [effective_from,
--     effective_to). OUTC-09 proves the exact boundary: an as-of date equal to
--     effective_to does NOT resolve that configuration.
--
--  3. OUTC-10 proves that a legitimately non-calculable dimension keeps its
--     configuration/as-of provenance instead of discarding it.
--
-- Every fixture is created inside the transaction; the script ends in ROLLBACK
-- and authors no real AML/CFT calculation policy.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/verify-aml-calc-outcome-fixtures.sql

BEGIN;

CREATE TEMP TABLE outc_gate(id text, name text, result text, detail text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.gate(_id text, _name text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO outc_gate VALUES (_id, _name, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;
GRANT INSERT ON outc_gate TO authenticated;

-- ------------------------------------------------------- 1. acceptance contract
DO $$
DECLARE _cfg uuid := gen_random_uuid(); _t timestamptz := now();
        _ok_trace jsonb := jsonb_build_object('status','CALCULATED','score',72);
        _nc_trace jsonb := jsonb_build_object('status','NOT_CALCULABLE',
          'reason','no applicable answered question meets the minimum-answer rule');
BEGIN
  -- OUTC-01 CALCULATED, complete -> acceptable
  PERFORM pg_temp.gate('OUTC-01','CALCULATED with rating, configuration, trace and timestamp',
    public.supervisory_calc_outcome_acceptable('CALCULATED','HIGH',_cfg,_ok_trace,_t),
    'expected acceptable');

  -- OUTC-02 NOT_CALCULABLE requires the configuration provenance the engine
  -- had already resolved before it could conclude that nothing is calculable.
  -- A reason alone, with no configuration/version/as-of, is NOT acceptable.
  PERFORM pg_temp.gate('OUTC-02','NOT_CALCULABLE requires configuration/version/as-of provenance',
    public.supervisory_calc_outcome_acceptable('NOT_CALCULABLE',NULL,_cfg,
      _nc_trace || jsonb_build_object('config_version',1,'as_of','2026-06-01','methodology_version','1'),_t)
    AND NOT public.supervisory_calc_outcome_acceptable('NOT_CALCULABLE',NULL,NULL,_nc_trace,_t)
    AND NOT public.supervisory_calc_outcome_acceptable('NOT_CALCULABLE',NULL,_cfg,_nc_trace,_t),
    'full provenance acceptable; missing configuration id or missing config_version/as_of/methodology_version refused');

  -- OUTC-03 never calculated -> unacceptable
  PERFORM pg_temp.gate('OUTC-03','never calculated is refused',
    NOT public.supervisory_calc_outcome_acceptable(NULL,NULL,NULL,NULL,NULL),
    'calculation_status IS NULL is never an acceptable outcome');

  -- OUTC-04 NO_CONFIGURATION -> unacceptable
  PERFORM pg_temp.gate('OUTC-04','NO_CONFIGURATION is refused',
    NOT public.supervisory_calc_outcome_acceptable('NO_CONFIGURATION',NULL,NULL,
      jsonb_build_object('reason','no approved calculation configuration was in force'),_t),
    'an unpublished policy cannot certify an assessment');

  -- OUTC-05 NO_EFFECTIVE_DATE_RULE -> unacceptable
  PERFORM pg_temp.gate('OUTC-05','NO_EFFECTIVE_DATE_RULE is refused',
    NOT public.supervisory_calc_outcome_acceptable('NO_EFFECTIVE_DATE_RULE',NULL,NULL,
      jsonb_build_object('reason','domain AML_CFT has no recorded effective-date rule'),_t),
    'an undecided effective-date rule cannot certify an assessment');

  -- OUTC-06 CONFIGURATION_INCOMPLETE -> unacceptable
  PERFORM pg_temp.gate('OUTC-06','CONFIGURATION_INCOMPLETE is refused',
    NOT public.supervisory_calc_outcome_acceptable('CONFIGURATION_INCOMPLETE',NULL,_cfg,
      jsonb_build_object('reason','a required supervisory parameter is undecided'),_t),
    'an incomplete configuration cannot certify an assessment');

  -- OUTC-07 CALCULATED with a NULL rating -> unacceptable
  PERFORM pg_temp.gate('OUTC-07','CALCULATED with no rating is refused',
    NOT public.supervisory_calc_outcome_acceptable('CALCULATED',NULL,_cfg,_ok_trace,_t)
    AND NOT public.supervisory_calc_outcome_acceptable('CALCULATED','HIGH',NULL,_ok_trace,_t)
    AND NOT public.supervisory_calc_outcome_acceptable('CALCULATED','HIGH',_cfg,_ok_trace,NULL),
    'CALCULATED requires rating + configuration + trace + timestamp');

  -- OUTC-08 NOT_CALCULABLE carrying a rating -> unacceptable (no fabrication)
  PERFORM pg_temp.gate('OUTC-08','NOT_CALCULABLE with a rating is refused',
    NOT public.supervisory_calc_outcome_acceptable('NOT_CALCULABLE','MEDIUM',_cfg,_nc_trace,_t)
    AND NOT public.supervisory_calc_outcome_acceptable('NOT_CALCULABLE',NULL,_cfg,
          jsonb_build_object('status','NOT_CALCULABLE'),_t),
    'a non-calculable dimension may carry neither a rating nor an unexplained outcome');
END $$;

-- ------------------------------------ 2/3. half-open boundary and provenance
DO $$
DECLARE _ent uuid; _m uuid; _dimI uuid; _dimC uuid; _q1 uuid; _q2 uuid; _cfgv uuid;
        _aEdge uuid; _aIn uuid; _aNone uuid; _aCalc uuid;
        _r jsonb; _row public.supervisory_assessment_dimension;
        _resolved uuid;
BEGIN
  SELECT entity_id INTO _ent FROM public.supervisory_assessment WHERE entity_id IS NOT NULL LIMIT 1;
  IF _ent IS NULL THEN SELECT id INTO _ent FROM public.supervisory_entity LIMIT 1; END IF;
  -- AML-CLOSE-02D fixture modernisation: creation requires an explicit AML/CFT
  -- perimeter (AML-CLOSE-02C). TEST-only determination, rolled back; an
  -- existing determination for the entity is left untouched.
  INSERT INTO public.supervisory_domain_perimeter(entity_id, domain_code, is_applicable, basis)
  VALUES (_ent, 'AML_CFT', true, 'TEST ONLY verifier fixture (rolled back) — not a regulatory determination')
  ON CONFLICT (entity_id, domain_code) DO NOTHING;

  INSERT INTO public.supervisory_domain_calculation_rule(domain_code, effective_date_rule, rationale)
  VALUES ('AML_CFT','PERIOD_END','synthetic verifier fixture: period end')
  ON CONFLICT (domain_code) DO UPDATE SET effective_date_rule = 'PERIOD_END';

  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, scoring_scale, definition)
  VALUES ('ZZ_OUTC','AML_CFT','Outcome fixture','1',
    '[{"code":"LOW","ordinal":1},{"code":"MEDIUM","ordinal":2},{"code":"HIGH","ordinal":3}]'::jsonb,
    '{"control_scale":["WEAK","ADEQUATE","STRONG"]}'::jsonb)
  RETURNING id INTO _m;

  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_m,'FX_INH','INHERENT_RISK','Inherent fixture','INHERENT',1,0) RETURNING id INTO _dimI;
  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_m,'FX_CTL','CONTROL_EFFECTIVENESS','Control fixture','CONTROL',1,0) RETURNING id INTO _dimC;
  INSERT INTO public.supervisory_methodology_question(methodology_id, methodology_dimension_id,
    question_code, prompt, response_options, min_evidence_count)
  VALUES (_m,_dimI,'FXQ1','Inherent question',ARRAY['YES','NO'],0) RETURNING id INTO _q1;
  INSERT INTO public.supervisory_methodology_question(methodology_id, methodology_dimension_id,
    question_code, prompt, response_options, min_evidence_count)
  VALUES (_m,_dimC,'FXQ2','Control question',ARRAY['YES','NO'],0) RETURNING id INTO _q2;


  -- one configuration version, window [2026-01-01, 2026-06-30)
  INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, status,
    effective_from, effective_to, aggregation_method, min_answered_questions, na_denominator_handling,
    evidence_insufficiency_handling, critical_question_handling, rounding_mode, rounding_decimals,
    inherent_direction, recommendation_policy)
  VALUES (_m,1,'ACTIVE','2026-01-01','2026-06-30','UNWEIGHTED_MEAN',1,'EXCLUDE','FLAG_ONLY','NONE',
    'HALF_UP',1,'DIRECT','WEIGHTED_SCORE') RETURNING id INTO _cfgv;
  INSERT INTO public.supervisory_calculation_band(config_id, band_kind, band_code, min_score, max_score)
  VALUES (_cfgv,'INHERENT','LOW',0,40),(_cfgv,'INHERENT','MEDIUM',40,70),(_cfgv,'INHERENT','HIGH',70,100),
         (_cfgv,'CONTROL','WEAK',0,40),(_cfgv,'CONTROL','ADEQUATE',40,70),(_cfgv,'CONTROL','STRONG',70,100);
  INSERT INTO public.supervisory_calculation_response_score(config_id, response_code, score, excluded_from_denominator)
  VALUES (_cfgv,'YES',100,false),(_cfgv,'NO',0,false);
  INSERT INTO public.supervisory_calculation_matrix_cell(config_id, inherent_band, control_band, residual_rating)
  SELECT _cfgv, i, c, 'MEDIUM'
    FROM unnest(ARRAY['LOW','MEDIUM','HIGH']) i, unnest(ARRAY['WEAK','ADEQUATE','STRONG']) c;

  -- A. as-of EXACTLY EQUAL to effective_to -> configuration must NOT be in force
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-OUTC-EDGE',_ent,'AML_CFT',_m,'1','2026-04-01','2026-06-30','2026-07-01','draft')
  RETURNING id INTO _aEdge;
  -- B. as-of one day inside the window -> configuration IS in force
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-OUTC-IN',_ent,'AML_CFT',_m,'1','2026-04-01','2026-06-29','2026-07-01','draft')
  RETURNING id INTO _aIn;

  -- C. an assessment whose only dimension is unanswered -> wholly NOT_CALCULABLE
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-OUTC-NONE',_ent,'AML_CFT',_m,'1','2026-04-01','2026-06-29','2026-07-01','draft')
  RETURNING id INTO _aNone;
  INSERT INTO public.supervisory_assessment_dimension(assessment_id, methodology_dimension_id,
    dimension_code, dimension_group, weight)
  VALUES (_aNone,_dimC,'FX_CTL','CONTROL_EFFECTIVENESS',1);

  FOR _resolved IN SELECT unnest(ARRAY[_aEdge,_aIn]) LOOP
    INSERT INTO public.supervisory_assessment_dimension(assessment_id, methodology_dimension_id,
      dimension_code, dimension_group, weight)
    VALUES (_resolved,_dimI,'FX_INH','INHERENT_RISK',1),
           (_resolved,_dimC,'FX_CTL','CONTROL_EFFECTIVENESS',1);
    -- only the inherent dimension is answered; the control dimension is left
    -- unanswered on purpose so it is legitimately NOT_CALCULABLE.
    INSERT INTO public.supervisory_assessment_question_response(assessment_id, assessment_dimension_id,
      methodology_id, methodology_dimension_id, methodology_question_id, dimension_code, question_code,
      question_text, response, evidence_refs)
    VALUES (_resolved,
      (SELECT id FROM public.supervisory_assessment_dimension
        WHERE assessment_id = _resolved AND dimension_code = 'FX_INH'),
      _m,_dimI,_q1,'FX_INH','FXQ1','Inherent question','YES','[]'::jsonb);
  END LOOP;

  -- D. an assessment whose inherent AND control sides are both answered, so the
  --    engine can produce a residual rating and a recommendation end to end.
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-OUTC-CALC',_ent,'AML_CFT',_m,'1','2026-04-01','2026-06-29','2026-07-01','draft')
  RETURNING id INTO _aCalc;
  INSERT INTO public.supervisory_assessment_dimension(assessment_id, methodology_dimension_id,
    dimension_code, dimension_group, weight)
  VALUES (_aCalc,_dimI,'FX_INH','INHERENT_RISK',1),
         (_aCalc,_dimC,'FX_CTL','CONTROL_EFFECTIVENESS',1);
  INSERT INTO public.supervisory_assessment_question_response(assessment_id, assessment_dimension_id,
    methodology_id, methodology_dimension_id, methodology_question_id, dimension_code, question_code,
    question_text, response, evidence_refs)
  VALUES (_aCalc,
    (SELECT id FROM public.supervisory_assessment_dimension
      WHERE assessment_id = _aCalc AND dimension_code = 'FX_INH'),
    _m,_dimI,_q1,'FX_INH','FXQ1','Inherent question','YES','[]'::jsonb),
   (_aCalc,
    (SELECT id FROM public.supervisory_assessment_dimension
      WHERE assessment_id = _aCalc AND dimension_code = 'FX_CTL'),
    _m,_dimC,_q2,'FX_CTL','FXQ2','Control question','YES','[]'::jsonb);


  -- OUTC-09 exact half-open boundary
  _r := public.supervisory_calc_compute(_aEdge);
  PERFORM pg_temp.gate('OUTC-09','effective_to is exclusive at the exact boundary',
    -- The engine reports the absence of a configuration in force as the governed
    -- outcome NOT_CALCULABLE carrying reason_code NO_CONFIGURATION; the obsolete
    -- top-level 'NO_CONFIGURATION' status is no longer part of the compute contract.
    public.supervisory_calc_config_for(_aEdge) IS NULL
    AND _r->>'status' = 'NOT_CALCULABLE'
    AND _r->>'reason_code' = 'NO_CONFIGURATION'
    AND length(btrim(COALESCE(_r->>'reason',''))) >= 5
    AND public.supervisory_calc_config_for(_aIn) = _cfgv,
    format('as_of = effective_to (2026-06-30) -> %s/%s; as_of = 2026-06-29 -> configuration v%s in force',
      _r->>'status', _r->>'reason_code',
      (SELECT config_version FROM public.supervisory_calculation_config
        WHERE id = public.supervisory_calc_config_for(_aIn))));

  -- OUTC-10 non-calculable provenance retained by the authoritative writer
  PERFORM public.supervisory_calc_materialise(_aIn, 'FIXTURE', NULL);
  SELECT * INTO _row FROM public.supervisory_assessment_dimension
   WHERE assessment_id = _aIn AND dimension_code = 'FX_CTL';
  PERFORM pg_temp.gate('OUTC-10','non-calculable dimension retains configuration provenance',
    _row.calculation_status = 'NOT_CALCULABLE'
    AND _row.calculated_residual_rating IS NULL
    AND _row.calculation_config_id = _cfgv
    AND _row.calculated_at IS NOT NULL
    AND length(btrim(COALESCE(_row.calculation_trace->>'reason',''))) >= 5
    AND (_row.calculation_trace->>'config_version') IS NOT NULL
    AND (_row.calculation_trace->>'as_of') IS NOT NULL
    AND public.supervisory_calc_outcome_acceptable(_row.calculation_status,
          _row.calculated_residual_rating, _row.calculation_config_id,
          _row.calculation_trace, _row.calculated_at),
    format('status=%s rating=%s config=%s as_of=%s reason=%s',
      _row.calculation_status, COALESCE(_row.calculated_residual_rating,'(null)'),
      COALESCE((_row.calculation_trace->>'config_version'),'(null)'),
      COALESCE((_row.calculation_trace->>'as_of'),'(null)'),
      left(COALESCE(_row.calculation_trace->>'reason','(null)'),60)));
END $$;

-- ------------------------------------ 4. governed recalculation of NOT_CALCULABLE
DO $$
DECLARE _uid uuid; _cfg uuid; _aIn uuid; _aNone uuid; _aCalc uuid; _dry jsonb; _wr jsonb; _row public.supervisory_assessment_dimension;
        _item jsonb; _itemw jsonb;
BEGIN
  SELECT id INTO _aIn FROM public.supervisory_assessment WHERE reference = 'ZZ-OUTC-IN';
  SELECT id INTO _aNone FROM public.supervisory_assessment WHERE reference = 'ZZ-OUTC-NONE';
  SELECT id INTO _aCalc FROM public.supervisory_assessment WHERE reference = 'ZZ-OUTC-CALC';
  _cfg := public.supervisory_calc_config_for(_aIn);
  SELECT u.id INTO _uid FROM auth.users u
   WHERE public.has_permission(u.id,'aml_supervision','manage_config') ORDER BY u.email LIMIT 1;
  IF _uid IS NULL OR _aIn IS NULL OR _aNone IS NULL THEN
    PERFORM pg_temp.gate('OUTC-11','governed recalculation dry run labels each outcome distinctly',
      false, 'no manage_config identity or fixture assessment');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_uid::text,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _dry := public.supervisory_calculation_recalculate('AML_CFT',
    'outcome fixture: governed recalculation dry run', _cfg, NULL, true);
  _wr := public.supervisory_calculation_recalculate('AML_CFT',
    'outcome fixture: governed recalculation write run', _cfg, NULL, false);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}', true);

  SELECT e INTO _item FROM jsonb_array_elements(_dry->'items') e WHERE e->>'assessment_id' = _aNone::text;
  SELECT e INTO _itemw FROM jsonb_array_elements(_wr->'items') e WHERE e->>'assessment_id' = _aNone::text;

  PERFORM pg_temp.gate('OUTC-11','governed recalculation dry run labels each outcome distinctly',
    _item->>'result' = 'WOULD_RECORD_NOT_CALCULABLE'
    AND (SELECT e->>'result' FROM jsonb_array_elements(_dry->'items') e
          WHERE e->>'assessment_id' = _aCalc::text) = 'WOULD_CALCULATE'
    AND (_dry->>'not_calculable')::int >= 1
    AND (_dry->>'recalculated')::int >= 1,
    format('non-calculable item=%s calculable item=%s not_calculable=%s recalculated=%s',
      COALESCE(_item->>'result','(none)'),
      COALESCE((SELECT e->>'result' FROM jsonb_array_elements(_dry->'items') e
                 WHERE e->>'assessment_id' = _aCalc::text),'(none)'),
      _dry->>'not_calculable', _dry->>'recalculated'));

  PERFORM pg_temp.gate('OUTC-12','governed recalculation write run materialises NOT_CALCULABLE',
    _itemw->>'result' = 'RECORDED_NOT_CALCULABLE'
    AND EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension d
                 WHERE d.assessment_id = _aNone AND d.calculation_status = 'NOT_CALCULABLE'
                   AND d.calculated_residual_rating IS NULL AND d.calculation_config_id = _cfg),
    format('item=%s', COALESCE(_itemw->>'result','(none)')));

  SELECT * INTO _row FROM public.supervisory_assessment_dimension
   WHERE assessment_id = _aIn AND dimension_code = 'FX_CTL';
  PERFORM pg_temp.gate('OUTC-13','recalculation fabricates no rating and keeps provenance',
    _row.calculated_residual_rating IS NULL
    AND _row.calculation_status = 'NOT_CALCULABLE'
    AND _row.calculation_config_id = _cfg
    AND public.supervisory_calc_outcome_acceptable(_row.calculation_status,
          _row.calculated_residual_rating, _row.calculation_config_id,
          _row.calculation_trace, _row.calculated_at),
    format('status=%s rating=%s config=%s', _row.calculation_status,
      COALESCE(_row.calculated_residual_rating,'(null)'),
      COALESCE(_row.calculation_config_id::text,'(null)')));

  PERFORM pg_temp.gate('OUTC-14','a legitimate NOT_CALCULABLE is not counted as an ordinary skip',
    (_dry->>'not_calculable')::int >= 1
    AND COALESCE((_dry->>'skipped')::int,0) = COALESCE((_dry->>'no_configuration')::int,0)
        + COALESCE((_dry->>'no_effective_date_rule')::int,0)
        + COALESCE((_dry->>'configuration_incomplete')::int,0)
        + COALESCE((_dry->>'other_configuration')::int,0),
    format('skipped=%s no_configuration=%s no_rule=%s incomplete=%s other_config=%s not_calculable=%s',
      _dry->>'skipped', _dry->>'no_configuration', _dry->>'no_effective_date_rule',
      _dry->>'configuration_incomplete', _dry->>'other_configuration', _dry->>'not_calculable'));
END $$;

SELECT id, name, result, detail FROM outc_gate ORDER BY id;
SELECT count(*) FILTER (WHERE result = 'PASS') AS pass,
       count(*) FILTER (WHERE result = 'FAIL') AS fail,
       count(*) AS total FROM outc_gate;

ROLLBACK;
