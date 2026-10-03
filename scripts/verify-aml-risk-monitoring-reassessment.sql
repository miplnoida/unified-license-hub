-- =====================================================================
-- AML-09 — RISK SURVEILLANCE, REVIEW-CYCLE STATUS AND GOVERNED
--          REASSESSMENT TRIGGERING : BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- Gate families: MON, DATE, EVENT, REASSESS, RESCHED, SEC, ROLLBACK.
--
-- Conventions (identical to the AML-01..AML-08 certifications):
--   * one transaction, ROLLBACK at the end — every AML09CERT fixture is
--     discarded, so no operational assessment, risk-of-record, review
--     schedule, reassessment requirement or finding is changed;
--   * behavioural: gates CALL the governed server operations under real
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML09CERT.
--
-- Personas (public.cert_certification_users):
--   Officer   b8eaf680-fe66-4d49-b816-1c087f511235  (view/create, NO review)
--   Checker   0b522724-adcb-48bf-b21d-175339479616  (review + approve)
--   Outsider  411dd06d-648b-4f32-82cc-897902c0c0b6  (no supervisory authority)
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
  ('outsider',  '411dd06d-648b-4f32-82cc-897902c0c0b6'),
  ('policyadmin','cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9');

INSERT INTO c_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT c.v FROM c_id c WHERE c.k='entity');
-- a second entity inside the same supervisory scope that carries no AML/CFT
-- risk-of-record: used for the "no source" and cross-entity linkage gates.
INSERT INTO c_id(k,v)
SELECT 'other_entity', l.id FROM public.licensees l
 WHERE l.id <> (SELECT c.v FROM c_id c WHERE c.k='entity')
   AND l.lead_regulator_id = (SELECT l2.lead_regulator_id FROM public.licensees l2
                          WHERE l2.id = (SELECT c.v FROM c_id c WHERE c.k='entity'))
   AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state s
                    WHERE s.entity_id = l.id AND s.domain_code='AML_CFT')
 ORDER BY l.id LIMIT 1;
-- fallback: if every same-scope entity already carries an AML/CFT
-- risk-of-record, any other supervised entity serves the cross-entity gates.
INSERT INTO c_id(k,v)
SELECT 'xentity', l.id FROM public.licensees l
 WHERE l.id <> (SELECT c.v FROM c_id c WHERE c.k='entity')
 ORDER BY l.id LIMIT 1;

-- ---------------------------------------------------------------- census ----
INSERT INTO c_n(k,n) VALUES
  ('assessments',  (SELECT count(*) FROM public.supervisory_assessment)),
  ('responses',    (SELECT count(*) FROM public.supervisory_assessment_question_response)),
  ('risk_state',   (SELECT count(*) FROM public.entity_risk_state)),
  ('risk_moves',   (SELECT count(*) FROM public.entity_risk_state_movement)),
  ('decisions',    (SELECT count(*) FROM public.supervisory_consequence_decision)),
  ('plans',        (SELECT count(*) FROM public.supervisory_plan)),
  ('reassess',     (SELECT count(*) FROM public.supervisory_reassessment_requirement)),
  ('interventions',(SELECT count(*) FROM public.supervisory_intervention)),
  ('examinations', (SELECT count(*) FROM public.examinations)),
  ('findings',     (SELECT count(*) FROM public.supervisory_finding)),
  ('enforcement',  (SELECT count(*) FROM public.enforcement_actions)),
  ('regulators',   (SELECT count(*) FROM public.regulators));

INSERT INTO c_t(k,t) VALUES
  ('risk_digest', (SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
                       s.residual_rating, s.inherent_rating, s.control_rating,
                       s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
                     FROM public.entity_risk_state s WHERE s.domain_code='AML_CFT'));

DO $$
BEGIN
  RAISE NOTICE 'CENSUS: % assessments, % AML risk-of-record rows, % consequence decisions, digest %',
    (SELECT c.n FROM c_n c WHERE c.k='assessments'),
    (SELECT c.n FROM c_n c WHERE c.k='risk_state'),
    (SELECT c.n FROM c_n c WHERE c.k='decisions'),
    (SELECT c.t FROM c_t c WHERE c.k='risk_digest');
END $$;

-- =====================================================================
-- FIXTURE — a governed, published AML/CFT risk-of-record (AML09CERT).
-- Built only through canonical AML-01..AML-07 operations.
-- =====================================================================
-- The personas keep their own operational authority: the officer can create
-- and examine but cannot review; the checker reviews and approves but cannot
-- create. Nothing is widened, so the maker-checker separation the gates
-- certify is the real production separation.
--
-- The one exception is enforcement referral authority, which the checker needs
-- for CREATE-09 and which is granted inside this transaction only.
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT '0b522724-adcb-48bf-b21d-175339479616'::uuid, r.id, 'active',
       '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: not self-granted
  FROM public.sec_roles r WHERE r.key = 'enforcement_officer'
ON CONFLICT (user_id, role_id) DO UPDATE SET status='active', assigned_by=EXCLUDED.assigned_by, effective_until=NULL;  -- AML-CLOSE-02D: re-activate inside this rolled-back transaction

INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
  FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='enforcement_officer' AND m.key='enforcement_management' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;

INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT c.v FROM c_id c WHERE c.k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='enforcement_officer'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='enforcement_management'
ON CONFLICT DO NOTHING;

-- Calculation-policy authority (aml_supervision.manage_config) belongs to the
-- policy administrator and, for the second pair of hands the policy lifecycle
-- requires, to the reviewing supervisor. The officer is deliberately NOT given
-- review or policy authority, so the maker-checker gates test the real split.
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: granted by the TEST super administrator, never self-granted
  FROM (VALUES ('cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9'::uuid),
               ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) AS x(u),
       public.sec_roles r
 WHERE r.key = 'aml_head'
ON CONFLICT (user_id, role_id) DO UPDATE SET status='active', assigned_by=EXCLUDED.assigned_by, effective_until=NULL;  -- AML-CLOSE-02D: re-activate inside this rolled-back transaction

INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
  FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='aml_head' AND m.key='aml_supervision' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;

INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT c.v FROM c_id c WHERE c.k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision'
ON CONFLICT DO NOTHING;

INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES (gen_random_uuid(), 'AML09CERT-METH', 'AML_CFT', 'AML09CERT consequence fixture', '1.0',
  'ACTIVE', (SELECT c.v FROM c_id c WHERE c.k='sector'), (SELECT c.v FROM c_id c WHERE c.k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML09CERT consequence fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO c_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML09CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),'AML09CERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),'AML09CERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL');
INSERT INTO c_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML09CERT_DIM_I';
INSERT INTO c_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML09CERT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),(SELECT c.v FROM c_id c WHERE c.k='dim_i'),'AML09CERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),(SELECT c.v FROM c_id c WHERE c.k='dim_c'),'AML09CERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  -- the domain effective-date rule is policy configuration, so the policy
  -- administrator sets it; the officer then creates the assessment.
  PERFORM set_config('request.jwt.claims','{"sub":"cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML09CERT fixture rule, discarded on rollback');
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT c.v FROM c_id c WHERE c.k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 365, _period_end => current_date - 1,
    _methodology_id => (SELECT c.v FROM c_id c WHERE c.k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AML09CERT consequence certification assessment');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_answer(_qcode text, _response text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _aid uuid := (SELECT c.v FROM c_id c WHERE c.k='assessment'); _q public.supervisory_methodology_question;
BEGIN
  SELECT * INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id=(SELECT c.v FROM c_id c WHERE c.k='meth') AND question_code=_qcode;
  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, methodology_id, methodology_dimension_id, methodology_question_id,
    assessment_dimension_id, dimension_code, question_code, question_text, response)
  SELECT _aid, (SELECT c.v FROM c_id c WHERE c.k='meth'), _q.methodology_dimension_id, _q.id,
         sad.id, md.dimension_code, _qcode, COALESCE(_q.prompt,_qcode), _response
    FROM public.supervisory_methodology_dimension md
    JOIN public.supervisory_assessment_dimension sad
      ON sad.assessment_id = _aid AND sad.methodology_dimension_id = md.id
   WHERE md.id = _q.methodology_dimension_id;
END $$;

SELECT pg_temp.c_answer('AML09CERT_Q_I1','NO');
SELECT pg_temp.c_answer('AML09CERT_Q_C1','YES');

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT c.v FROM c_id c WHERE c.k='assessment'),
    _dimension_code => 'AML09CERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 80,
    _rationale => 'AML09CERT inherent dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT c.v FROM c_id c WHERE c.k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT c.v FROM c_id c WHERE c.k='assessment'),
    _dimension_code => 'AML09CERT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 10,
    _rationale => 'AML09CERT control dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT c.v FROM c_id c WHERE c.k='dim_c'));
  RESET ROLE;
END $$;

-- Synthetic approved calculation policy — AML09CERT only, rolled back.
DO $$
DECLARE cfg uuid; vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9","role":"authenticated"}', true);
  cfg := public.supervisory_calculation_config_upsert((SELECT c.v FROM c_id c WHERE c.k='meth'), jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT','recommendation_policy','WEIGHTED_SCORE'));
  INSERT INTO c_id(k,v) VALUES ('cfg', cfg);
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
    jsonb_build_object('question_code','AML09CERT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML09CERT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','AML09CERT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AML09CERT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FIXTURE: the AML09CERT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','AML09CERT policy submitted for approval');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','AML09CERT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','AML09CERT policy activated by the checker');
  RESET ROLE;
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT c.v FROM c_id c WHERE c.k='assessment'),'AML09CERT_RUN');
  INSERT INTO c_id(k,v) VALUES ('run', (res->>'run_id')::uuid);
  IF (SELECT status FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT c.v FROM c_id c WHERE c.k='run')) <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FIXTURE: the AML09CERT calculation run is not CALCULATED'; END IF;
  res := public.supervisory_assessment_submit_for_review((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML09CERT submission of the consequence certification assessment',
    (SELECT c.v FROM c_id c WHERE c.k='run'), NULL, NULL);
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('round', (res->>'round_id')::uuid);
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_assessment_approve((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML09CERT: approved by the independent supervisor on the submitted calculation run.');
  INSERT INTO c_id(k,v) VALUES ('decision', (res->>'decision_id')::uuid);
  res := public.supervisory_assessment_publish_risk_of_record((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML09CERT publication of the certification risk-of-record');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('publication', (res->>'publication_id')::uuid);
  IF (SELECT c.v FROM c_id c WHERE c.k='publication') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: the AML09CERT risk-of-record was not published (%)', res; END IF;
  RAISE NOTICE 'FIXTURE: AML09CERT published risk-of-record in force for this transaction only';
END $$;
-- ---------------------------------------------------------------------
-- Additional fixture anchors for AML-09.
-- ---------------------------------------------------------------------
-- An entity with no AML/CFT risk-of-record at all (BLOCKED gates), and a
-- legacy risk-of-record that predates governed publication (LEGACY /
-- NOT_CALCULABLE gates). Both are read-only for this certification.
-- The no-risk entity must sit inside the reviewing supervisor's own scope,
-- otherwise the gate would certify a scope refusal instead of BLOCKED.
DO $$
DECLARE r record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  FOR r IN SELECT l.id, l.lead_regulator_id, l.sector_id FROM public.licensees l
            WHERE l.id <> (SELECT c.v FROM c_id c WHERE c.k='entity')
              AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state s
                               WHERE s.entity_id = l.id AND s.domain_code='AML_CFT')
            ORDER BY l.id
  LOOP
    BEGIN
      PERFORM public.supervisory_entity_scope_check(
        '0b522724-adcb-48bf-b21d-175339479616'::uuid, r.id);
      INSERT INTO c_id(k,v) VALUES ('norisk', r.id);
      EXIT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

  END LOOP;
  RESET ROLE;
END $$;


INSERT INTO c_id(k,v)
SELECT 'legacy', s.entity_id FROM public.entity_risk_state s
 WHERE s.domain_code='AML_CFT' AND s.entity_id <> (SELECT c.v FROM c_id c WHERE c.k='entity')
   AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p
                    WHERE p.entity_id = s.entity_id)
 ORDER BY s.entity_id LIMIT 1;

INSERT INTO c_t(k,t)
SELECT 'fixture_rating', s.residual_rating FROM public.entity_risk_state s
 WHERE s.entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND s.domain_code='AML_CFT';

DO $$
BEGIN
  IF (SELECT c.v FROM c_id c WHERE c.k='norisk') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: no entity without an AML/CFT risk-of-record is available'; END IF;
  IF (SELECT c.v FROM c_id c WHERE c.k='legacy') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: no legacy AML/CFT risk-of-record is available'; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_view(_persona text, _entity uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_risk_monitoring_view(_entity,'AML_CFT');
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_reschedule(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_risk_monitoring_reschedule(_payload);
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_reassess(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_risk_monitoring_require_reassessment(_payload);
  RESET ROLE;
  RETURN v;
END $$;

-- =====================================================================
-- MON-01 — the review cycle is read from canonical sources only and no
--          default review interval is ever assumed.
-- =====================================================================
DO $$
DECLARE v jsonb; due date; basis text; st text;
BEGIN
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  st := v->>'monitoring_state';
  basis := v->'schedule'->>'due_date_basis';
  due := NULLIF(v->'schedule'->>'next_review_date','')::date;
  IF st NOT IN ('CURRENT','DUE','OVERDUE','EVENT_TRIGGERED','UNSCHEDULED','BLOCKED','LEGACY') THEN
    RAISE EXCEPTION 'FAIL MON-01: monitoring state % is not a governed state', st; END IF;
  IF due IS NULL AND basis <> 'UNSCHEDULED' THEN
    RAISE EXCEPTION 'FAIL MON-01: no review date exists yet the basis is %', basis; END IF;
  IF due IS NULL AND st <> 'UNSCHEDULED' THEN
    RAISE EXCEPTION 'FAIL MON-01: no canonical schedule exists yet the state is % (a default interval was assumed)', st; END IF;
  IF due IS NOT NULL AND basis NOT IN ('EXPLICIT_SCHEDULE_DECISION','PROGRAMME_CYCLE',
        'ASSESSMENT_REVIEW_PERIOD','RISK_STATE_REVIEW_DATE') THEN
    RAISE EXCEPTION 'FAIL MON-01: review date % carries the ungoverned basis %', due, basis; END IF;
  IF v->'schedule'->>'due_date_basis_detail' IS NULL THEN
    RAISE EXCEPTION 'FAIL MON-01: the review-date source is not explained'; END IF;
  RAISE NOTICE 'PASS MON-01: baseline state % from basis % (date %) with no assumed interval', st, basis, due;
END $$;

-- =====================================================================
-- MON-02 — CURRENT at a future review date, from the recorded source.
-- =====================================================================
DO $$
DECLARE r jsonb; v jsonb;
BEGIN
  r := pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'disposition','RESCHEDULED','revised_due_date',(current_date + 90)::text,
        'rationale','AML09CERT: the next AML/CFT review is set ninety days ahead for the certification fixture.'));
  IF NOT COALESCE((r->>'created')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL MON-02: the governed schedule decision was not recorded (%)', r; END IF;
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  IF v->>'monitoring_state' <> 'CURRENT' OR v->>'reason_code' <> 'REVIEW_NOT_YET_DUE' THEN
    RAISE EXCEPTION 'FAIL MON-02: state is %/%', v->>'monitoring_state', v->>'reason_code'; END IF;
  IF (v->'schedule'->>'next_review_date')::date <> current_date + 90
     OR v->'schedule'->>'due_date_basis' <> 'EXPLICIT_SCHEDULE_DECISION' THEN
    RAISE EXCEPTION 'FAIL MON-02: the review date/source is %/%',
      v->'schedule'->>'next_review_date', v->'schedule'->>'due_date_basis'; END IF;
  RAISE NOTICE 'PASS MON-02: CURRENT is derived from the approved explicit schedule decision';
END $$;

-- =====================================================================
-- MON-03 — DUE exactly on the review date (as-of-date boundary).
-- =====================================================================
DO $$
DECLARE r jsonb; v jsonb;
BEGIN
  r := pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'disposition','RESCHEDULED','revised_due_date',current_date::text,
        'rationale','AML09CERT: the review date is moved to today to certify the due boundary exactly.'));
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  IF v->>'monitoring_state' <> 'DUE' OR v->>'reason_code' <> 'REVIEW_DUE_TODAY' THEN
    RAISE EXCEPTION 'FAIL MON-03: on the review date the state is %/%',
      v->>'monitoring_state', v->>'reason_code'; END IF;
  IF (v->'as_of')::text::date <> current_date THEN
    RAISE EXCEPTION 'FAIL MON-03: the as-of date is not the server date'; END IF;
  RAISE NOTICE 'PASS MON-03: the review date itself is DUE, not OVERDUE';
END $$;

-- =====================================================================
-- MON-04 — OVERDUE one day after the review date (boundary + no rating change).
-- =====================================================================
DO $$
DECLARE r jsonb; v jsonb;
BEGIN
  r := pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'disposition','DEFERRED','revised_due_date',(current_date - 1)::text,
        'rationale','AML09CERT: the review date is set to yesterday to certify the overdue boundary exactly.'));
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  IF v->>'monitoring_state' <> 'OVERDUE' OR v->>'reason_code' <> 'REVIEW_DATE_PASSED' THEN
    RAISE EXCEPTION 'FAIL MON-04: one day past the review date the state is %/%',
      v->>'monitoring_state', v->>'reason_code'; END IF;
  IF v->'risk'->>'current_rating' IS DISTINCT FROM (SELECT c.t FROM c_t c WHERE c.k='fixture_rating') THEN
    RAISE EXCEPTION 'FAIL MON-04: an overdue review altered the rating (% vs %)',
      v->'risk'->>'current_rating', (SELECT c.t FROM c_t c WHERE c.k='fixture_rating'); END IF;
  RAISE NOTICE 'PASS MON-04: OVERDUE is a workflow condition only; the risk rating is untouched';
