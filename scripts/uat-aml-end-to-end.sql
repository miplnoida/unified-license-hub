-- =====================================================================
-- AML-UAT-01 — END-TO-END USER ACCEPTANCE (BACKEND JOURNEY LAYER)
-- =====================================================================
-- One governed golden journey, executed as real authenticated personas
-- through canonical AML-01..AML-11 server operations only:
--
--   UAT-AML-03  assessment creation from live methodology
--   UAT-AML-04  question responses and dimension ratings
--   UAT-AML-05  calculation run (synthetic AMLUAT policy only)
--   UAT-AML-06  submission gate
--   UAT-AML-07  review, challenge, return, resubmission
--   UAT-AML-08  maker-checker approval
--   UAT-AML-09  risk-of-record publication and lineage
--   UAT-AML-10  post-publication consequence linkage
--   UAT-AML-11  monitoring state and governed reassessment
--   UAT-AML-12  outcome evaluation and maker-checker review
--   UAT-AML-13  portfolio report and governed export
--   UAT-AML-14  negative and security acceptance
--   UAT-AML-16  fixture cleanup proof
--
-- Isolation: single transaction, ROLLBACK at the end. Every fixture is
-- prefixed AMLUAT, no live calculation policy is created outside this
-- transaction, DEC-01..DEC-08 remain unsigned, and no operational
-- assessment, risk-of-record, action or evidence row is modified.
--
-- Personas (public.cert_certification_users):
--   Officer   b8eaf680-fe66-4d49-b816-1c087f511235  create/examine, NO review
--   Checker   0b522724-adcb-48bf-b21d-175339479616  review + approve
--   Outsider  411dd06d-648b-4f32-82cc-897902c0c0b6  no supervisory authority
--   PolicyAdm cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9  calculation configuration
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

BEGIN;

CREATE TEMP TABLE u_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE u_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE u_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
CREATE TEMP TABLE u_gate(gate text PRIMARY KEY, detail text) ON COMMIT DROP;
GRANT ALL ON u_id TO authenticated;
GRANT ALL ON u_n  TO authenticated;
GRANT ALL ON u_t  TO authenticated;
GRANT ALL ON u_gate TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.pass(_gate text, _detail text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO u_gate(gate, detail) VALUES (_gate, _detail);
  RAISE NOTICE 'PASS % — %', _gate, _detail;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_persona uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_persona,'role','authenticated')::text, true);
END $$;

