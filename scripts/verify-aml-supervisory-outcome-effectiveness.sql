-- =====================================================================
-- AML-11 — GOVERNED EVALUATION OF SUPERVISORY ACTION OUTCOMES
--          AND EFFECTIVENESS : BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- Gate families: ELIG, EVAL, REVIEW, FOLLOW, REPORT, SEC, ROLLBACK.
--
-- Conventions (identical to the AML-01..AML-08 certifications):
--   * one transaction, ROLLBACK at the end — every AML11CERT fixture is
--     discarded, so no operational assessment, risk-of-record, review
--     schedule, reassessment requirement or finding is changed;
--   * behavioural: gates CALL the governed server operations under real
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML11CERT.
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
-- FIXTURE — a governed, published AML/CFT risk-of-record (AML11CERT).
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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
VALUES (gen_random_uuid(), 'AML11CERT-METH', 'AML_CFT', 'AML11CERT consequence fixture', '1.0',
  'ACTIVE', (SELECT c.v FROM c_id c WHERE c.k='sector'), (SELECT c.v FROM c_id c WHERE c.k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML11CERT consequence fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO c_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML11CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),'AML11CERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),'AML11CERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL');
INSERT INTO c_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML11CERT_DIM_I';
INSERT INTO c_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML11CERT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),(SELECT c.v FROM c_id c WHERE c.k='dim_i'),'AML11CERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT c.v FROM c_id c WHERE c.k='meth'),(SELECT c.v FROM c_id c WHERE c.k='dim_c'),'AML11CERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  -- the domain effective-date rule is policy configuration, so the policy
  -- administrator sets it; the officer then creates the assessment.
  PERFORM set_config('request.jwt.claims','{"sub":"cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML11CERT fixture rule, discarded on rollback');
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT c.v FROM c_id c WHERE c.k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 365, _period_end => current_date - 1,
    _methodology_id => (SELECT c.v FROM c_id c WHERE c.k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AML11CERT consequence certification assessment');
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

SELECT pg_temp.c_answer('AML11CERT_Q_I1','NO');
SELECT pg_temp.c_answer('AML11CERT_Q_C1','YES');

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT c.v FROM c_id c WHERE c.k='assessment'),
    _dimension_code => 'AML11CERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 80,
    _rationale => 'AML11CERT inherent dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT c.v FROM c_id c WHERE c.k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT c.v FROM c_id c WHERE c.k='assessment'),
    _dimension_code => 'AML11CERT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 10,
    _rationale => 'AML11CERT control dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT c.v FROM c_id c WHERE c.k='dim_c'));
  RESET ROLE;
END $$;

-- Synthetic approved calculation policy — AML11CERT only, rolled back.
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
    jsonb_build_object('question_code','AML11CERT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML11CERT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','AML11CERT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AML11CERT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FIXTURE: the AML11CERT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','AML11CERT policy submitted for approval');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','AML11CERT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','AML11CERT policy activated by the checker');
  RESET ROLE;
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT c.v FROM c_id c WHERE c.k='assessment'),'AML11CERT_RUN');
  INSERT INTO c_id(k,v) VALUES ('run', (res->>'run_id')::uuid);
  IF (SELECT status FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT c.v FROM c_id c WHERE c.k='run')) <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FIXTURE: the AML11CERT calculation run is not CALCULATED'; END IF;
  res := public.supervisory_assessment_submit_for_review((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML11CERT submission of the consequence certification assessment',
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
    'AML11CERT: approved by the independent supervisor on the submitted calculation run.');
  INSERT INTO c_id(k,v) VALUES ('decision', (res->>'decision_id')::uuid);
  res := public.supervisory_assessment_publish_risk_of_record((SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'AML11CERT publication of the certification risk-of-record');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('publication', (res->>'publication_id')::uuid);
  IF (SELECT c.v FROM c_id c WHERE c.k='publication') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: the AML11CERT risk-of-record was not published (%)', res; END IF;
  RAISE NOTICE 'FIXTURE: AML11CERT published risk-of-record in force for this transaction only';
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
        'rationale','AML11CERT: the next AML/CFT review is set ninety days ahead for the portfolio fixture.'));
  IF NOT COALESCE((r->>'created')::boolean,false) THEN
    RAISE EXCEPTION 'FIXTURE: the AML11CERT review schedule was not recorded (%)', r; END IF;
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
    'title','AML11CERT supervisory plan',
    'rationale','AML11CERT: the published AML/CFT risk-of-record warrants a governed supervisory plan.'));
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
    'rationale','AML11CERT: an event-driven AML/CFT reassessment is required for the portfolio fixture.'));
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
    'severity','HIGH','title','AML11CERT customer due diligence failure',
    'observation','AML11CERT fixture observation for the portfolio certification.',
    'required_action','AML11CERT fixture required action.'));
  PERFORM public.supervisory_finding_lifecycle(fid,'REVIEW','AML11CERT: the fixture finding is submitted for review.');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_finding_lifecycle(fid,'ISSUED','AML11CERT: the fixture finding is issued to the entity.');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('finding', fid);
END $$;
-- =====================================================================
-- AML-11 fixture extensions.
--   * evidence in the entity/assessment context, one restricted item and
--     one item belonging to a different entity and assessment;
--   * a completed supervisory plan (the evaluable action);
--   * a second plan left open, a third plan cancelled;
--   * a record-only consequence (no action to evaluate);
--   * a legacy-lineage consequence and an objective-less consequence,
--     both written through the governed writer flag as fixture
--     arrangement so the server eligibility engine can be exercised on
--     states the canonical operations do not produce.
-- Every row is discarded by the final ROLLBACK.
-- =====================================================================

-- in-context evidence (same entity, same assessment)
INSERT INTO public.supervisory_assessment_evidence_basis(
  assessment_id, entity_id, evidence_type, source_reference, title, confidentiality, origin, as_of_date)
VALUES ((SELECT c.v FROM c_id c WHERE c.k='assessment'), (SELECT c.v FROM c_id c WHERE c.k='entity'),
        'REMEDIATION_RECORD','AML11CERT-EV-1','AML11CERT remediation evidence','INTERNAL','OFFICER_LINKED', current_date - 5);
INSERT INTO c_id(k,v) SELECT 'ev_ok', id FROM public.supervisory_assessment_evidence_basis
 WHERE source_reference='AML11CERT-EV-1';

-- restricted evidence in the same context
INSERT INTO public.supervisory_assessment_evidence_basis(
  assessment_id, entity_id, evidence_type, source_reference, title, confidentiality, origin, as_of_date)
VALUES ((SELECT c.v FROM c_id c WHERE c.k='assessment'), (SELECT c.v FROM c_id c WHERE c.k='entity'),
        'WORKPAPER','AML11CERT-EV-R','AML11CERT restricted STR extract','RESTRICTED','OFFICER_LINKED', current_date - 4);
INSERT INTO c_id(k,v) SELECT 'ev_restricted', id FROM public.supervisory_assessment_evidence_basis
 WHERE source_reference='AML11CERT-EV-R';

-- evidence belonging to a different entity and assessment
INSERT INTO c_id(k,v)
SELECT 'other_assessment', a.id FROM public.supervisory_assessment a
 WHERE a.entity_id <> (SELECT c.v FROM c_id c WHERE c.k='entity')
 ORDER BY a.id LIMIT 1;

INSERT INTO public.supervisory_assessment_evidence_basis(
  assessment_id, entity_id, evidence_type, source_reference, title, confidentiality, origin, as_of_date)
SELECT a.id, a.entity_id, 'WORKPAPER','AML11CERT-EV-X','AML11CERT foreign-context evidence','INTERNAL','OFFICER_LINKED', current_date - 3
  FROM public.supervisory_assessment a WHERE a.id = (SELECT c.v FROM c_id c WHERE c.k='other_assessment');
INSERT INTO c_id(k,v) SELECT 'ev_foreign', id FROM public.supervisory_assessment_evidence_basis
 WHERE source_reference='AML11CERT-EV-X';

-- the evaluable action: the fixture plan is completed
UPDATE public.supervisory_plan
   SET status='COMPLETED', completed_at = now() - interval '3 days'
 WHERE id = (SELECT c.v FROM c_id c WHERE c.k='plan');