END $$;

-- =====================================================================
-- MON-05 — an entity with no AML/CFT risk-of-record is BLOCKED, not scheduled.
-- =====================================================================
DO $$
DECLARE v jsonb; a jsonb;
BEGIN
  v := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',(SELECT c.v FROM c_id c WHERE c.k='norisk'));
  IF v->>'monitoring_state' <> 'BLOCKED' OR v->>'reason_code' <> 'NO_RISK_OF_RECORD' THEN
    RAISE EXCEPTION 'FAIL MON-05: state is %/%', v->>'monitoring_state', v->>'reason_code'; END IF;
  SELECT x INTO a FROM jsonb_array_elements(v->'permitted_actions') x WHERE x->>'action'='REQUIRE_REASSESSMENT';
  IF COALESCE((a->>'available')::boolean,true) THEN
    RAISE EXCEPTION 'FAIL MON-05: reassessment is offered without a risk-of-record'; END IF;
  IF v->'schedule'->>'next_review_date' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL MON-05: a review date was invented without a risk-of-record'; END IF;
  RAISE NOTICE 'PASS MON-05: no risk-of-record yields BLOCKED with no invented schedule';
END $$;

-- =====================================================================
-- MON-06 — a legacy risk-of-record is declared LEGACY, read from legacy data.
-- =====================================================================
DO $$
DECLARE v jsonb;
BEGIN
  v := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',(SELECT c.v FROM c_id c WHERE c.k='legacy'));
  IF v->'risk'->>'source_kind' <> 'LEGACY_RISK_RECORD' THEN
    RAISE EXCEPTION 'FAIL MON-06: source kind is %', v->'risk'->>'source_kind'; END IF;
  IF v->>'monitoring_state' <> 'LEGACY' AND jsonb_array_length(COALESCE(v->'events','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'FAIL MON-06: a legacy record without events is reported as %', v->>'monitoring_state'; END IF;
  IF v->'schedule'->>'due_date_basis' NOT IN ('RISK_STATE_REVIEW_DATE','ASSESSMENT_REVIEW_PERIOD',
        'PROGRAMME_CYCLE','EXPLICIT_SCHEDULE_DECISION','UNSCHEDULED') THEN
    RAISE EXCEPTION 'FAIL MON-06: legacy basis % is not canonical', v->'schedule'->>'due_date_basis'; END IF;
  RAISE NOTICE 'PASS MON-06: the legacy risk-of-record is reported as LEGACY from legacy canonical data';
END $$;

-- =====================================================================
-- MON-07 — NOT_CALCULABLE availability is stated honestly and no rating
--          is derived by the monitoring surface.
-- =====================================================================
DO $$
DECLARE v jsonb; stored text;
BEGIN
  v := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',(SELECT c.v FROM c_id c WHERE c.k='legacy'));
  SELECT residual_rating INTO stored FROM public.entity_risk_state
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='legacy') AND domain_code='AML_CFT';
  IF v->'risk'->>'calculation_availability' <> 'NOT_CALCULABLE' THEN
    RAISE EXCEPTION 'FAIL MON-07: availability is % for a legacy record', v->'risk'->>'calculation_availability'; END IF;
  IF v->'risk'->>'current_rating' IS DISTINCT FROM stored THEN
    RAISE EXCEPTION 'FAIL MON-07: the monitoring surface reports % while the record holds %',
      v->'risk'->>'current_rating', stored; END IF;
  RAISE NOTICE 'PASS MON-07: NOT_CALCULABLE is preserved and the rating is read, never derived';
END $$;

-- =====================================================================
-- MON-08 — the whole monitoring cycle so far changed no risk-of-record.
-- =====================================================================
DO $$
DECLARE d text;
BEGIN
  SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
           s.residual_rating, s.inherent_rating, s.control_rating,
           s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
    INTO d FROM public.entity_risk_state s
   WHERE s.domain_code='AML_CFT' AND s.entity_id <> (SELECT c.v FROM c_id c WHERE c.k='entity');
  INSERT INTO c_t(k,t) VALUES ('digest_mid', d);
  IF EXISTS (SELECT 1 FROM public.entity_risk_state_movement m
              WHERE m.entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity')
                AND m.created_at > (SELECT decided_at FROM public.supervisory_risk_monitoring_decision
                                     ORDER BY decided_at ASC LIMIT 1)) THEN
    RAISE EXCEPTION 'FAIL MON-08: a monitoring decision produced a risk movement'; END IF;
  RAISE NOTICE 'PASS MON-08: no risk state or movement was written by monitoring (digest %)', d;
END $$;

-- =====================================================================
-- DATE-01 — an approved explicit schedule decision outranks every other source.
-- =====================================================================
DO $$
DECLARE v jsonb; sched jsonb;
BEGIN
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  sched := v->'schedule';
  IF sched->>'due_date_basis' <> 'EXPLICIT_SCHEDULE_DECISION'
     OR sched->>'basis_source_kind' <> 'MONITORING_DECISION' THEN
    RAISE EXCEPTION 'DATE-01: the explicit decision does not outrank other sources (%)', sched; END IF;
  IF (sched->'schedule_decision'->>'revised_due_date')::date <> (sched->>'next_review_date')::date THEN
    RAISE EXCEPTION 'DATE-01: the published date does not match the decision'; END IF;
  IF (sched->'schedule_decision'->>'decided_by')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='checker') THEN
    RAISE EXCEPTION 'DATE-01: the deciding officer is not recorded correctly'; END IF;
  RAISE NOTICE 'PASS DATE-01: the latest approved schedule decision is the authoritative review date';