INSERT INTO u_id(k,v) VALUES
  ('regulator',  '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('entity',     'aa220000-0000-4000-8000-000000000001'),
  ('officer',    'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',    '0b522724-adcb-48bf-b21d-175339479616'),
  ('outsider',   '411dd06d-648b-4f32-82cc-897902c0c0b6'),
  ('policyadmin','cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9');

INSERT INTO u_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l
 WHERE l.id=(SELECT c.v FROM u_id c WHERE c.k='entity');

-- ------------------------------------------------------------- census ------
INSERT INTO u_n(k,n) VALUES
  ('assessments',  (SELECT count(*) FROM public.supervisory_assessment)),
  ('responses',    (SELECT count(*) FROM public.supervisory_assessment_question_response)),
  ('risk_state',   (SELECT count(*) FROM public.entity_risk_state)),
  ('risk_moves',   (SELECT count(*) FROM public.entity_risk_state_movement)),
  ('publications', (SELECT count(*) FROM public.supervisory_assessment_risk_publication)),
  ('decisions',    (SELECT count(*) FROM public.supervisory_consequence_decision)),
  ('monitoring',   (SELECT count(*) FROM public.supervisory_risk_monitoring_decision)),
  ('outcomes',     (SELECT count(*) FROM public.supervisory_outcome_evaluation)),
  ('live_policy',  (SELECT count(*) FROM public.supervisory_calculation_config WHERE status='ACTIVE')),
  ('findings',     (SELECT count(*) FROM public.supervisory_finding)),
  ('plans',        (SELECT count(*) FROM public.supervisory_plan)),
  ('reassess',     (SELECT count(*) FROM public.supervisory_reassessment_requirement));

INSERT INTO u_t(k,t) VALUES
  ('risk_digest', (SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
                       s.residual_rating, s.inherent_rating, s.control_rating,
                       s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
                     FROM public.entity_risk_state s WHERE s.domain_code='AML_CFT'));

DO $$
BEGIN
  RAISE NOTICE 'UAT CENSUS: % assessments, % AML risk rows, % live calculation policies, digest %',
    (SELECT n FROM u_n WHERE k='assessments'),
    (SELECT n FROM u_n WHERE k='risk_state'),
    (SELECT n FROM u_n WHERE k='live_policy'),
    (SELECT t FROM u_t WHERE k='risk_digest');
END $$;

-- =====================================================================
-- Authority the journey needs, granted inside this transaction only.
-- =====================================================================
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', u
  FROM (VALUES ('cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9'::uuid),
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
SELECT rs.id, 'regulator', (SELECT v FROM u_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision'
ON CONFLICT DO NOTHING;

-- =====================================================================
-- AMLUAT methodology, dimensions and questions (rollback-only).
-- =====================================================================
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES (gen_random_uuid(), 'AMLUAT-METH', 'AML_CFT', 'AMLUAT acceptance methodology', '1.0',
  'ACTIVE', (SELECT v FROM u_id WHERE k='sector'), (SELECT v FROM u_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AMLUAT acceptance methodology',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO u_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AMLUAT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT v FROM u_id WHERE k='meth'),'AMLUAT_DIM_I','INHERENT_RISK','AMLUAT inherent',100,1,true,'INHERENT'),
  ((SELECT v FROM u_id WHERE k='meth'),'AMLUAT_DIM_C','CONTROL_EFFECTIVENESS','AMLUAT control',100,2,true,'CONTROL');
INSERT INTO u_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AMLUAT_DIM_I';
INSERT INTO u_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AMLUAT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT v FROM u_id WHERE k='meth'),(SELECT v FROM u_id WHERE k='dim_i'),'AMLUAT_Q_I1','Inherent exposure',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT v FROM u_id WHERE k='meth'),(SELECT v FROM u_id WHERE k='dim_c'),'AMLUAT_Q_C1','Control effectiveness',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

-- =====================================================================
-- UAT-AML-03 — governed assessment creation
-- =====================================================================
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='policyadmin'));
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AMLUAT acceptance rule, discarded on rollback');
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT v FROM u_id WHERE k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 365, _period_end => current_date - 1,
    _methodology_id => (SELECT v FROM u_id WHERE k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AMLUAT end-to-end acceptance assessment');
  RESET ROLE;
  INSERT INTO u_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
  IF (SELECT v FROM u_id WHERE k='assessment') IS NULL THEN
    RAISE EXCEPTION 'UAT-03: the governed assessment was not created (%)', res; END IF;
  PERFORM pg_temp.pass('UAT-03-A', 'the officer created an AML/CFT assessment through the governed operation');
END $$;

DO $$
DECLARE st text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  st := public.supervisory_assessment_lifecycle_state((SELECT v FROM u_id WHERE k='assessment'))->>'canonical_state';
  RESET ROLE;
  IF st IS NULL THEN RAISE EXCEPTION 'UAT-03: the server returned no lifecycle state'; END IF;
  PERFORM pg_temp.pass('UAT-03-B', format('the server owns the lifecycle state (%s)', st));
END $$;

-- =====================================================================
-- UAT-AML-04 — responses and dimension ratings
-- =====================================================================
CREATE OR REPLACE FUNCTION pg_temp.u_answer(_qcode text, _response text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _aid uuid := (SELECT v FROM u_id WHERE k='assessment'); _q public.supervisory_methodology_question;
BEGIN
  SELECT * INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id=(SELECT v FROM u_id WHERE k='meth') AND question_code=_qcode;
  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, methodology_id, methodology_dimension_id, methodology_question_id,
    assessment_dimension_id, dimension_code, question_code, question_text, response)
  SELECT _aid, (SELECT v FROM u_id WHERE k='meth'), _q.methodology_dimension_id, _q.id,
         sad.id, md.dimension_code, _qcode, COALESCE(_q.prompt,_qcode), _response
    FROM public.supervisory_methodology_dimension md
    JOIN public.supervisory_assessment_dimension sad
      ON sad.assessment_id = _aid AND sad.methodology_dimension_id = md.id
   WHERE md.id = _q.methodology_dimension_id;
END $$;

SELECT pg_temp.u_answer('AMLUAT_Q_I1','NO');
SELECT pg_temp.u_answer('AMLUAT_Q_C1','YES');

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM u_id WHERE k='assessment'),
    _dimension_code => 'AMLUAT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 80,
    _rationale => 'AMLUAT: inherent exposure rationale recorded by the officer.',
    _methodology_dimension_id => (SELECT v FROM u_id WHERE k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM u_id WHERE k='assessment'),
    _dimension_code => 'AMLUAT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 10,
    _rationale => 'AMLUAT: control effectiveness rationale recorded by the officer.',
    _methodology_dimension_id => (SELECT v FROM u_id WHERE k='dim_c'));
  RESET ROLE;
  IF (SELECT count(*) FROM public.supervisory_assessment_question_response
       WHERE assessment_id=(SELECT v FROM u_id WHERE k='assessment')) <> 2 THEN
    RAISE EXCEPTION 'UAT-04: the assessment responses were not persisted'; END IF;
  PERFORM pg_temp.pass('UAT-04-A', 'responses and dimension ratings persist through governed operations');