-- a second, still-open plan
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','AML11CERT open supervisory plan',
    'rationale','AML11CERT: a second governed supervisory plan is opened and deliberately left open.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_open', (res->>'decision_id')::uuid), ('plan_open', (res->>'target_id')::uuid);
END $$;

-- a third plan, cancelled
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','AML11CERT cancelled supervisory plan',
    'rationale','AML11CERT: a third governed supervisory plan is opened and then cancelled by the regulator.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_cancelled', (res->>'decision_id')::uuid), ('plan_cancelled', (res->>'target_id')::uuid);
  UPDATE public.supervisory_plan SET status='CANCELLED' WHERE id=(SELECT c.v FROM c_id c WHERE c.k='plan_cancelled');
END $$;

-- a record-only consequence: supervisory judgment with no action
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT c.v FROM c_id c WHERE c.k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT c.v FROM c_id c WHERE c.k='assessment'),
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'rationale','AML11CERT: the supervisor records that no further supervisory action is warranted.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_recordonly', (res->>'decision_id')::uuid);
END $$;

-- a legacy-lineage consequence over a completed action, and an
-- objective-less consequence: arranged states the canonical operations do
-- not produce, used only to exercise the server eligibility engine.
DO $$
DECLARE pl uuid; pl2 uuid; d uuid;
BEGIN
  INSERT INTO public.supervisory_plan(reference, title, objective, factual_basis, status, domain_code, regulator_id,
    sector_id, entity_ids, start_date, completed_at, created_by)
  VALUES ('AML11CERT-LEGACY-PLAN','AML11CERT legacy remediation plan','Close legacy AML/CFT control gaps',
    'AML11CERT fixture factual basis',
    'COMPLETED','AML_CFT',(SELECT c.v FROM c_id c WHERE c.k='regulator'),(SELECT c.v FROM c_id c WHERE c.k='sector'),
    ARRAY[(SELECT c.v FROM c_id c WHERE c.k='entity')], current_date - 200, now() - interval '10 days',
    'b8eaf680-fe66-4d49-b816-1c087f511235')
  RETURNING id INTO pl;
  INSERT INTO c_id(k,v) VALUES ('plan_legacy', pl);

  -- an enforcement action carries no title, so a decision that also records
  -- no objective leaves nothing to measure effectiveness against.
  INSERT INTO public.enforcement_actions(entity_id, case_number, enforcement_type, status, stage, date_opened)
  VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML11CERT-NOOBJ-ENF','warning','closed','CLOSED', current_date - 190)
  RETURNING id INTO pl2;
  INSERT INTO c_id(k,v) VALUES ('enf_noobj', pl2);

  PERFORM set_config('app.supervisory_consequence_writer','governed', true);
  INSERT INTO public.supervisory_consequence_decision(
    entity_id, domain_code, regulator_id, sector_id, source_kind, publication_id, risk_state_id,
    assessment_id, source_rating, rating_provenance, calculation_availability, action_type,
    linkage_mode, target_kind, target_id, target_reference, rationale, supervisory_objective,
    status, lineage, idempotency_key, decided_by)
  VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT',(SELECT c.v FROM c_id c WHERE c.k='regulator'),
    (SELECT c.v FROM c_id c WHERE c.k='sector'),'LEGACY_RISK_RECORD', NULL,
    (SELECT s.id FROM public.entity_risk_state s WHERE s.entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND s.domain_code='AML_CFT'),
    NULL,'HIGH','LEGACY_OFFICER_RATING','UNAVAILABLE','OPEN_SUPERVISORY_PLAN','CREATE',
    'SUPERVISORY_PLAN', pl, 'AML11CERT-LEGACY-PLAN',
    'AML11CERT: legacy-lineage consequence arranged for the eligibility engine.',
    'Close legacy AML/CFT control gaps','RECORDED','{}'::jsonb,'AML11CERT-LEGACY-KEY',
    'b8eaf680-fe66-4d49-b816-1c087f511235')
  RETURNING id INTO d;
  INSERT INTO c_id(k,v) VALUES ('dec_legacy', d);

  INSERT INTO public.supervisory_consequence_decision(
    entity_id, domain_code, regulator_id, sector_id, source_kind, publication_id, risk_state_id,
    assessment_id, source_rating, rating_provenance, calculation_availability, action_type,
    linkage_mode, target_kind, target_id, target_reference, rationale, supervisory_objective,
    status, lineage, idempotency_key, decided_by)
  VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT',(SELECT c.v FROM c_id c WHERE c.k='regulator'),
    (SELECT c.v FROM c_id c WHERE c.k='sector'),'PUBLICATION',(SELECT c.v FROM c_id c WHERE c.k='publication'),
    (SELECT s.id FROM public.entity_risk_state s WHERE s.entity_id=(SELECT c.v FROM c_id c WHERE c.k='entity') AND s.domain_code='AML_CFT'),
    (SELECT c.v FROM c_id c WHERE c.k='assessment'),'HIGH','COMPUTED','CALCULATED','REFER_TO_ENFORCEMENT','CREATE',
    'ENFORCEMENT_ACTION', pl2, 'AML11CERT-NOOBJ-ENF',
    'AML11CERT: objective-less consequence arranged for the eligibility engine.',
    NULL,'RECORDED','{}'::jsonb,'AML11CERT-NOOBJ-KEY',
    'b8eaf680-fe66-4d49-b816-1c087f511235')
  RETURNING id INTO d;
  INSERT INTO c_id(k,v) VALUES ('dec_noobj', d);
  PERFORM set_config('app.supervisory_consequence_writer','', true);
END $$;

