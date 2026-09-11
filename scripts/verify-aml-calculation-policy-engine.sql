-- =====================================================================
-- AML-06 — CALCULATION POLICY, SCORING & RESIDUAL-RISK ENGINE :
--          CERTIFICATION
-- =====================================================================
-- Gate families: POLICY, SCORE, FACTCALC, DIMCALC, INHERENT, CONTROL,
--                RESIDUAL, TRACE, OVERRIDE, LIFECYCLE, LEGACY, SEC.
--
-- Conventions (identical to the AML-01..AML-05 certifications):
--   * one transaction, ROLLBACK at the end — every AML06CERT fixture is
--     discarded, so no calculation policy value is left behind and no
--     regulator decision is fabricated;
--   * behavioural: gates CALL governed operations under real authenticated
--     personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML06CERT.
--
-- Personas (public.cert_certification_users):
--   Officer / maker    b8eaf680-fe66-4d49-b816-1c087f511235
--   Supervisor/checker 0b522724-adcb-48bf-b21d-175339479616
--   Outsider           411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

BEGIN;

CREATE TEMP TABLE c_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE c_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE c_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON c_id TO authenticated;
GRANT ALL ON c_n  TO authenticated;
GRANT ALL ON c_t  TO authenticated;

INSERT INTO c_id(k,v) VALUES
  ('regulator', '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('entity',    'aa220000-0000-4000-8000-000000000001'),
  ('officer',   'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',   '0b522724-adcb-48bf-b21d-175339479616'),
  ('outsider',  '411dd06d-648b-4f32-82cc-897902c0c0b6');

INSERT INTO c_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM c_id WHERE k='entity');

-- ---------------------------------------------------------------- census ----
INSERT INTO c_n(k,n) VALUES
  ('assessments',   (SELECT count(*) FROM public.supervisory_assessment)),
  ('responses',     (SELECT count(*) FROM public.supervisory_assessment_question_response)),
  ('cfg',           (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('cfg_band',      (SELECT count(*) FROM public.supervisory_calculation_band)),
  ('cfg_matrix',    (SELECT count(*) FROM public.supervisory_calculation_matrix_cell)),
  ('cfg_score',     (SELECT count(*) FROM public.supervisory_calculation_response_score)),
  ('cfg_qw',        (SELECT count(*) FROM public.supervisory_calculation_question_weight)),
  ('cfg_dw',        (SELECT count(*) FROM public.supervisory_calculation_dimension_weight)),
  ('cfg_fr',        (SELECT count(*) FROM public.supervisory_calculation_fact_rule)),
  ('cfg_mat',       (SELECT count(*) FROM public.supervisory_calculation_materiality_rule)),
  ('runs',          (SELECT count(*) FROM public.supervisory_assessment_calculation_run)),
  ('overrides',     (SELECT count(*) FROM public.supervisory_assessment_calculation_override)),
  ('facts',         (SELECT count(*) FROM public.supervisory_assessment_fact));

INSERT INTO c_t(k,t) VALUES
  ('assess_digest',(SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.methodology_id::text,'-'),'|' ORDER BY a.id))
                      FROM public.supervisory_assessment a)),
  ('risk_digest',  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
                      FROM public.entity_risk_state r));

-- -------------------------------------------------------------- fixtures ----
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', u
  FROM (VALUES ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
               ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) AS x(u),
       public.sec_roles r
 WHERE r.key = 'aml_head'
ON CONFLICT DO NOTHING;

INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
  FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='aml_head' AND m.key='aml_supervision' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;

INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT v FROM c_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- Fixture methodology (ACTIVE, sector + regulator scoped).
--
-- The fixture publishes BOTH vocabularies the calculation contract depends on:
--   * the inherent-risk scale, in `scoring_scale` (code / label / ordinal), which
--     is also the vocabulary residual ratings must come from;
--   * the control-effectiveness scale, in `definition->control_scale`, which is a
--     plain array of codes.
-- Every band code and matrix cell below uses only codes these two scales publish.
-- Both scales are synthetic AML06CERT certification content: they are rolled back
-- and are not approved operational supervisory policy.
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES (gen_random_uuid(), 'AML06CERT-METH', 'AML_CFT', 'AML06CERT calculation fixture', '1.0',
  'ACTIVE', (SELECT v FROM c_id WHERE k='sector'), (SELECT v FROM c_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML06CERT calculation fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4},
    {"code":"SEVERE","label":"Severe","ordinal":5}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO c_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML06CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT v FROM c_id WHERE k='meth'),'AML06CERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT v FROM c_id WHERE k='meth'),'AML06CERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL'),
  -- declared INHERENT by the methodology; the policy reassigns it to the control side
  ((SELECT v FROM c_id WHERE k='meth'),'AML06CERT_DIM_X','INHERENT_RISK','Reassigned fixture',100,3,true,'INHERENT'),
  -- excluded by the calculation policy
  ((SELECT v FROM c_id WHERE k='meth'),'AML06CERT_DIM_Z','INHERENT_RISK','Excluded fixture',100,4,true,'INHERENT');

INSERT INTO c_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML06CERT_DIM_I';
INSERT INTO c_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML06CERT_DIM_C';
INSERT INTO c_id(k,v) SELECT 'dim_x', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML06CERT_DIM_X';
INSERT INTO c_id(k,v) SELECT 'dim_z', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML06CERT_DIM_Z';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_i'),'AML06CERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_i'),'AML06CERT_Q_I2','I2',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],false,false,false,0,true,false,'CORE',true,2),
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_c'),'AML06CERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,3),
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_x'),'AML06CERT_Q_X1','X1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,4),
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_z'),'AML06CERT_Q_Z1','Z1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,5);

INSERT INTO public.supervisory_methodology_fact_requirement(
  methodology_id, fact_code, label, data_type, unit, numerator_basis, denominator_basis,
  is_required, auto_prefill_allowed, officer_edit_allowed, definition_status, description)
VALUES
  ((SELECT v FROM c_id WHERE k='meth'),'AML06CERT_F_RATIO','Fixture ratio','percentage','%',
   'Numerator basis','Denominator basis',false,true,true,'DEFINED','Ratio fact used by the fixture policy'),
  ((SELECT v FROM c_id WHERE k='meth'),'AML06CERT_F_ABSENT','Fixture absent fact','percentage','%',
   NULL,NULL,false,true,true,'DEFINED','Never recorded, exercises missing-value handling');

-- Fixture programme so the canonical creation path materialises the assessment.
INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('AML06CERT-PROGRAMMES','1.0','AML06CERT programme fixture','AML_CFT',
  (SELECT v FROM c_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
SELECT s.id,'AML06CERT_P','AML06CERT programme','PERIODIC',true,1,'TRAILING_DAYS',365,1,false,false,
  ARRAY['CORE','CONDITIONAL'],'{}'::text[],'{}'::text[]
  FROM public.supervisory_assessment_programme_set s WHERE s.code='AML06CERT-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
SELECT p.id,'PERIODIC','Periodic cycle',true,true,1
  FROM public.supervisory_assessment_programme p WHERE p.programme_code='AML06CERT_P';

-- The domain must publish an effective-date rule for a calculation to resolve.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML06CERT fixture rule, discarded on rollback');
  RESET ROLE;
  RAISE NOTICE 'FIXTURE: AML_CFT effective-date rule set for the fixture transaction only';
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM c_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='AML06CERT_P'),
    'PERIODIC', NULL, NULL, 'AML06CERT calculation certification');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
  IF (SELECT methodology_id FROM public.supervisory_assessment WHERE id=(SELECT v FROM c_id WHERE k='assessment'))
     <> (SELECT v FROM c_id WHERE k='meth') THEN
    RAISE EXCEPTION 'FIXTURE: the certification assessment did not bind the AML06CERT methodology';
  END IF;
  RAISE NOTICE 'FIXTURE: AML06CERT assessment created through the canonical programmed path';
