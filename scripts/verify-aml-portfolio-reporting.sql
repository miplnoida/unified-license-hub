-- =====================================================================
-- AML-10 — SERVER-AUTHORITATIVE PORTFOLIO RISK AND MANAGEMENT
--          REPORTING : BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- Gate families: PORT, EXPO, TREND, FILTER, EXPORT, SEC, ROLLBACK.
--
-- Conventions (identical to the AML-01..AML-08 certifications):
--   * one transaction, ROLLBACK at the end — every AML10CERT fixture is
--     discarded, so no operational assessment, risk-of-record, review
--     schedule, reassessment requirement or finding is changed;
--   * behavioural: gates CALL the governed server operations under real
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML10CERT.
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
-- FIXTURE — a governed, published AML/CFT risk-of-record (AML10CERT).
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
ON CONFLICT (user_id, role_id) DO UPDATE SET status='active', assigned_by=EXCLUDED.assigned_by;  -- AML-CLOSE-02D: re-activate inside this rolled-back transaction

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
ON CONFLICT (user_id, role_id) DO UPDATE SET status='active', assigned_by=EXCLUDED.assigned_by;  -- AML-CLOSE-02D: re-activate inside this rolled-back transaction

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
VALUES (gen_random_uuid(), 'AML10CERT-METH', 'AML_CFT', 'AML10CERT consequence fixture', '1.0',
  'ACTIVE', (SELECT c.v FROM c_id c WHERE c.k='sector'), (SELECT c.v FROM c_id c WHERE c.k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML10CERT consequence fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO c_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML10CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),'AML10CERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),'AML10CERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL');
INSERT INTO c_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML10CERT_DIM_I';
INSERT INTO c_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML10CERT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),(SELECT c.v FROM c_id c WHERE c.k='dim_i'),'AML10CERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),(SELECT c.v FROM c_id c WHERE c.k='dim_c'),'AML10CERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  -- the domain effective-date rule is policy configuration, so the policy
  -- administrator sets it; the officer then creates the assessment.
  PERFORM set_config('request.jwt.claims','{"sub":"cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML10CERT fixture rule, discarded on rollback');
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT c.v FROM c_id c WHERE c.k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 365, _period_end => current_date - 1,
    _methodology_id => (SELECT c.v FROM c_id c WHERE c.k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AML10CERT consequence certification assessment');
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

SELECT pg_temp.c_answer('AML10CERT_Q_I1','NO');
SELECT pg_temp.c_answer('AML10CERT_Q_C1','YES');

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT c.v FROM c_id c WHERE c.k='assessment'),
    _dimension_code => 'AML10CERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 80,
    _rationale => 'AML10CERT inherent dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT c.v FROM c_id c WHERE c.k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT c.v FROM c_id c WHERE c.k='assessment'),
    _dimension_code => 'AML10CERT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 10,
    _rationale => 'AML10CERT control dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT c.v FROM c_id c WHERE c.k='dim_c'));
  RESET ROLE;
END $$;

-- Synthetic approved calculation policy — AML10CERT only, rolled back.
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
    jsonb_build_object('question_code','AML10CERT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML10CERT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','AML10CERT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AML10CERT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FIXTURE: the AML10CERT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','AML10CERT policy submitted for approval');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','AML10CERT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','AML10CERT policy activated by the checker');
  RESET ROLE;
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT c.v FROM c_id c WHERE c.k='assessment'),'AML10CERT_RUN');
  INSERT INTO c_id(k,v) VALUES ('run', (res->>'run_id')::uuid);
  IF (SELECT status FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT c.v FROM c_id c WHERE c.k='run')) <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FIXTURE: the AML10CERT calculation run is not CALCULATED'; END IF;
  res := public.supervisory_assessment_submit_for_review((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML10CERT submission of the consequence certification assessment',
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
    'AML10CERT: approved by the independent supervisor on the submitted calculation run.');
  INSERT INTO c_id(k,v) VALUES ('decision', (res->>'decision_id')::uuid);
  res := public.supervisory_assessment_publish_risk_of_record((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML10CERT publication of the certification risk-of-record');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('publication', (res->>'publication_id')::uuid);
  IF (SELECT c.v FROM c_id c WHERE c.k='publication') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: the AML10CERT risk-of-record was not published (%)', res; END IF;
  RAISE NOTICE 'FIXTURE: AML10CERT published risk-of-record in force for this transaction only';
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
-- AML-10 fixture extensions: a governed review schedule, an open
-- consequence, an open reassessment and a canonical issued finding.
-- Every one of them is created through the canonical AML-08/AML-09
-- operations and is discarded by the final ROLLBACK.
-- =====================================================================
CREATE OR REPLACE FUNCTION pg_temp.c_report(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_portfolio_report(_payload);
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_export(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_portfolio_export(_payload);
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_row(_r jsonb, _e uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements(_r->'entities') x WHERE x->>'entity_id' = _e::text;
$$;

-- an approved explicit review schedule ninety days ahead (AML-09 governed op)
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.c_reschedule('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
        'disposition','RESCHEDULED','revised_due_date',(current_date + 90)::text,
        'rationale','AML10CERT: the next AML/CFT review is set ninety days ahead for the portfolio fixture.'));
  IF NOT COALESCE((r->>'created')::boolean,false) THEN
    RAISE EXCEPTION 'FIXTURE: the AML10CERT review schedule was not recorded (%)', r; END IF;
END $$;

-- an open governed consequence (AML-08) and its canonical plan
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','AML10CERT supervisory plan',
    'rationale','AML10CERT: the published AML/CFT risk-of-record warrants a governed supervisory plan.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_plan', (res->>'decision_id')::uuid), ('plan', (res->>'target_id')::uuid);
END $$;

-- an open reassessment requirement (AML-08 governed op, review authority)
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
    'rationale','AML10CERT: an event-driven AML/CFT reassessment is required for the portfolio fixture.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_re', (res->>'decision_id')::uuid), ('reassessment', (res->>'target_id')::uuid);
END $$;

-- a canonical issued finding, reached through the real finding lifecycle
DO $$
DECLARE fid uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'severity','HIGH','title','AML10CERT customer due diligence failure',
    'observation','AML10CERT fixture observation for the portfolio certification.',
    'required_action','AML10CERT fixture required action.'));
  PERFORM public.supervisory_finding_lifecycle(fid,'REVIEW','AML10CERT: the fixture finding is submitted for review.');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_finding_lifecycle(fid,'ISSUED','AML10CERT: the fixture finding is issued to the entity.');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('finding', fid);
END $$;

-- =====================================================================
-- PORT-01 — the visible-entity total is exactly the set of entities the
--           persona's regulator, domain and supervisory perimeter admit.
-- =====================================================================
DO $$
DECLARE r jsonb; expected int;
BEGIN
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  SELECT count(*) INTO expected FROM public.licensees l
   WHERE public.supervisory_monitoring_scope_admits(
           'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT', l.id,
           l.lead_regulator_id, l.sector_id);
  IF (r->'summary'->>'visible_entity_total')::int <> expected THEN
    RAISE EXCEPTION 'FAIL PORT-01: the report reports % visible entities, the scope admits %',
      r->'summary'->>'visible_entity_total', expected; END IF;
  IF (r->'summary'->>'entity_total')::int <> jsonb_array_length(r->'entities')
     AND NOT COALESCE((r->>'truncated')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL PORT-01: the filtered total does not match the returned rows'; END IF;
  RAISE NOTICE 'PASS PORT-01: the visible-entity total is exactly the admitted scope (%)', expected;
END $$;

-- =====================================================================
-- PORT-02 — the current-risk total is the count of entities that actually
--           hold a risk-of-record; it is never inferred.
-- =====================================================================
DO $$
DECLARE r jsonb; withr int; without int; n int;
BEGIN
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  SELECT count(*) FILTER (WHERE x->>'current_risk' IS NOT NULL),
         count(*) FILTER (WHERE x->>'current_risk' IS NULL), count(*)
    INTO withr, without, n FROM jsonb_array_elements(r->'entities') x;
  IF (r->'summary'->>'entities_with_current_risk')::int <> withr
     OR (r->'summary'->>'entities_without_risk')::int <> without THEN
    RAISE EXCEPTION 'FAIL PORT-02: current-risk totals %/% do not match the rows %/%',
      r->'summary'->>'entities_with_current_risk', r->'summary'->>'entities_without_risk', withr, without; END IF;
  IF withr + without <> n THEN
    RAISE EXCEPTION 'FAIL PORT-02: the risk split does not partition the portfolio'; END IF;
  RAISE NOTICE 'PASS PORT-02: % entities hold a risk-of-record and % do not', withr, without;
END $$;

-- =====================================================================
-- PORT-03 — a governed calculated publication lands in CALCULATED with the
--           rating read from the risk-of-record, never recomputed.
-- =====================================================================
DO $$
DECLARE r jsonb; row jsonb; stored text;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  row := pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity'));
  SELECT residual_rating INTO stored FROM public.entity_risk_state
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND domain_code='AML_CFT';
  IF row IS NULL THEN RAISE EXCEPTION 'FAIL PORT-03: the published fixture entity is missing from the portfolio'; END IF;
  IF row->>'provenance_bucket' <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL PORT-03: a calculated publication is bucketed as %', row->>'provenance_bucket'; END IF;
  IF row->>'current_risk' IS DISTINCT FROM stored THEN
    RAISE EXCEPTION 'FAIL PORT-03: the report shows % while the risk-of-record holds %',
      row->>'current_risk', stored; END IF;
  IF row->>'calculation_availability' <> 'CALCULATED' OR row->>'rating_provenance' <> 'COMPUTED' THEN
    RAISE EXCEPTION 'FAIL PORT-03: provenance %/% is not a governed calculated outcome',
      row->>'rating_provenance', row->>'calculation_availability'; END IF;
  IF row->>'publication_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL PORT-03: the calculated rating carries no publication lineage'; END IF;
  RAISE NOTICE 'PASS PORT-03: the calculated bucket carries the published rating % with its publication lineage', stored;
END $$;

-- =====================================================================
-- PORT-04 — the approved-override bucket holds exactly the entities whose
--           canonical provenance is an approved override, and never a
--           calculated rating.
-- =====================================================================
DO $$
DECLARE r jsonb; expected int; reported int;
BEGIN
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  SELECT count(*) INTO expected FROM jsonb_array_elements(r->'entities') x
   WHERE x->>'rating_provenance' = 'APPROVED_OVERRIDE';
  reported := (r->'summary'->>'approved_override_total')::int;
  IF reported <> expected THEN
    RAISE EXCEPTION 'FAIL PORT-04: % overrides reported against % canonical override provenances', reported, expected; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE x->>'rating_provenance' = 'APPROVED_OVERRIDE'
                AND x->>'provenance_bucket' <> 'APPROVED_OVERRIDE') THEN
    RAISE EXCEPTION 'FAIL PORT-04: an approved override is reported as a calculated rating'; END IF;
  RAISE NOTICE 'PASS PORT-04: the approved-override bucket matches canonical override provenance (%)', reported;
END $$;

-- =====================================================================
-- PORT-05 — a legacy risk-of-record stays in the LEGACY bucket and is
--           declared as not calculated.
-- =====================================================================
DO $$
DECLARE r jsonb; row jsonb;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  row := pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='legacy'));
  IF row IS NULL THEN
    RAISE NOTICE 'SKIP-CONTEXT PORT-05: the legacy entity is outside this persona scope';
  ELSE
    IF row->>'provenance_bucket' NOT IN ('LEGACY','NOT_CALCULABLE') THEN
      RAISE EXCEPTION 'FAIL PORT-05: the legacy risk-of-record is bucketed as %', row->>'provenance_bucket'; END IF;
    IF row->>'provenance_bucket' = 'CALCULATED' THEN
      RAISE EXCEPTION 'FAIL PORT-05: a legacy rating is presented as calculated'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(row->'reason_codes') rc
                    WHERE rc->>'field' = 'provenance') THEN
      RAISE EXCEPTION 'FAIL PORT-05: the legacy provenance is not disclosed to the reader'; END IF;
    RAISE NOTICE 'PASS PORT-05: the legacy risk-of-record is reported as % with an honest disclosure',
      row->>'provenance_bucket';
  END IF;