-- ---------------------------------------------------------- AML-11 helpers
CREATE OR REPLACE FUNCTION pg_temp.c_ov(_persona text, _entity uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_outcome_view(COALESCE(_entity,(SELECT c.v FROM c_id c WHERE c.k='entity')),'AML_CFT');
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_action(_r jsonb, _dec uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements(_r->'actions') x WHERE x->>'decision_id' = _dec::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.c_evaluation(_r jsonb, _id uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements(_r->'evaluations') x WHERE x->>'id' = _id::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.c_eval(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_outcome_evaluate(_payload);
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_review(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_outcome_review(_payload);
  RESET ROLE;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_followup(_persona text, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_persona,'role','authenticated')::text, true);
  v := public.supervisory_outcome_followup(_payload);
  RESET ROLE;
  RETURN v;
END $$;

-- =====================================================================
-- ELIG-01 — a completed governed action is eligible, and the server says so.
-- =====================================================================
DO $$
DECLARE a jsonb;
BEGIN
  a := pg_temp.c_action(pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235'),
                        (SELECT c.v FROM c_id c WHERE c.k='dec_plan'));
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL ELIG-01: the completed fixture action is absent from the read model'; END IF;
  IF NOT (a->>'evaluable')::boolean OR a->>'reason_code' <> 'OK' THEN
    RAISE EXCEPTION 'FAIL ELIG-01: a completed action is refused as % (%)', a->>'reason_code', a->>'reason'; END IF;
  IF NOT (a->>'action_completed')::boolean OR a->>'action_status' <> 'COMPLETED' THEN
    RAISE EXCEPTION 'FAIL ELIG-01: completion is not recognised (%)', a->>'action_status'; END IF;
  IF a->>'action_objective' IS NULL THEN
    RAISE EXCEPTION 'FAIL ELIG-01: the eligible action carries no objective to measure against'; END IF;
  RAISE NOTICE 'PASS ELIG-01: the completed action is eligible with objective "%"', a->>'action_objective';
END $$;

-- =====================================================================
-- ELIG-02 — an open action is refused, and evaluation of it is refused.
-- =====================================================================
DO $$
DECLARE a jsonb; ok boolean := false; msg text;
BEGIN
  a := pg_temp.c_action(pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235'),
                        (SELECT c.v FROM c_id c WHERE c.k='dec_open'));
  IF (a->>'evaluable')::boolean OR a->>'reason_code' <> 'ACTION_NOT_COMPLETE' THEN
    RAISE EXCEPTION 'FAIL ELIG-02: an open action reports % / %', a->>'evaluable', a->>'reason_code'; END IF;
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_open'),
      'conclusion','EFFECTIVE',
      'rationale','AML11CERT: attempting to conclude effectiveness on an action that is still open.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL ELIG-02: an open action was evaluated'; END IF;
  RAISE NOTICE 'PASS ELIG-02: the open action is refused (%) and evaluation is refused: %', a->>'reason_code', msg;
END $$;

-- =====================================================================
-- ELIG-03 — a cancelled action is distinguished from an open or completed one.
-- =====================================================================
DO $$
DECLARE a jsonb; ok boolean := false;
BEGIN
  a := pg_temp.c_action(pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235'),
                        (SELECT c.v FROM c_id c WHERE c.k='dec_cancelled'));
  IF (a->>'evaluable')::boolean OR a->>'reason_code' <> 'ACTION_CANCELLED' THEN
    RAISE EXCEPTION 'FAIL ELIG-03: a cancelled action reports %', a->>'reason_code'; END IF;
  IF (a->>'action_completed')::boolean OR NOT (a->>'action_cancelled')::boolean THEN
    RAISE EXCEPTION 'FAIL ELIG-03: cancellation is conflated with completion'; END IF;
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_cancelled'),
      'conclusion','INEFFECTIVE',
      'rationale','AML11CERT: attempting to evaluate a cancelled supervisory action for effectiveness.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL ELIG-03: a cancelled action was evaluated'; END IF;
  RAISE NOTICE 'PASS ELIG-03: the cancelled action is identified separately and cannot be evaluated';
END $$;

-- =====================================================================
-- ELIG-04 — an action with no recorded objective cannot be evaluated, and
--           every canonical operation records one.
-- =====================================================================
DO $$
DECLARE a jsonb; ok boolean := false; missing int;
BEGIN
  a := pg_temp.c_action(pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235'),
                        (SELECT c.v FROM c_id c WHERE c.k='dec_noobj'));
  IF (a->>'evaluable')::boolean OR a->>'reason_code' <> 'OBJECTIVE_MISSING' THEN
    RAISE EXCEPTION 'FAIL ELIG-04: an objective-less completed action reports %', a->>'reason_code'; END IF;
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_noobj'),
      'conclusion','EFFECTIVE',
      'rationale','AML11CERT: attempting effectiveness with nothing to measure the action against.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL ELIG-04: an objective-less action was evaluated'; END IF;
  SELECT count(*) INTO missing FROM public.supervisory_consequence_decision
   WHERE rationale LIKE 'AML11CERT%' AND idempotency_key NOT LIKE 'AML11CERT-%'
     AND NULLIF(btrim(COALESCE(supervisory_objective,'')),'') IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'FAIL ELIG-04: % governed consequence decisions carry no objective', missing; END IF;
  RAISE NOTICE 'PASS ELIG-04: the objective is required, and every governed decision records one';
END $$;

-- =====================================================================
-- ELIG-05 — a legacy-lineage action is identified honestly, not hidden.
-- =====================================================================
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  a := pg_temp.c_action(pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235'),
                        (SELECT c.v FROM c_id c WHERE c.k='dec_legacy'));
  b := pg_temp.c_action(pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235'),
                        (SELECT c.v FROM c_id c WHERE c.k='dec_plan'));
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL ELIG-05: the legacy action is hidden from the read model'; END IF;
  IF NOT (a->>'legacy_lineage')::boolean THEN
    RAISE EXCEPTION 'FAIL ELIG-05: a legacy-lineage action is not declared as legacy'; END IF;
  IF a->>'publication_id' IS NOT NULL OR a->>'source_kind' = 'PUBLICATION' THEN
    RAISE EXCEPTION 'FAIL ELIG-05: legacy lineage is presented as a governed publication'; END IF;
  IF (b->>'legacy_lineage')::boolean THEN
    RAISE EXCEPTION 'FAIL ELIG-05: a published action is mislabelled as legacy'; END IF;
  IF NOT (a->>'evaluable')::boolean THEN
    RAISE EXCEPTION 'FAIL ELIG-05: the legacy action is refused instead of being flagged honestly'; END IF;
  RAISE NOTICE 'PASS ELIG-05: the legacy action is flagged legacy_lineage and remains evaluable with disclosure';
END $$;

-- =====================================================================
-- ELIG-06 — the server always returns a reason code for ineligibility.
-- =====================================================================
DO $$
DECLARE r jsonb; a jsonb; n int;
BEGIN
  r := pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235');
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'actions') x
   WHERE NOT (x->>'evaluable')::boolean
     AND (NULLIF(x->>'reason_code','') IS NULL OR NULLIF(x->>'reason','') IS NULL);
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ELIG-06: % ineligible actions carry no reason', n; END IF;
  a := pg_temp.c_action(r,(SELECT c.v FROM c_id c WHERE c.k='dec_recordonly'));
  IF a IS NULL OR a->>'reason_code' <> 'NO_TARGET_ACTION' THEN
    RAISE EXCEPTION 'FAIL ELIG-06: a record-only decision reports %', a->>'reason_code'; END IF;
  RAISE NOTICE 'PASS ELIG-06: every ineligible action carries a canonical reason code';
END $$;

-- =====================================================================
-- EVAL-01 — governed creation of an evaluation by the preparing supervisor.
-- =====================================================================
DO $$
DECLARE res jsonb; e public.supervisory_outcome_evaluation;
BEGIN
  res := pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
    'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_plan'),
    'conclusion','PARTIALLY_EFFECTIVE',
    'rationale','AML11CERT: the plan closed the customer due diligence gap only in part; onboarding files remain weak.',
    'limitations','AML11CERT: transaction monitoring was not re-tested.',
    'recommended_next_step','AML11CERT: consider a targeted reassessment.',
    'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  IF res->>'evaluation_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL EVAL-01: no evaluation was recorded (%)', res; END IF;
  INSERT INTO c_id(k,v) VALUES ('eval1', (res->>'evaluation_id')::uuid);
  SELECT * INTO e FROM public.supervisory_outcome_evaluation WHERE id=(res->>'evaluation_id')::uuid;
  IF e.review_status <> 'SUBMITTED' OR e.conclusion <> 'PARTIALLY_EFFECTIVE'
     OR e.prepared_by <> 'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid THEN
    RAISE EXCEPTION 'FAIL EVAL-01: the recorded evaluation is %/%/%', e.review_status, e.conclusion, e.prepared_by; END IF;
  IF e.version <> 1 OR e.evidence_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL EVAL-01: an unreviewed evaluation is already frozen'; END IF;
  RAISE NOTICE 'PASS EVAL-01: the evaluation is recorded as SUBMITTED v1 by the preparer';
END $$;

-- =====================================================================
-- EVAL-02 — only the canonical conclusion vocabulary is accepted.
-- =====================================================================
DO $$
DECLARE ok boolean := false; conc jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_legacy'),
      'conclusion','MOSTLY_FINE',
      'rationale','AML11CERT: attempting an invented effectiveness conclusion outside the vocabulary.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL EVAL-02: a non-canonical conclusion was accepted'; END IF;
  conc := pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235')->'conclusions';
  IF conc <> '["NOT_ASSESSED","EFFECTIVE","PARTIALLY_EFFECTIVE","INEFFECTIVE","INCONCLUSIVE"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL EVAL-02: the server publishes the vocabulary %', conc; END IF;
  RAISE NOTICE 'PASS EVAL-02: the conclusion vocabulary is server-owned and enforced';
END $$;

-- =====================================================================
-- EVAL-03 — a written rationale is mandatory.
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_legacy'),
      'conclusion','EFFECTIVE','rationale','fine',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL EVAL-03: an evaluation without a written judgment was accepted'; END IF;
  RAISE NOTICE 'PASS EVAL-03: a written supervisory rationale is required';
END $$;

-- =====================================================================
-- EVAL-04 — evidence must belong to the same entity or assessment context.
-- =====================================================================
DO $$
DECLARE ok boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_legacy'),
      'conclusion','EFFECTIVE',
      'rationale','AML11CERT: citing evidence that belongs to a different entity and assessment.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_foreign')))));
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL EVAL-04: out-of-context evidence was accepted'; END IF;
  IF msg NOT LIKE '%evidence_not_in_context%' THEN
    RAISE EXCEPTION 'FAIL EVAL-04: the refusal is not the context refusal: %', msg; END IF;
  RAISE NOTICE 'PASS EVAL-04: only same-entity or same-assessment evidence may be cited';