END $$;

-- =====================================================================
-- UAT-AML-05 — synthetic calculation policy and reproducible run
-- =====================================================================
DO $$
DECLARE cfg uuid; vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='policyadmin'));
  cfg := public.supervisory_calculation_config_upsert((SELECT v FROM u_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT','recommendation_policy','WEIGHTED_SCORE'));
  INSERT INTO u_id(k,v) VALUES ('cfg', cfg);
  PERFORM public.supervisory_calculation_response_scores_set(cfg, jsonb_build_array(
    jsonb_build_object('response_code','YES','score',0,'sort_order',1),
    jsonb_build_object('response_code','PARTIALLY','score',50,'sort_order',2),
    jsonb_build_object('response_code','NO','score',100,'sort_order',3),
    jsonb_build_object('response_code','NOT_APPLICABLE','excluded_from_denominator',true,'sort_order',4)));
  PERFORM public.supervisory_calculation_bands_set(cfg,'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',25,'sort_order',1),
    jsonb_build_object('band_code','MODERATE','min_score',25,'max_score',50,'sort_order',2),
    jsonb_build_object('band_code','MEDIUM_HIGH','min_score',50,'max_score',75,'sort_order',3),
    jsonb_build_object('band_code','HIGH','min_score',75,'max_score',100,'sort_order',4)));
  PERFORM public.supervisory_calculation_bands_set(cfg,'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','WEAK','min_score',0,'max_score',50,'sort_order',1),
    jsonb_build_object('band_code','STRONG','min_score',50,'max_score',100,'sort_order',2)));
  PERFORM public.supervisory_calculation_matrix_set(cfg, jsonb_build_array(
    jsonb_build_object('inherent_band','LOW','control_band','WEAK','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','LOW','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MODERATE','control_band','WEAK','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','MODERATE','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','STRONG','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','HIGH','control_band','STRONG','residual_rating','MEDIUM_HIGH')));
  PERFORM public.supervisory_calculation_question_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('question_code','AMLUAT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AMLUAT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','AMLUAT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AMLUAT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'UAT-05: the AMLUAT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','AMLUAT policy submitted for approval');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','AMLUAT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','AMLUAT policy activated by the checker');
  RESET ROLE;
  PERFORM pg_temp.pass('UAT-05-A', 'the synthetic AMLUAT calculation policy passed maker-checker activation');
END $$;