END $$;

-- =====================================================================
-- PORT-06 — the NOT_CALCULABLE bucket never contains a calculated outcome.
-- =====================================================================
DO $$
DECLARE r jsonb; expected int; reported int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  SELECT count(*) INTO expected FROM jsonb_array_elements(r->'entities') x
   WHERE x->>'provenance_bucket' = 'NOT_CALCULABLE';
  reported := (r->'summary'->>'not_calculable_total')::int;
  IF reported <> expected THEN
    RAISE EXCEPTION 'FAIL PORT-06: the NOT_CALCULABLE total % does not match the rows %', reported, expected; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE x->>'provenance_bucket' = 'NOT_CALCULABLE'
                AND x->>'calculation_availability' = 'CALCULATED') THEN
    RAISE EXCEPTION 'FAIL PORT-06: a calculated outcome is reported as NOT_CALCULABLE'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE x->>'provenance_bucket' = 'NOT_CALCULABLE'
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(x->'reason_codes') rc
                                 WHERE rc->>'field' = 'provenance')) THEN
    RAISE EXCEPTION 'FAIL PORT-06: a NOT_CALCULABLE entity carries no explanation'; END IF;
  RAISE NOTICE 'PASS PORT-06: % NOT_CALCULABLE entities are declared honestly', reported;
END $$;

-- =====================================================================
-- PORT-07 — an entity with no risk-of-record sits in the no-risk bucket
--           with no rating, band or review date invented for it.
-- =====================================================================
DO $$
DECLARE r jsonb; row jsonb;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  row := pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='norisk'));
  IF row IS NULL THEN RAISE EXCEPTION 'FAIL PORT-07: the no-risk entity is missing from the visible portfolio'; END IF;
  IF row->>'provenance_bucket' <> 'NO_RISK' THEN
    RAISE EXCEPTION 'FAIL PORT-07: an entity with no risk-of-record is bucketed as %', row->>'provenance_bucket'; END IF;
  IF row->>'current_risk' IS NOT NULL OR row->>'next_review_date' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL PORT-07: a rating or review date was invented without a risk-of-record'; END IF;
  IF row->>'monitoring_state' <> 'BLOCKED' THEN
    RAISE EXCEPTION 'FAIL PORT-07: the no-risk entity is reported as %', row->>'monitoring_state'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(row->'reason_codes') rc
                  WHERE rc->>'code' = 'NO_RISK_OF_RECORD') THEN
    RAISE EXCEPTION 'FAIL PORT-07: the absence of a risk-of-record is not disclosed'; END IF;
  RAISE NOTICE 'PASS PORT-07: the no-risk entity is reported as NO_RISK with nothing inferred';
END $$;

-- =====================================================================
-- PORT-08 — the provenance buckets partition the portfolio exactly once:
--           no entity is counted twice and none is dropped.
-- =====================================================================
DO $$
DECLARE r jsonb; total int; sum_buckets int; dist_total int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  total := (r->'summary'->>'entity_total')::int;
  sum_buckets := (r->'summary'->>'calculated_risk_total')::int
               + (r->'summary'->>'approved_override_total')::int
               + (r->'summary'->>'legacy_risk_total')::int
               + (r->'summary'->>'not_calculable_total')::int
               + (r->'summary'->>'no_risk_total')::int;
  IF sum_buckets <> total THEN
    RAISE EXCEPTION 'FAIL PORT-08: the buckets sum to % against a portfolio of %', sum_buckets, total; END IF;
  SELECT COALESCE(sum((x->>'entities')::int),0) INTO dist_total
    FROM jsonb_array_elements(r->'risk_distribution') x;
  IF dist_total <> total THEN
    RAISE EXCEPTION 'FAIL PORT-08: the risk distribution counts % against a portfolio of %', dist_total, total; END IF;
  IF EXISTS (SELECT x->>'entity_id' FROM jsonb_array_elements(r->'entities') x
              GROUP BY x->>'entity_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL PORT-08: an entity appears more than once in the portfolio'; END IF;
  RAISE NOTICE 'PASS PORT-08: % entities are bucketed and distributed exactly once', total;
END $$;

-- =====================================================================
-- EXPO-01 — the review-state totals are the AML-09 states and they
--           partition the portfolio.
-- =====================================================================
DO $$
DECLARE r jsonb; total int; s int; dist int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  total := (r->'summary'->>'entity_total')::int;
  s := (r->'summary'->>'review_current_total')::int + (r->'summary'->>'review_due_total')::int
     + (r->'summary'->>'review_overdue_total')::int + (r->'summary'->>'review_event_triggered_total')::int
     + (r->'summary'->>'review_unscheduled_total')::int + (r->'summary'->>'review_blocked_total')::int
     + (r->'summary'->>'review_legacy_total')::int;
  IF s <> total THEN
    RAISE EXCEPTION 'FAIL EXPO-01: the review states sum to % against a portfolio of %', s, total; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE x->>'monitoring_state' NOT IN ('CURRENT','DUE','OVERDUE','EVENT_TRIGGERED',
                                                   'UNSCHEDULED','BLOCKED','LEGACY')) THEN
    RAISE EXCEPTION 'FAIL EXPO-01: an ungoverned review state is reported'; END IF;
  SELECT COALESCE(sum((x->>'entities')::int),0) INTO dist FROM jsonb_array_elements(r->'review_distribution') x;
  IF dist <> total THEN
    RAISE EXCEPTION 'FAIL EXPO-01: the review distribution counts % against %', dist, total; END IF;
  RAISE NOTICE 'PASS EXPO-01: the seven canonical review states partition % entities', total;
