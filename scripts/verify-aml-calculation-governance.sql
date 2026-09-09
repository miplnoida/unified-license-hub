-- AML/CFT calculation governance verifier (CALCG gates).
--
-- Behavioural gates: the script builds a synthetic methodology, two calculation
-- configuration versions with different effective windows, and assessments on
-- either side of the changeover, then asserts what the engine actually returns.
-- Nothing is authored for the real AML/CFT methodology: every fixture is created
-- inside the transaction and the script ends in ROLLBACK.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/verify-aml-calculation-governance.sql

BEGIN;

CREATE TEMP TABLE calcg_gate(id text, name text, result text, detail text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.gate(_id text, _name text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO calcg_gate VALUES (_id, _name, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;

-- ---------------------------------------------------------------- fixtures
CREATE TEMP TABLE calcg_fx(k text primary key, fx uuid) ON COMMIT DROP;

DO $$
DECLARE _m uuid; _dimI uuid; _dimC uuid; _ent uuid; _v1 uuid; _v2 uuid;
        _aJan uuid; _aAug uuid; _q1 uuid; _q2 uuid;
BEGIN
  SELECT entity_id INTO _ent FROM public.supervisory_assessment WHERE entity_id IS NOT NULL LIMIT 1;
  IF _ent IS NULL THEN SELECT id INTO _ent FROM public.supervisory_entity LIMIT 1; END IF;

  INSERT INTO public.supervisory_domain_calculation_rule(domain_code, effective_date_rule, rationale)
  VALUES ('AML_CFT','PERIOD_END','synthetic verifier fixture: period end')
  ON CONFLICT (domain_code) DO UPDATE SET effective_date_rule = 'PERIOD_END';

  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, scoring_scale, definition)
  VALUES ('ZZ_CALCG','AML_CFT','Calculation governance fixture','1',
    '[{"code":"LOW","ordinal":1},{"code":"MEDIUM","ordinal":2},{"code":"HIGH","ordinal":3}]'::jsonb,
    '{"control_scale":["WEAK","ADEQUATE","STRONG"]}'::jsonb)
  RETURNING id INTO _m;

  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_m,'FX_INH','INHERENT_RISK','Inherent fixture','INHERENT',1,0) RETURNING id INTO _dimI;
  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_m,'FX_CTL','CONTROL_EFFECTIVENESS','Control fixture','CONTROL',1,2) RETURNING id INTO _dimC;

  INSERT INTO public.supervisory_methodology_question(methodology_id, methodology_dimension_id,
    question_code, prompt, response_options, min_evidence_count)
  VALUES (_m,_dimI,'FXQ1','Inherent question',ARRAY['YES','NO'],0) RETURNING id INTO _q1;
  INSERT INTO public.supervisory_methodology_question(methodology_id, methodology_dimension_id,
    question_code, prompt, response_options, min_evidence_count)
  VALUES (_m,_dimC,'FXQ2','Control question',ARRAY['YES','NO'],2) RETURNING id INTO _q2;
  INSERT INTO public.supervisory_methodology_question(methodology_id, methodology_dimension_id,
    question_code, prompt, response_options, min_evidence_count)
  VALUES (_m,_dimI,'FXQ1B','Second inherent question',ARRAY['YES','NO'],0);

  -- two configuration versions: v1 [2026-01-01, 2026-07-01), v2 [2026-07-01, open)
  INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, status,
    effective_from, effective_to, aggregation_method, min_answered_questions, na_denominator_handling,
    evidence_insufficiency_handling, critical_question_handling, rounding_mode, rounding_decimals,
    inherent_direction, recommendation_policy)
  VALUES (_m,1,'SUPERSEDED','2026-01-01','2026-07-01','UNWEIGHTED_MEAN',1,'EXCLUDE','FLAG_ONLY','NONE',
    'HALF_UP',1,'DIRECT','WEIGHTED_SCORE') RETURNING id INTO _v1;
  INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, status,
    effective_from, aggregation_method, min_answered_questions, na_denominator_handling,
    evidence_insufficiency_handling, critical_question_handling, rounding_mode, rounding_decimals,
    inherent_direction, recommendation_policy)
  VALUES (_m,2,'ACTIVE','2026-07-01','UNWEIGHTED_MEAN',1,'EXCLUDE','FLAG_ONLY','NONE',
    'HALF_UP',1,'DIRECT','WEIGHTED_SCORE') RETURNING id INTO _v2;

  -- both versions: complete half-open band grids and full residual matrix
  INSERT INTO public.supervisory_calculation_band(config_id, band_kind, band_code, min_score, max_score)
  SELECT c, k, b, lo, hi FROM (VALUES
      ('INHERENT','LOW',0,40),('INHERENT','MEDIUM',40,70),('INHERENT','HIGH',70,100),
      ('CONTROL','WEAK',0,40),('CONTROL','ADEQUATE',40,70),('CONTROL','STRONG',70,100)
    ) AS g(k,b,lo,hi), (VALUES (_v1),(_v2)) AS cfg(c);
  INSERT INTO public.supervisory_calculation_response_score(config_id, response_code, score, excluded_from_denominator)
  SELECT c, r, s, false FROM (VALUES ('YES',100),('NO',0)) AS x(r,s), (VALUES (_v1),(_v2)) AS cfg(c);
  INSERT INTO public.supervisory_calculation_matrix_cell(config_id, inherent_band, control_band, residual_rating)
  SELECT c, i, ctl,
    CASE WHEN i = 'HIGH' AND ctl <> 'STRONG' THEN 'HIGH'
         WHEN i = 'LOW' AND ctl = 'STRONG' THEN 'LOW' ELSE 'MEDIUM' END
  FROM unnest(ARRAY['LOW','MEDIUM','HIGH']) i, unnest(ARRAY['WEAK','ADEQUATE','STRONG']) ctl,
       (VALUES (_v1),(_v2)) AS cfg(c);

  -- assessments either side of the changeover (as-of = period_end per the domain rule)
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-CALCG-JAN',_ent,'AML_CFT',_m,'1','2026-01-01','2026-03-31','2026-04-05','draft')
  RETURNING id INTO _aJan;
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-CALCG-AUG',_ent,'AML_CFT',_m,'1','2026-07-01','2026-08-31','2026-09-02','draft')
  RETURNING id INTO _aAug;

  FOR _m IN SELECT unnest(ARRAY[_aJan,_aAug]) LOOP
    INSERT INTO public.supervisory_assessment_dimension(assessment_id, methodology_dimension_id,
      dimension_code, dimension_group, weight)
    VALUES (_m,_dimI,'FX_INH','INHERENT_RISK',1),(_m,_dimC,'FX_CTL','CONTROL_EFFECTIVENESS',1);
    INSERT INTO public.supervisory_assessment_question_response(assessment_id, assessment_dimension_id,
      methodology_id, methodology_dimension_id, methodology_question_id, dimension_code, question_code,
      question_text, response, evidence_refs)
    VALUES (_m,
            (SELECT id FROM public.supervisory_assessment_dimension
              WHERE assessment_id = _m AND dimension_code = 'FX_INH'),
            (SELECT methodology_id FROM public.supervisory_assessment WHERE id = _m),
            _dimI,_q1,'FX_INH','FXQ1','Inherent question','YES','[]'::jsonb),
           (_m,
            (SELECT id FROM public.supervisory_assessment_dimension
              WHERE assessment_id = _m AND dimension_code = 'FX_CTL'),
            (SELECT methodology_id FROM public.supervisory_assessment WHERE id = _m),
            _dimC,_q2,'FX_CTL','FXQ2','Control question','YES','[]'::jsonb);
  END LOOP;

  INSERT INTO calcg_fx VALUES ('methodology',(SELECT methodology_id FROM public.supervisory_assessment WHERE id = _aJan)),
    ('dimI',_dimI),('dimC',_dimC),('v1',_v1),('v2',_v2),('aJan',_aJan),('aAug',_aAug);