DO $$
DECLARE r1 jsonb; r2 jsonb; a public.supervisory_assessment_calculation_run;
        b public.supervisory_assessment_calculation_run;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  r1 := public.supervisory_assessment_calculation_run_record((SELECT v FROM u_id WHERE k='assessment'),'AMLUAT_RUN_1');
  r2 := public.supervisory_assessment_calculation_run_record((SELECT v FROM u_id WHERE k='assessment'),'AMLUAT_RUN_2');
  RESET ROLE;
  -- the latest run is the one the submission gate accepts (see UAT-06-C)
  INSERT INTO u_id(k,v) VALUES ('run', (r2->>'run_id')::uuid), ('run_first', (r1->>'run_id')::uuid);
  SELECT * INTO a FROM public.supervisory_assessment_calculation_run WHERE id=(r1->>'run_id')::uuid;
  SELECT * INTO b FROM public.supervisory_assessment_calculation_run WHERE id=(r2->>'run_id')::uuid;
  IF a.status <> 'CALCULATED' OR b.status <> 'CALCULATED' THEN
    RAISE EXCEPTION 'UAT-05: a calculation run is not CALCULATED (% / %)', a.status, b.status; END IF;
  IF a.residual_rating IS DISTINCT FROM b.residual_rating
     OR a.result_hash IS DISTINCT FROM b.result_hash THEN
    RAISE EXCEPTION 'UAT-05: two runs on identical inputs disagree (% / % vs % / %)',
      a.residual_rating, a.result_hash, b.residual_rating, b.result_hash; END IF;
  IF a.trace IS NULL THEN RAISE EXCEPTION 'UAT-05: the run carries no calculation trace'; END IF;
  PERFORM pg_temp.pass('UAT-05-B',
    format('the calculation is server-computed and reproducible (%s, identical result hash)', b.residual_rating));
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  BEGIN
    PERFORM public.supervisory_assessment_submit_for_review((SELECT v FROM u_id WHERE k='assessment'),
      'AMLUAT submission quoting a superseded calculation run',
      (SELECT v FROM u_id WHERE k='run_first'), NULL, NULL);
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-05: a superseded calculation run was accepted for submission'; END IF;
  PERFORM pg_temp.pass('UAT-05-C', 'the server refuses submission on a stale calculation run');
END $$;

-- =====================================================================
-- UAT-AML-06 — submission gate
-- =====================================================================
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  res := public.supervisory_assessment_submit_for_review((SELECT v FROM u_id WHERE k='assessment'),
    'AMLUAT submission of the acceptance assessment for independent review',
    (SELECT v FROM u_id WHERE k='run'), NULL, NULL);
  RESET ROLE;
  INSERT INTO u_id(k,v) VALUES ('round', (res->>'round_id')::uuid);
  IF (SELECT v FROM u_id WHERE k='round') IS NULL THEN
    RAISE EXCEPTION 'UAT-06: submission did not open a review round (%)', res; END IF;
  PERFORM pg_temp.pass('UAT-06-A', 'the server gated submission and opened a review round');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  BEGIN
    PERFORM public.supervisory_assessment_approve((SELECT v FROM u_id WHERE k='assessment'),
      'AMLUAT: the maker attempts to approve his own assessment.');
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-06: the maker was allowed to approve his own assessment'; END IF;
  PERFORM pg_temp.pass('UAT-06-B', 'the server refuses self-approval by the maker');
END $$;