END $$;

-- Recorded supervisory answers (fixture only).
CREATE OR REPLACE FUNCTION pg_temp.c_answer(_qcode text, _response text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _aid uuid := (SELECT v FROM c_id WHERE k='assessment'); _q public.supervisory_methodology_question;
BEGIN
  SELECT * INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id=(SELECT v FROM c_id WHERE k='meth') AND question_code=_qcode;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_response
              WHERE assessment_id=_aid AND question_code=_qcode) THEN
    UPDATE public.supervisory_assessment_question_response
       SET response=_response, methodology_dimension_id=_q.methodology_dimension_id,
           methodology_question_id=_q.id
     WHERE assessment_id=_aid AND question_code=_qcode;
  ELSE
    INSERT INTO public.supervisory_assessment_question_response(
      assessment_id, methodology_id, methodology_dimension_id, methodology_question_id,
      assessment_dimension_id, dimension_code, question_code, question_text, response)
    SELECT _aid, (SELECT v FROM c_id WHERE k='meth'), _q.methodology_dimension_id, _q.id,
           sad.id, md.dimension_code, _qcode, COALESCE(_q.prompt, _qcode), _response
      FROM public.supervisory_methodology_dimension md
      JOIN public.supervisory_assessment_dimension sad
        ON sad.assessment_id = _aid AND sad.methodology_dimension_id = md.id
     WHERE md.id = _q.methodology_dimension_id;
  END IF;
END $$;

SELECT pg_temp.c_answer('AML06CERT_Q_I1','NO');          -- score 100, policy weight 3
SELECT pg_temp.c_answer('AML06CERT_Q_I2','YES');         -- excluded by the policy
SELECT pg_temp.c_answer('AML06CERT_Q_C1','YES');         -- score 0
SELECT pg_temp.c_answer('AML06CERT_Q_X1','YES');         -- score 0, reassigned to control
SELECT pg_temp.c_answer('AML06CERT_Q_Z1','NO');          -- dimension excluded by the policy

-- Governed fact: 60% ratio with period and provenance.
INSERT INTO public.supervisory_assessment_fact(
  assessment_id, entity_id, methodology_id, fact_requirement_id, fact_code, data_type, unit,
  value_numeric, numerator, denominator, period_start, period_end, source_type, provenance, recorded_by)
SELECT (SELECT v FROM c_id WHERE k='assessment'), (SELECT v FROM c_id WHERE k='entity'),
       (SELECT v FROM c_id WHERE k='meth'), fr.id, 'AML06CERT_F_RATIO', 'percentage', '%',
       60, 60, 100, current_date - 90, current_date - 1, 'OFFICER_ENTERED',
       jsonb_build_object('origin','GOVERNED'), (SELECT v FROM c_id WHERE k='officer')
  FROM public.supervisory_methodology_fact_requirement fr
 WHERE fr.methodology_id=(SELECT v FROM c_id WHERE k='meth') AND fr.fact_code='AML06CERT_F_RATIO';

-- ============================ POLICY gates ============================
-- POLICY-01 — a draft calculation policy is created and parameterised only
--             through the governed operation.
DO $$
DECLARE cfg uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  cfg := public.supervisory_calculation_config_upsert((SELECT v FROM c_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN',
    'completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE',
    'evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE',
    'rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT',
    'recommendation_policy','WEIGHTED_SCORE'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('cfg', cfg);
  IF (SELECT status FROM public.supervisory_calculation_config WHERE id=cfg) <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL POLICY-01: a new calculation policy is not a draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_event
                  WHERE config_id=cfg AND event_type='PARAMETERS_SAVED') THEN
    RAISE EXCEPTION 'FAIL POLICY-01: the parameter save was not recorded as an event';
  END IF;
  RAISE NOTICE 'PASS POLICY-01: draft calculation policy created and parameterised through the governed operation';
END $$;

-- POLICY-02 — no screen may write a policy row directly.
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN INSERT INTO public.supervisory_calculation_question_weight(config_id, question_code)
        VALUES ((SELECT v FROM c_id WHERE k='cfg'),'X'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_calculation_dimension_weight(config_id, dimension_code, contributes_to)
        VALUES ((SELECT v FROM c_id WHERE k='cfg'),'X','INHERENT'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_calculation_fact_rule(config_id, fact_code, data_type, direction, missing_handling)
        VALUES ((SELECT v FROM c_id WHERE k='cfg'),'X','NUMERIC','HIGHER_IS_HIGHER_RISK','EXCLUDE');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_calculation_materiality_rule(
          config_id, parameter_code, comparator, threshold_value, adjustment_kind, rationale)
        VALUES ((SELECT v FROM c_id WHERE k='cfg'),'X','GTE',1,'NO_ADJUSTMENT','direct write attempt');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_assessment_calculation_run(
          assessment_id, run_seq, engine_version, status, inputs_hash, result_hash, event_reason)
        VALUES ((SELECT v FROM c_id WHERE k='assessment'), 999,'X','CALCULATED','h','h','forged');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_assessment_calculation_override(
          assessment_id, run_id, computed_result_hash, proposed_rating, rationale)
        VALUES ((SELECT v FROM c_id WHERE k='assessment'), gen_random_uuid(),'h','HIGH','forged override attempt');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 6 THEN RAISE EXCEPTION 'FAIL POLICY-02: only % of 6 direct writes were refused', refused; END IF;
  RAISE NOTICE 'PASS POLICY-02: every direct write to a calculation record is refused (6/6)';
END $$;

-- POLICY-03 — a persona without configuration authority cannot author policy.
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_dimension_weights_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_materiality_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 4 THEN RAISE EXCEPTION 'FAIL POLICY-03: only % of 4 unauthorised authoring calls were refused', refused; END IF;
  RAISE NOTICE 'PASS POLICY-03: policy authoring is refused without configuration authority (4/4)';
END $$;

-- POLICY-04 — the complete policy is authored through the governed setters.
DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

  PERFORM public.supervisory_calculation_response_scores_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('response_code','YES','score',0,'sort_order',1),
    jsonb_build_object('response_code','PARTIALLY','score',50,'sort_order',2),
    jsonb_build_object('response_code','NO','score',100,'sort_order',3),
    jsonb_build_object('response_code','NOT_APPLICABLE','excluded_from_denominator',true,'sort_order',4)));

  -- Bands must cover EVERY code the fixture scales publish, start at 0, be
  -- contiguous and reach 100. Inherent bands therefore carry all five risk codes
  -- in ordinal order; control bands carry both control codes.
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM c_id WHERE k='cfg'),'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',20,'sort_order',1),
    jsonb_build_object('band_code','MODERATE','min_score',20,'max_score',40,'sort_order',2),
    jsonb_build_object('band_code','MEDIUM_HIGH','min_score',40,'max_score',60,'sort_order',3),
    jsonb_build_object('band_code','HIGH','min_score',60,'max_score',80,'sort_order',4),
    jsonb_build_object('band_code','SEVERE','min_score',80,'max_score',100,'sort_order',5)));
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM c_id WHERE k='cfg'),'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','WEAK','min_score',0,'max_score',50,'sort_order',1),
    jsonb_build_object('band_code','STRONG','min_score',50,'max_score',100,'sort_order',2)));

  -- The residual matrix must publish every inherent x control combination
  -- (5 x 2 = 10 cells); each residual rating is a code from the inherent scale.
  PERFORM public.supervisory_calculation_matrix_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('inherent_band','LOW','control_band','WEAK','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','LOW','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MODERATE','control_band','WEAK','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','MODERATE','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','STRONG','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','HIGH','control_band','STRONG','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','SEVERE','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','SEVERE','control_band','STRONG','residual_rating','HIGH')));

  n := public.supervisory_calculation_question_weights_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('question_code','AML06CERT_Q_I1','participation','SCORED','weight',3),
    jsonb_build_object('question_code','AML06CERT_Q_I2','participation','EXCLUDED'),
    jsonb_build_object('question_code','AML06CERT_Q_C1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML06CERT_Q_X1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML06CERT_Q_Z1','participation','SCORED','weight',1)));
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL POLICY-04: % question weighting rows saved', n; END IF;

  n := public.supervisory_calculation_dimension_weights_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('dimension_code','AML06CERT_DIM_I','contributes_to','INHERENT','weight',2),
    jsonb_build_object('dimension_code','AML06CERT_DIM_C','contributes_to','CONTROL','weight',1),
    jsonb_build_object('dimension_code','AML06CERT_DIM_X','contributes_to','CONTROL','weight',1),
    jsonb_build_object('dimension_code','AML06CERT_DIM_Z','contributes_to','EXCLUDED')));
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL POLICY-04: % dimension weighting rows saved', n; END IF;

  n := public.supervisory_calculation_fact_rules_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML06CERT_F_RATIO','data_type','PERCENTAGE','unit','%',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML06CERT_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',50,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',50,'score',100,'sort_order',2)))));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL POLICY-04: % fact rule rows saved', n; END IF;

  n := public.supervisory_calculation_materiality_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('parameter_code','AML06CERT_MATERIAL','fact_code','AML06CERT_F_RATIO',
      'comparator','GTE','threshold_value',95,'unit','%','adjustment_kind','FLOOR_AT_BAND',
      'adjustment_band','SEVERE','rationale','AML06CERT fixture materiality rule')));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL POLICY-04: % materiality rows saved', n; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS POLICY-04: response scoring, bands, matrix, weights, fact rules and materiality authored through governed operations';