END $$;

-- =====================================================================
-- EXPO-02 — current, due and overdue follow the recorded review date at
--           the requested as-of date; no interval is assumed.
-- =====================================================================
DO $$
DECLARE e uuid := (SELECT c.v FROM c_id c WHERE c.k='entity'); a jsonb; b jsonb; cc jsonb;
BEGIN
  a := pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb), e);
  b := pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
         jsonb_build_object('as_of',(current_date + 90)::text)), e);
  cc := pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
         jsonb_build_object('as_of',(current_date + 91)::text)), e);
  IF a->>'monitoring_state' <> 'CURRENT' OR a->>'monitoring_reason_code' <> 'REVIEW_NOT_YET_DUE' THEN
    RAISE EXCEPTION 'FAIL EXPO-02: a future review date reports %/%',
      a->>'monitoring_state', a->>'monitoring_reason_code'; END IF;
  IF b->>'monitoring_state' <> 'DUE' THEN
    RAISE EXCEPTION 'FAIL EXPO-02: on the review date the state is %', b->>'monitoring_state'; END IF;
  IF cc->>'monitoring_state' <> 'OVERDUE' THEN
    RAISE EXCEPTION 'FAIL EXPO-02: one day later the state is %', cc->>'monitoring_state'; END IF;
  IF (a->>'due_date_basis') <> 'EXPLICIT_SCHEDULE_DECISION' THEN
    RAISE EXCEPTION 'FAIL EXPO-02: the review date basis is %', a->>'due_date_basis'; END IF;
  IF a->>'current_risk' IS DISTINCT FROM cc->>'current_risk' THEN
    RAISE EXCEPTION 'FAIL EXPO-02: restating the as-of date changed the rating'; END IF;
  RAISE NOTICE 'PASS EXPO-02: CURRENT/DUE/OVERDUE follow the recorded review date only';
END $$;

-- =====================================================================
-- EXPO-03 — every reported review state is the AML-09 read model's own
--           state: the report re-derives nothing.
-- =====================================================================
DO $$
DECLARE r jsonb; x jsonb; v jsonb; checked int := 0;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  FOR x IN SELECT e FROM jsonb_array_elements(r->'entities') e LOOP
    IF x->>'provenance_bucket' = 'NO_RISK' THEN CONTINUE; END IF;
    v := pg_temp.c_view('0b522724-adcb-48bf-b21d-175339479616',(x->>'entity_id')::uuid);
    IF v->>'monitoring_state' IS DISTINCT FROM x->>'monitoring_state' THEN
      RAISE EXCEPTION 'FAIL EXPO-03: entity % is % in the report and % in the AML-09 read model',
        x->>'entity_id', x->>'monitoring_state', v->>'monitoring_state'; END IF;
    IF NULLIF(v->'schedule'->>'next_review_date','') IS DISTINCT FROM NULLIF(x->>'next_review_date','') THEN
      RAISE EXCEPTION 'FAIL EXPO-03: entity % carries a different review date in the report', x->>'entity_id'; END IF;
    checked := checked + 1;
  END LOOP;
  RAISE NOTICE 'PASS EXPO-03: % entities carry exactly the AML-09 review state and date', checked;
END $$;

-- =====================================================================
-- EXPO-04 — an open reassessment requirement is reported as exposure.
-- =====================================================================
DO $$
DECLARE r jsonb; row jsonb; expected int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  row := pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity'));
  IF row->>'open_reassessment_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL EXPO-04: the open reassessment requirement is not reported'; END IF;
  IF (row->>'open_reassessment_id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='reassessment') THEN
    RAISE EXCEPTION 'FAIL EXPO-04: a different reassessment requirement is reported'; END IF;
  SELECT count(*) INTO expected FROM jsonb_array_elements(r->'entities') x
   WHERE x->>'open_reassessment_id' IS NOT NULL;
  IF (r->'summary'->>'entities_with_open_reassessment')::int <> expected THEN
    RAISE EXCEPTION 'FAIL EXPO-04: the reassessment total % does not match the rows %',
      r->'summary'->>'entities_with_open_reassessment', expected; END IF;
  RAISE NOTICE 'PASS EXPO-04: the open reassessment requirement is reported for % entities', expected;
END $$;

-- =====================================================================
-- EXPO-05 — an open AML-08 consequence decision is reported as exposure
--           and withdrawn or closed decisions are excluded.
-- =====================================================================
DO $$
DECLARE r jsonb; row jsonb; expected int; before int; after int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  row := pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity'));
  before := (row->>'open_consequence_count')::int;
  IF before < 2 THEN
    RAISE EXCEPTION 'FAIL EXPO-05: the two governed consequence decisions are reported as %', before; END IF;
  SELECT count(*) INTO expected FROM jsonb_array_elements(r->'entities') x
   WHERE (x->>'open_consequence_count')::int > 0;
  IF (r->'summary'->>'entities_with_open_consequence')::int <> expected THEN
    RAISE EXCEPTION 'FAIL EXPO-05: the consequence total does not match the rows'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_consequence_withdraw((SELECT c.v FROM c_id c WHERE c.k='dec_plan'),
    'AML10CERT: the plan consequence is withdrawn to certify that withdrawn decisions leave the exposure counts.');
  RESET ROLE;
  after := (pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb),
             (SELECT c.v FROM c_id c WHERE c.k='entity'))->>'open_consequence_count')::int;
  IF after <> before - 1 THEN
    RAISE EXCEPTION 'FAIL EXPO-05: a withdrawn consequence is still counted (% then %)', before, after; END IF;
  RAISE NOTICE 'PASS EXPO-05: open consequences are counted and withdrawn ones are excluded';
END $$;

-- =====================================================================
-- EXPO-06 — findings, examinations, interventions and enforcement
--           exposure equal the canonical open records.
-- =====================================================================
DO $$
DECLARE r jsonb; x jsonb; f int; ex int; iv int; en int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  FOR x IN SELECT e FROM jsonb_array_elements(r->'entities') e LOOP
    SELECT count(*) INTO f FROM public.supervisory_finding s
     WHERE s.entity_id=(x->>'entity_id')::uuid AND upper(COALESCE(s.domain_code,''))='AML_CFT'
       AND s.status NOT IN ('CLOSED','SUPERSEDED','DRAFT')
       AND upper(COALESCE(s.confidentiality,'')) NOT IN ('RESTRICTED','CONFIDENTIAL');
    SELECT count(*) INTO ex FROM public.examinations s
     WHERE s.entity_id=(x->>'entity_id')::uuid AND upper(COALESCE(s.domain_code,''))='AML_CFT'
       AND s.closed_at IS NULL;
    SELECT count(*) INTO iv FROM public.supervisory_intervention s
     WHERE s.licensee_id=(x->>'entity_id')::uuid AND upper(COALESCE(s.domain_code,''))='AML_CFT'
       AND upper(COALESCE(s.status,'')) IN ('PROPOSED','ENDORSED','ACTIVE');
    SELECT count(*) INTO en FROM public.enforcement_actions s
     WHERE s.entity_id=(x->>'entity_id')::uuid
       AND lower(COALESCE(s.status,'')) NOT IN ('closed','withdrawn');
    IF (x->>'open_findings')::int <> f OR (x->>'open_examinations')::int <> ex
       OR (x->>'open_interventions')::int <> iv OR (x->>'open_enforcement')::int <> en THEN
      RAISE EXCEPTION 'FAIL EXPO-06: entity % exposure %/%/%/% differs from canonical %/%/%/%',
        x->>'entity_id', x->>'open_findings', x->>'open_examinations', x->>'open_interventions',
        x->>'open_enforcement', f, ex, iv, en; END IF;
  END LOOP;
  RAISE NOTICE 'PASS EXPO-06: every entity''s supervisory exposure equals the canonical open records';
END $$;