END $$;

-- ---------------------------------------------------------------- gates
DO $$
DECLARE _m uuid; _v1 uuid; _v2 uuid; _aJan uuid; _aAug uuid; _draft uuid;
        r jsonb; r2 jsonb; v jsonb; n bigint; s text; ok boolean; bands text; miss text[];
BEGIN
  SELECT fx INTO _m FROM calcg_fx WHERE k='methodology';
  SELECT fx INTO _v1 FROM calcg_fx WHERE k='v1';
  SELECT fx INTO _v2 FROM calcg_fx WHERE k='v2';
  SELECT fx INTO _aJan FROM calcg_fx WHERE k='aJan';
  SELECT fx INTO _aAug FROM calcg_fx WHERE k='aAug';

  -- CALCG-01 no silent supervisory default on any policy parameter
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='supervisory_calculation_config'
     AND column_name IN ('aggregation_method','min_answered_questions','na_denominator_handling',
       'evidence_insufficiency_handling','critical_question_handling','rounding_mode',
       'rounding_decimals','inherent_direction','recommendation_policy')
     AND (column_default IS NOT NULL OR is_nullable = 'NO');
  PERFORM pg_temp.gate('CALCG-01','no silent supervisory defaults', n = 0,
    format('%s of 9 policy parameters still carry a default or NOT NULL', n));

  -- CALCG-02 the completeness validator refuses an undecided parameter
  INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, status)
  VALUES (_m, 99, 'DRAFT') RETURNING id INTO _draft;
  v := public.supervisory_calculation_config_validate(_draft);
  PERFORM pg_temp.gate('CALCG-02','validator refuses undecided policy parameters',
    NOT (v->>'ok')::boolean AND (v->>'problems') LIKE '%has not been decided%',
    left((v->>'problems'), 220));

  -- CALCG-03 no calculation without a recorded domain effective-date rule
  DELETE FROM public.supervisory_domain_calculation_rule WHERE domain_code = 'AML_CFT';
  r := public.supervisory_calc_compute(_aJan);
  -- The refusal is reported as the governed outcome NOT_CALCULABLE carrying
  -- reason_code NO_EFFECTIVE_DATE_RULE; the obsolete top-level status of the same
  -- name is no longer part of the compute contract.
  PERFORM pg_temp.gate('CALCG-03','no calculation without an effective-date decision',
    r->>'status' = 'NOT_CALCULABLE'
    AND r->>'reason_code' = 'NO_EFFECTIVE_DATE_RULE'
    AND length(btrim(COALESCE(r->>'reason',''))) >= 5
    AND public.supervisory_calc_config_for(_aJan) IS NULL,
    format('status=%s/%s', r->>'status', r->>'reason_code'));
  INSERT INTO public.supervisory_domain_calculation_rule(domain_code, effective_date_rule, rationale)
  VALUES ('AML_CFT','PERIOD_END','synthetic verifier fixture: period end');

  -- CALCG-04 historical assessments resolve the superseded configuration
  PERFORM pg_temp.gate('CALCG-04','historical SUPERSEDED configuration resolution',
    public.supervisory_calc_config_for(_aJan) = _v1
    AND public.supervisory_calc_config_for(_aAug) = _v2,
    format('january -> v%s, august -> v%s',
      (SELECT config_version FROM public.supervisory_calculation_config WHERE id = public.supervisory_calc_config_for(_aJan)),
      (SELECT config_version FROM public.supervisory_calculation_config WHERE id = public.supervisory_calc_config_for(_aAug))));

  -- CALCG-05 overlapping effective windows are refused
  ok := false;
  BEGIN
    INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, status,
      effective_from, effective_to) VALUES (_m, 98, 'ACTIVE', '2026-03-01', '2026-09-01');
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%overlapping_effective_window%');
  END;
  PERFORM pg_temp.gate('CALCG-05','overlapping configuration windows refused', ok,
    CASE WHEN ok THEN 'the window guard rejected an overlapping [2026-03-01, 2026-09-01)'
         ELSE 'an overlapping window was accepted' END);

  -- CALCG-06 activation closes the predecessor at the successor effective_from
  SELECT prosrc INTO s FROM pg_proc WHERE proname = 'supervisory_calculation_config_lifecycle';
  PERFORM pg_temp.gate('CALCG-06','predecessor window closed against the successor',
    s LIKE '%effective_to = _c.effective_from%' AND s NOT LIKE '%effective_to, current_date%'
    AND (SELECT effective_to FROM public.supervisory_calculation_config WHERE id = _v1) = '2026-07-01'::date,
    'activation sets effective_to to the successor effective_from; no current_date fallback remains');

  -- CALCG-07 determinism
  r := public.supervisory_calc_compute(_aAug);
  r2 := public.supervisory_calc_compute(_aAug);
  PERFORM pg_temp.gate('CALCG-07','recomputation is deterministic',
    md5(r::text) = md5(r2::text) AND r->>'status' = 'CALCULATED',
    format('status=%s hash=%s', r->>'status', left(md5(r::text),12)));

  -- CALCG-08 the authoritative writer is not executable by application roles
  PERFORM pg_temp.gate('CALCG-08','unauthorised calculation writer denied',
    NOT has_function_privilege('authenticated','public.supervisory_calc_materialise(uuid,text,uuid)','execute')
    AND NOT has_function_privilege('anon','public.supervisory_calc_materialise(uuid,text,uuid)','execute')
    AND has_function_privilege('authenticated','public.supervisory_assessment_calculate(uuid)','execute'),
    'materialise is internal; only the governed wrapper is executable by signed-in roles');

  -- CALCG-09 evidence handling actually changes behaviour
  -- the control dimension requires 2 evidence items per question and none is supplied
  r := public.supervisory_calc_compute(_aAug);   -- FLAG_ONLY
  UPDATE public.supervisory_calculation_config SET evidence_insufficiency_handling = 'NOT_CALCULABLE' WHERE id = _v2;
  r2 := public.supervisory_calc_compute(_aAug);
  UPDATE public.supervisory_calculation_config SET evidence_insufficiency_handling = 'CAP_AT_MIDPOINT' WHERE id = _v2;
  v := public.supervisory_calc_compute(_aAug);
  PERFORM pg_temp.gate('CALCG-09','evidence insufficiency changes the outcome',
    (SELECT d->>'evidence_sufficient' = 'false' AND d->>'evidence_treatment' = 'FLAG_ONLY'
       FROM jsonb_array_elements(r->'dimensions') d WHERE d->>'dimension_code' = 'FX_CTL')
    AND (SELECT d->>'status' = 'NOT_CALCULABLE'
       FROM jsonb_array_elements(r2->'dimensions') d WHERE d->>'dimension_code' = 'FX_CTL')
    AND (SELECT (d->>'score')::numeric = 50 AND d->>'evidence_effect' LIKE '%capped%'
       FROM jsonb_array_elements(v->'dimensions') d WHERE d->>'dimension_code' = 'FX_CTL'),
    format('flag_only=%s not_calculable=%s cap=%s',
      (SELECT d->>'evidence_treatment' FROM jsonb_array_elements(r->'dimensions') d WHERE d->>'dimension_code'='FX_CTL'),
      (SELECT d->>'status' FROM jsonb_array_elements(r2->'dimensions') d WHERE d->>'dimension_code'='FX_CTL'),
      (SELECT d->>'score' FROM jsonb_array_elements(v->'dimensions') d WHERE d->>'dimension_code'='FX_CTL')));
  UPDATE public.supervisory_calculation_config SET evidence_insufficiency_handling = 'FLAG_ONLY' WHERE id = _v2;

  -- CALCG-10 critical-question floors are unavailable until governed metadata exists
  ok := false;
  BEGIN
    UPDATE public.supervisory_calculation_config SET critical_question_handling = 'FLOOR_DIMENSION' WHERE id = _v2;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM pg_temp.gate('CALCG-10','critical-question floors unavailable, not faked', ok,
    'FLOOR_DIMENSION/FLOOR_ASSESSMENT are refused because the methodology has no question-level criticality');

  -- CALCG-11 every exposed option has distinct semantics; withdrawn options refused
  UPDATE public.supervisory_assessment_question_response SET response = 'NO'
   WHERE assessment_id = _aAug AND question_code = 'FXQ1';
  INSERT INTO public.supervisory_assessment_question_response(assessment_id, assessment_dimension_id,
    methodology_id, methodology_dimension_id, methodology_question_id, dimension_code, question_code,
    question_text, response)
  SELECT _aAug,
         (SELECT id FROM public.supervisory_assessment_dimension
           WHERE assessment_id = _aAug AND dimension_code = 'FX_INH'),
         methodology_id, (SELECT fx FROM calcg_fx WHERE k='dimI'),
         (SELECT id FROM public.supervisory_methodology_question WHERE methodology_id = _m AND question_code='FXQ1B'),
         'FX_INH','FXQ1B','Second inherent question','YES'
    FROM public.supervisory_assessment WHERE id = _aAug;
  r := public.supervisory_calc_compute(_aAug);   -- UNWEIGHTED_MEAN => 50
  UPDATE public.supervisory_calculation_config SET aggregation_method = 'WORST_RESPONSE' WHERE id = _v2;
  r2 := public.supervisory_calc_compute(_aAug);  -- WORST_RESPONSE => 0
  ok := false;
  BEGIN
    UPDATE public.supervisory_calculation_config SET aggregation_method = 'WEIGHTED_MEAN' WHERE id = _v2;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM pg_temp.gate('CALCG-11','aggregation options behave to contract',
    (SELECT (d->>'raw_score')::numeric FROM jsonb_array_elements(r->'dimensions') d WHERE d->>'dimension_code'='FX_INH') = 50
    AND (SELECT (d->>'raw_score')::numeric FROM jsonb_array_elements(r2->'dimensions') d WHERE d->>'dimension_code'='FX_INH') = 0
    AND ok,
    format('unweighted_mean=%s worst_response=%s withdrawn options refused=%s',
      (SELECT d->>'raw_score' FROM jsonb_array_elements(r->'dimensions') d WHERE d->>'dimension_code'='FX_INH'),
      (SELECT d->>'raw_score' FROM jsonb_array_elements(r2->'dimensions') d WHERE d->>'dimension_code'='FX_INH'), ok));
  UPDATE public.supervisory_calculation_config SET aggregation_method = 'UNWEIGHTED_MEAN' WHERE id = _v2;

  -- CALCG-12 complete decimal band coverage: every rounded score resolves exactly one band
  miss := '{}';
  FOR n IN SELECT 1 LOOP END LOOP;
  SELECT array_agg(x::text) INTO miss FROM unnest(ARRAY[0,0.1,19,19.1,19.9,20,39.9,40,49.9,50,
                                                        69.9,70,79.9,80,84.9,85,99.9,100]::numeric[]) x
   WHERE (SELECT count(*) FROM public.supervisory_calculation_band b
           WHERE b.config_id = _v2 AND b.band_kind = 'INHERENT'
             AND x >= b.min_score AND (x < b.max_score OR (b.max_score = 100 AND x <= 100))) <> 1;
  -- and the validator must reject an incomplete decimal grid (0-19, 20-39, ...)
  UPDATE public.supervisory_calculation_band SET min_score = 20, max_score = 39
   WHERE config_id = _draft AND false;   -- draft has no bands; build a deliberately gapped grid
  INSERT INTO public.supervisory_calculation_band(config_id, band_kind, band_code, min_score, max_score)
  VALUES (_draft,'INHERENT','LOW',0,19),(_draft,'INHERENT','MEDIUM',20,39),(_draft,'INHERENT','HIGH',39,100);
  UPDATE public.supervisory_calculation_config SET rounding_decimals = 1 WHERE id = _draft;
  v := public.supervisory_calculation_config_validate(_draft);
  PERFORM pg_temp.gate('CALCG-12','decimal band coverage proven complete',
    (miss IS NULL OR array_length(miss,1) IS NULL) AND (v->>'problems') LIKE '%gap or overlap%',
    format('edge scores resolving no/multiple band: %s; gapped grid rejected: %s',
      COALESCE(array_to_string(miss,','),'none'), (v->>'problems') LIKE '%gap or overlap%'));

  -- CALCG-13 governed recalculation exists, is audited and refuses an unauthorised caller
  SELECT prosrc INTO s FROM pg_proc WHERE proname = 'supervisory_calculation_recalculate';
  ok := false;
  BEGIN
    PERFORM public.supervisory_calculation_recalculate('AML_CFT','verifier probe without a session', NULL, NULL, true);
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  PERFORM pg_temp.gate('CALCG-13','audited recalculation/backfill governed', ok
    AND s LIKE '%BLOCKED_REVIEW_REQUIRED%' AND s LIKE '%log_compliance_audit%'
    AND s LIKE '%_dry_run%' AND s NOT LIKE '%override_reason =%',
    'permission enforced, dry-run supported, divergence blocked, no fabricated override reason, audited');

  -- CALCG-14 calculation provenance is retained and append-only
  PERFORM public.supervisory_calc_materialise(_aAug, 'VERIFIER_FIXTURE_1', NULL);
  UPDATE public.supervisory_calculation_config SET rounding_decimals = 0 WHERE id = _v2;
  PERFORM public.supervisory_calc_materialise(_aAug, 'VERIFIER_FIXTURE_2', NULL);
  SELECT count(*) INTO n FROM public.supervisory_assessment_calculation_history WHERE assessment_id = _aAug;
  ok := false;
  BEGIN
    UPDATE public.supervisory_assessment_calculation_history SET status = 'TAMPERED' WHERE assessment_id = _aAug;
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%append-only%');
  END;
  PERFORM pg_temp.gate('CALCG-14','historical calculation provenance retained',
    n >= 2 AND ok
    AND EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_history
                 WHERE assessment_id = _aAug AND trace_hash IS NOT NULL AND as_of IS NOT NULL
                   AND config_version IS NOT NULL AND event_reason = 'VERIFIER_FIXTURE_1'),
    format('%s history rows retained, update refused=%s', n, ok));