END $$;

-- =====================================================================
-- DATE-02 — the resolution order itself is canonical: with the explicit
--           decisions removed from consideration the next available
--           canonical source is used, and only that one.
-- =====================================================================
DO $$
DECLARE sched jsonb; asmt_next date; rs_next date; prog record;
BEGIN
  sched := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',
             (SELECT c.v FROM c_id c WHERE c.k='legacy'))->'schedule';
  SELECT a.next_review_date INTO asmt_next FROM public.supervisory_assessment a
   WHERE a.entity_id=(SELECT c.v FROM c_id c WHERE c.k='legacy') AND a.domain_code='AML_CFT'
     AND a.status IN ('APPROVED','SUPERSEDED')
   ORDER BY COALESCE(a.approved_at,a.updated_at) DESC LIMIT 1;
  SELECT s.next_review_date INTO rs_next FROM public.entity_risk_state s
   WHERE s.entity_id=(SELECT c.v FROM c_id c WHERE c.k='legacy') AND s.domain_code='AML_CFT';
  IF sched->>'due_date_basis' = 'ASSESSMENT_REVIEW_PERIOD'
     AND (sched->>'next_review_date')::date <> asmt_next THEN
    RAISE EXCEPTION 'DATE-02: the assessment-period source is not the recorded assessment date'; END IF;
  IF sched->>'due_date_basis' = 'RISK_STATE_REVIEW_DATE' THEN
    IF (sched->>'next_review_date')::date <> rs_next THEN
      RAISE EXCEPTION 'DATE-02: the risk-state source is not the recorded risk-state date'; END IF;
    IF asmt_next IS NOT NULL THEN
      RAISE EXCEPTION 'DATE-02: the risk-state source was used while an assessment period exists'; END IF;
  END IF;
  IF sched->>'due_date_basis' = 'PROGRAMME_CYCLE' THEN
    IF (sched->'programme'->>'recurrence_months') IS NULL THEN
      RAISE EXCEPTION 'DATE-02: a programme cycle was claimed with no recurrence'; END IF;
    IF (sched->>'next_review_date')::date <>
       ((sched->>'last_review_date')::date + make_interval(months => (sched->'programme'->>'recurrence_months')::int))::date THEN
      RAISE EXCEPTION 'DATE-02: the programme-derived date is not the recorded cycle applied to the last review'; END IF;
  END IF;
  RAISE NOTICE 'PASS DATE-02: the review date comes from the highest available canonical source (%)',
    sched->>'due_date_basis';
END $$;

-- =====================================================================
-- DATE-03 — missing configuration becomes UNSCHEDULED, never a guess.
-- =====================================================================
DO $$
DECLARE sched jsonb;
BEGIN
  sched := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',
             (SELECT c.v FROM c_id c WHERE c.k='norisk'))->'schedule';
  IF sched->>'next_review_date' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL DATE-03: a review date was produced with no canonical configuration'; END IF;
  IF sched->>'due_date_basis' <> 'UNSCHEDULED' THEN
    RAISE EXCEPTION 'FAIL DATE-03: basis is % rather than UNSCHEDULED', sched->>'due_date_basis'; END IF;
  RAISE NOTICE 'PASS DATE-03: absent configuration is reported as UNSCHEDULED with no assumed interval';
END $$;

-- =====================================================================
-- DATE-04 — a later programme change does not rewrite recorded schedule history.
-- =====================================================================
DO $$
DECLARE before_row public.supervisory_risk_monitoring_decision; after_row public.supervisory_risk_monitoring_decision;
BEGIN
  SELECT * INTO before_row FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='RESCHEDULE'
   ORDER BY decided_at ASC LIMIT 1;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'FAIL DATE-04: no schedule history exists'; END IF;
  UPDATE public.supervisory_assessment_programme SET recurrence_months = 7
   WHERE id = (SELECT assessment_programme_id FROM public.supervisory_assessment
                WHERE id=(SELECT c.v FROM c_id c WHERE c.k='assessment'));
  SELECT * INTO after_row FROM public.supervisory_risk_monitoring_decision WHERE id = before_row.id;
  IF after_row.original_due_date IS DISTINCT FROM before_row.original_due_date
     OR after_row.revised_due_date IS DISTINCT FROM before_row.revised_due_date
     OR after_row.programme_version IS DISTINCT FROM before_row.programme_version
     OR after_row.rationale IS DISTINCT FROM before_row.rationale THEN
    RAISE EXCEPTION 'FAIL DATE-04: recorded schedule history changed with the programme'; END IF;
  RAISE NOTICE 'PASS DATE-04: recorded schedule history is a snapshot and is not rewritten';