-- =====================================================================
-- EXPO-07 — a closed finding leaves the open exposure counts.
-- =====================================================================
DO $$
DECLARE fid uuid := (SELECT c.v FROM c_id c WHERE c.k='finding'); before int; after int; t int;
BEGIN
  before := (pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb),
              (SELECT c.v FROM c_id c WHERE c.k='entity'))->>'open_findings')::int;
  IF before < 1 THEN RAISE EXCEPTION 'FAIL EXPO-07: the issued fixture finding is not reported as open'; END IF;
  UPDATE public.supervisory_finding SET status='CLOSED' WHERE id=fid;
  after := (pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb),
             (SELECT c.v FROM c_id c WHERE c.k='entity'))->>'open_findings')::int;
  IF after <> before - 1 THEN
    RAISE EXCEPTION 'FAIL EXPO-07: a closed finding is still reported as open exposure (% then %)', before, after; END IF;
  UPDATE public.supervisory_finding SET status='ISSUED' WHERE id=fid;
  t := (pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'summary'->>'open_findings_total')::int;
  IF t < 1 THEN RAISE EXCEPTION 'FAIL EXPO-07: the portfolio finding total was not restored'; END IF;
  RAISE NOTICE 'PASS EXPO-07: closed supervisory records are excluded from open exposure';
END $$;

-- =====================================================================
-- TREND-01 — every reported movement is an immutable risk-history record.
-- =====================================================================
DO $$
DECLARE r jsonb; m jsonb; expected int; reported int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  reported := jsonb_array_length(r->'trends'->'movements');
  IF r->'trends'->>'source' <> 'entity_risk_state_movement' THEN
    RAISE EXCEPTION 'FAIL TREND-01: the trend source is declared as %', r->'trends'->>'source'; END IF;
  FOR m IN SELECT x FROM jsonb_array_elements(r->'trends'->'movements') x LOOP
    -- the report emits canonical upper-case rating codes; the ledger keeps its
    -- own stored value untouched, so the comparison is made canonically.
    IF NOT EXISTS (SELECT 1 FROM public.entity_risk_state_movement v
                    WHERE v.id = (m->>'movement_id')::uuid
                      AND v.entity_id = (m->>'entity_id')::uuid
                      AND upper(NULLIF(v.new_rating,'')) IS NOT DISTINCT FROM m->>'new_rating'
                      AND upper(NULLIF(v.previous_rating,'')) IS NOT DISTINCT FROM m->>'previous_rating') THEN
      RAISE EXCEPTION 'FAIL TREND-01: movement % is not an immutable risk-history record', m->>'movement_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') e
                    WHERE e->>'entity_id' = m->>'entity_id') THEN
      RAISE EXCEPTION 'FAIL TREND-01: movement % belongs to an entity outside the report', m->>'movement_id'; END IF;
  END LOOP;
  SELECT count(*) INTO expected FROM public.entity_risk_state_movement v
   WHERE upper(COALESCE(v.domain_code,''))='AML_CFT'
     AND COALESCE(v.approved_at, v.created_at)::date
         BETWEEN (r->'trends'->>'period_from')::date AND (r->'trends'->>'period_to')::date
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') e
                  WHERE e->>'entity_id' = v.entity_id::text);
  IF reported <> expected THEN
    RAISE EXCEPTION 'FAIL TREND-01: % movements reported against % in the immutable history', reported, expected; END IF;
  RAISE NOTICE 'PASS TREND-01: all % trend movements come from the immutable risk history', reported;
END $$;

-- =====================================================================
-- TREND-02 — opening and closing states are the recorded period boundaries.
-- =====================================================================
DO $$
DECLARE r jsonb; x jsonb; pf date; pt date; k text; expected jsonb := '{}'::jsonb; n int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  pf := (r->'trends'->>'period_from')::date; pt := (r->'trends'->>'period_to')::date;
  FOR x IN SELECT e FROM jsonb_array_elements(r->'entities') e LOOP
    SELECT COALESCE((SELECT upper(NULLIF(v.previous_rating,'')) FROM public.entity_risk_state_movement v
                      WHERE v.entity_id=(x->>'entity_id')::uuid
                        AND upper(COALESCE(v.domain_code,''))='AML_CFT'
                        AND COALESCE(v.approved_at,v.created_at)::date BETWEEN pf AND pt
                      ORDER BY COALESCE(v.approved_at,v.created_at) ASC LIMIT 1),
                    x->>'current_risk','NONE') INTO k;
    expected := jsonb_set(expected, ARRAY[k], to_jsonb(COALESCE((expected->>k)::int,0) + 1));
  END LOOP;
  IF expected <> r->'trends'->'opening' THEN
    RAISE EXCEPTION 'FAIL TREND-02: the opening distribution % is not the recorded period opening %',
      r->'trends'->'opening', expected; END IF;
  expected := '{}'::jsonb;
  FOR x IN SELECT e FROM jsonb_array_elements(r->'entities') e LOOP
    SELECT COALESCE((SELECT upper(NULLIF(v.new_rating,'')) FROM public.entity_risk_state_movement v
                      WHERE v.entity_id=(x->>'entity_id')::uuid
                        AND upper(COALESCE(v.domain_code,''))='AML_CFT'
                        AND COALESCE(v.approved_at,v.created_at)::date BETWEEN pf AND pt
                      ORDER BY COALESCE(v.approved_at,v.created_at) DESC LIMIT 1),
                    x->>'current_risk','NONE') INTO k;
    expected := jsonb_set(expected, ARRAY[k], to_jsonb(COALESCE((expected->>k)::int,0) + 1));
  END LOOP;
  IF expected <> r->'trends'->'closing' THEN
    RAISE EXCEPTION 'FAIL TREND-02: the closing distribution % is not the recorded period closing %',
      r->'trends'->'closing', expected; END IF;
  SELECT COALESCE(sum(value::int),0) INTO n FROM jsonb_each_text(r->'trends'->'closing');
  IF n <> (r->'summary'->>'entity_total')::int THEN
    RAISE EXCEPTION 'FAIL TREND-02: the closing distribution covers % of % entities',
      n, r->'summary'->>'entity_total'; END IF;
  RAISE NOTICE 'PASS TREND-02: opening and closing states are the recorded period boundaries';
END $$;

-- =====================================================================
-- TREND-03 — upward, downward and unchanged classification follows the
--            recorded trend, never a re-comparison of ratings.
-- =====================================================================
DO $$
DECLARE r jsonb; m jsonb; up int := 0; dn int := 0; fl int := 0; ot int := 0; expected text;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  FOR m IN SELECT x FROM jsonb_array_elements(r->'trends'->'movements') x LOOP
    SELECT CASE upper(COALESCE(m->>'trend',''))
             WHEN 'DETERIORATING' THEN 'UPWARD'
             WHEN 'IMPROVING' THEN 'DOWNWARD'
             WHEN 'STABLE' THEN 'UNCHANGED'
             ELSE 'UNCLASSIFIED' END INTO expected;
    IF m->>'direction' IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'FAIL TREND-03: recorded trend % is classified as %', m->>'trend', m->>'direction'; END IF;
    up := up + (CASE WHEN m->>'direction'='UPWARD' THEN 1 ELSE 0 END);
    dn := dn + (CASE WHEN m->>'direction'='DOWNWARD' THEN 1 ELSE 0 END);
    fl := fl + (CASE WHEN m->>'direction'='UNCHANGED' THEN 1 ELSE 0 END);
    ot := ot + (CASE WHEN m->>'direction'='UNCLASSIFIED' THEN 1 ELSE 0 END);
  END LOOP;
  IF (r->'trends'->>'upward_movements')::int <> up
     OR (r->'trends'->>'downward_movements')::int <> dn
     OR (r->'trends'->>'unchanged_movements')::int <> fl
     OR (r->'trends'->>'unclassified_movements')::int <> ot THEN
    RAISE EXCEPTION 'FAIL TREND-03: the trend counters do not match the classified movements'; END IF;
  RAISE NOTICE 'PASS TREND-03: direction is read from the recorded trend (%/%/%/%)', up, dn, fl, ot;
END $$;

-- =====================================================================
-- TREND-04 — current records are never used to invent history.
-- =====================================================================
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
        'period_from',(current_date + 30)::text,'period_to',(current_date + 60)::text));
  IF jsonb_array_length(r->'trends'->'movements') <> 0 THEN
    RAISE EXCEPTION 'FAIL TREND-04: movements were produced for a period with no risk history'; END IF;
  IF (r->'trends'->>'upward_movements')::int <> 0 OR (r->'trends'->>'downward_movements')::int <> 0
     OR (r->'trends'->>'unchanged_movements')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL TREND-04: trend counters were invented without movements'; END IF;
  IF (r->'summary'->>'entity_total')::int = 0 THEN
    RAISE EXCEPTION 'FAIL TREND-04: the portfolio itself disappeared with an empty trend period'; END IF;
  RAISE NOTICE 'PASS TREND-04: an empty history period yields no movements and no invented trend';
END $$;