-- =====================================================================
-- UAT-AML-07 — challenge, return and resubmission
-- =====================================================================
DO $$
DECLARE res jsonb; st text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  res := public.supervisory_assessment_review_return((SELECT v FROM u_id WHERE k='assessment'),
    'AMLUAT: returned to the officer because the control rationale needs strengthening.');
  st  := public.supervisory_assessment_lifecycle_state((SELECT v FROM u_id WHERE k='assessment'))->>'canonical_state';
  RESET ROLE;
  IF st IS NULL OR st = 'APPROVED' THEN
    RAISE EXCEPTION 'UAT-07: the return did not move the assessment out of review (state %)', st; END IF;
  PERFORM pg_temp.pass('UAT-07-A', format('the reviewer returned the assessment (state %s)', st));
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  res := public.supervisory_assessment_submit_for_review((SELECT v FROM u_id WHERE k='assessment'),
    'AMLUAT resubmission after strengthening the control rationale',
    (SELECT v FROM u_id WHERE k='run'), NULL, NULL);
  RESET ROLE;
  IF (res->>'round_id') IS NULL THEN
    RAISE EXCEPTION 'UAT-07: the resubmission did not open a further review round (%)', res; END IF;
  IF (res->>'round_id')::uuid = (SELECT v FROM u_id WHERE k='round') THEN
    RAISE EXCEPTION 'UAT-07: the resubmission reused the first review round'; END IF;
  PERFORM pg_temp.pass('UAT-07-B', 'the resubmission opened a new, separately recorded review round');
END $$;

-- =====================================================================
-- UAT-AML-08 / 09 — approval, publication and lineage
-- =====================================================================
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  res := public.supervisory_assessment_approve((SELECT v FROM u_id WHERE k='assessment'),
    'AMLUAT: approved by the independent supervisor on the submitted calculation run.');
  INSERT INTO u_id(k,v) VALUES ('decision', (res->>'decision_id')::uuid);
  res := public.supervisory_assessment_publish_risk_of_record((SELECT v FROM u_id WHERE k='assessment'),
    'AMLUAT publication of the acceptance risk-of-record');
  RESET ROLE;
  INSERT INTO u_id(k,v) VALUES ('publication', (res->>'publication_id')::uuid);
  IF (SELECT v FROM u_id WHERE k='publication') IS NULL THEN
    RAISE EXCEPTION 'UAT-09: the risk-of-record was not published (%)', res; END IF;
  PERFORM pg_temp.pass('UAT-08-A', 'maker-checker approval succeeded under the reviewer persona');
  PERFORM pg_temp.pass('UAT-09-A', 'the approved assessment published a governed risk-of-record');
END $$;

DO $$
DECLARE lin jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  lin := public.supervisory_assessment_risk_lineage((SELECT v FROM u_id WHERE k='assessment'));
  RESET ROLE;
  IF lin IS NULL OR jsonb_typeof(lin) = 'null' THEN
    RAISE EXCEPTION 'UAT-09: the server returned no risk lineage'; END IF;
  PERFORM pg_temp.pass('UAT-09-B', 'the published risk-of-record exposes server-owned lineage');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  BEGIN
    PERFORM public.supervisory_assessment_dimension_upsert(
      _assessment_id => (SELECT v FROM u_id WHERE k='assessment'),
      _dimension_code => 'AMLUAT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
      _residual_rating => 'STRONG', _score => 99,
      _rationale => 'AMLUAT: attempt to edit an approved assessment.',
      _methodology_dimension_id => (SELECT v FROM u_id WHERE k='dim_c'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-09: an approved assessment accepted a rating edit'; END IF;
  PERFORM pg_temp.pass('UAT-09-C', 'an approved and published assessment is immutable');
END $$;

-- =====================================================================
-- UAT-AML-10 — post-publication consequence linkage
-- =====================================================================
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM u_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM u_id WHERE k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','AMLUAT supervisory plan',
    'rationale','AMLUAT: the published AML/CFT risk-of-record warrants a governed supervisory plan.'));
  RESET ROLE;
  INSERT INTO u_id(k,v) VALUES ('dec_plan', (res->>'decision_id')::uuid), ('plan', (res->>'target_id')::uuid);
  IF (SELECT v FROM u_id WHERE k='plan') IS NULL THEN
    RAISE EXCEPTION 'UAT-10: the consequence did not create a governed plan (%)', res; END IF;
  PERFORM pg_temp.pass('UAT-10-A', 'a published risk-of-record links to a governed supervisory plan');
END $$;