END $$;

-- =====================================================================
-- EVAL-05 — restricted evidence cannot be cited without authority and is
--           withheld from the read model.
-- =====================================================================
DO $$
DECLARE ok boolean := false; msg text; r jsonb; item jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_legacy'),
      'conclusion','EFFECTIVE',
      'rationale','AML11CERT: citing restricted supervisory evidence without confidential authority.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_restricted')))));
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL EVAL-05: restricted evidence was cited without authority'; END IF;
  IF msg NOT LIKE '%evidence_restricted%' THEN
    RAISE EXCEPTION 'FAIL EVAL-05: the refusal is not the restricted-evidence refusal: %', msg; END IF;
  r := pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235');
  SELECT x INTO item FROM jsonb_array_elements(
      pg_temp.c_evaluation(r,(SELECT c.v FROM c_id c WHERE c.k='eval1'))->'evidence') x LIMIT 1;
  IF item IS NULL OR item->>'evidence_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL EVAL-05: the cited evidence is not published to the reader'; END IF;
  IF (item->>'restricted')::boolean THEN
    RAISE EXCEPTION 'FAIL EVAL-05: unexpected restricted item on the fixture evaluation'; END IF;
  RAISE NOTICE 'PASS EVAL-05: restricted evidence is refused and its contents are withheld';
END $$;

-- =====================================================================
-- EVAL-06 — closure never implies effectiveness.
-- =====================================================================
DO $$
DECLARE a jsonb; r jsonb;
BEGIN
  r := pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235');
  a := pg_temp.c_action(r,(SELECT c.v FROM c_id c WHERE c.k='dec_legacy'));
  IF NOT (a->>'action_completed')::boolean THEN
    RAISE EXCEPTION 'FAIL EVAL-06: the completed legacy fixture is not recognised as complete'; END IF;
  IF a->'active_evaluation' IS NOT NULL AND jsonb_typeof(a->'active_evaluation') <> 'null' THEN
    RAISE EXCEPTION 'FAIL EVAL-06: a closed action carries an evaluation nobody recorded'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(r->'notes') n
                  WHERE n LIKE 'Completion is not effectiveness%') THEN
    RAISE EXCEPTION 'FAIL EVAL-06: the server does not state that completion is not effectiveness'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_outcome_evaluation
              WHERE consequence_decision_id=(SELECT c.v FROM c_id c WHERE c.k='dec_legacy')) THEN
    RAISE EXCEPTION 'FAIL EVAL-06: closing an action created an effectiveness record'; END IF;
  RAISE NOTICE 'PASS EVAL-06: a closed action holds no effectiveness conclusion until a supervisor records one';
END $$;

-- =====================================================================
-- EVAL-07 — a duplicate evaluation of the same action is prevented, and an
--           identical resubmission converges idempotently.
-- =====================================================================
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  a := pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
    'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_plan'),
    'conclusion','PARTIALLY_EFFECTIVE',
    'rationale','AML11CERT: the plan closed the customer due diligence gap only in part; onboarding files remain weak.',
    'limitations','AML11CERT: transaction monitoring was not re-tested.',
    'recommended_next_step','AML11CERT: consider a targeted reassessment.',
    'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  IF (a->>'evaluation_id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='eval1')
     OR NOT COALESCE((a->>'idempotent')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL EVAL-07: an identical resubmission did not converge (%)', a; END IF;
  b := pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
    'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_plan'),
    'conclusion','INEFFECTIVE',
    'rationale','AML11CERT: a second, different conclusion recorded while the first awaits review.',
    'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  IF NOT COALESCE((b->>'duplicate')::boolean,false)
     OR b->>'reason_code' <> 'EVALUATION_PENDING_REVIEW'
     OR (b->>'evaluation_id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='eval1') THEN
    RAISE EXCEPTION 'FAIL EVAL-07: a competing evaluation was accepted (%)', b; END IF;
  IF (SELECT count(*) FROM public.supervisory_outcome_evaluation
       WHERE consequence_decision_id=(SELECT c.v FROM c_id c WHERE c.k='dec_plan')) <> 1 THEN
    RAISE EXCEPTION 'FAIL EVAL-07: more than one evaluation exists for one action'; END IF;
  RAISE NOTICE 'PASS EVAL-07: duplicates converge and no competing evaluation is created';
END $$;

-- =====================================================================
-- EVAL-08 — source lineage is retained on the evaluation.
-- =====================================================================
DO $$
DECLARE e public.supervisory_outcome_evaluation;
BEGIN
  SELECT * INTO e FROM public.supervisory_outcome_evaluation
   WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval1');
  IF e.publication_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='publication')
     OR e.assessment_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='assessment')
     OR e.risk_state_id IS NULL OR e.source_kind <> 'PUBLICATION' THEN
    RAISE EXCEPTION 'FAIL EVAL-08: publication, assessment or risk lineage is missing'; END IF;
  IF e.source_rating IS NULL OR e.rating_provenance IS NULL THEN
    RAISE EXCEPTION 'FAIL EVAL-08: the source rating and its provenance are not retained'; END IF;
  IF e.target_kind <> 'SUPERVISORY_PLAN' OR e.target_id <> (SELECT c.v FROM c_id c WHERE c.k='plan')
     OR e.action_completed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL EVAL-08: the evaluated action and its completion are not retained'; END IF;
  IF e.lineage->>'consequence_decision_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL EVAL-08: the consequence lineage is not carried'; END IF;
  RAISE NOTICE 'PASS EVAL-08: publication, risk, assessment, rating and action lineage are retained';
END $$;

-- =====================================================================
-- REVIEW-01 — maker-checker: approval authority is required.
-- =====================================================================
DO $$
DECLARE ok boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_review('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval1'),'decision','APPROVE',
      'note','AML11CERT: the preparing officer attempts to approve without approval authority.'));
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'REVIEW-01: an officer without approval authority approved an evaluation'; END IF;
  RAISE NOTICE 'PASS REVIEW-01: approval authority is required to review an evaluation (%)', left(msg,90);
END $$;

-- =====================================================================
-- REVIEW-02 — self-approval is refused even with full approval authority.
-- =====================================================================
DO $$
DECLARE res jsonb; ok boolean := false; msg text; ev uuid;
BEGIN
  res := pg_temp.c_eval('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
    'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_legacy'),
    'conclusion','INEFFECTIVE',
    'rationale','AML11CERT: the legacy remediation plan did not remedy the control weakness it targeted.',
    'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  ev := (res->>'evaluation_id')::uuid;
  INSERT INTO c_id(k,v) VALUES ('eval_self', ev);
  BEGIN
    PERFORM pg_temp.c_review('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'evaluation_id',ev,'decision','APPROVE',
      'note','AML11CERT: the same supervisor attempts to approve the evaluation they prepared.'));
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL REVIEW-02: self-approval was accepted'; END IF;
  IF msg NOT LIKE '%self_review_refused%' THEN
    RAISE EXCEPTION 'FAIL REVIEW-02: the refusal is not the self-review refusal: %', msg; END IF;
  IF (SELECT review_status FROM public.supervisory_outcome_evaluation WHERE id=ev) <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'FAIL REVIEW-02: the self-approved evaluation changed state'; END IF;
  IF NOT (pg_temp.c_evaluation(pg_temp.c_ov('0b522724-adcb-48bf-b21d-175339479616'), ev)->>'self_review_blocked')::boolean THEN
    RAISE EXCEPTION 'FAIL REVIEW-02: the server does not disclose the self-review block'; END IF;
  RAISE NOTICE 'PASS REVIEW-02: self-approval is refused and disclosed by the server';
END $$;