-- =====================================================================
-- TREND-05 — legacy movements stay distinguishable from governed ones.
-- =====================================================================
DO $$
DECLARE r jsonb; m jsonb; n int := 0;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  FOR m IN SELECT x FROM jsonb_array_elements(r->'trends'->'movements') x LOOP
    IF (m->>'legacy_movement')::boolean IS DISTINCT FROM (m->>'new_assessment_id' IS NULL) THEN
      RAISE EXCEPTION 'FAIL TREND-05: movement % misreports its legacy status', m->>'movement_id'; END IF;
    IF (m->>'legacy_movement')::boolean THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'PASS TREND-05: legacy movements remain distinguishable (% legacy of %)',
    n, jsonb_array_length(r->'trends'->'movements');
END $$;

-- =====================================================================
-- FILTER-01 — the regulator filter is applied on the server.
-- =====================================================================
DO $$
DECLARE r jsonb; reg uuid := (SELECT c.v FROM c_id c WHERE c.k='regulator');
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object('regulator_id', reg));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE (x->>'regulator_id')::uuid IS DISTINCT FROM reg) THEN
    RAISE EXCEPTION 'FAIL FILTER-01: a foreign regulator survived the regulator filter'; END IF;
  IF (r->'filters'->>'regulator_id')::uuid <> reg THEN
    RAISE EXCEPTION 'FAIL FILTER-01: the applied regulator filter is not echoed'; END IF;
  IF (r->'summary'->>'entity_total')::int <> jsonb_array_length(r->'entities') THEN
    RAISE EXCEPTION 'FAIL FILTER-01: the summary was not recomputed for the filtered set'; END IF;
  RAISE NOTICE 'PASS FILTER-01: the regulator filter is applied by the server (% entities)',
    r->'summary'->>'entity_total';
END $$;

-- =====================================================================
-- FILTER-02 — the supervisory perimeter is never widened by a filter.
-- =====================================================================
DO $$
DECLARE r jsonb; other uuid;
BEGIN
  SELECT l.lead_regulator_id INTO other FROM public.licensees l
   WHERE l.lead_regulator_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='regulator')
   ORDER BY l.lead_regulator_id LIMIT 1;
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235',
        jsonb_build_object('regulator_id', COALESCE(other, gen_random_uuid())));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE NOT public.supervisory_monitoring_scope_admits(
                      'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT',
                      (x->>'entity_id')::uuid,(x->>'regulator_id')::uuid,
                      NULLIF(x->>'sector_id','')::uuid)) THEN
    RAISE EXCEPTION 'FAIL FILTER-02: a filter widened the persona perimeter'; END IF;
  RAISE NOTICE 'PASS FILTER-02: filters can only narrow the assigned supervisory perimeter';
END $$;

-- =====================================================================
-- FILTER-03 — risk and provenance filters.
-- =====================================================================
DO $$
DECLARE r jsonb; rating text;
BEGIN
  SELECT residual_rating INTO rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND domain_code='AML_CFT';
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object('risk_code', rating));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x WHERE x->>'current_risk' <> rating) THEN
    RAISE EXCEPTION 'FAIL FILTER-03: the risk filter admitted another rating'; END IF;
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-03: the fixture entity was dropped by its own rating filter'; END IF;
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object('provenance','CALCULATED'));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE x->>'provenance_bucket' <> 'CALCULATED') THEN
    RAISE EXCEPTION 'FAIL FILTER-03: the provenance filter admitted another bucket'; END IF;
  IF (r->'summary'->>'legacy_risk_total')::int <> 0 OR (r->'summary'->>'no_risk_total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL FILTER-03: the summary still counts filtered-out buckets'; END IF;
  RAISE NOTICE 'PASS FILTER-03: risk and provenance filters are applied to rows and summary alike';
END $$;

-- =====================================================================
-- FILTER-04 — the monitoring-state filter uses the AML-09 state.
-- =====================================================================
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object('monitoring_state','CURRENT'));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x WHERE x->>'monitoring_state' <> 'CURRENT') THEN
    RAISE EXCEPTION 'FAIL FILTER-04: the monitoring filter admitted another state'; END IF;
  IF (r->'summary'->>'review_current_total')::int <> (r->'summary'->>'entity_total')::int THEN
    RAISE EXCEPTION 'FAIL FILTER-04: the review summary does not match the filtered set'; END IF;
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-04: the CURRENT fixture entity is missing from the CURRENT filter'; END IF;
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object('monitoring_state','BLOCKED'));
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='norisk')) IS NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-04: the no-risk entity is missing from the BLOCKED filter'; END IF;
  RAISE NOTICE 'PASS FILTER-04: the monitoring-state filter is the AML-09 state';
END $$;

-- =====================================================================
-- FILTER-05 — programme and sector filters are canonical, not guessed.
-- =====================================================================
DO $$
DECLARE r jsonb; sect uuid := (SELECT c.v FROM c_id c WHERE c.k='sector');
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object('sector_id', sect));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE NULLIF(x->>'sector_id','')::uuid IS DISTINCT FROM sect) THEN
    RAISE EXCEPTION 'FAIL FILTER-05: the sector filter admitted another sector'; END IF;
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('programme_id', gen_random_uuid()));
  IF jsonb_array_length(r->'entities') <> 0 OR (r->'summary'->>'entity_total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL FILTER-05: an unknown programme filter still returned entities'; END IF;
  IF (r->'summary'->>'visible_entity_total')::int = 0 THEN
    RAISE EXCEPTION 'FAIL FILTER-05: the visible scope was lost by a programme filter'; END IF;
  RAISE NOTICE 'PASS FILTER-05: programme and sector filters select canonical values only';
END $$;

-- =====================================================================
-- FILTER-06 — the consequence-type filter selects governed consequences.
-- =====================================================================
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('consequence_action_type','REQUIRE_REASSESSMENT'));
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-06: the entity with an open reassessment consequence was filtered out'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE (x->>'open_consequence_count')::int = 0) THEN
    RAISE EXCEPTION 'FAIL FILTER-06: an entity with no matching consequence survived the filter'; END IF;
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('consequence_action_type','REVOKE_LICENCE'));
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-06: an unrelated consequence type still matched the entity'; END IF;
  -- the withdrawn plan consequence must no longer match its own action type
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('consequence_action_type','OPEN_SUPERVISORY_PLAN'));
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-06: a withdrawn consequence still satisfied the consequence filter'; END IF;
  RAISE NOTICE 'PASS FILTER-06: the consequence-type filter matches governed AML-08 decisions only';
END $$;

-- =====================================================================
-- FILTER-07 — the effective-date range filter.
-- =====================================================================
DO $$
DECLARE r jsonb; eff date;
BEGIN
  eff := (pg_temp.c_row(pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb),
            (SELECT c.v FROM c_id c WHERE c.k='entity'))->>'effective_from')::date;
  IF eff IS NULL THEN RAISE EXCEPTION 'FAIL FILTER-07: the fixture risk-of-record has no effective date'; END IF;
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('effective_from', eff::text,'effective_to', eff::text));
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-07: the entity is missing from its own effective-date range'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x
              WHERE NULLIF(x->>'effective_from','')::date IS DISTINCT FROM eff) THEN
    RAISE EXCEPTION 'FAIL FILTER-07: the effective-date range admitted another date'; END IF;
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('effective_from',(eff + 1)::text));
  IF pg_temp.c_row(r,(SELECT c.v FROM c_id c WHERE c.k='entity')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL FILTER-07: the entity survived a range that starts after its effective date'; END IF;
  RAISE NOTICE 'PASS FILTER-07: the effective-date range filter is applied on the server';
END $$;

-- =====================================================================
-- FILTER-08 — an invalid period is refused rather than guessed.
-- =====================================================================
DO $$
DECLARE refused boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
      jsonb_build_object('period_from',(current_date)::text,'period_to',(current_date - 30)::text));
  EXCEPTION WHEN others THEN refused := true; END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL FILTER-08: an inverted trend period was silently accepted'; END IF;
  RAISE NOTICE 'PASS FILTER-08: an invalid reporting period is refused, never guessed';
END $$;

-- =====================================================================
-- FILTER-09 — summary, table, trend and export share one filtered source.
-- =====================================================================
DO $$
DECLARE p jsonb; r jsonb; e jsonb; m jsonb;
BEGIN
  p := jsonb_build_object('provenance','CALCULATED','monitoring_state','CURRENT');
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616', p);
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616', p);
  IF r->'summary' <> e->'summary' OR r->'row_count' <> e->'row_count' THEN
    RAISE EXCEPTION 'FAIL FILTER-09: the export summary diverges from the screen summary'; END IF;
  IF (r->'summary'->>'entity_total')::int <> jsonb_array_length(r->'entities') THEN
    RAISE EXCEPTION 'FAIL FILTER-09: the summary and the table disagree under a filter'; END IF;
  FOR m IN SELECT x FROM jsonb_array_elements(r->'trends'->'movements') x LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') y
                    WHERE y->>'entity_id' = m->>'entity_id') THEN
      RAISE EXCEPTION 'FAIL FILTER-09: the trend uses an entity outside the filtered table'; END IF;
  END LOOP;
  IF r->'filters' <> e->'filters' THEN
    RAISE EXCEPTION 'FAIL FILTER-09: the export declares different filters'; END IF;
  RAISE NOTICE 'PASS FILTER-09: summary, table, trend and export share one filtered server source';