END $$;

-- =====================================================================
-- DATE-05 — a schedule decision with no revised date is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'disposition','RESCHEDULED',
      'rationale','AML09CERT: an invalid schedule decision carrying no revised review date at all.'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL DATE-05: a schedule decision with no date was accepted'; END IF;
  RAISE NOTICE 'PASS DATE-05: an invalid review date is refused (%)', left(msg,70);
END $$;

-- =====================================================================
-- DATE-06 — a cross-entity schedule source cannot be introduced: every
--           recorded basis source belongs to the entity it schedules.
-- =====================================================================
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.supervisory_risk_monitoring_decision d
   WHERE d.entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity')
     AND (
       (d.assessment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a
          WHERE a.id=d.assessment_id AND a.entity_id=d.entity_id))
    OR (d.risk_state_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state s
          WHERE s.id=d.risk_state_id AND s.entity_id=d.entity_id))
    OR (d.basis_source_kind='MONITORING_DECISION' AND NOT EXISTS (
          SELECT 1 FROM public.supervisory_risk_monitoring_decision p
           WHERE p.id=d.basis_source_id AND p.entity_id=d.entity_id)));
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL DATE-06: % schedule decisions cite a source from another entity', bad; END IF;
  RAISE NOTICE 'PASS DATE-06: every recorded schedule source belongs to the scheduled entity';
END $$;

-- =====================================================================
-- FIXTURE — a canonical issued AML/CFT finding, raised after the
--           risk-of-record took effect. No monitoring alert is created.
-- =====================================================================
DO $$
DECLARE fid uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'severity','HIGH','title','AML09CERT customer due diligence failure',
    'observation','AML09CERT fixture observation for the surveillance certification.',
    'required_action','AML09CERT fixture required action.'));
  PERFORM public.supervisory_finding_lifecycle(fid,'REVIEW','AML09CERT: the fixture finding is submitted for review.');
  RESET ROLE;
  -- issuing a finding is approval authority, so the checker issues it
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_finding_lifecycle(fid,'ISSUED','AML09CERT: the fixture finding is issued to the entity.');
  RESET ROLE;
  -- The fixture compresses months of supervision into one transaction, so the
  -- issued finding is dated after the risk-of-record took effect, as it would be
  -- in real supervision. The governed status was reached through the real lifecycle.
  UPDATE public.supervisory_finding
     SET created_at = created_at + interval '1 day', issued_at = issued_at + interval '1 day'
   WHERE id = fid;
  INSERT INTO c_id(k,v) VALUES ('finding', fid);

END $$;

-- =====================================================================
-- EVENT-01 — the canonical finding is recognised as a supervisory event.
-- =====================================================================
DO $$
DECLARE v jsonb; e jsonb;
BEGIN
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  SELECT x INTO e FROM jsonb_array_elements(v->'events') x
   WHERE (x->>'source_id')::uuid = (SELECT c.v FROM c_id c WHERE c.k='finding');
  IF e IS NULL THEN RAISE EXCEPTION 'FAIL EVENT-01: the issued finding is not recognised (%)', v->'events'; END IF;
  IF e->>'event_type' <> 'FINDING_RAISED' OR e->>'source_kind' <> 'SUPERVISORY_FINDING' THEN
    RAISE EXCEPTION 'FAIL EVENT-01: the event is typed %/%', e->>'event_type', e->>'source_kind'; END IF;
  IF e->>'reason' IS NULL OR e->>'route' IS NULL THEN
    RAISE EXCEPTION 'FAIL EVENT-01: the event carries no reason or canonical route'; END IF;
  RAISE NOTICE 'PASS EVENT-01: the canonical finding is surfaced as a supervisory event from its own record';
END $$;