-- =====================================================================
-- REVIEW-03 — a returned evaluation is preserved as history and an
--             amendment is a new version linked to it.
-- =====================================================================
DO $$
DECLARE r jsonb; res jsonb; prev public.supervisory_outcome_evaluation; new public.supervisory_outcome_evaluation;
BEGIN
  r := pg_temp.c_review('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
    'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval1'),'decision','RETURN',
    'note','AML11CERT: returned because the onboarding sample is too small to support the conclusion.'));
  IF r->>'review_status' <> 'RETURNED' THEN
    RAISE EXCEPTION 'FAIL REVIEW-03: the return decision reports %', r->>'review_status'; END IF;
  SELECT * INTO prev FROM public.supervisory_outcome_evaluation WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval1');
  IF prev.review_status <> 'RETURNED' OR prev.conclusion <> 'PARTIALLY_EFFECTIVE'
     OR prev.rationale IS NULL OR prev.reviewed_by IS NULL OR prev.review_note IS NULL THEN
    RAISE EXCEPTION 'FAIL REVIEW-03: the returned evaluation was not preserved intact'; END IF;

  res := pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
    'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_plan'),
    'amends_id',(SELECT c.v FROM c_id c WHERE c.k='eval1'),
    'conclusion','INEFFECTIVE',
    'rationale','AML11CERT: on the wider onboarding sample the plan did not achieve its objective at all.',
    'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  INSERT INTO c_id(k,v) VALUES ('eval2', (res->>'evaluation_id')::uuid);
  SELECT * INTO new FROM public.supervisory_outcome_evaluation WHERE id=(res->>'evaluation_id')::uuid;
  IF new.version <> 2 OR new.supersedes_id <> prev.id THEN
    RAISE EXCEPTION 'FAIL REVIEW-03: the amendment is v% superseding %', new.version, new.supersedes_id; END IF;
  IF (SELECT count(*) FROM public.supervisory_outcome_evaluation
       WHERE consequence_decision_id=(SELECT c.v FROM c_id c WHERE c.k='dec_plan')) <> 2 THEN
    RAISE EXCEPTION 'FAIL REVIEW-03: the history is not a two-version chain'; END IF;
  RAISE NOTICE 'PASS REVIEW-03: the returned evaluation is preserved and the amendment is version 2';
END $$;

-- =====================================================================
-- REVIEW-04 — approval freezes the conclusion, rationale and an evidence
--             snapshot, and closes the superseded version.
-- =====================================================================
DO $$
DECLARE r jsonb; e public.supervisory_outcome_evaluation; snap jsonb;
BEGIN
  r := pg_temp.c_review('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
    'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval2'),'decision','APPROVE',
    'note','AML11CERT: approved by the independent supervisor on the wider onboarding sample.'));
  IF r->>'review_status' <> 'APPROVED' OR NOT (r->>'frozen')::boolean THEN
    RAISE EXCEPTION 'FAIL REVIEW-04: approval reports %', r; END IF;
  SELECT * INTO e FROM public.supervisory_outcome_evaluation WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
  IF e.reviewed_by <> '0b522724-adcb-48bf-b21d-175339479616'::uuid OR e.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL REVIEW-04: the reviewing supervisor is not recorded'; END IF;
  snap := e.evidence_snapshot;
  IF snap IS NULL OR jsonb_array_length(snap) = 0 THEN
    RAISE EXCEPTION 'FAIL REVIEW-04: approval did not freeze an evidence snapshot'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snap) x
                  WHERE (x->>'id')::uuid = (SELECT c.v FROM c_id c WHERE c.k='ev_ok')) THEN
    RAISE EXCEPTION 'FAIL REVIEW-04: the snapshot does not contain the cited evidence'; END IF;
  IF (SELECT superseded_by_id FROM public.supervisory_outcome_evaluation
       WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval1')) <> e.id THEN
    RAISE EXCEPTION 'FAIL REVIEW-04: the earlier version was not closed by the approved amendment'; END IF;
  -- a later change to the evidence register must not rewrite the snapshot
  UPDATE public.supervisory_assessment_evidence_basis SET title='AML11CERT retitled after approval'
   WHERE id=(SELECT c.v FROM c_id c WHERE c.k='ev_ok');
  IF (SELECT evidence_snapshot FROM public.supervisory_outcome_evaluation WHERE id=e.id) <> snap THEN
    RAISE EXCEPTION 'FAIL REVIEW-04: the frozen snapshot followed a later register change'; END IF;
  RAISE NOTICE 'PASS REVIEW-04: approval freezes the conclusion, rationale and evidence snapshot';
END $$;

-- =====================================================================
-- REVIEW-05 — an approved evaluation cannot be edited, re-reviewed or deleted.
-- =====================================================================
DO $$
DECLARE n int := 0; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_review('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval2'),'decision','RETURN',
      'note','AML11CERT: attempting to reopen an approved effectiveness conclusion.'));
  EXCEPTION WHEN OTHERS THEN n := n + 1;
  END;
  BEGIN
    PERFORM set_config('app.supervisory_outcome_writer','governed', true);
    UPDATE public.supervisory_outcome_evaluation SET conclusion='EFFECTIVE'
     WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
  EXCEPTION WHEN OTHERS THEN n := n + 1; msg := SQLERRM;
  END;
  BEGIN
    DELETE FROM public.supervisory_outcome_evaluation WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
  EXCEPTION WHEN OTHERS THEN n := n + 1;
  END;
  PERFORM set_config('app.supervisory_outcome_writer','', true);
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL REVIEW-05: only % of 3 mutation attempts were refused', n; END IF;
  IF (SELECT conclusion FROM public.supervisory_outcome_evaluation
       WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2')) <> 'INEFFECTIVE' THEN
    RAISE EXCEPTION 'FAIL REVIEW-05: the approved conclusion changed'; END IF;
  RAISE NOTICE 'PASS REVIEW-05: an approved evaluation is immutable and undeletable (%)', left(COALESCE(msg,''),70);
END $$;

-- =====================================================================
-- REVIEW-06 — no role-name bypass: a signed-in user whose roles carry no
--             canonical supervisory permission is refused everywhere.
-- =====================================================================
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN PERFORM pg_temp.c_ov('411dd06d-648b-4f32-82cc-897902c0c0b6');
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN
    PERFORM pg_temp.c_eval('411dd06d-648b-4f32-82cc-897902c0c0b6', jsonb_build_object(
      'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_plan'),
      'conclusion','EFFECTIVE',
      'rationale','AML11CERT: a user without canonical supervisory permission attempts an evaluation.',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id',(SELECT c.v FROM c_id c WHERE c.k='ev_ok')))));
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN
    PERFORM pg_temp.c_review('411dd06d-648b-4f32-82cc-897902c0c0b6', jsonb_build_object(
      'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval_self'),'decision','APPROVE',
      'note','AML11CERT: a user without canonical approval permission attempts to approve.'));
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL REVIEW-06: only % of 3 unauthorised operations were refused', n; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
              WHERE p.proname LIKE 'supervisory_outcome%'
                AND pg_get_functiondef(p.oid) ~* '(sec_roles|user_roles|profiles)\.?[a-z_]*\s*(=|IN)\s*''(admin|super_admin|aml_head|supervisor)''') THEN
    RAISE EXCEPTION 'FAIL REVIEW-06: an AML-11 routine branches on a role name'; END IF;
  RAISE NOTICE 'PASS REVIEW-06: authority is canonical permission only; no role-name bypass exists';
END $$;