END $$;

-- =====================================================================
-- EXPORT-01 — screen and export totals are identical.
-- =====================================================================
DO $$
DECLARE r jsonb; e jsonb;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  IF r->'summary' <> e->'summary' THEN
    RAISE EXCEPTION 'FAIL EXPORT-01: the export summary is not the screen summary'; END IF;
  IF jsonb_array_length(e->'entities') <> jsonb_array_length(r->'entities') THEN
    RAISE EXCEPTION 'FAIL EXPORT-01: the export row count differs from the screen'; END IF;
  IF r->'risk_distribution' <> e->'risk_distribution'
     OR r->'review_distribution' <> e->'review_distribution' THEN
    RAISE EXCEPTION 'FAIL EXPORT-01: the export distributions differ from the screen'; END IF;
  RAISE NOTICE 'PASS EXPORT-01: the export and the screen report identical totals';
END $$;

-- =====================================================================
-- EXPORT-02 — the export carries its filters and as-of timestamp.
-- =====================================================================
DO $$
DECLARE e jsonb;
BEGIN
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('monitoring_state','CURRENT','as_of',current_date::text));
  IF e->'filters'->>'monitoring_state' <> 'CURRENT' THEN
    RAISE EXCEPTION 'FAIL EXPORT-02: the export does not state the filters it was produced under'; END IF;
  IF NULLIF(e->>'as_of','') IS NULL OR NULLIF(e->>'generated_at','') IS NULL THEN
    RAISE EXCEPTION 'FAIL EXPORT-02: the export has no as-of or generation timestamp'; END IF;
  IF (e->>'as_of')::date <> current_date THEN
    RAISE EXCEPTION 'FAIL EXPORT-02: the export as-of date is not the requested date'; END IF;
  RAISE NOTICE 'PASS EXPORT-02: the export states its filters, as-of date and generation time';
END $$;

-- =====================================================================
-- EXPORT-03 — the export records the actor and regulator provenance.
-- =====================================================================
DO $$
DECLARE e jsonb;
BEGIN
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616',
        jsonb_build_object('regulator_id',(SELECT c.v FROM c_id c WHERE c.k='regulator')));
  IF (e->>'generated_by_id')::uuid <> '0b522724-adcb-48bf-b21d-175339479616' THEN
    RAISE EXCEPTION 'FAIL EXPORT-03: the export does not record the requesting actor'; END IF;
  IF NULLIF(e->>'generated_by','') IS NULL THEN
    RAISE EXCEPTION 'FAIL EXPORT-03: the export has no named generator'; END IF;
  IF (e->>'regulator_id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='regulator') THEN
    RAISE EXCEPTION 'FAIL EXPORT-03: the export does not record its regulator scope'; END IF;
  IF e->>'report_title' IS NULL THEN
    RAISE EXCEPTION 'FAIL EXPORT-03: the export is untitled'; END IF;
  RAISE NOTICE 'PASS EXPORT-03: the export records actor, regulator and title provenance';
END $$;

-- =====================================================================
-- EXPORT-04 — legacy and NOT_CALCULABLE records are identified honestly.
-- =====================================================================
DO $$
DECLARE e jsonb; x jsonb;
BEGIN
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  FOR x IN SELECT y FROM jsonb_array_elements(e->'entities') y LOOP
    IF x->>'provenance_bucket' IS NULL THEN
      RAISE EXCEPTION 'FAIL EXPORT-04: an exported row carries no provenance'; END IF;
    IF x->>'provenance_bucket' IN ('LEGACY','NOT_CALCULABLE')
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(x->'reason_codes') rc
                        WHERE rc->>'field'='provenance') THEN
      RAISE EXCEPTION 'FAIL EXPORT-04: an exported legacy or NOT_CALCULABLE rating is not declared'; END IF;
    IF x->>'provenance_bucket' = 'NO_RISK' AND x->>'current_risk' IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL EXPORT-04: the export invented a rating for an entity with no risk-of-record'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e->'notes') n
                  WHERE n::text ILIKE '%not calculated ratings%') THEN
    RAISE EXCEPTION 'FAIL EXPORT-04: the export carries no provenance caveat for the reader'; END IF;
  RAISE NOTICE 'PASS EXPORT-04: legacy and NOT_CALCULABLE records are exported honestly';
END $$;

-- =====================================================================
-- EXPORT-05 — inaccessible entities and restricted facts never leave.
-- =====================================================================
DO $$
DECLARE e jsonb; x jsonb; hidden int := 0;
BEGIN
  e := pg_temp.c_export('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  FOR x IN SELECT y FROM jsonb_array_elements(e->'entities') y LOOP
    IF NOT public.supervisory_monitoring_scope_admits(
             'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT',(x->>'entity_id')::uuid,
             NULLIF(x->>'regulator_id','')::uuid, NULLIF(x->>'sector_id','')::uuid) THEN
      RAISE EXCEPTION 'FAIL EXPORT-05: an inaccessible entity was exported'; END IF;
    IF COALESCE((x->>'restricted_matter_present')::boolean,false) THEN
      hidden := hidden + 1;
      IF x::text ILIKE '%restricted matter%observation%' THEN
        RAISE EXCEPTION 'FAIL EXPORT-05: restricted content was exported'; END IF;
    END IF;
  END LOOP;
  SELECT count(*) INTO hidden FROM public.licensees l
   WHERE NOT public.supervisory_monitoring_scope_admits(
           'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT', l.id,
           l.lead_regulator_id, l.sector_id)
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(e->'entities') y
                  WHERE y->>'entity_id' = l.id::text);
  IF hidden > 0 THEN
    RAISE EXCEPTION 'FAIL EXPORT-05: % entities outside the perimeter appear in the export', hidden; END IF;
  RAISE NOTICE 'PASS EXPORT-05: the export contains only accessible entities and no restricted content';
END $$;