-- =====================================================================
-- EVENT-02 — the event creates a consideration state only.
-- =====================================================================
DO $$
DECLARE v jsonb; e jsonb;
BEGIN
  v := pg_temp.c_view('b8eaf680-fe66-4d49-b816-1c087f511235',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  IF v->>'monitoring_state' <> 'EVENT_TRIGGERED' OR v->>'reason_code' <> 'EVENT_REQUIRES_CONSIDERATION' THEN
    RAISE EXCEPTION 'FAIL EVENT-02: state is %/%', v->>'monitoring_state', v->>'reason_code'; END IF;
  SELECT x INTO e FROM jsonb_array_elements(v->'events') x
   WHERE (x->>'source_id')::uuid = (SELECT c.v FROM c_id c WHERE c.k='finding');
  IF NOT COALESCE((e->>'requires_consideration')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL EVENT-02: the event does not require supervisory consideration'; END IF;
  RAISE NOTICE 'PASS EVENT-02: a canonical event asks for consideration and decides nothing itself';
END $$;

-- =====================================================================
-- EVENT-03 — the event changed no risk and created no reassessment.
-- =====================================================================
DO $$
DECLARE v jsonb; n int; rating text;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_reassessment_requirement
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND domain_code='AML_CFT';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL EVENT-03: % reassessment requirements appeared automatically', n; END IF;
  SELECT residual_rating INTO rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND domain_code='AML_CFT';
  IF rating IS DISTINCT FROM (SELECT c.t FROM c_t c WHERE c.k='fixture_rating') THEN
    RAISE EXCEPTION 'FAIL EVENT-03: the event changed the rating to %', rating; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_risk_monitoring_decision
              WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity')
                AND decision_kind='REASSESSMENT_TRIGGERED') THEN
    RAISE EXCEPTION 'FAIL EVENT-03: a reassessment decision was recorded without a supervisor'; END IF;
  RAISE NOTICE 'PASS EVENT-03: the event created no reassessment and changed no risk';
END $$;

-- =====================================================================
-- EVENT-04 — an unsupported/unknown event is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reassess('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'event_type','MEDIA_RUMOUR',
      'rationale','AML09CERT: an unsupported event type must not be accepted as canonical provenance.'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL EVENT-04: an unsupported event was accepted'; END IF;
  RAISE NOTICE 'PASS EVENT-04: an unsupported event is refused (%)', left(msg,70);
END $$;

-- =====================================================================
-- EVENT-05 — an inaccessible event is not disclosed.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text; v jsonb;
BEGIN
  BEGIN
    v := pg_temp.c_view('411dd06d-648b-4f32-82cc-897902c0c0b6',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN
    IF jsonb_array_length(COALESCE(v->'events','[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'FAIL EVENT-05: an unauthorised reader was shown supervisory events'; END IF;
    RAISE EXCEPTION 'FAIL EVENT-05: an unauthorised reader obtained the monitoring view';
  END IF;
  RAISE NOTICE 'PASS EVENT-05: an inaccessible event is never disclosed (%)', left(msg,70);
END $$;

-- =====================================================================
-- REASSESS-01 — a rationale is mandatory.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reassess('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'event_type','FINDING_RAISED','rationale','too short'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL REASSESS-01: a reassessment was created without a rationale'; END IF;
  RAISE NOTICE 'PASS REASSESS-01: a written supervisory rationale is required (%)', left(msg,60);
END $$;

-- =====================================================================
-- REASSESS-02 — an officer without review authority is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reassess('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'event_type','FINDING_RAISED',
      'rationale','AML09CERT: an officer without review authority attempts to require a reassessment.'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL REASSESS-02: an unauthorised officer required a reassessment'; END IF;
  RAISE NOTICE 'PASS REASSESS-02: reassessment requires aml_supervision.review (%)', left(msg,70);
END $$;

-- =====================================================================
-- REASSESS-03 — an out-of-scope entity is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reassess('411dd06d-648b-4f32-82cc-897902c0c0b6', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'rationale','AML09CERT: a user outside the supervisory scope attempts a cross-scope reassessment.'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL REASSESS-03: a cross-scope reassessment was accepted'; END IF;
  RAISE NOTICE 'PASS REASSESS-03: a cross-regulator/entity request is refused (%)', left(msg,70);
END $$;

-- =====================================================================
-- REASSESS-04 — an authorised, event-sourced request succeeds through the
--               canonical reassessment contract.
-- =====================================================================
DO $$
DECLARE r jsonb; req public.supervisory_reassessment_requirement;
BEGIN
  r := pg_temp.c_reassess('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'event_type','FINDING_RAISED','event_source_id',(SELECT c.v FROM c_id c WHERE c.k='finding'),
        'requested_type','TARGETED','due_date',(current_date + 30)::text,
        'rationale','AML09CERT: the issued high severity finding requires a targeted AML/CFT reassessment.'));
  IF NOT COALESCE((r->>'created')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL REASSESS-04: the authorised request did not create a requirement (%)', r; END IF;
  INSERT INTO c_id(k,v) VALUES ('requirement', (r->>'requirement_id')::uuid);
  SELECT * INTO req FROM public.supervisory_reassessment_requirement WHERE id=(r->>'requirement_id')::uuid;
  IF req.id IS NULL THEN RAISE EXCEPTION 'FAIL REASSESS-04: no canonical requirement exists'; END IF;
  IF req.trigger_kind <> 'MATERIAL_FINDING' THEN
    RAISE EXCEPTION 'FAIL REASSESS-04: trigger kind is % for a finding event', req.trigger_kind; END IF;
  IF req.finding_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='finding') THEN
    RAISE EXCEPTION 'FAIL REASSESS-04: the source finding is not bound to the requirement'; END IF;
  RAISE NOTICE 'PASS REASSESS-04: the authorised request creates one canonical reassessment requirement';
END $$;

-- =====================================================================
-- REASSESS-05 — lineage of event, schedule and risk is preserved.
-- =====================================================================
DO $$
DECLARE d public.supervisory_risk_monitoring_decision;
BEGIN
  SELECT * INTO d FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='REASSESSMENT_TRIGGERED'
   ORDER BY decided_at DESC LIMIT 1;
  IF d.id IS NULL THEN RAISE EXCEPTION 'FAIL REASSESS-05: no monitoring decision was recorded'; END IF;
  IF d.event_type <> 'FINDING_RAISED' OR d.event_source_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='finding')
     OR d.event_source_kind <> 'SUPERVISORY_FINDING' THEN
    RAISE EXCEPTION 'FAIL REASSESS-05: the event lineage is not preserved (%)', to_jsonb(d); END IF;
  IF d.risk_state_id IS NULL OR d.publication_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='publication')
     OR d.assessment_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='assessment') THEN
    RAISE EXCEPTION 'FAIL REASSESS-05: the risk lineage is not preserved (%)', to_jsonb(d); END IF;
  IF d.due_date_basis IS NULL OR d.original_due_date IS NULL THEN
    RAISE EXCEPTION 'FAIL REASSESS-05: the schedule in force was not captured'; END IF;
  IF d.reassessment_requirement_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='requirement') THEN
    RAISE EXCEPTION 'FAIL REASSESS-05: the requirement is not linked'; END IF;
  IF d.decided_by IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='checker') THEN
    RAISE EXCEPTION 'FAIL REASSESS-05: the deciding supervisor is not recorded'; END IF;
  RAISE NOTICE 'PASS REASSESS-05: event, schedule, risk and actor lineage are all preserved';
END $$;

-- =====================================================================
-- REASSESS-06 — an audit event is recorded.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs l
   WHERE l.object_id = (SELECT c.v FROM c_id c WHERE c.k='requirement')::text;

  IF n = 0 THEN RAISE EXCEPTION 'FAIL REASSESS-06: no audit event was written'; END IF;
  RAISE NOTICE 'PASS REASSESS-06: the governed reassessment is audited (% event(s))', n;
END $$;

-- =====================================================================
-- REASSESS-07 — the existing open requirement is returned, never duplicated.
-- =====================================================================
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := pg_temp.c_reassess('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'event_type','FINDING_RAISED','event_source_id',(SELECT c.v FROM c_id c WHERE c.k='finding'),
        'rationale','AML09CERT: a second supervisor request while a reassessment is already open.'));
  IF COALESCE((r->>'created')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL REASSESS-07: a second requirement was created (%)', r; END IF;
  IF NOT COALESCE((r->>'duplicate')::boolean,false) OR r->>'reason_code' <> 'REASSESSMENT_ALREADY_OPEN' THEN
    RAISE EXCEPTION 'FAIL REASSESS-07: the existing requirement was not returned (%)', r; END IF;
  IF (r->>'requirement_id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='requirement') THEN
    RAISE EXCEPTION 'FAIL REASSESS-07: a different requirement was returned'; END IF;
  SELECT count(*) INTO n FROM public.supervisory_reassessment_requirement
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND domain_code='AML_CFT';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL REASSESS-07: % requirements exist for one condition', n; END IF;
  RAISE NOTICE 'PASS REASSESS-07: a repeated request converges on the existing requirement';
END $$;

-- =====================================================================
-- REASSESS-08 — the surface itself reports the open requirement and
--               withdraws the action, so no concurrent second path exists.
-- =====================================================================
DO $$
DECLARE v jsonb; a jsonb;
BEGIN
  v := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  IF (v->'open_reassessment'->>'id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='requirement') THEN
    RAISE EXCEPTION 'FAIL REASSESS-08: the open requirement is not reported'; END IF;
  SELECT x INTO a FROM jsonb_array_elements(v->'permitted_actions') x WHERE x->>'action'='REQUIRE_REASSESSMENT';
  IF COALESCE((a->>'available')::boolean,true) OR a->>'reason_code' <> 'REASSESSMENT_ALREADY_OPEN' THEN
    RAISE EXCEPTION 'FAIL REASSESS-08: the action is still offered (%)', a; END IF;
  IF v->>'monitoring_state' = 'EVENT_TRIGGERED' THEN
    RAISE EXCEPTION 'FAIL REASSESS-08: the event still demands consideration after the requirement exists'; END IF;
  RAISE NOTICE 'PASS REASSESS-08: with a requirement open the server withdraws the action (state %)',
    v->>'monitoring_state';
END $$;

-- =====================================================================
-- RESCHED-01 — rescheduling requires approval authority.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reschedule('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'disposition','RESCHEDULED','revised_due_date',(current_date + 200)::text,
      'rationale','AML09CERT: an officer without approval authority attempts to move the review date.'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL RESCHED-01: an unauthorised officer rescheduled the review'; END IF;
  RAISE NOTICE 'PASS RESCHED-01: rescheduling requires aml_supervision.approve (%)', left(msg,70);
END $$;

-- =====================================================================
-- RESCHED-02 — a rationale is mandatory for a schedule decision.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'disposition','DEFERRED','revised_due_date',(current_date + 45)::text,'rationale','later'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL RESCHED-02: a schedule decision was accepted without a rationale'; END IF;
  RAISE NOTICE 'PASS RESCHED-02: a written rationale is required to move a review (%)', left(msg,60);
END $$;

-- =====================================================================
-- RESCHED-03 — a new decision is appended and the original is retained.
-- =====================================================================
DO $$
DECLARE before_n int; after_n int; r jsonb; first_row public.supervisory_risk_monitoring_decision;
BEGIN
  SELECT count(*) INTO before_n FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='RESCHEDULE';
  SELECT * INTO first_row FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='RESCHEDULE'
   ORDER BY decided_at ASC LIMIT 1;
  r := pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'disposition','DEFERRED','revised_due_date',(current_date + 60)::text,
        'rationale','AML09CERT: the review is deferred sixty days pending the reassessment fieldwork.'));
  SELECT count(*) INTO after_n FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='RESCHEDULE';
  IF after_n <> before_n + 1 THEN
    RAISE EXCEPTION 'FAIL RESCHED-03: % decisions before and % after', before_n, after_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_risk_monitoring_decision
                  WHERE id = first_row.id AND revised_due_date = first_row.revised_due_date
                    AND rationale = first_row.rationale) THEN
    RAISE EXCEPTION 'FAIL RESCHED-03: the original schedule decision was overwritten'; END IF;
  IF (r->>'original_due_date') IS NULL THEN
    RAISE EXCEPTION 'FAIL RESCHED-03: the superseded review date was not captured (%)', r; END IF;
  RAISE NOTICE 'PASS RESCHED-03: schedule decisions are appended and the earlier record is retained';
END $$;

-- =====================================================================
-- RESCHED-04 — an identical repeat is idempotent, not a second decision.
-- =====================================================================
DO $$
DECLARE r jsonb; n1 int; n2 int;
BEGIN
  SELECT count(*) INTO n1 FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='RESCHEDULE';
  r := pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'disposition','DEFERRED','revised_due_date',(current_date + 60)::text,
        'rationale','AML09CERT: the review is deferred sixty days pending the reassessment fieldwork.'));
  SELECT count(*) INTO n2 FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND decision_kind='RESCHEDULE';
  IF n2 <> n1 THEN RAISE EXCEPTION 'FAIL RESCHED-04: a repeated decision was duplicated'; END IF;
  IF NOT COALESCE((r->>'idempotent')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL RESCHED-04: the repeat was not recognised as idempotent (%)', r; END IF;
  RAISE NOTICE 'PASS RESCHED-04: an identical repeat converges on the recorded decision';
END $$;

-- =====================================================================
-- RESCHED-05 — waiving a review remains unsupported.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text; v jsonb; a jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
      'disposition','WAIVED','revised_due_date',(current_date + 400)::text,
      'rationale','AML09CERT: an attempt to waive the AML/CFT review obligation entirely.'));
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM; RESET ROLE;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL RESCHED-05: a review waiver was accepted'; END IF;
  v := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',(SELECT c.v FROM c_id c WHERE c.k='entity'));
  SELECT x INTO a FROM jsonb_array_elements(v->'permitted_actions') x WHERE x->>'action'='WAIVE_REVIEW';
  IF a IS NULL OR COALESCE((a->>'available')::boolean,true)
     OR a->>'reason_code' <> 'UNSUPPORTED_NO_CANONICAL_AUTHORITY' THEN
    RAISE EXCEPTION 'FAIL RESCHED-05: waiver is not declared unsupported (%)', a; END IF;
  RAISE NOTICE 'PASS RESCHED-05: waiver is refused and declared unsupported (%)', left(msg,60);