END $$;

-- POLICY-05 — an incomplete policy is reported and cannot be submitted.
DO $$
DECLARE vres jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  -- remove one question decision: coverage is then incomplete
  PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('question_code','AML06CERT_Q_I1','participation','SCORED','weight',3)));
  vres := public.supervisory_calculation_config_validate((SELECT v FROM c_id WHERE k='cfg'));
  IF (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL POLICY-05: validation accepted a policy that does not decide every question';
  END IF;
  IF NOT (vres->'problems')::text ILIKE '%participation decision%' THEN
    RAISE EXCEPTION 'FAIL POLICY-05: validation does not name the missing participation decisions: %', vres->'problems';
  END IF;
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM c_id WHERE k='cfg'),'REVIEW',
      'AML06CERT submission attempt on an incomplete policy');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL POLICY-05: an incomplete policy was allowed into review'; END IF;
  RAISE NOTICE 'PASS POLICY-05: an incomplete calculation policy is reported and refused for submission';
END $$;

-- POLICY-06 — a complete policy validates and reaches ACTIVE under maker/checker.
DO $$
DECLARE vres jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM c_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('question_code','AML06CERT_Q_I1','participation','SCORED','weight',3),
    jsonb_build_object('question_code','AML06CERT_Q_I2','participation','EXCLUDED'),
    jsonb_build_object('question_code','AML06CERT_Q_C1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML06CERT_Q_X1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML06CERT_Q_Z1','participation','SCORED','weight',1)));
  vres := public.supervisory_calculation_config_validate((SELECT v FROM c_id WHERE k='cfg'));
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL POLICY-06: a complete policy still reports problems: %', vres->'problems';
  END IF;
  PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM c_id WHERE k='cfg'),'REVIEW',
    'AML06CERT complete policy submitted for approval');
  -- the maker may not approve their own submission
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM c_id WHERE k='cfg'),'APPROVED',
      'AML06CERT self approval attempt');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL POLICY-06: the author was allowed to approve their own policy'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM c_id WHERE k='cfg'),'APPROVED',
    'AML06CERT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM c_id WHERE k='cfg'),'ACTIVE',
    'AML06CERT policy activated by the checker');
  RESET ROLE;
  IF (SELECT status FROM public.supervisory_calculation_config WHERE id=(SELECT v FROM c_id WHERE k='cfg')) <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL POLICY-06: the approved policy is not in force';
  END IF;
  RAISE NOTICE 'PASS POLICY-06: a complete policy validates and reaches force under maker/checker separation';
END $$;

-- POLICY-07 — an in-force policy can no longer be edited.
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_materiality_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_dimension_weights_set((SELECT v FROM c_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 4 THEN RAISE EXCEPTION 'FAIL POLICY-07: only % of 4 edits to an in-force policy were refused', refused; END IF;
  RAISE NOTICE 'PASS POLICY-07: an in-force calculation policy is immutable (4/4 edits refused)';
END $$;

-- POLICY-08 — the policy handed to the engine carries every authored section.
DO $$
DECLARE p jsonb;
BEGIN
  p := public.supervisory_calc_policy_from_config((SELECT v FROM c_id WHERE k='cfg'));
  IF jsonb_array_length(p->'question_weights') <> 5 THEN RAISE EXCEPTION 'FAIL POLICY-08: question weights missing'; END IF;
  IF jsonb_array_length(p->'dimension_weights') <> 4 THEN RAISE EXCEPTION 'FAIL POLICY-08: dimension weights missing'; END IF;
  IF jsonb_array_length(p->'fact_rules') <> 1 THEN RAISE EXCEPTION 'FAIL POLICY-08: fact rules missing'; END IF;
  IF jsonb_array_length(p->'materiality') <> 1 THEN RAISE EXCEPTION 'FAIL POLICY-08: materiality rules missing'; END IF;
  IF p->>'dimension_weight_mode' <> 'POLICY' THEN RAISE EXCEPTION 'FAIL POLICY-08: policy weighting not signalled'; END IF;
  IF jsonb_array_length(p->'fact_rules'->0->'thresholds') <> 2 THEN RAISE EXCEPTION 'FAIL POLICY-08: fact thresholds missing'; END IF;
  RAISE NOTICE 'PASS POLICY-08: the engine receives response scoring, weights, fact rules, thresholds and materiality';
END $$;

-- POLICY-09 — the rating vocabulary contract is enforced, not assumed.
--   A deliberately invalid secondary fixture proves that:
--     (a) an inherent band code the methodology does not publish is refused;
--     (b) a control band code the methodology does not publish is refused;
--     (c) a methodology that publishes no control-effectiveness scale cannot validate;
--     (d) incomplete residual-matrix coverage is refused.
--   The valid AML06CERT policy above is untouched and continues through the
--   remaining gates.
DO $$
DECLARE bad_meth uuid; bad_cfg uuid; vres jsonb; probs text; refused boolean;
BEGIN
  -- (c) a methodology with a risk scale but NO control scale
  INSERT INTO public.supervisory_methodology(
    id, code, domain_code, name, version, status, sector_id, regulator_id,
    effective_from, origin, title, scoring_scale, definition)
  VALUES (gen_random_uuid(),'AML06CERT-METH-NOCTRL','AML_CFT','AML06CERT no-control-scale fixture','1.0',
    'ACTIVE',(SELECT v FROM c_id WHERE k='sector'),(SELECT v FROM c_id WHERE k='regulator'),
    current_date - 1,'REGULATOR_AUTHORED','AML06CERT no-control-scale fixture',
    '[{"code":"LOW","label":"Low","ordinal":1},{"code":"HIGH","label":"High","ordinal":2}]'::jsonb,
    '{}'::jsonb)
  RETURNING id INTO bad_meth;
  INSERT INTO c_id(k,v) VALUES ('bad_meth', bad_meth);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  bad_cfg := public.supervisory_calculation_config_upsert(bad_meth, jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT','recommendation_policy','WEIGHTED_SCORE'));
  INSERT INTO c_id(k,v) VALUES ('bad_cfg', bad_cfg);

  -- (a) an inherent band code outside the published risk scale
  PERFORM public.supervisory_calculation_bands_set(bad_cfg,'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',50,'sort_order',1),
    jsonb_build_object('band_code','AML06CERT_NOT_A_RATING','min_score',50,'max_score',100,'sort_order',2)));
  -- (b) a control band code, on a methodology publishing no control scale at all
  PERFORM public.supervisory_calculation_bands_set(bad_cfg,'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','AML06CERT_NOT_A_CONTROL_GRADE','min_score',0,'max_score',100,'sort_order',1)));
  -- (d) a single matrix cell, far short of full coverage
  PERFORM public.supervisory_calculation_matrix_set(bad_cfg, jsonb_build_array(
    jsonb_build_object('inherent_band','LOW','control_band','AML06CERT_NOT_A_CONTROL_GRADE','residual_rating','LOW')));
  RESET ROLE;

  vres := public.supervisory_calculation_config_validate(bad_cfg);
  probs := vres->>'problems';
  IF (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL POLICY-09: an invalid vocabulary policy validated cleanly';
  END IF;
  IF probs NOT LIKE '%inherent bands use a code outside the published vocabulary%' THEN
    RAISE EXCEPTION 'FAIL POLICY-09(a): an unknown inherent rating code was not refused: %', probs; END IF;
  IF probs NOT LIKE '%no control effectiveness scale%' THEN
    RAISE EXCEPTION 'FAIL POLICY-09(c): a methodology with no control scale still validated: %', probs; END IF;
  -- Residual-matrix coverage cannot be judged at all on this methodology: with no
  -- published control vocabulary there is no complete grid to compare against, so
  -- the validator correctly reports the missing scale first. Matrix coverage is
  -- certified in POLICY-09C, on the methodology that publishes both scales.

  -- the invalid policy can never be submitted for approval
  refused := false;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle(bad_cfg,'REVIEW','AML06CERT invalid vocabulary submission');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL POLICY-09: a policy using unpublished rating codes was allowed into review'; END IF;

  RAISE NOTICE 'PASS POLICY-09: an unpublished inherent rating code and a methodology publishing no control-effectiveness scale are both refused, and the policy cannot enter review';
END $$;

-- POLICY-09B — a control band code outside a PUBLISHED control scale is refused
--              (the valid fixture methodology publishes WEAK/STRONG).
DO $$
DECLARE cfg2 uuid; vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  cfg2 := public.supervisory_calculation_config_upsert((SELECT v FROM c_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date + 30)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT','recommendation_policy','WEIGHTED_SCORE'));
  PERFORM public.supervisory_calculation_bands_set(cfg2,'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','ADEQUATE','min_score',0,'max_score',100,'sort_order',1)));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('cfg2', cfg2);
  vres := public.supervisory_calculation_config_validate(cfg2);
  IF (vres->>'problems') NOT LIKE '%control bands use a code outside the published vocabulary%' THEN
    RAISE EXCEPTION 'FAIL POLICY-09B: an unknown control-effectiveness code was accepted: %', vres->'problems';
  END IF;
  RAISE NOTICE 'PASS POLICY-09B: a control band code the methodology does not publish is refused';