-- =====================================================================
-- EXPORT-06 — spreadsheet-formula injection is neutralised on the server.
-- =====================================================================
DO $$
DECLARE e jsonb; row jsonb; ent uuid := (SELECT c.v FROM c_id c WHERE c.k='entity'); orig text;
BEGIN
  SELECT name INTO orig FROM public.licensees WHERE id = ent;
  UPDATE public.licensees SET name = '=SUM(A1:A9)+AML10CERT' WHERE id = ent;
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  row := pg_temp.c_row(e, ent);
  IF NOT COALESCE((e->>'csv_injection_neutralised')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL EXPORT-06: the export does not declare formula neutralisation'; END IF;
  IF left(row->>'entity_name',1) IN ('=','+','-','@') THEN
    RAISE EXCEPTION 'FAIL EXPORT-06: an exported value still begins as a spreadsheet formula (%)',
      row->>'entity_name'; END IF;
  IF row->>'entity_name' <> '''=SUM(A1:A9)+AML10CERT' THEN
    RAISE EXCEPTION 'FAIL EXPORT-06: the neutralised value is % ', row->>'entity_name'; END IF;
  UPDATE public.licensees SET name = orig WHERE id = ent;
  RAISE NOTICE 'PASS EXPORT-06: exported text can never execute as a spreadsheet formula';
END $$;

-- =====================================================================
-- EXPORT-07 — the export creates no supervisory record of any kind.
-- =====================================================================
DO $$
DECLARE before_d int; before_a int; before_r int; before_m int;
BEGIN
  SELECT count(*) INTO before_d FROM public.supervisory_consequence_decision;
  SELECT count(*) INTO before_a FROM public.supervisory_assessment;
  SELECT count(*) INTO before_r FROM public.entity_risk_state;
  SELECT count(*) INTO before_m FROM public.entity_risk_state_movement;
  PERFORM pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  PERFORM pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  IF (SELECT count(*) FROM public.supervisory_consequence_decision) <> before_d
     OR (SELECT count(*) FROM public.supervisory_assessment) <> before_a
     OR (SELECT count(*) FROM public.entity_risk_state) <> before_r
     OR (SELECT count(*) FROM public.entity_risk_state_movement) <> before_m THEN
    RAISE EXCEPTION 'FAIL EXPORT-07: reporting wrote a supervisory record'; END IF;
  RAISE NOTICE 'PASS EXPORT-07: reading and exporting the portfolio creates nothing';
END $$;

-- =====================================================================
-- SEC-01 — anonymous access is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.supervisory_portfolio_report('{}'::jsonb);
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SEC-01: an anonymous caller read the portfolio'; END IF;
  RAISE NOTICE 'PASS SEC-01: anonymous portfolio access is refused (%)', msg;
END $$;

-- =====================================================================
-- SEC-02 — a persona without supervisory view authority is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  BEGIN PERFORM pg_temp.c_report('411dd06d-648b-4f32-82cc-897902c0c0b6','{}'::jsonb);
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL SEC-02: a persona with no supervisory authority read the portfolio'; END IF;
  refused := false;
  BEGIN PERFORM pg_temp.c_export('411dd06d-648b-4f32-82cc-897902c0c0b6','{}'::jsonb);
  EXCEPTION WHEN others THEN refused := true; END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL SEC-02: an unauthorised persona exported the portfolio'; END IF;
  RAISE NOTICE 'PASS SEC-02: portfolio read and export require supervisory view authority (%)', msg;
END $$;

-- =====================================================================
-- SEC-03 — cross-regulator and cross-domain data is never returned.
-- =====================================================================
DO $$
DECLARE r jsonb; leak int;
BEGIN
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  SELECT count(*) INTO leak FROM jsonb_array_elements(r->'entities') x
   WHERE NOT public.supervisory_monitoring_scope_admits(
           'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT',(x->>'entity_id')::uuid,
           NULLIF(x->>'regulator_id','')::uuid, NULLIF(x->>'sector_id','')::uuid);
  IF leak > 0 THEN RAISE EXCEPTION 'FAIL SEC-03: % entities outside the perimeter were returned', leak; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'entities') x WHERE x->>'domain_code' <> 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL SEC-03: another supervisory domain was returned'; END IF;
  RAISE NOTICE 'PASS SEC-03: only in-perimeter AML/CFT entities are returned';
END $$;

-- =====================================================================
-- SEC-04 — an invisible entity influences no aggregate.
-- =====================================================================
DO $$
DECLARE r jsonb; hidden uuid; total int;
BEGIN
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  SELECT l.id INTO hidden FROM public.licensees l
   WHERE NOT public.supervisory_monitoring_scope_admits(
           'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT', l.id,
           l.lead_regulator_id, l.sector_id)
   ORDER BY l.id LIMIT 1;
  IF hidden IS NULL THEN
    RAISE NOTICE 'SKIP-CONTEXT SEC-04: this persona supervises every entity in the register';
  ELSE
    IF pg_temp.c_row(r, hidden) IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL SEC-04: an invisible entity appears in the table'; END IF;
    SELECT count(*) INTO total FROM public.licensees l
     WHERE public.supervisory_monitoring_scope_admits(
             'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,'AML_CFT', l.id,
             l.lead_regulator_id, l.sector_id);
    IF (r->'summary'->>'visible_entity_total')::int <> total THEN
      RAISE EXCEPTION 'FAIL SEC-04: an invisible entity influenced the aggregate'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'trends'->'movements') m
                WHERE (m->>'entity_id')::uuid = hidden) THEN
      RAISE EXCEPTION 'FAIL SEC-04: an invisible entity appears in the trend history'; END IF;
    RAISE NOTICE 'PASS SEC-04: the invisible entity is absent from rows, aggregates and trends';
  END IF;
END $$;

-- =====================================================================
-- SEC-05 — the direct-write boundary on canonical records is preserved.
-- =====================================================================
DO $$
DECLARE blocked int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN
    INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating)
    VALUES ((SELECT c.v FROM c_id c WHERE c.k='norisk'),'AML_CFT','LOW');
  EXCEPTION WHEN others THEN blocked := blocked + 1; END;
  BEGIN
    INSERT INTO public.entity_risk_state_movement(entity_id, domain_code, new_rating, reason)
    VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT','LOW','AML10CERT direct write attempt');
  EXCEPTION WHEN others THEN blocked := blocked + 1; END;
  BEGIN
    INSERT INTO public.supervisory_consequence_decision(entity_id, domain_code, action_type, rationale)
    VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT','RECORD_MONITORING','AML10CERT direct write attempt');
  EXCEPTION WHEN others THEN blocked := blocked + 1; END;
  RESET ROLE;
  IF blocked < 3 THEN
    RAISE EXCEPTION 'FAIL SEC-05: only % of 3 direct writes to canonical records were refused', blocked; END IF;
  RAISE NOTICE 'PASS SEC-05: canonical risk, history and consequence records refuse direct writes';
END $$;

-- =====================================================================
-- SEC-06 — the internal read helper is not callable by signed-in users.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_portfolio_internal('{}'::jsonb);
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL SEC-06: the internal portfolio helper is callable by signed-in users'; END IF;
  IF has_function_privilege('anon','public.supervisory_portfolio_internal(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.supervisory_portfolio_report(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.supervisory_portfolio_export(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL SEC-06: an anonymous grant survives on a portfolio function'; END IF;
  RAISE NOTICE 'PASS SEC-06: the internal helper is private and no anonymous grant exists (%)', msg;
END $$;

-- =====================================================================
-- SEC-07 — every definer path is pinned to a fixed search_path.
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('supervisory_portfolio_internal','supervisory_portfolio_report',
                       'supervisory_portfolio_export','supervisory_export_text_safe')
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) cfg
                      WHERE cfg LIKE 'search_path=%');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL SEC-07: unpinned search_path on %', bad; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('supervisory_portfolio_report',
             'supervisory_portfolio_export','supervisory_portfolio_internal')
         AND p.prosecdef) <> 3 THEN
    RAISE EXCEPTION 'FAIL SEC-07: a portfolio function is not a governed definer path'; END IF;
  RAISE NOTICE 'PASS SEC-07: all portfolio definer paths are pinned';
END $$;

-- =====================================================================
-- SEC-08 — no aggregate discloses a restricted or invisible fact.
-- =====================================================================
DO $$
DECLARE r jsonb; x jsonb; f int;
BEGIN
  r := pg_temp.c_report('b8eaf680-fe66-4d49-b816-1c087f511235','{}'::jsonb);
  FOR x IN SELECT y FROM jsonb_array_elements(r->'entities') y LOOP
    SELECT count(*) INTO f FROM public.supervisory_finding s
     WHERE s.entity_id=(x->>'entity_id')::uuid
       AND upper(COALESCE(s.confidentiality,'')) IN ('RESTRICTED','CONFIDENTIAL')
       AND s.status NOT IN ('CLOSED','SUPERSEDED','DRAFT');
    IF f > 0 AND (x->>'open_findings')::int >
       (SELECT count(*) FROM public.supervisory_finding s2
         WHERE s2.entity_id=(x->>'entity_id')::uuid
           AND upper(COALESCE(s2.domain_code,''))='AML_CFT'
           AND s2.status NOT IN ('CLOSED','SUPERSEDED','DRAFT')
           AND upper(COALESCE(s2.confidentiality,'')) NOT IN ('RESTRICTED','CONFIDENTIAL')) THEN
      RAISE EXCEPTION 'FAIL SEC-08: a restricted matter is disclosed through an aggregate'; END IF;
    IF f > 0 AND NOT COALESCE((x->>'restricted_matter_present')::boolean,false) THEN
      RAISE EXCEPTION 'FAIL SEC-08: a restricted matter is neither counted nor disclosed as present'; END IF;
  END LOOP;
  IF r->'notes'::text IS NULL THEN
    RAISE EXCEPTION 'FAIL SEC-08: the report carries no confidentiality caveat'; END IF;
  RAISE NOTICE 'PASS SEC-08: restricted matters are presence-only and never disclosed by aggregate';
END $$;

-- =====================================================================
-- CASE-01..04 — mixed-case historical ratings resolve into ONE canonical
--               reporting bucket, in the report and in the export, without
--               the stored risk history ever being rewritten.
--               Regression for the AML-UAT-01 portfolio trend defect.
-- =====================================================================
DO $$
BEGIN
  INSERT INTO public.entity_risk_state_movement
    (entity_id, domain_code, new_assessment_id, previous_rating, new_rating, trend, reason, created_at, approved_at)
  SELECT (SELECT c.v FROM c_id c WHERE c.k='entity'), 'AML_CFT',
         (SELECT c.v FROM c_id c WHERE c.k='assessment'),
         p, n, 'INCREASED', 'AML10CERT mixed-case rating fixture', now(), now()
    FROM (VALUES ('moderate','high'), ('Moderate','High'), ('MODERATE','HIGH')) AS v(p,n);
  RAISE NOTICE 'FIXTURE: three mixed-case AML10CERT movement rows recorded for this transaction only';
END $$;

DO $$
DECLARE r jsonb; x jsonb; ks text[]; ps text[]; n int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  SELECT array_agg(DISTINCT m->>'new_rating'), array_agg(DISTINCT m->>'previous_rating'), count(*)
    INTO ks, ps, n
    FROM jsonb_array_elements(r->'trends'->'movements') m
   WHERE (m->>'movement_id')::uuid IN (SELECT v.id FROM public.entity_risk_state_movement v
                                        WHERE v.reason = 'AML10CERT mixed-case rating fixture');
  IF n < 3 THEN
    RAISE EXCEPTION 'FAIL CASE-01: only % of the three mixed-case movements are reported', n; END IF;
  IF ks <> ARRAY['HIGH'] THEN
    RAISE EXCEPTION 'FAIL CASE-01: HIGH/high/High produced the buckets %', ks; END IF;
  IF ps <> ARRAY['MODERATE'] THEN
    RAISE EXCEPTION 'FAIL CASE-01: MODERATE/Moderate/moderate produced the buckets %', ps; END IF;
  RAISE NOTICE 'PASS CASE-01: HIGH + high + High resolve into one canonical HIGH bucket (and MODERATE likewise)';
END $$;

DO $$
DECLARE r jsonb; e jsonb; k text;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  e := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  -- every reported and exported rating label is already canonical
  FOR k IN SELECT m->>'new_rating' FROM jsonb_array_elements(r->'trends'->'movements') m
           UNION ALL SELECT m->>'previous_rating' FROM jsonb_array_elements(r->'trends'->'movements') m
           UNION ALL SELECT m->>'new_rating' FROM jsonb_array_elements(e->'trends'->'movements') m
           UNION ALL SELECT m->>'previous_rating' FROM jsonb_array_elements(e->'trends'->'movements') m
           UNION ALL SELECT j.key FROM jsonb_each_text(r->'trends'->'opening') j
           UNION ALL SELECT j.key FROM jsonb_each_text(r->'trends'->'closing') j
           UNION ALL SELECT j.key FROM jsonb_each_text(e->'trends'->'opening') j
           UNION ALL SELECT j.key FROM jsonb_each_text(e->'trends'->'closing') j
  LOOP
    IF k IS NOT NULL AND k <> upper(k) THEN
      RAISE EXCEPTION 'FAIL CASE-02: a non-canonical rating label % is reported', k; END IF;
  END LOOP;
  IF e->'trends'->'opening' <> r->'trends'->'opening'
     OR e->'trends'->'closing' <> r->'trends'->'closing'
     OR jsonb_array_length(e->'trends'->'movements') <> jsonb_array_length(r->'trends'->'movements') THEN
    RAISE EXCEPTION 'FAIL CASE-02: the export and the report disagree about the canonical trend'; END IF;
  RAISE NOTICE 'PASS CASE-02: report and export publish identical canonical rating labels and counts';
END $$;

DO $$
DECLARE stored text[]; lower_hist bigint;
BEGIN
  -- the three stored variants must still be exactly as written: reporting
  -- normalises presentation, it never rewrites the immutable ledger.
  SELECT array_agg(DISTINCT new_rating) INTO stored
    FROM public.entity_risk_state_movement WHERE reason = 'AML10CERT mixed-case rating fixture';
  IF NOT ('HIGH' = ANY(stored) AND 'High' = ANY(stored) AND 'high' = ANY(stored))
     OR array_length(stored,1) <> 3 THEN
    RAISE EXCEPTION 'FAIL CASE-03: the stored risk history was rewritten to %', stored; END IF;
  IF EXISTS (SELECT 1 FROM public.entity_risk_state_movement
              WHERE reason = 'AML10CERT mixed-case rating fixture'
                AND previous_rating NOT IN ('moderate','Moderate','MODERATE')) THEN
    RAISE EXCEPTION 'FAIL CASE-03: a stored previous rating was rewritten'; END IF;
  -- the pre-existing operational lower-case history is also still lower case
  SELECT count(*) INTO lower_hist FROM public.entity_risk_state_movement
   WHERE reason IS DISTINCT FROM 'AML10CERT mixed-case rating fixture'
     AND new_rating IS NOT NULL AND new_rating <> upper(new_rating);
  RAISE NOTICE 'PASS CASE-03: the immutable history keeps its stored values exactly (% ; % pre-existing lower-case rows untouched)',
    stored, lower_hist;
END $$;


DO $$
DECLARE r jsonb; hi int; mo int;
BEGIN
  r := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb);
  hi := COALESCE((r->'trends'->'closing'->>'HIGH')::int,0);
  mo := COALESCE((r->'trends'->'closing'->>'MODERATE')::int,0);
  IF (r->'trends'->'closing' ? 'high') OR (r->'trends'->'closing' ? 'High')
     OR (r->'trends'->'opening' ? 'moderate') OR (r->'trends'->'opening' ? 'Moderate') THEN
    RAISE EXCEPTION 'FAIL CASE-04: a case variant survives as its own distribution bucket'; END IF;
  IF hi > 0 AND mo > 0 AND hi = mo AND hi = (SELECT (r->'summary'->>'entity_total')::int) THEN
    RAISE EXCEPTION 'FAIL CASE-04: distinct canonical ratings were merged into one bucket'; END IF;
  RAISE NOTICE 'PASS CASE-04: case variants collapse but genuinely different canonical ratings stay separate (HIGH=%, MODERATE=%)', hi, mo;
END $$;

-- =====================================================================
-- ROLLBACK-01 — the AML10CERT fixtures exist inside this transaction only.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_consequence_decision
   WHERE rationale LIKE 'AML10CERT%';
  IF n = 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK-01: the certification wrote nothing to roll back'; END IF;
  RAISE NOTICE 'PASS ROLLBACK-01: % AML10CERT consequence decisions are pending rollback', n;
END $$;

-- =====================================================================
-- ROLLBACK-02 — the operational AML risk-of-record set is unchanged.
-- =====================================================================
DO $$
DECLARE d text;
BEGIN
  SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
           s.residual_rating, s.inherent_rating, s.control_rating,
           s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
    INTO d FROM public.entity_risk_state s
   WHERE s.domain_code='AML_CFT' AND s.entity_id <> (SELECT c.v FROM c_id c WHERE c.k='entity');
  IF (SELECT count(*) FROM public.entity_risk_state) < (SELECT c.n FROM c_n c WHERE c.k='risk_state') THEN
    RAISE EXCEPTION 'FAIL ROLLBACK-02: operational risk-of-record rows were removed'; END IF;
  IF (SELECT count(*) FROM public.regulators) <> (SELECT c.n FROM c_n c WHERE c.k='regulators') THEN
    RAISE EXCEPTION 'FAIL ROLLBACK-02: the regulator register changed'; END IF;
  RAISE NOTICE 'PASS ROLLBACK-02: the operational AML risk-of-record set is unchanged (%)', d;
END $$;

ROLLBACK;

-- ---------------------------------------------------------------------
-- Post-rollback proof: nothing named AML10CERT (or from any earlier
-- certification) survives anywhere in the operational data.
-- ---------------------------------------------------------------------
SELECT 'consequence_decisions' AS fixture, count(*) AS surviving
  FROM public.supervisory_consequence_decision WHERE rationale LIKE 'AML10CERT%'
UNION ALL SELECT 'monitoring_decisions', count(*)
  FROM public.supervisory_risk_monitoring_decision WHERE rationale LIKE 'AML10CERT%'
UNION ALL SELECT 'reassessments', count(*)
  FROM public.supervisory_reassessment_requirement WHERE trigger_rationale LIKE 'AML10CERT%'
UNION ALL SELECT 'findings', count(*)
  FROM public.supervisory_finding WHERE title LIKE 'AML10CERT%'
UNION ALL SELECT 'plans', count(*)
  FROM public.supervisory_plan WHERE COALESCE(title,'') LIKE 'AML10CERT%'
UNION ALL SELECT 'assessments', count(*)
  FROM public.supervisory_assessment WHERE summary LIKE 'AML10CERT%'
UNION ALL SELECT 'methodologies', count(*)
  FROM public.supervisory_methodology WHERE code LIKE 'AML10CERT%'
UNION ALL SELECT 'risk_movements', count(*)
  FROM public.entity_risk_state_movement WHERE reason LIKE 'AML10CERT%'
UNION ALL SELECT 'audit_events', count(*)
  FROM public.compliance_audit_logs WHERE justification LIKE 'AML10CERT%'
UNION ALL SELECT 'older_cert_fixtures', (
  SELECT count(*) FROM public.supervisory_methodology
   WHERE code LIKE 'AML0%CERT%' OR code LIKE 'AML1%CERT%');