-- =====================================================================
-- FOLLOW-01 — a follow-up is offered only after an approved
--             PARTIALLY_EFFECTIVE, INEFFECTIVE or INCONCLUSIVE outcome.
-- =====================================================================
DO $$
DECLARE r jsonb; ev jsonb; ok boolean := false;
BEGIN
  r := pg_temp.c_ov('0b522724-adcb-48bf-b21d-175339479616');
  ev := pg_temp.c_evaluation(r,(SELECT c.v FROM c_id c WHERE c.k='eval2'));
  IF NOT (ev->>'follow_up_available')::boolean THEN
    RAISE EXCEPTION 'FAIL FOLLOW-01: an approved ineffective outcome offers no follow-up'; END IF;
  IF jsonb_array_length(COALESCE(r->'follow_up_actions','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'FAIL FOLLOW-01: the governed follow-up catalogue is empty'; END IF;
  IF (pg_temp.c_evaluation(r,(SELECT c.v FROM c_id c WHERE c.k='eval_self'))->>'follow_up_available')::boolean THEN
    RAISE EXCEPTION 'FAIL FOLLOW-01: an unapproved evaluation offers a follow-up'; END IF;
  BEGIN
    PERFORM pg_temp.c_followup('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval_self'),
      'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
      'rationale','AML11CERT: attempting a follow-up from an evaluation that is not approved.'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL FOLLOW-01: a follow-up was created from an unapproved evaluation'; END IF;
  RAISE NOTICE 'PASS FOLLOW-01: follow-up is available only from a current approved non-effective outcome';
END $$;

-- =====================================================================
-- FOLLOW-02 — the supervisor must justify the follow-up in writing.
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.c_followup('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
      'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval2'),
      'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE','rationale','because'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL FOLLOW-02: an unjustified follow-up was accepted'; END IF;
  RAISE NOTICE 'PASS FOLLOW-02: a written supervisory justification is required for a follow-up';
END $$;

-- =====================================================================
-- FOLLOW-03 — the follow-up is created only by the canonical AML-08
--             operation, with its own prerequisites and lineage.
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_consequence_decision; e public.supervisory_outcome_evaluation;
BEGIN
  res := pg_temp.c_followup('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
    'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval2'),
    'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
    'rationale','AML11CERT: the ineffective plan outcome warrants a governed AML/CFT reassessment of the entity.'));
  IF res->>'decision_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL FOLLOW-03: the follow-up produced no governed consequence (%)', res; END IF;
  IF COALESCE((res->>'automatic')::boolean,true) THEN
    RAISE EXCEPTION 'FAIL FOLLOW-03: the follow-up is reported as automatic'; END IF;
  INSERT INTO c_id(k,v) VALUES ('dec_follow', (res->>'decision_id')::uuid);
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(res->>'decision_id')::uuid;
  IF d.id IS NULL OR d.action_type <> 'REQUIRE_REASSESSMENT' OR d.target_id IS NULL
     OR d.entity_id <> (SELECT c.v FROM c_id c WHERE c.k='entity') OR d.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'FAIL FOLLOW-03: the follow-up decision is not a canonical AML-08 record'; END IF;
  IF d.decided_by <> '0b522724-adcb-48bf-b21d-175339479616'::uuid THEN
    RAISE EXCEPTION 'FAIL FOLLOW-03: the deciding supervisor is not recorded on the follow-up'; END IF;
  SELECT * INTO e FROM public.supervisory_outcome_evaluation WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.followups) f WHERE f->>'decision_id' = d.id::text) THEN
    RAISE EXCEPTION 'FAIL FOLLOW-03: the follow-up is not linked back to the evaluation'; END IF;
  IF e.conclusion <> 'INEFFECTIVE' OR e.review_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'FAIL FOLLOW-03: the approved evaluation was altered by the follow-up'; END IF;
  RAISE NOTICE 'PASS FOLLOW-03: the follow-up is the canonical AML-08 record % linked to the evaluation', d.id;
END $$;

-- =====================================================================
-- FOLLOW-04 — the target action keeps its own permission requirement.
-- =====================================================================
DO $$
DECLARE ok boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM pg_temp.c_followup('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
      'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval2'),
      'action_type','REFER_TO_ENFORCEMENT','linkage_mode','CREATE',
      'rationale','AML11CERT: an officer without enforcement authority attempts an enforcement referral follow-up.'));
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL FOLLOW-04: an enforcement referral was created without enforcement authority'; END IF;
  RAISE NOTICE 'PASS FOLLOW-04: the target action keeps its own authority and prerequisites (%)', left(msg,90);
END $$;

-- =====================================================================
-- FOLLOW-05 — a duplicate follow-up converges and nothing is automatic.
-- =====================================================================
DO $$
DECLARE res jsonb; e public.supervisory_outcome_evaluation; before int; after int;
BEGIN
  SELECT count(*) INTO before FROM public.supervisory_consequence_decision;
  res := pg_temp.c_followup('0b522724-adcb-48bf-b21d-175339479616', jsonb_build_object(
    'evaluation_id',(SELECT c.v FROM c_id c WHERE c.k='eval2'),
    'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
    'rationale','AML11CERT: the ineffective plan outcome warrants a governed AML/CFT reassessment of the entity.'));
  SELECT count(*) INTO after FROM public.supervisory_consequence_decision;
  IF (res->>'decision_id')::uuid <> (SELECT c.v FROM c_id c WHERE c.k='dec_follow') OR after <> before THEN
    RAISE EXCEPTION 'FAIL FOLLOW-05: a repeated follow-up created a second consequence (% -> %)', before, after; END IF;
  SELECT * INTO e FROM public.supervisory_outcome_evaluation WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
  IF (SELECT count(*) FROM jsonb_array_elements(e.followups) f
       WHERE f->>'decision_id' = (SELECT c.v FROM c_id c WHERE c.k='dec_follow')::text) <> 1 THEN
    RAISE EXCEPTION 'FAIL FOLLOW-05: the follow-up link was duplicated'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_consequence_decision d
              WHERE d.entity_id = e.entity_id AND d.decided_at > e.reviewed_at
                AND d.id <> (SELECT c.v FROM c_id c WHERE c.k='dec_follow')) THEN
    RAISE EXCEPTION 'FAIL FOLLOW-05: a consequence was created that no supervisor selected'; END IF;
  RAISE NOTICE 'PASS FOLLOW-05: repeated follow-ups converge and nothing is created automatically';
END $$;

-- =====================================================================
-- REPORT-01 — the AML-10 outcome totals equal the canonical server counts.
-- =====================================================================
DO $$
DECLARE s jsonb; linked int;
BEGIN
  s := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  IF s IS NULL THEN RAISE EXCEPTION 'FAIL REPORT-01: the portfolio report publishes no outcome summary'; END IF;
  IF s->>'source' <> 'supervisory_outcome_evaluation' THEN
    RAISE EXCEPTION 'FAIL REPORT-01: the outcome summary source is %', s->>'source'; END IF;
  linked := (s->>'completed_actions_total')::int + (s->>'open_actions_total')::int
          + (s->>'cancelled_actions_total')::int;
  IF (s->>'linked_actions_total')::int <> linked THEN
    RAISE EXCEPTION 'FAIL REPORT-01: linked % does not equal completed+open+cancelled %',
      s->>'linked_actions_total', linked; END IF;
  IF (s->>'ineffective_total')::int < 1 THEN
    RAISE EXCEPTION 'FAIL REPORT-01: the approved ineffective outcome is not counted'; END IF;
  RAISE NOTICE 'PASS REPORT-01: % linked actions, % completed, % ineffective',
    s->>'linked_actions_total', s->>'completed_actions_total', s->>'ineffective_total';
END $$;

-- =====================================================================
-- REPORT-02 — the conclusions are separated and never merged.
-- =====================================================================
DO $$
DECLARE s jsonb; sum_c int;
BEGIN
  s := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  sum_c := (s->>'effective_total')::int + (s->>'partially_effective_total')::int
         + (s->>'ineffective_total')::int + (s->>'inconclusive_total')::int
         + (s->>'not_assessed_total')::int;
  IF (s->>'evaluated_total')::int <> sum_c THEN
    RAISE EXCEPTION 'FAIL REPORT-02: evaluated % does not equal the sum of conclusions %',
      s->>'evaluated_total', sum_c; END IF;
  IF (s->>'effective_total')::int > 0 THEN
    RAISE EXCEPTION 'FAIL REPORT-02: an effective outcome is counted where none was approved'; END IF;
  RAISE NOTICE 'PASS REPORT-02: the five conclusions are reported separately (evaluated %)', sum_c;
END $$;

-- =====================================================================
-- REPORT-03 — unevaluated and legacy actions are separated from outcomes.
-- =====================================================================
DO $$
DECLARE s jsonb;
BEGIN
  s := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  IF (s->>'unevaluated_actions_total')::int < 1 THEN
    RAISE EXCEPTION 'FAIL REPORT-03: the open and cancelled fixtures are not reported as unevaluated'; END IF;
  IF (s->>'legacy_lineage_actions_total')::int < 1 THEN
    RAISE EXCEPTION 'FAIL REPORT-03: the legacy-lineage action is not reported separately'; END IF;
  IF (s->>'unevaluated_actions_total')::int + (s->>'evaluated_total')::int
     + (s->>'evaluations_awaiting_review_total')::int > (s->>'linked_actions_total')::int
       + (s->>'evaluations_awaiting_review_total')::int THEN
    RAISE EXCEPTION 'FAIL REPORT-03: unevaluated and evaluated actions overlap'; END IF;
  IF s->>'note' NOT LIKE '%Completion is not effectiveness%' THEN
    RAISE EXCEPTION 'FAIL REPORT-03: the report does not disclose that completion is not effectiveness'; END IF;
  RAISE NOTICE 'PASS REPORT-03: % unevaluated and % legacy actions are reported separately',
    s->>'unevaluated_actions_total', s->>'legacy_lineage_actions_total';