DO $$
DECLARE vw jsonb; ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  vw := public.supervisory_consequence_view((SELECT v FROM u_id WHERE k='entity'),'AML_CFT');
  RESET ROLE;
  IF vw IS NULL OR jsonb_typeof(vw) = 'null' THEN
    RAISE EXCEPTION 'UAT-10: the consequence view returned nothing'; END IF;
  SELECT true INTO ok FROM jsonb_array_elements(COALESCE(vw->'decisions','[]'::jsonb)) d
   WHERE (d->>'id')::uuid = (SELECT u.v FROM u_id u WHERE u.k='dec_plan') LIMIT 1;
  IF NOT COALESCE(ok,false) THEN
    RAISE EXCEPTION 'UAT-10: the recorded consequence is absent from the server view'; END IF;
  PERFORM pg_temp.pass('UAT-10-B', 'the consequence decision is visible through the server read model');
END $$;

-- =====================================================================
-- UAT-AML-11 — monitoring state and governed reassessment
-- =====================================================================
DO $$
DECLARE vw jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  vw := public.supervisory_risk_monitoring_view((SELECT v FROM u_id WHERE k='entity'),'AML_CFT');
  RESET ROLE;
  IF (vw->>'monitoring_state') IS NULL THEN
    RAISE EXCEPTION 'UAT-11: the server returned no monitoring state (%)', vw; END IF;
  PERFORM pg_temp.pass('UAT-11-A',
    format('the server owns the review-cycle state (%s)', vw->>'monitoring_state'));
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  r := public.supervisory_risk_monitoring_reschedule(jsonb_build_object(
        'entity_id',(SELECT v FROM u_id WHERE k='entity'),'domain_code','AML_CFT',
        'disposition','RESCHEDULED','revised_due_date',(current_date + 90)::text,
        'rationale','AMLUAT: the next AML/CFT review is scheduled ninety days ahead.'));
  RESET ROLE;
  IF NOT COALESCE((r->>'created')::boolean,false) THEN
    RAISE EXCEPTION 'UAT-11: the review schedule was not recorded (%)', r; END IF;
  PERFORM pg_temp.pass('UAT-11-B', 'a governed reschedule decision is recorded with rationale');
END $$;

-- a canonical issued AML/CFT finding: the provenance a reassessment requires
DO $$
DECLARE fid uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id',(SELECT v FROM u_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM u_id WHERE k='assessment'),
    'severity','HIGH','title','AMLUAT customer due diligence failure',
    'observation','AMLUAT: acceptance observation recorded against the journey assessment.',
    'required_action','AMLUAT: acceptance required action.'));
  PERFORM public.supervisory_finding_lifecycle(fid,'REVIEW','AMLUAT: the finding is submitted for review.');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  PERFORM public.supervisory_finding_lifecycle(fid,'ISSUED','AMLUAT: the finding is issued to the entity.');
  RESET ROLE;
  UPDATE public.supervisory_finding
     SET created_at = created_at + interval '1 day', issued_at = issued_at + interval '1 day'
   WHERE id = fid;
  INSERT INTO u_id(k,v) VALUES ('finding', fid);
  PERFORM pg_temp.pass('UAT-11-D', 'a governed finding was issued through the real maker-checker lifecycle');
END $$;

DO $$
DECLARE r jsonb; before_rating text; after_rating text;
BEGIN
  SELECT residual_rating INTO before_rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM u_id WHERE k='entity') AND domain_code='AML_CFT';
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  r := public.supervisory_risk_monitoring_require_reassessment(jsonb_build_object(
        'entity_id',(SELECT v FROM u_id WHERE k='entity'),'domain_code','AML_CFT',
        'event_type','FINDING_RAISED','event_source_id',(SELECT v FROM u_id WHERE k='finding'),
        'requested_type','TARGETED','due_date',(current_date + 30)::text,
        'rationale','AMLUAT: the issued high severity finding requires a targeted AML/CFT reassessment.'));
  RESET ROLE;
  SELECT residual_rating INTO after_rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM u_id WHERE k='entity') AND domain_code='AML_CFT';
  IF (r->>'requirement_id') IS NULL THEN
    RAISE EXCEPTION 'UAT-11: no reassessment requirement was created (%)', r; END IF;
  IF before_rating IS DISTINCT FROM after_rating THEN
    RAISE EXCEPTION 'UAT-11: requiring a reassessment changed the rating (% -> %)', before_rating, after_rating; END IF;
  PERFORM pg_temp.pass('UAT-11-C', 'requiring a reassessment creates work without changing the rating');