END $$;

-- POLICY-09C — incomplete residual-matrix coverage is refused on a methodology
--              that publishes both vocabularies (5 risk x 2 control = 10 cells).
DO $$
DECLARE vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM c_id WHERE k='cfg2'),'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',20,'sort_order',1),
    jsonb_build_object('band_code','MODERATE','min_score',20,'max_score',40,'sort_order',2),
    jsonb_build_object('band_code','MEDIUM_HIGH','min_score',40,'max_score',60,'sort_order',3),
    jsonb_build_object('band_code','HIGH','min_score',60,'max_score',80,'sort_order',4),
    jsonb_build_object('band_code','SEVERE','min_score',80,'max_score',100,'sort_order',5)));
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM c_id WHERE k='cfg2'),'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','WEAK','min_score',0,'max_score',50,'sort_order',1),
    jsonb_build_object('band_code','STRONG','min_score',50,'max_score',100,'sort_order',2)));
  -- only 2 of the 10 required cells
  PERFORM public.supervisory_calculation_matrix_set((SELECT v FROM c_id WHERE k='cfg2'), jsonb_build_array(
    jsonb_build_object('inherent_band','LOW','control_band','WEAK','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','LOW','control_band','STRONG','residual_rating','LOW')));
  RESET ROLE;
  vres := public.supervisory_calculation_config_validate((SELECT v FROM c_id WHERE k='cfg2'));
  IF (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL POLICY-09C: a partial residual matrix validated cleanly'; END IF;
  IF (vres->>'problems') NOT LIKE '%residual matrix%' THEN
    RAISE EXCEPTION 'FAIL POLICY-09C: incomplete residual-matrix coverage was not refused: %', vres->'problems';
  END IF;
  RAISE NOTICE 'PASS POLICY-09C: a residual matrix that does not cover every published inherent x control combination is refused';
END $$;



-- ===================== SCORE / DIMCALC / bands ========================
DO $$
DECLARE r jsonb;
BEGIN
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  INSERT INTO c_t(k,t) VALUES ('base', r::text);
  IF r->>'status' <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FIXTURE: the fixture assessment is not calculable: % / %', r->>'reason_code', r->>'reason';
  END IF;
  RAISE NOTICE 'FIXTURE: baseline calculation produced % (inherent % / control %)',
    r->>'recommended_rating', r->>'inherent_band', r->>'control_band';
END $$;

-- SCORE-01 — response scores and question weights drive the dimension score.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  -- Q_I1 = NO (100, weight 3) and the fact scores 100 at weight 1 => 100
  IF (d->>'score')::numeric <> 100 THEN
    RAISE EXCEPTION 'FAIL SCORE-01: inherent dimension scored % instead of 100', d->>'score';
  END IF;
  IF (d->>'answered')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL SCORE-01: % questions counted, the excluded question must not count', d->>'answered';
  END IF;
  RAISE NOTICE 'PASS SCORE-01: the dimension score follows the configured response scores and question weights';
END $$;

-- SCORE-02 — a question the policy excludes is traced as excluded and ignored.
DO $$
DECLARE r jsonb; q jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  SELECT x INTO q FROM jsonb_array_elements(r->'dimensions') d,
         jsonb_array_elements(d->'questions') x WHERE x->>'question_code'='AML06CERT_Q_I2';
  IF q IS NULL OR q->>'excluded_by' <> 'CALCULATION_POLICY' THEN
    RAISE EXCEPTION 'FAIL SCORE-02: the excluded question is not traced as excluded by policy: %', q;
  END IF;
  RAISE NOTICE 'PASS SCORE-02: a question excluded by the policy is traced and left out of the score';
END $$;

-- SCORE-03 — changing a response moves the result deterministically.
DO $$
DECLARE r1 jsonb; r2 jsonb;
BEGIN
  r1 := (SELECT t FROM c_t WHERE k='base')::jsonb;
  PERFORM pg_temp.c_answer('AML06CERT_Q_C1','NO');
  r2 := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  IF r2->>'control_score' = r1->>'control_score' THEN
    RAISE EXCEPTION 'FAIL SCORE-03: the control score did not move when a control answer changed';
  END IF;
  PERFORM pg_temp.c_answer('AML06CERT_Q_C1','YES');
  r2 := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  IF r2->>'control_score' <> r1->>'control_score' THEN
    RAISE EXCEPTION 'FAIL SCORE-03: restoring the answer did not restore the score';
  END IF;
  RAISE NOTICE 'PASS SCORE-03: the calculated result moves with the recorded answers and is reproducible';
END $$;

-- SCORE-04 — the same inputs produce the same result, twice.
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  a := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  b := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  IF md5(a::text) <> md5(b::text) THEN RAISE EXCEPTION 'FAIL SCORE-04: two runs on identical inputs disagree'; END IF;
  RAISE NOTICE 'PASS SCORE-04: the engine is deterministic on identical inputs';
END $$;

-- DIMCALC-01 — the policy decides which side a dimension contributes to.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_X';
  IF d->>'dimension_kind' <> 'INHERENT' OR d->>'contributes_to' <> 'CONTROL' THEN
    RAISE EXCEPTION 'FAIL DIMCALC-01: the policy did not reassign the dimension to the control side: %', d;
  END IF;
  RAISE NOTICE 'PASS DIMCALC-01: dimension contribution follows the approved policy, not the methodology default';
END $$;

-- DIMCALC-02 — a dimension the policy excludes produces no score.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_Z';
  IF d->>'status' <> 'NOT_APPLICABLE' OR d->>'reason_code' <> 'EXCLUDED_BY_CALCULATION_POLICY' THEN
    RAISE EXCEPTION 'FAIL DIMCALC-02: the excluded dimension was not held out: %', d;
  END IF;
  IF d ? 'score' THEN RAISE EXCEPTION 'FAIL DIMCALC-02: an excluded dimension still carries a score'; END IF;
  RAISE NOTICE 'PASS DIMCALC-02: a dimension excluded by policy carries no score and says why';
END $$;

-- DIMCALC-03 — dimension weights are used in aggregation and traced.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  IF (d->>'weight')::numeric <> 2 THEN
    RAISE EXCEPTION 'FAIL DIMCALC-03: the policy weight was not applied (%)', d->>'weight';
  END IF;
  IF r->'parameters'->>'dimension_weight_mode' <> 'POLICY' THEN
    RAISE EXCEPTION 'FAIL DIMCALC-03: the trace does not record policy weighting';
  END IF;
  RAISE NOTICE 'PASS DIMCALC-03: dimension weights come from the approved policy and are traced';
END $$;

-- INHERENT-01 / CONTROL-01 / RESIDUAL-01 — sides, bands and matrix cell.
DO $$
DECLARE r jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  -- inherent score 100 falls in the top published band of the fixture scale
  IF r->>'inherent_band' <> 'SEVERE' THEN
    RAISE EXCEPTION 'FAIL INHERENT-01: inherent band % with score %', r->>'inherent_band', r->>'inherent_score'; END IF;
  RAISE NOTICE 'PASS INHERENT-01: the inherent side aggregates to score % and band %', r->>'inherent_score', r->>'inherent_band';
  IF r->>'control_band' <> 'WEAK' THEN
    RAISE EXCEPTION 'FAIL CONTROL-01: control band % with score %', r->>'control_band', r->>'control_score'; END IF;
  RAISE NOTICE 'PASS CONTROL-01: the control side aggregates to score % and band %', r->>'control_score', r->>'control_band';
  IF r->>'residual_rating' <> 'HIGH' THEN
    RAISE EXCEPTION 'FAIL RESIDUAL-01: residual % for inherent %/control %',
      r->>'residual_rating', r->>'inherent_band', r->>'control_band'; END IF;
  RAISE NOTICE 'PASS RESIDUAL-01: the residual rating comes from the approved matrix cell';
  IF r->>'recommended_rating' IS NULL THEN RAISE EXCEPTION 'FAIL RESIDUAL-01: no recommendation produced'; END IF;
END $$;

-- ============================ FACTCALC gates ==========================
-- FACTCALC-01 — a governed fact is scored through its threshold band.
DO $$
DECLARE r jsonb; f jsonb;
BEGIN
  r := (SELECT t FROM c_t WHERE k='base')::jsonb;
  SELECT x INTO f FROM jsonb_array_elements(r->'dimensions') d, jsonb_array_elements(d->'facts') x
   WHERE x->>'fact_code'='AML06CERT_F_RATIO';
  IF f IS NULL OR f->>'outcome' <> 'SCORED' THEN RAISE EXCEPTION 'FAIL FACTCALC-01: the fact was not scored: %', f; END IF;
  IF f->>'band' <> 'HIGHRISK' OR (f->>'score')::numeric <> 100 OR (f->>'value')::numeric <> 60 THEN
    RAISE EXCEPTION 'FAIL FACTCALC-01: the fact was scored outside the published threshold: %', f;
  END IF;
  IF f->>'period_end' IS NULL THEN RAISE EXCEPTION 'FAIL FACTCALC-01: the trace omits the fact period'; END IF;
  RAISE NOTICE 'PASS FACTCALC-01: a governed fact is transformed through its published threshold band and traced';
END $$;

-- FACTCALC-02 — a unit mismatch refuses the dimension.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  UPDATE public.supervisory_assessment_fact SET unit='bps'
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  IF d->>'reason_code' <> 'FACT_UNIT_MISMATCH' THEN
    RAISE EXCEPTION 'FAIL FACTCALC-02: a unit mismatch did not refuse the dimension: %', d->>'reason_code'; END IF;
  UPDATE public.supervisory_assessment_fact SET unit='%'
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  RAISE NOTICE 'PASS FACTCALC-02: a fact recorded in the wrong unit is refused, not converted or guessed';
END $$;

-- FACTCALC-03 — a missing reporting period refuses the dimension.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  UPDATE public.supervisory_assessment_fact SET period_end=NULL
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  IF d->>'reason_code' <> 'FACT_PERIOD_MISSING' THEN
    RAISE EXCEPTION 'FAIL FACTCALC-03: a fact with no period was still used: %', d->>'reason_code'; END IF;
  UPDATE public.supervisory_assessment_fact SET period_end=current_date - 1
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  RAISE NOTICE 'PASS FACTCALC-03: a fact with no reporting period cannot enter the calculation';
END $$;

-- FACTCALC-04 — a ratio without numerator and denominator is refused.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  UPDATE public.supervisory_assessment_fact SET denominator=NULL
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  IF d->>'reason_code' <> 'FACT_PROVENANCE_MISSING' THEN
    RAISE EXCEPTION 'FAIL FACTCALC-04: an untraceable ratio was still used: %', d->>'reason_code'; END IF;
  UPDATE public.supervisory_assessment_fact SET denominator=100
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  RAISE NOTICE 'PASS FACTCALC-04: a ratio the officer cannot trace to its parts is refused';
END $$;

-- FACTCALC-05 — a value outside every threshold band is refused, never defaulted.
DO $$
DECLARE r jsonb; d jsonb;
BEGIN
  UPDATE public.supervisory_assessment_fact SET value_numeric=-5, numerator=-5
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  IF d->>'reason_code' <> 'FACT_NO_THRESHOLD' THEN
    RAISE EXCEPTION 'FAIL FACTCALC-05: an uncovered value produced a score: %', d->>'reason_code'; END IF;
  UPDATE public.supervisory_assessment_fact SET value_numeric=60, numerator=60
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  RAISE NOTICE 'PASS FACTCALC-05: a value the policy does not band is refused instead of scored';
END $$;

-- FACTCALC-06 — a missing fact is handled exactly as the policy states.
DO $$
DECLARE r jsonb; d jsonb; fid uuid;
BEGIN
  SELECT id INTO fid FROM public.supervisory_assessment_fact
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  DELETE FROM public.supervisory_assessment_fact WHERE id=fid;
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO d FROM jsonb_array_elements(r->'dimensions') x WHERE x->>'dimension_code'='AML06CERT_DIM_I';
  IF d->>'reason_code' <> 'FACT_UNAVAILABLE' THEN
    RAISE EXCEPTION 'FAIL FACTCALC-06: a missing required fact did not refuse the dimension: %', d->>'reason_code'; END IF;
  IF r->>'status' = 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL FACTCALC-06: the assessment still produced a recommendation without the fact'; END IF;
  INSERT INTO public.supervisory_assessment_fact(
    assessment_id, entity_id, methodology_id, fact_requirement_id, fact_code, data_type, unit,
    value_numeric, numerator, denominator, period_start, period_end, source_type, provenance, recorded_by)
  SELECT (SELECT v FROM c_id WHERE k='assessment'), (SELECT v FROM c_id WHERE k='entity'),
         (SELECT v FROM c_id WHERE k='meth'), fr.id, 'AML06CERT_F_RATIO','percentage','%',
         60, 60, 100, current_date - 90, current_date - 1, 'OFFICER_ENTERED',
         jsonb_build_object('origin','GOVERNED'), (SELECT v FROM c_id WHERE k='officer')
    FROM public.supervisory_methodology_fact_requirement fr
   WHERE fr.methodology_id=(SELECT v FROM c_id WHERE k='meth') AND fr.fact_code='AML06CERT_F_RATIO';
  RAISE NOTICE 'PASS FACTCALC-06: a fact the policy requires is never substituted with a default';
END $$;

-- RESIDUAL-02 — materiality can floor the recommendation, and says so.
DO $$
DECLARE r jsonb; m jsonb;
BEGIN
  UPDATE public.supervisory_assessment_fact SET value_numeric=99, numerator=99
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO m FROM jsonb_array_elements(r->'materiality') x WHERE x->>'parameter_code'='AML06CERT_MATERIAL';
  IF m->>'outcome' <> 'APPLIED' OR r->>'recommended_rating' <> 'SEVERE' THEN
    RAISE EXCEPTION 'FAIL RESIDUAL-02: the materiality floor was not applied: % / %', m, r->>'recommended_rating';
  END IF;
  UPDATE public.supervisory_assessment_fact SET value_numeric=60, numerator=60
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') AND fact_code='AML06CERT_F_RATIO';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO m FROM jsonb_array_elements(r->'materiality') x WHERE x->>'parameter_code'='AML06CERT_MATERIAL';
  IF m->>'outcome' <> 'NOT_APPLIED' OR m->>'reason_code' <> 'THRESHOLD_NOT_MET' THEN
    RAISE EXCEPTION 'FAIL RESIDUAL-02: the materiality rule fired below its threshold: %', m;
  END IF;
  RAISE NOTICE 'PASS RESIDUAL-02: a materiality rule floors the recommendation only when its threshold is met, and is traced';
END $$;

-- RESIDUAL-03 — no matrix cell means no residual rating.
DO $$
DECLARE r jsonb;
BEGIN
  DELETE FROM public.supervisory_calculation_matrix_cell
   WHERE config_id=(SELECT v FROM c_id WHERE k='cfg') AND inherent_band='SEVERE' AND control_band='WEAK';
  r := public.supervisory_calc_compute((SELECT v FROM c_id WHERE k='assessment'));
  IF r->>'status' <> 'NOT_CALCULABLE' OR r->>'reason_code' <> 'NO_MATRIX_CELL' THEN
    RAISE EXCEPTION 'FAIL RESIDUAL-03: a missing matrix cell produced % / %', r->>'status', r->>'reason_code';
  END IF;
  INSERT INTO public.supervisory_calculation_matrix_cell(config_id, inherent_band, control_band, residual_rating)
  VALUES ((SELECT v FROM c_id WHERE k='cfg'),'SEVERE','WEAK','HIGH');
  RAISE NOTICE 'PASS RESIDUAL-03: without a published matrix cell the engine refuses instead of inventing a rating';
END $$;

-- ============================== TRACE gates ===========================
-- TRACE-01 — a run is recorded with its inputs, policy and hashes.
DO $$
DECLARE res jsonb; run public.supervisory_assessment_calculation_run;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT v FROM c_id WHERE k='assessment'),
           'AML06CERT_CERTIFICATION');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('run1', (res->>'run_id')::uuid);
  SELECT * INTO run FROM public.supervisory_assessment_calculation_run WHERE id=(res->>'run_id')::uuid;
  IF run.run_seq <> 1 THEN RAISE EXCEPTION 'FAIL TRACE-01: run numbering started at %', run.run_seq; END IF;
  IF run.status <> 'CALCULATED' OR run.recommended_rating IS NULL THEN
    RAISE EXCEPTION 'FAIL TRACE-01: the recorded run carries no calculated result (%)', run.reason_code; END IF;
  IF run.config_id <> (SELECT v FROM c_id WHERE k='cfg') THEN
    RAISE EXCEPTION 'FAIL TRACE-01: the run does not name the policy in force'; END IF;
  IF jsonb_array_length(run.inputs->'responses') = 0 OR jsonb_array_length(run.inputs->'facts') = 0 THEN
    RAISE EXCEPTION 'FAIL TRACE-01: the run does not snapshot the inputs it read'; END IF;
  IF run.policy_snapshot->>'source' IS NULL OR run.inputs_hash IS NULL OR run.result_hash IS NULL THEN
    RAISE EXCEPTION 'FAIL TRACE-01: the run does not snapshot the policy or its hashes'; END IF;
  IF run.engine_version IS NULL OR run.as_of IS NULL THEN
    RAISE EXCEPTION 'FAIL TRACE-01: the run records neither engine version nor resolved date'; END IF;
  RAISE NOTICE 'PASS TRACE-01: a calculation run records inputs, policy, result, hashes, engine version and date';