END $$;

-- ------------------------------------------------ authorization boundary gates
-- CALCG-15..CALCG-20 impersonate real sessions (request.jwt.claims) to prove the
-- authorization model, not merely its source text. Nothing is authored.
DO $$
DECLARE _aJan uuid; _aPrud uuid; _ent uuid; _m uuid;
        _sa uuid; _amlEdit uuid; _prudCfg uuid;
        r jsonb; ok boolean; ok2 boolean; ok3 boolean; s text; e text; e2 text;
BEGIN
  SELECT fx INTO _m FROM calcg_fx WHERE k='methodology';
  SELECT fx INTO _aJan FROM calcg_fx WHERE k='aJan';
  SELECT entity_id INTO _ent FROM public.supervisory_assessment WHERE id = _aJan;

  -- a fixture assessment that belongs to a DIFFERENT supervisory domain
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status)
  VALUES ('ZZ-CALCG-PRUD',_ent,'PRUDENTIAL',_m,'1','2026-07-01','2026-09-30','2026-10-05','draft')
  RETURNING id INTO _aPrud;

  SELECT id INTO _sa FROM auth.users WHERE public.is_super_admin(id) LIMIT 1;
  SELECT id INTO _amlEdit FROM auth.users
   WHERE NOT public.is_super_admin(id)
     AND public.has_permission(id,'aml_supervision','edit')
     AND NOT public.has_permission(id,'prudential_supervision','record_camels_assessment')
     AND NOT public.has_permission(id,'prudential_supervision','manage_config') LIMIT 1;
  SELECT id INTO _prudCfg FROM auth.users
   WHERE NOT public.is_super_admin(id)
     AND public.has_permission(id,'prudential_supervision','manage_config')
     AND NOT public.has_permission(id,'aml_supervision','manage_config') LIMIT 1;

  -- CALCG-15 a permission held in domain A never authorises calculation in domain B
  ok := false; e := NULL;
  IF _amlEdit IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_amlEdit,'role','authenticated')::text, true);
    BEGIN
      PERFORM public.supervisory_assessment_calculate(_aPrud);
    EXCEPTION WHEN OTHERS THEN e := SQLERRM; ok := (SQLSTATE = '42501');
    END;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  PERFORM pg_temp.gate('CALCG-15','cross-domain assessment calculation denied',
    _amlEdit IS NOT NULL AND ok,
    format('AML-only officer calculating a PRUDENTIAL assessment: %s', COALESCE(e,'no denial')));

  -- CALCG-16 the governed wrapper still succeeds for an authorised session, and
  -- resolves the required authority from the assessment's own domain
  ok := false; e := NULL;
  IF _sa IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_sa,'role','authenticated')::text, true);
    BEGIN
      r := public.supervisory_assessment_calculate(_aJan);
      ok := (r->>'status') IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN e := SQLERRM;
    END;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='supervisory_assessment_calculate';
  PERFORM pg_temp.gate('CALCG-16','domain-authorised calculation succeeds, authority derived from the assessment',
    ok AND s LIKE '%supervisory_domain_module(_a.domain_code)%'
       AND s LIKE '%supervisory_domain_actions(_a.domain_code%'
       AND s LIKE '%supervisory_entity_scope_check%'
       AND s NOT LIKE '%market_conduct.run_conduct_analytics%',
    format('status=%s error=%s; no cross-domain OR-list retained', COALESCE(r->>'status','-'), COALESCE(e,'none')));

  -- CALCG-17 the internal engine primitives are not callable by anon/authenticated
  SELECT string_agg(f || '=' ||
           CASE WHEN has_function_privilege('authenticated', f, 'EXECUTE') THEN 'authenticated'
                WHEN has_function_privilege('anon', f, 'EXECUTE') THEN 'anon'
                ELSE 'internal' END, ', ')
    INTO s
    FROM unnest(ARRAY['public.supervisory_calc_compute(uuid)',
                      'public.supervisory_calc_compute_core(uuid)',
                      'public.supervisory_calc_materialise(uuid,text,uuid)',
                      'public.supervisory_calc_config_for(uuid)',
                      'public.supervisory_calc_as_of_for(uuid)',
                      'public.supervisory_calc_band_of(uuid,text,numeric)',
                      'public.supervisory_calculation_config_validate_core(uuid)',
                      'public.supervisory_calculation_config_score_problems(uuid)']) f;
  PERFORM pg_temp.gate('CALCG-17','internal calculation primitives are not directly executable',
    s NOT LIKE '%=authenticated%' AND s NOT LIKE '%=anon%'
    AND has_function_privilege('authenticated','public.supervisory_assessment_calculate(uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.supervisory_assessment_calculate(uuid)','EXECUTE'),
    s);

  -- CALCG-18 governed recalculation is coupled to exactly the supplied domain
  ok := false; ok2 := false; ok3 := false; e := NULL; e2 := NULL;
  IF _prudCfg IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_prudCfg,'role','authenticated')::text, true);
    BEGIN
      PERFORM public.supervisory_calculation_recalculate('AML_CFT','cross-domain attack matrix probe', NULL, NULL, true);
    EXCEPTION WHEN OTHERS THEN e := SQLERRM; ok := (SQLSTATE = '42501');
    END;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  IF _amlEdit IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_amlEdit,'role','authenticated')::text, true);
    BEGIN
      PERFORM public.supervisory_calculation_recalculate('PRUDENTIAL','cross-domain attack matrix probe', NULL, NULL, true);
    EXCEPTION WHEN OTHERS THEN e2 := SQLERRM; ok2 := (SQLSTATE = '42501');
    END;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  BEGIN
    PERFORM public.supervisory_calculation_recalculate('ZZ_NOT_A_DOMAIN','unknown domain probe text', NULL, NULL, true);
  EXCEPTION WHEN OTHERS THEN ok3 := (SQLERRM LIKE '%unknown_domain%');
  END;
  PERFORM pg_temp.gate('CALCG-18','cross-domain governed recalculation denied, unknown domain refused',
    _prudCfg IS NOT NULL AND ok AND _amlEdit IS NOT NULL AND ok2 AND ok3,
    format('PRUDENTIAL cfg -> AML_CFT: %s | AML officer -> PRUDENTIAL: %s | unknown domain refused: %s',
      COALESCE(e,'no denial'), COALESCE(e2,'no denial'), ok3));

  -- CALCG-19 a domain-authorised recalculation still succeeds (dry run, nothing written)
  ok := false; e := NULL;
  IF _sa IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_sa,'role','authenticated')::text, true);
    BEGIN
      r := public.supervisory_calculation_recalculate('AML_CFT','verifier dry-run recalculation probe', NULL, _ent, true);
      ok := (r->>'dry_run')::boolean AND r->>'module' = 'aml_supervision';
    EXCEPTION WHEN OTHERS THEN e := SQLERRM;
    END;
    PERFORM set_config('request.jwt.claims','',true);
  END IF;
  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='supervisory_calculation_recalculate';
  PERFORM pg_temp.gate('CALCG-19','domain-authorised governed recalculation succeeds',
    ok AND s LIKE '%supervisory_domain_module(_domain_code)%'
       AND s LIKE '%_module || ''.manage_config''%'
       AND s NOT LIKE '%''prudential_supervision.manage_config''%',
    format('module=%s considered=%s error=%s', COALESCE(r->>'module','-'),
      COALESCE(r->>'considered','-'), COALESCE(e,'none')));

  -- CALCG-20 the recommendation-policy label matches the implemented semantics
  ok := false;
  BEGIN
    UPDATE public.supervisory_calculation_config
       SET recommendation_policy = 'HIGHEST_MATERIAL_DIMENSION'
     WHERE id = (SELECT fx FROM calcg_fx WHERE k='v2');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  UPDATE public.supervisory_calculation_config
     SET recommendation_policy = 'HIGHEST_DIMENSION'
   WHERE id = (SELECT fx FROM calcg_fx WHERE k='v2');
  -- The recommendation engine itself must carry no materiality semantics. The
  -- governed materiality POLICY surface (supervisory_calculation_materiality_*)
  -- is a separate, authorised policy record and legitimately names materiality.
  SELECT string_agg(p.proname, ',') INTO s
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'supervisory_calc%'
     AND p.proname NOT LIKE '%materiality%'
     AND p.prosrc LIKE '%MATERIAL%';
  PERFORM pg_temp.gate('CALCG-20','recommendation-policy label matches implemented semantics',
    ok AND s IS NULL
    AND pg_get_constraintdef((SELECT oid FROM pg_constraint
        WHERE conname='supervisory_calculation_config_policy_chk')) LIKE '%HIGHEST_DIMENSION%'
    AND pg_get_constraintdef((SELECT oid FROM pg_constraint
        WHERE conname='supervisory_calculation_config_policy_chk')) NOT LIKE '%MATERIAL%',
    format('MATERIAL name refused=%s; engine functions still mentioning materiality: %s',
      ok, COALESCE(s,'none')));
  UPDATE public.supervisory_calculation_config
     SET recommendation_policy = 'WEIGHTED_SCORE'
   WHERE id = (SELECT fx FROM calcg_fx WHERE k='v2');
END $$;

SELECT id, result, name, detail FROM calcg_gate ORDER BY id;
SELECT count(*) FILTER (WHERE result='PASS') AS pass,
       count(*) FILTER (WHERE result='FAIL') AS fail FROM calcg_gate;

ROLLBACK;