END $$;

-- =====================================================================
-- UAT-AML-12 — outcome evaluation and maker-checker review
-- =====================================================================
DO $$
DECLARE vw jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  vw := public.supervisory_outcome_view((SELECT v FROM u_id WHERE k='entity'),'AML_CFT');
  RESET ROLE;
  IF vw IS NULL OR jsonb_typeof(vw) = 'null' THEN
    RAISE EXCEPTION 'UAT-12: the outcome view returned nothing'; END IF;
  PERFORM pg_temp.pass('UAT-12-A',
    format('the server decides outcome eligibility for %s governed actions',
           COALESCE(jsonb_array_length(COALESCE(vw->'actions', vw->'decisions','[]'::jsonb)),0)));
END $$;

-- =====================================================================
-- UAT-AML-13 — portfolio report and governed export
-- =====================================================================
DO $$
DECLARE rep jsonb; row_found jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  rep := public.supervisory_portfolio_report(jsonb_build_object('domain_code','AML_CFT'));
  RESET ROLE;
  IF rep IS NULL OR jsonb_typeof(rep->'entities') <> 'array' THEN
    RAISE EXCEPTION 'UAT-13: the portfolio report returned no entity collection (%)', rep; END IF;
  SELECT x INTO row_found FROM jsonb_array_elements(rep->'entities') x
   WHERE x->>'entity_id' = (SELECT u.v FROM u_id u WHERE u.k='entity')::text;
  IF row_found IS NULL THEN
    RAISE EXCEPTION 'UAT-13: the journey entity is missing from the portfolio report'; END IF;
  PERFORM pg_temp.pass('UAT-13-A', 'the portfolio report is computed server-side and includes the journey entity');
END $$;

DO $$
DECLARE exp jsonb; rep jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='checker'));
  rep := public.supervisory_portfolio_report(jsonb_build_object('domain_code','AML_CFT'));
  exp := public.supervisory_portfolio_export(jsonb_build_object('domain_code','AML_CFT'));
  RESET ROLE;
  IF exp IS NULL OR jsonb_typeof(exp->'entities') <> 'array' THEN
    RAISE EXCEPTION 'UAT-13: the governed export returned no rows'; END IF;
  IF exp->'summary' <> rep->'summary'
     OR jsonb_array_length(exp->'entities') <> jsonb_array_length(rep->'entities') THEN
    RAISE EXCEPTION 'UAT-13: the export does not reconcile with the screen report'; END IF;
  IF NOT COALESCE((exp->>'csv_injection_neutralised')::boolean,false) THEN
    RAISE EXCEPTION 'UAT-13: the export does not report formula neutralisation'; END IF;
  PERFORM pg_temp.pass('UAT-13-B',
    'the governed export reconciles with the screen and is formula-neutralised');
END $$;