END $$;

-- TRACE-02 — a recorded run can never be changed or removed.
DO $$
DECLARE refused int := 0;
BEGIN
  BEGIN UPDATE public.supervisory_assessment_calculation_run SET recommended_rating='LOW'
         WHERE id=(SELECT v FROM c_id WHERE k='run1'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_calculation_run
         WHERE id=(SELECT v FROM c_id WHERE k='run1'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  IF refused < 2 THEN RAISE EXCEPTION 'FAIL TRACE-02: a recorded run was mutable (% of 2 refused)', refused; END IF;
  RAISE NOTICE 'PASS TRACE-02: a recorded calculation run is append-only (update and delete refused)';
END $$;

-- TRACE-03 — the trace explains the result question by question and fact by fact.
DO $$
DECLARE t jsonb;
BEGIN
  SELECT trace INTO t FROM public.supervisory_assessment_calculation_run WHERE id=(SELECT v FROM c_id WHERE k='run1');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'dimensions') d,
                      jsonb_array_elements(d->'questions') q WHERE q ? 'score') THEN
    RAISE EXCEPTION 'FAIL TRACE-03: the trace carries no per-question scoring'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'dimensions') d,
                      jsonb_array_elements(d->'facts') f WHERE f ? 'band') THEN
    RAISE EXCEPTION 'FAIL TRACE-03: the trace carries no per-fact band decision'; END IF;
  IF t->'parameters' IS NULL OR t->'materiality' IS NULL THEN
    RAISE EXCEPTION 'FAIL TRACE-03: the trace omits the parameters or the materiality decisions'; END IF;
  RAISE NOTICE 'PASS TRACE-03: the trace explains every question, fact, parameter and materiality decision';