END $$;

-- =====================================================================
-- RESCHED-06 — nothing is silently deleted or overwritten.
-- =====================================================================
DO $$
DECLARE blocked int := 0; d uuid;
BEGIN
  SELECT id INTO d FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') ORDER BY decided_at ASC LIMIT 1;
  BEGIN
    UPDATE public.supervisory_risk_monitoring_decision SET revised_due_date = current_date + 999 WHERE id = d;
  EXCEPTION WHEN OTHERS THEN blocked := blocked + 1;
  END;
  BEGIN
    DELETE FROM public.supervisory_risk_monitoring_decision WHERE id = d;
  EXCEPTION WHEN OTHERS THEN blocked := blocked + 1;
  END;
  IF blocked <> 2 THEN
    RAISE EXCEPTION 'FAIL RESCHED-06: recorded schedule history can be edited or deleted (% of 2 blocked)', blocked; END IF;
  RAISE NOTICE 'PASS RESCHED-06: recorded monitoring history is append-only';
END $$;

-- =====================================================================
-- SEC-01 — anonymous access to the monitoring view is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims','', true);
    PERFORM public.supervisory_risk_monitoring_view((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT');
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM;
  END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SEC-01: anonymous access succeeded'; END IF;
  RAISE NOTICE 'PASS SEC-01: anonymous access is refused (%)', left(msg,70);
END $$;

-- =====================================================================
-- SEC-02 — anonymous access to the due-review work list is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims','', true);
    PERFORM public.supervisory_risk_monitoring_due_list('AML_CFT', NULL, 5);
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM;
  END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SEC-02: the anonymous work list succeeded'; END IF;
  RAISE NOTICE 'PASS SEC-02: the anonymous work list is refused (%)', left(msg,70);
END $$;

-- =====================================================================
-- SEC-03 — a direct write by an authenticated user is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
    INSERT INTO public.supervisory_risk_monitoring_decision(
      entity_id, domain_code, decision_kind, disposition, revised_due_date, rationale, idempotency_key)
    VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT','RESCHEDULE','RESCHEDULED', current_date + 5,
            'AML09CERT: a direct client write that must never be accepted at all.','AML09CERT-DIRECT');
  EXCEPTION WHEN OTHERS THEN refused := true; msg := SQLERRM;
  END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SEC-03: a direct client write was accepted'; END IF;
  RAISE NOTICE 'PASS SEC-03: direct writes are refused (%)', left(msg,80);
END $$;

-- =====================================================================
-- SEC-04 — the internal helpers are not executable by clients.
-- =====================================================================
DO $$
DECLARE bad text := '';
BEGIN
  IF has_function_privilege('authenticated','public.supervisory_risk_monitoring_writer_guard()','EXECUTE')
    THEN bad := bad || ' writer_guard'; END IF;
  IF has_function_privilege('authenticated','public.supervisory_risk_monitoring_immutable_guard()','EXECUTE')
    THEN bad := bad || ' immutable_guard'; END IF;
  IF has_function_privilege('anon','public.supervisory_risk_monitoring_view(uuid,text)','EXECUTE')
    THEN bad := bad || ' view/anon'; END IF;
  IF has_function_privilege('anon','public.supervisory_risk_monitoring_require_reassessment(jsonb)','EXECUTE')
    THEN bad := bad || ' require/anon'; END IF;
  IF has_function_privilege('anon','public.supervisory_risk_monitoring_reschedule(jsonb)','EXECUTE')
    THEN bad := bad || ' reschedule/anon'; END IF;
  IF bad <> '' THEN RAISE EXCEPTION 'FAIL SEC-04: executable to clients:%', bad; END IF;
  RAISE NOTICE 'PASS SEC-04: internal helpers and anonymous execution are revoked';
END $$;

-- =====================================================================
-- SEC-05 — every AML-09 SECURITY DEFINER path pins its search_path.
-- =====================================================================
DO $$
DECLARE n int; unpinned text;
BEGIN
  SELECT count(*), string_agg(p.proname,', ') INTO n, unpinned
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'supervisory_risk_monitoring%'
     AND p.prosecdef AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-05: unpinned definer functions: %', unpinned; END IF;
  RAISE NOTICE 'PASS SEC-05: every AML-09 SECURITY DEFINER path pins search_path';
END $$;

-- =====================================================================
-- SEC-06 — regulator/domain isolation: the work list never leaks an
--          entity outside the reader's supervisory scope.
-- =====================================================================
DO $$
DECLARE lst jsonb; leaked int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  lst := public.supervisory_risk_monitoring_due_list('AML_CFT', NULL, 200);
  RESET ROLE;
  SELECT count(*) INTO leaked FROM jsonb_array_elements(lst->'items') i
   WHERE NOT public.supervisory_monitoring_scope_admits(
     (SELECT c.v FROM c_id c WHERE c.k='checker'),'AML_CFT',(i->>'entity_id')::uuid,
     (SELECT l.lead_regulator_id FROM public.licensees l WHERE l.id=(i->>'entity_id')::uuid),
     (SELECT l.sector_id FROM public.licensees l WHERE l.id=(i->>'entity_id')::uuid));
  IF leaked > 0 THEN RAISE EXCEPTION 'FAIL SEC-06: % out-of-scope entities appear in the work list', leaked; END IF;
  IF lst->>'domain_code' <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL SEC-06: the work list is not domain scoped'; END IF;
  RAISE NOTICE 'PASS SEC-06: the work list is scoped by regulator and domain (% items)', lst->>'count';
END $$;

-- =====================================================================
-- SEC-07 — the work-list state filter is applied by the server.
-- =====================================================================
DO $$
DECLARE lst jsonb; wrong int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  lst := public.supervisory_risk_monitoring_due_list('AML_CFT','LEGACY',200);
  RESET ROLE;
  SELECT count(*) INTO wrong FROM jsonb_array_elements(lst->'items') i
   WHERE i->>'monitoring_state' <> 'LEGACY';
  IF wrong > 0 THEN RAISE EXCEPTION 'FAIL SEC-07: % rows do not match the requested state', wrong; END IF;
  IF lst->>'state_filter' <> 'LEGACY' THEN
    RAISE EXCEPTION 'FAIL SEC-07: the applied filter is not reported'; END IF;
  RAISE NOTICE 'PASS SEC-07: the server applies the review-state filter (% items)', lst->>'count';
END $$;

-- =====================================================================
-- SEC-08 — the acting supervisor is recorded on every decision.
-- =====================================================================
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.supervisory_risk_monitoring_decision d
   WHERE d.entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity')
     AND (d.decided_by IS NULL OR d.decided_by <> (SELECT c.v FROM c_id c WHERE c.k='checker'));
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL SEC-08: % decisions carry no or the wrong actor', bad; END IF;
  RAISE NOTICE 'PASS SEC-08: the acting supervisor is recorded on every monitoring decision';
END $$;

-- =====================================================================
-- ROLLBACK-01 — the AML-09 fixtures exist inside this transaction only.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity');
  IF n = 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK-01: the certification wrote nothing to roll back'; END IF;
  RAISE NOTICE 'PASS ROLLBACK-01: % AML09CERT monitoring decisions are pending rollback', n;
END $$;

-- =====================================================================
-- ROLLBACK-02 — no operational AML risk-of-record outside the fixture
--               entity changed at any point in the run.
-- =====================================================================
DO $$
DECLARE d text;
BEGIN
  SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
           s.residual_rating, s.inherent_rating, s.control_rating,
           s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
    INTO d FROM public.entity_risk_state s
   WHERE s.domain_code='AML_CFT' AND s.entity_id <> (SELECT c.v FROM c_id c WHERE c.k='entity');
  IF d IS DISTINCT FROM (SELECT c.t FROM c_t c WHERE c.k='digest_mid') THEN
    RAISE EXCEPTION 'FAIL ROLLBACK-02: operational AML risk-of-record digest changed'; END IF;
  RAISE NOTICE 'PASS ROLLBACK-02: the operational AML risk-of-record set is unchanged (%)', d;
END $$;

ROLLBACK;

-- ---------------------------------------------------------------------
-- Post-rollback survivor proof.
-- ---------------------------------------------------------------------
SELECT 'monitoring_decisions' AS fixture, count(*) AS surviving
  FROM public.supervisory_risk_monitoring_decision WHERE rationale LIKE 'AML09CERT%'
UNION ALL SELECT 'reassessment_requirements', count(*)
  FROM public.supervisory_reassessment_requirement WHERE trigger_rationale LIKE 'AML09CERT%'
UNION ALL SELECT 'findings', count(*)
  FROM public.supervisory_finding WHERE title LIKE 'AML09CERT%'
UNION ALL SELECT 'assessments', count(*)
  FROM public.supervisory_assessment WHERE summary LIKE 'AML09CERT%'
UNION ALL SELECT 'methodologies', count(*)
  FROM public.supervisory_methodology WHERE code LIKE 'AML09CERT%'
UNION ALL SELECT 'risk_states', count(*)
  FROM public.entity_risk_state s
 WHERE s.driving_assessment_id IN (SELECT a.id FROM public.supervisory_assessment a
                                    WHERE a.summary LIKE 'AML09CERT%')
UNION ALL SELECT 'risk_movements', count(*)
  FROM public.entity_risk_state_movement WHERE reason LIKE 'AML09CERT%'
UNION ALL SELECT 'publications', count(*)
  FROM public.supervisory_assessment_risk_publication p
 WHERE p.assessment_id IN (SELECT a.id FROM public.supervisory_assessment a
                            WHERE a.summary LIKE 'AML09CERT%')
UNION ALL SELECT 'audit_events', count(*)
  FROM public.compliance_audit_logs WHERE justification LIKE 'AML09CERT%'
UNION ALL SELECT 'work_items', count(*)
  FROM public.supervisory_reassessment_requirement
 WHERE trigger_rationale LIKE 'AML09CERT%'
UNION ALL SELECT 'older_aml_cert_fixtures', count(*)
  FROM public.supervisory_methodology
 WHERE code LIKE 'AML0%CERT%' OR code LIKE 'PLANCERT%';