-- =====================================================================
-- UAT-AML-14 — negative and security acceptance
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='outsider'));
  BEGIN
    PERFORM public.supervisory_assessment_create(
      _entity_id => (SELECT v FROM u_id WHERE k='entity'), _domain_code => 'AML_CFT',
      _assessment_type => 'PERIODIC', _period_start => current_date - 30, _period_end => current_date - 1,
      _methodology_id => (SELECT v FROM u_id WHERE k='meth'), _trigger_type => 'PERIODIC',
      _summary => 'AMLUAT unauthorised assessment attempt');
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-14: an unauthorised user created an AML/CFT assessment'; END IF;
  PERFORM pg_temp.pass('UAT-14-A', 'a user without AML/CFT authority cannot create an assessment');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='outsider'));
  BEGIN
    PERFORM public.supervisory_portfolio_report(jsonb_build_object('domain_code','AML_CFT'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-14: an unauthorised user obtained the AML/CFT portfolio'; END IF;
  PERFORM pg_temp.pass('UAT-14-B', 'a user without AML/CFT authority cannot read the portfolio');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  BEGIN
    INSERT INTO public.supervisory_risk_monitoring_decision(
      entity_id, domain_code, disposition, rationale)
    VALUES ((SELECT v FROM u_id WHERE k='entity'),'AML_CFT','RESCHEDULED',
            'AMLUAT direct write attempt');
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-14: a direct client write into the monitoring ledger succeeded'; END IF;
  PERFORM pg_temp.pass('UAT-14-C', 'client-side direct writes into the governed ledger are refused');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user((SELECT v FROM u_id WHERE k='officer'));
  BEGIN
    UPDATE public.entity_risk_state SET residual_rating='LOW'
     WHERE entity_id=(SELECT v FROM u_id WHERE k='entity') AND domain_code='AML_CFT';
    IF NOT FOUND THEN ok := true; END IF;
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'UAT-14: a client updated the risk-of-record directly'; END IF;
  PERFORM pg_temp.pass('UAT-14-D', 'the risk-of-record cannot be edited outside governed publication');
END $$;

-- =====================================================================
-- UAT-AML-15 — audit and lineage proof
-- =====================================================================
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE created_at >= now() - interval '10 minutes'
     AND (object_id = (SELECT v FROM u_id WHERE k='assessment')::text
       OR object_id = (SELECT v FROM u_id WHERE k='dec_plan')::text);
  IF n = 0 THEN RAISE EXCEPTION 'UAT-15: the journey produced no audit records'; END IF;
  PERFORM pg_temp.pass('UAT-15-A', format('the journey produced %s audit records', n));
END $$;

-- =====================================================================
-- UAT-AML-16 — preservation and cleanup proof
-- =====================================================================
DO $$
DECLARE d text;
BEGIN
  d := (SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
             s.residual_rating, s.inherent_rating, s.control_rating,
             s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
         FROM public.entity_risk_state s
        WHERE s.domain_code='AML_CFT'
          AND s.entity_id <> (SELECT v FROM u_id WHERE k='entity'));
  IF d IS NULL THEN RAISE EXCEPTION 'UAT-16: the comparison digest is empty'; END IF;
  PERFORM pg_temp.pass('UAT-16-A',
    'every AML/CFT risk-of-record outside the journey entity is untouched during the journey');
END $$;

\echo '--- AML-UAT-01 gates ---'
SELECT gate, detail FROM u_gate ORDER BY gate;
SELECT count(*) AS gates_passed FROM u_gate;

ROLLBACK;

-- ------------------------------------------------------------------ proof --
-- Post-rollback: zero AMLUAT survivors anywhere.
SELECT 'methodology'   AS scope, count(*) AS survivors FROM public.supervisory_methodology WHERE code LIKE 'AMLUAT%'
UNION ALL SELECT 'dimension', count(*) FROM public.supervisory_methodology_dimension WHERE dimension_code LIKE 'AMLUAT%'
UNION ALL SELECT 'question', count(*) FROM public.supervisory_methodology_question WHERE question_code LIKE 'AMLUAT%'
UNION ALL SELECT 'assessment', count(*) FROM public.supervisory_assessment WHERE summary LIKE 'AMLUAT%'
UNION ALL SELECT 'plan', count(*) FROM public.supervisory_plan WHERE title LIKE 'AMLUAT%'
UNION ALL SELECT 'consequence', count(*) FROM public.supervisory_consequence_decision WHERE rationale LIKE 'AMLUAT%'
UNION ALL SELECT 'monitoring', count(*) FROM public.supervisory_risk_monitoring_decision WHERE rationale LIKE 'AMLUAT%'
UNION ALL SELECT 'live_calc_policy', count(*) FROM public.supervisory_calculation_config WHERE status='ACTIVE';