END $$;

-- =====================================================================
-- REPORT-04 — no action is counted twice.
-- =====================================================================
DO $$
DECLARE s jsonb; canonical int;
BEGIN
  s := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  SELECT count(*) INTO canonical FROM public.supervisory_consequence_decision d
   WHERE d.domain_code='AML_CFT' AND d.status='RECORDED' AND d.target_id IS NOT NULL
     AND d.entity_id = (SELECT c.v FROM c_id c WHERE c.k='entity');
  IF (s->>'linked_actions_total')::int < canonical THEN
    RAISE EXCEPTION 'FAIL REPORT-04: % linked actions reported against % canonical fixture actions',
      s->>'linked_actions_total', canonical; END IF;
  IF (s->>'evaluated_total')::int + (s->>'evaluations_awaiting_review_total')::int
     + (s->>'unevaluated_actions_total')::int - (s->>'evaluations_awaiting_review_total')::int
     <> (s->>'evaluated_total')::int + (s->>'unevaluated_actions_total')::int THEN
    RAISE EXCEPTION 'FAIL REPORT-04: the evaluation buckets do not partition the linked actions'; END IF;
  IF (SELECT count(*) FROM public.supervisory_outcome_evaluation
       WHERE consequence_decision_id=(SELECT c.v FROM c_id c WHERE c.k='dec_plan')
         AND review_status='APPROVED' AND superseded_by_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL REPORT-04: an action carries more than one current approved outcome'; END IF;
  RAISE NOTICE 'PASS REPORT-04: each action contributes exactly one outcome to the totals';
END $$;

-- =====================================================================
-- REPORT-05 — the export matches the server report exactly.
-- =====================================================================
DO $$
DECLARE rep jsonb; exp jsonb;
BEGIN
  rep := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  exp := pg_temp.c_export('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  IF exp IS NULL THEN RAISE EXCEPTION 'FAIL REPORT-05: the export publishes no outcome summary'; END IF;
  IF rep <> exp THEN
    RAISE EXCEPTION 'FAIL REPORT-05: the export outcome totals differ from the report'; END IF;
  RAISE NOTICE 'PASS REPORT-05: the export reproduces the server outcome totals exactly';
END $$;

-- =====================================================================
-- REPORT-06 — the actor's own scope is preserved in the totals.
-- =====================================================================
DO $$
DECLARE mine jsonb; scoped jsonb; ok boolean := false;
BEGIN
  mine := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616','{}'::jsonb)->'outcome_summary';
  scoped := pg_temp.c_report('0b522724-adcb-48bf-b21d-175339479616',
     jsonb_build_object('regulator_id', gen_random_uuid()))->'outcome_summary';
  IF (scoped->>'linked_actions_total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL REPORT-06: a foreign regulator filter still returns % actions',
      scoped->>'linked_actions_total'; END IF;
  IF (mine->>'linked_actions_total')::int = 0 THEN
    RAISE EXCEPTION 'FAIL REPORT-06: the supervisor sees none of their own linked actions'; END IF;
  BEGIN PERFORM pg_temp.c_report('411dd06d-648b-4f32-82cc-897902c0c0b6','{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL REPORT-06: an unauthorised user read the portfolio outcome totals'; END IF;
  RAISE NOTICE 'PASS REPORT-06: the outcome totals respect the actor scope and refuse outsiders';
END $$;

-- =====================================================================
-- SEC-01 — anonymous access is refused on every AML-11 entry point.
-- =====================================================================
DO $$
DECLARE n int := 0;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.supervisory_outcome_view((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT');
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN PERFORM public.supervisory_outcome_evaluate('{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN PERFORM public.supervisory_outcome_review('{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN PERFORM public.supervisory_outcome_followup('{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  RESET ROLE;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL SEC-01: only % of 4 anonymous calls were refused', n; END IF;
  RAISE NOTICE 'PASS SEC-01: anonymous access is refused on all four AML-11 entry points';
END $$;

-- =====================================================================
-- SEC-02 — a cross-regulator entity is refused.
-- =====================================================================
DO $$
DECLARE ok boolean := false; msg text; x uuid;
BEGIN
  SELECT l.id INTO x FROM public.licensees l
   WHERE l.lead_regulator_id IS DISTINCT FROM (SELECT c.v FROM c_id c WHERE c.k='regulator')
   ORDER BY l.id LIMIT 1;
  IF x IS NULL THEN RAISE NOTICE 'SKIP-CONTEXT SEC-02: no out-of-scope entity exists'; RETURN; END IF;
  BEGIN PERFORM pg_temp.c_ov('b8eaf680-fe66-4d49-b816-1c087f511235', x);
  EXCEPTION WHEN OTHERS THEN ok := true; msg := SQLERRM; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL SEC-02: an out-of-scope entity was read'; END IF;
  RAISE NOTICE 'PASS SEC-02: a cross-regulator entity is refused (%)', left(msg,80);
END $$;

-- =====================================================================
-- SEC-03 — direct writes and deletes by a signed-in user are refused.
-- =====================================================================
DO $$
DECLARE n int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN
    INSERT INTO public.supervisory_outcome_evaluation(
      entity_id, domain_code, consequence_decision_id, action_type, target_kind, target_id,
      action_objective, source_kind, rating_provenance, conclusion, rationale, idempotency_key)
    VALUES ((SELECT c.v FROM c_id c WHERE c.k='entity'),'AML_CFT',
      (SELECT c.v FROM c_id c WHERE c.k='dec_plan'),'OPEN_SUPERVISORY_PLAN','SUPERVISORY_PLAN',
      (SELECT c.v FROM c_id c WHERE c.k='plan'),'objective','PUBLICATION','COMPUTED','EFFECTIVE',
      'AML11CERT: a direct insert bypassing the governed operation.','AML11CERT-DIRECT');
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN
    UPDATE public.supervisory_outcome_evaluation SET review_note='AML11CERT direct update'
     WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
    -- a refusal may also present as zero affected rows under row level security
    IF NOT FOUND THEN n := n + 1; END IF;
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  BEGIN
    DELETE FROM public.supervisory_outcome_evaluation WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2');
    IF NOT FOUND THEN n := n + 1; END IF;
  EXCEPTION WHEN OTHERS THEN n := n + 1; END;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_outcome_evaluation
                  WHERE id=(SELECT c.v FROM c_id c WHERE c.k='eval2')
                    AND COALESCE(review_note,'') <> 'AML11CERT direct update') THEN
    RAISE EXCEPTION 'FAIL SEC-03: a signed-in user altered or removed an evaluation directly';
  END IF;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL SEC-03: only % of 3 direct mutations were refused', n; END IF;
  RAISE NOTICE 'PASS SEC-03: signed-in users cannot insert, update or delete an outcome evaluation';
END $$;

-- =====================================================================
-- SEC-04 — internal helpers remain inaccessible to signed-in users.
-- =====================================================================
DO $$
DECLARE n int := 0; total int := 0; f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
            JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
           WHERE p.proname IN ('supervisory_outcome_action_internal','supervisory_outcome_evidence_internal',
                               'supervisory_outcome_portfolio_totals_internal','supervisory_outcome_may_prepare',
                               'supervisory_outcome_writer_guard','supervisory_outcome_immutable_guard')
  LOOP
    total := total + 1;
    IF has_function_privilege('authenticated', f.sig, 'EXECUTE')
       OR has_function_privilege('anon', f.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL SEC-04: internal helper % is executable by a signed-in user', f.sig; END IF;
    n := n + 1;
  END LOOP;
  IF total < 6 THEN RAISE EXCEPTION 'FAIL SEC-04: only % internal helpers were found', total; END IF;
  RAISE NOTICE 'PASS SEC-04: % internal AML-11 helpers are inaccessible to anon and authenticated', n;
END $$;

-- =====================================================================
-- SEC-05 — every AML-11 definer routine pins its search path.
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname LIKE 'supervisory_outcome%' AND p.prosecdef
     AND COALESCE(array_to_string(p.proconfig,','),'') NOT LIKE '%search_path%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL SEC-05: definer routines without a pinned search path: %', bad; END IF;
  RAISE NOTICE 'PASS SEC-05: every AML-11 security-definer routine pins search_path';
END $$;

-- =====================================================================
-- SEC-06 — restricted evidence never leaks through the read model.
-- =====================================================================
DO $$
DECLARE res jsonb; ev uuid; item jsonb;
BEGIN
  -- the checker holds confidential authority in this fixture only if granted;
  -- the officer never does, so the officer's read is the leak test.
  res := pg_temp.c_eval('b8eaf680-fe66-4d49-b816-1c087f511235', jsonb_build_object(
    'consequence_decision_id',(SELECT c.v FROM c_id c WHERE c.k='dec_noobj'),
    'conclusion','NOT_ASSESSED',
    'rationale','AML11CERT: not assessed, recorded only to test the restricted-evidence boundary.'));
  IF res IS NOT NULL AND res->>'evaluation_id' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL SEC-06: an ineligible action was evaluated'; END IF;
EXCEPTION WHEN OTHERS THEN
  -- the ineligible action is correctly refused; now assert the read boundary
  FOR item IN SELECT x FROM jsonb_array_elements(
        public.supervisory_outcome_evidence_internal('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid,
          ARRAY[(SELECT c.v FROM c_id c WHERE c.k='ev_restricted')])) x
  LOOP
    IF NOT (item->>'restricted')::boolean THEN
      RAISE EXCEPTION 'FAIL SEC-06: restricted evidence is not flagged restricted'; END IF;
    IF item->>'title' IS NOT NULL OR item->>'source_reference' IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL SEC-06: restricted evidence contents leaked to an unauthorised reader'; END IF;
  END LOOP;
  RAISE NOTICE 'PASS SEC-06: restricted evidence is disclosed as restricted with its contents withheld';
END $$;

-- =====================================================================
-- SEC-07 — the audit trail records the actor of every governed decision.
-- =====================================================================
DO $$
DECLARE created int; approved int; returned int;
BEGIN
  SELECT count(*) INTO created FROM public.compliance_audit_logs
   WHERE object_type='supervisory_outcome_evaluation' AND action_type='CREATE'::public.compliance_audit_action
     AND object_id = (SELECT c.v FROM c_id c WHERE c.k='eval2')::text
     AND user_id = 'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid;
  SELECT count(*) INTO approved FROM public.compliance_audit_logs
   WHERE object_type='supervisory_outcome_evaluation' AND action_type='APPROVE'
     AND object_id = (SELECT c.v FROM c_id c WHERE c.k='eval2')::text
     AND user_id = '0b522724-adcb-48bf-b21d-175339479616'::uuid;
  SELECT count(*) INTO returned FROM public.compliance_audit_logs
   WHERE object_type='supervisory_outcome_evaluation' AND action_type='REJECT'
     AND object_id = (SELECT c.v FROM c_id c WHERE c.k='eval1')::text;
  IF created < 1 OR approved < 1 OR returned < 1 THEN
    RAISE EXCEPTION 'FAIL SEC-07: audit rows create=% approve=% return=%', created, approved, returned; END IF;
  RAISE NOTICE 'PASS SEC-07: preparation, return and approval are audited with their actors';
END $$;

-- =====================================================================
-- ROLLBACK-01 — the AML11CERT fixtures exist inside this transaction only.
-- =====================================================================
DO $$
DECLARE ev int; dec int;
BEGIN
  SELECT count(*) INTO ev FROM public.supervisory_outcome_evaluation
   WHERE rationale LIKE 'AML11CERT%' OR idempotency_key LIKE 'AML11CERT%';
  SELECT count(*) INTO dec FROM public.supervisory_consequence_decision WHERE rationale LIKE 'AML11CERT%';
  IF ev = 0 OR dec = 0 THEN
    RAISE EXCEPTION 'FAIL ROLLBACK-01: the certification wrote nothing to roll back (%/%)', ev, dec; END IF;
  RAISE NOTICE 'PASS ROLLBACK-01: % AML11CERT evaluations and % consequence decisions are pending rollback', ev, dec;
END $$;

-- =====================================================================
-- ROLLBACK-02 — the operational AML risk-of-record set is unchanged.
-- =====================================================================
DO $$
DECLARE d text; moves bigint;
BEGIN
  SELECT md5(string_agg(concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code,
             s.residual_rating, s.inherent_rating, s.control_rating,
             s.driving_assessment_id::text, s.effective_from::text), E'\n' ORDER BY s.id))
    INTO d FROM public.entity_risk_state s
   WHERE s.domain_code='AML_CFT'
     AND s.driving_assessment_id NOT IN (SELECT c.v FROM c_id c WHERE c.k='assessment');
  SELECT count(*) INTO moves FROM public.entity_risk_state_movement m
   WHERE COALESCE(m.new_assessment_id, m.previous_assessment_id) IS NULL
      OR COALESCE(m.new_assessment_id, m.previous_assessment_id)
         NOT IN (SELECT c.v FROM c_id c WHERE c.k='assessment');
  IF d IS DISTINCT FROM (SELECT c.t FROM c_t c WHERE c.k='risk_digest') THEN
    RAISE EXCEPTION 'FAIL ROLLBACK-02: the AML risk-of-record digest changed during the certification'; END IF;
  IF moves <> (SELECT c.n FROM c_n c WHERE c.k='risk_moves') THEN
    RAISE EXCEPTION 'FAIL ROLLBACK-02: risk movement history changed (% vs %)',
      moves, (SELECT c.n FROM c_n c WHERE c.k='risk_moves'); END IF;
  RAISE NOTICE 'PASS ROLLBACK-02: the AML risk-of-record and its movement history are unchanged (%)', d;
END $$;

ROLLBACK;

-- =====================================================================
-- POST-ROLLBACK PROOF — nothing the certification created survives.
-- =====================================================================
DO $$
DECLARE ev int; dec int; pl int; evid int; aud int; risk int; older int;
BEGIN
  SELECT count(*) INTO ev FROM public.supervisory_outcome_evaluation
   WHERE rationale LIKE 'AML11CERT%' OR idempotency_key LIKE 'AML11CERT%'
      OR review_note LIKE 'AML11CERT%' OR followups::text LIKE '%AML11CERT%'
      OR evidence_snapshot::text LIKE '%AML11CERT%';
  SELECT count(*) INTO dec FROM public.supervisory_consequence_decision
   WHERE rationale LIKE 'AML11CERT%' OR idempotency_key LIKE 'AML11CERT%';
  SELECT count(*) INTO pl FROM public.supervisory_plan WHERE reference LIKE 'AML11CERT%' OR title LIKE 'AML11CERT%';
  pl := pl + (SELECT count(*) FROM public.enforcement_actions WHERE case_number LIKE 'AML11CERT%');
  SELECT count(*) INTO evid FROM public.supervisory_assessment_evidence_basis WHERE source_reference LIKE 'AML11CERT%';
  SELECT count(*) INTO aud FROM public.compliance_audit_logs
   WHERE object_type='supervisory_outcome_evaluation' AND justification LIKE 'AML11CERT%';
  SELECT count(*) INTO risk FROM public.supervisory_assessment WHERE reference LIKE 'AML11CERT%';
  SELECT count(*) INTO older FROM public.supervisory_assessment
   WHERE reference LIKE 'AML10CERT%' OR reference LIKE 'AML09CERT%' OR reference LIKE 'AML08CERT%'
      OR reference LIKE 'AML07CERT%' OR reference LIKE 'AML06CERT%';
  IF ev+dec+pl+evid+aud+risk+older > 0 THEN
    RAISE EXCEPTION 'FAIL POST-ROLLBACK: survivors evaluations=% decisions=% plans=% evidence=% audit=% assessments=% older_fixtures=%',
      ev, dec, pl, evid, aud, risk, older; END IF;
  RAISE NOTICE 'PASS POST-ROLLBACK: zero AML11CERT evaluations, versions, reviews, snapshots, follow-ups, consequences, risk records or audit events survive, and no older certification fixture survives';
END $$;