END $$;

-- TRACE-04 — a later run never overwrites an earlier one.
DO $$
DECLARE res jsonb; n int;
BEGIN
  PERFORM pg_temp.c_answer('AML06CERT_Q_C1','NO');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT v FROM c_id WHERE k='assessment'),
           'AML06CERT_SECOND_RUN');
  RESET ROLE;
  PERFORM pg_temp.c_answer('AML06CERT_Q_C1','YES');
  SELECT count(*) INTO n FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL TRACE-04: % run(s) recorded instead of 2', n; END IF;
  IF (SELECT result_hash FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT v FROM c_id WHERE k='run1'))
     = (SELECT result_hash FROM public.supervisory_assessment_calculation_run WHERE id=(res->>'run_id')::uuid) THEN
    RAISE EXCEPTION 'FAIL TRACE-04: the second run reproduced the first despite changed answers'; END IF;
  RAISE NOTICE 'PASS TRACE-04: each calculation is a new numbered run and earlier runs stay readable';
END $$;

-- ============================ OVERRIDE gates ==========================
-- OVERRIDE-01 — a reason of substance is required.
DO $$
DECLARE refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_override_propose(
          (SELECT v FROM c_id WHERE k='assessment'),'SEVERE','short');
        EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-01: an override with no written reason was accepted'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-01: an override without a written supervisory reason is refused';
END $$;

-- OVERRIDE-02 — the proposed rating must be on the methodology scale.
DO $$
DECLARE refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_override_propose(
          (SELECT v FROM c_id WHERE k='assessment'),'CATASTROPHIC',
          'AML06CERT attempt to use a rating that is not published');
        EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-02: a rating outside the published scale was accepted'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-02: only a rating on the methodology scale may be proposed';
END $$;

-- OVERRIDE-03 — an override identical to the calculated result is refused.
DO $$
DECLARE refused boolean := false; rec text;
BEGIN
  SELECT recommended_rating INTO rec FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') ORDER BY run_seq DESC LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_override_propose(
          (SELECT v FROM c_id WHERE k='assessment'), rec,
          'AML06CERT override equal to the calculated recommendation');
        EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-03: an override that changes nothing was recorded'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-03: an override that equals the calculated result is refused';
END $$;

-- OVERRIDE-04 — a valid proposal preserves the calculated result.
DO $$
DECLARE oid uuid; o public.supervisory_assessment_calculation_override; run public.supervisory_assessment_calculation_run;
BEGIN
  SELECT * INTO run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment') ORDER BY run_seq DESC LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  oid := public.supervisory_calculation_override_propose((SELECT v FROM c_id WHERE k='assessment'),'SEVERE',
    'AML06CERT supervisory judgement differs from the calculated recommendation');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('override', oid);
  SELECT * INTO o FROM public.supervisory_assessment_calculation_override WHERE id=oid;
  IF o.status <> 'PENDING_APPROVAL' THEN RAISE EXCEPTION 'FAIL OVERRIDE-04: the override did not await a decision'; END IF;
  IF o.computed_recommended_rating <> run.recommended_rating OR o.computed_result_hash <> run.result_hash THEN
    RAISE EXCEPTION 'FAIL OVERRIDE-04: the calculated result was not preserved on the override'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-04: an override preserves the calculated result and awaits a decision';
END $$;

-- OVERRIDE-05 — a second proposal cannot queue behind the first.
DO $$
DECLARE refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_override_propose(
          (SELECT v FROM c_id WHERE k='assessment'),'MODERATE',
          'AML06CERT second competing override proposal');
        EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-05: two overrides were left awaiting a decision'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-05: only one override proposal may await a decision at a time';
END $$;

-- OVERRIDE-06 — the proposer may not decide; a second person may.
DO $$
DECLARE refused boolean := false; o public.supervisory_assessment_calculation_override;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_override_decide((SELECT v FROM c_id WHERE k='override'),'APPROVED',NULL);
        EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-06: the proposer approved their own override'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_override_decide((SELECT v FROM c_id WHERE k='override'),'APPROVED',
    'AML06CERT override accepted by the checker');
  RESET ROLE;
  SELECT * INTO o FROM public.supervisory_assessment_calculation_override WHERE id=(SELECT v FROM c_id WHERE k='override');
  IF o.status <> 'APPROVED' OR o.decided_by = o.proposed_by OR o.decided_at IS NULL THEN
    RAISE EXCEPTION 'FAIL OVERRIDE-06: the override decision was not properly attributed'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-06: an override needs a second person to decide it, and the decision is attributed';
END $$;

-- ============================ LIFECYCLE gates =========================
-- LIFECYCLE-01 — a new policy version does not rewrite recorded runs.
DO $$
DECLARE cfg2 uuid; ver int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  cfg2 := public.supervisory_calculation_config_upsert((SELECT v FROM c_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date + 30)::text, 'aggregation_method','UNWEIGHTED_MEAN',
    'completeness_mode','MIN_ANSWERED','min_answered_questions',1,'na_denominator_handling','EXCLUDE',
    'evidence_insufficiency_handling','FLAG_ONLY','critical_question_handling','NONE',
    'rounding_mode','HALF_UP','rounding_decimals',2,'inherent_direction','DIRECT',
    'recommendation_policy','HIGHEST_DIMENSION'));
  RESET ROLE;
  SELECT config_version INTO ver FROM public.supervisory_calculation_config WHERE id=cfg2;
  -- A successor takes the next unused version number for the methodology. Earlier
  -- POLICY-09B/09C drafts also consumed numbers, so the contract asserted here is
  -- "strictly later than the version in force", not a fixed literal.
  IF ver IS NULL OR ver <= 1 THEN
    RAISE EXCEPTION 'LIFECYCLE-01: the successor policy took version %, which does not follow the version in force', ver; END IF;
  IF (SELECT config_version FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT v FROM c_id WHERE k='run1')) <> 1 THEN
    RAISE EXCEPTION 'FAIL LIFECYCLE-01: an earlier run no longer names the policy version it used'; END IF;
  RAISE NOTICE 'PASS LIFECYCLE-01: a successor policy version leaves recorded runs bound to their own version';
END $$;

-- LIFECYCLE-02 — the assessment cannot be moved to another methodology once approved.
DO $$
DECLARE refused boolean := false;
BEGIN
  UPDATE public.supervisory_assessment SET status='approved'
   WHERE id=(SELECT v FROM c_id WHERE k='assessment');
  BEGIN
    UPDATE public.supervisory_assessment SET methodology_id=gen_random_uuid()
     WHERE id=(SELECT v FROM c_id WHERE k='assessment');
  EXCEPTION WHEN others THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL LIFECYCLE-02: an approved assessment was rebound to another methodology'; END IF;
  UPDATE public.supervisory_assessment SET status='draft' WHERE id=(SELECT v FROM c_id WHERE k='assessment');
  RAISE NOTICE 'PASS LIFECYCLE-02: an approved assessment keeps the methodology version it was assessed under';
END $$;

-- ============================== SEC gates =============================
-- SEC-01 — authenticated holds read-only privileges on every AML-06 store.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(t || ':' || p, ', ') INTO bad
    FROM (VALUES ('supervisory_calculation_question_weight'),('supervisory_calculation_dimension_weight'),
                 ('supervisory_calculation_fact_rule'),('supervisory_calculation_fact_threshold'),
                 ('supervisory_calculation_materiality_rule'),('supervisory_assessment_calculation_run'),
                 ('supervisory_assessment_calculation_override')) AS x(t),
         (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS y(p)
   WHERE has_table_privilege('authenticated','public.'||t, p);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-01: authenticated holds write privileges: %', bad; END IF;
  RAISE NOTICE 'PASS SEC-01: every AML-06 store is read-only for signed-in users';
END $$;

-- SEC-02 — anonymous callers hold nothing at all.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(t, ', ') INTO bad
    FROM (VALUES ('supervisory_calculation_question_weight'),('supervisory_calculation_dimension_weight'),
                 ('supervisory_calculation_fact_rule'),('supervisory_calculation_fact_threshold'),
                 ('supervisory_calculation_materiality_rule'),('supervisory_assessment_calculation_run'),
                 ('supervisory_assessment_calculation_override')) AS x(t)
   WHERE has_table_privilege('anon','public.'||t,'SELECT');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-02: anon can read %', bad; END IF;
  SELECT string_agg(f, ', ') INTO bad
    FROM (VALUES ('supervisory_calculation_question_weights_set(uuid,jsonb)'),
                 ('supervisory_calculation_dimension_weights_set(uuid,jsonb)'),
                 ('supervisory_calculation_fact_rules_set(uuid,jsonb)'),
                 ('supervisory_calculation_materiality_set(uuid,jsonb)'),
                 ('supervisory_assessment_calculation_run_record(uuid,text)'),
                 ('supervisory_calculation_override_propose(uuid,text,text)'),
                 ('supervisory_calculation_override_decide(uuid,text,text)'),
                 ('supervisory_assessment_calculation_view(uuid)')) AS x(f)
   WHERE has_function_privilege('anon','public.'||f,'EXECUTE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-02: anon can execute %', bad; END IF;
  RAISE NOTICE 'PASS SEC-02: anonymous callers can neither read nor run any AML-06 operation';
END $$;

-- SEC-03 — RLS is enabled and read-scoped on every AML-06 store.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN (
     'supervisory_calculation_question_weight','supervisory_calculation_dimension_weight',
     'supervisory_calculation_fact_rule','supervisory_calculation_fact_threshold',
     'supervisory_calculation_materiality_rule','supervisory_assessment_calculation_run',
     'supervisory_assessment_calculation_override')
     AND (NOT c.relrowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=c.relname AND p.cmd='SELECT'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-03: RLS or read policy missing on %', bad; END IF;
  RAISE NOTICE 'PASS SEC-03: row-level security with a read policy is in force on every AML-06 store';
END $$;

-- SEC-04 — a persona without AML authority sees no run and cannot calculate.
DO $$
DECLARE n int; refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM c_id WHERE k='assessment');
  BEGIN PERFORM public.supervisory_assessment_calculation_run_record((SELECT v FROM c_id WHERE k='assessment'),'X');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_calculation_view((SELECT v FROM c_id WHERE k='assessment'));
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_override_propose((SELECT v FROM c_id WHERE k='assessment'),'LOW',
          'AML06CERT outsider override attempt'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL SEC-04: an outsider read % calculation run(s)', n; END IF;
  IF refused < 3 THEN RAISE EXCEPTION 'FAIL SEC-04: only % of 3 outsider operations were refused', refused; END IF;
  RAISE NOTICE 'PASS SEC-04: without AML authority a calculation cannot be read, run or overridden';
END $$;

-- SEC-05 — the read model serves the authorised officer.
DO $$
DECLARE vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vres := public.supervisory_assessment_calculation_view((SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  IF vres->'latest_run' IS NULL OR jsonb_array_length(vres->'runs') < 2 OR jsonb_array_length(vres->'overrides') < 1 THEN
    RAISE EXCEPTION 'FAIL SEC-05: the read model does not serve runs and overrides: %', vres;
  END IF;
  RAISE NOTICE 'PASS SEC-05: the authorised officer reads the latest run, the run history and the overrides';
END $$;

-- SEC-06 — internal engine helpers are not callable by signed-in users.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(f, ', ') INTO bad
    FROM (VALUES ('supervisory_calc_run_immutable()'),('supervisory_calc_touch_updated_at()'),
                 ('supervisory_calc_config_draft_guard(uuid,text)'),
                 ('supervisory_calc_inputs_snapshot(uuid)'),('supervisory_calc_run_authority(uuid)')) AS x(f)
   WHERE has_function_privilege('authenticated','public.'||f,'EXECUTE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-06: signed-in users can call internal helpers: %', bad; END IF;
  RAISE NOTICE 'PASS SEC-06: internal calculation helpers are reachable only from governed operations';
END $$;

-- ============================= LEGACY gates ===========================
-- LEGACY-01 — nothing outside the fixture was calculated or published.
DO $$
DECLARE other_runs int; baseline_runs int;
BEGIN
  SELECT count(*) INTO other_runs FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id <> (SELECT v FROM c_id WHERE k='assessment');
  SELECT c.n INTO baseline_runs FROM c_n c WHERE c.k='runs';
  IF other_runs <> baseline_runs THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: % run(s) exist outside the fixture assessment, baseline was %', other_runs, baseline_runs; END IF;
  IF (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
        FROM public.entity_risk_state r) <> (SELECT t FROM c_t WHERE k='risk_digest') THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: the risk-of-record was changed by a calculation or an override'; END IF;
  RAISE NOTICE 'PASS LEGACY-01: calculation and override never publish to the entity risk-of-record by themselves';
END $$;

-- LEGACY-02 — existing assessments keep working with no policy of their own.
DO $$
DECLARE a uuid; r jsonb;
BEGIN
  SELECT id INTO a FROM public.supervisory_assessment
   WHERE id <> (SELECT v FROM c_id WHERE k='assessment')
     AND methodology_id IS NOT NULL ORDER BY created_at LIMIT 1;
  IF a IS NULL THEN RAISE NOTICE 'PASS LEGACY-02: no pre-existing assessment to exercise'; RETURN; END IF;
  r := public.supervisory_calc_compute(a);
  IF r->>'status' = 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: a legacy assessment produced a rating although no policy is approved for it'; END IF;
  IF r->>'reason_code' IS NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: a legacy assessment refused without saying why'; END IF;
  RAISE NOTICE 'PASS LEGACY-02: a legacy assessment refuses with a stated reason (%) instead of inventing a rating', r->>'reason_code';
END $$;

-- LEGACY-03 — the live policy stores are untouched outside the fixture.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(x.k, ', ') INTO bad FROM (VALUES
    ('question weights', (SELECT count(*) FROM public.supervisory_calculation_question_weight
                           WHERE config_id NOT IN (SELECT id FROM public.supervisory_calculation_config
                                                    WHERE methodology_id=(SELECT v FROM c_id WHERE k='meth'))),
                         (SELECT n FROM c_n WHERE k='cfg_qw')),
    ('dimension weights', (SELECT count(*) FROM public.supervisory_calculation_dimension_weight
                           WHERE config_id NOT IN (SELECT id FROM public.supervisory_calculation_config
                                                    WHERE methodology_id=(SELECT v FROM c_id WHERE k='meth'))),
                         (SELECT n FROM c_n WHERE k='cfg_dw')),
    ('fact rules', (SELECT count(*) FROM public.supervisory_calculation_fact_rule
                           WHERE config_id NOT IN (SELECT id FROM public.supervisory_calculation_config
                                                    WHERE methodology_id=(SELECT v FROM c_id WHERE k='meth'))),
                         (SELECT n FROM c_n WHERE k='cfg_fr')),
    ('materiality rules', (SELECT count(*) FROM public.supervisory_calculation_materiality_rule
                           WHERE config_id NOT IN (SELECT id FROM public.supervisory_calculation_config
                                                    WHERE methodology_id=(SELECT v FROM c_id WHERE k='meth'))),
                         (SELECT n FROM c_n WHERE k='cfg_mat'))
  ) AS x(k, now_n, was_n) WHERE x.now_n <> x.was_n;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL LEGACY-03: live policy stores changed: %', bad; END IF;
  RAISE NOTICE 'PASS LEGACY-03: no calculation policy value was written outside the AML06CERT fixture';
END $$;

ROLLBACK;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_calculation_config;
  RAISE NOTICE 'ROLLBACK CONFIRMED: % calculation configuration(s) remain in the live database', n;
  SELECT count(*) INTO n FROM public.supervisory_assessment_calculation_run;
  RAISE NOTICE 'ROLLBACK CONFIRMED: % calculation run(s) remain in the live database', n;
  SELECT count(*) INTO n FROM public.supervisory_methodology WHERE code='AML06CERT-METH';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: an AML06CERT fixture survived the rollback'; END IF;
  RAISE NOTICE 'ROLLBACK CONFIRMED: no AML06CERT fixture survived';
END $$;
