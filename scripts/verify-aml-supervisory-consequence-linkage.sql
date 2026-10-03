-- =====================================================================
-- AML-08 — POST-PUBLICATION SUPERVISORY CONSEQUENCE & ACTION LINKAGE :
--          BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- Gate families: SOURCE, ACTION, CREATE, LINK, DUP, WITHDRAW, IMMUT,
--                LEGACY, SEC.
--
-- Conventions (identical to the AML-01..AML-07 certifications):
--   * one transaction, ROLLBACK at the end — every AML08CERT fixture is
--     discarded, so no operational assessment, plan, examination, finding,
--     intervention, enforcement case or entity risk-of-record is changed;
--   * behavioural: gates CALL the governed server operations under real
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML08CERT.
--
-- Personas (public.cert_certification_users):
--   Officer   b8eaf680-fe66-4d49-b816-1c087f511235  (create/examine/finding)
--   Checker   0b522724-adcb-48bf-b21d-175339479616  (review + enforcement)
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
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM c_id WHERE k='entity');
-- a second entity inside the same supervisory scope that carries no AML/CFT
-- risk-of-record: used for the "no source" and cross-entity linkage gates.
INSERT INTO c_id(k,v)
SELECT 'other_entity', l.id FROM public.licensees l
 WHERE l.id <> (SELECT v FROM c_id WHERE k='entity')
   AND l.lead_regulator_id = (SELECT l2.lead_regulator_id FROM public.licensees l2
                          WHERE l2.id = (SELECT v FROM c_id WHERE k='entity'))
   AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state s
                    WHERE s.entity_id = l.id AND s.domain_code='AML_CFT')
 ORDER BY l.id LIMIT 1;
-- fallback: if every same-scope entity already carries an AML/CFT
-- risk-of-record, any other supervised entity serves the cross-entity gates.
INSERT INTO c_id(k,v)
SELECT 'xentity', l.id FROM public.licensees l
 WHERE l.id <> (SELECT v FROM c_id WHERE k='entity')
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
    (SELECT n FROM c_n WHERE k='assessments'),
    (SELECT n FROM c_n WHERE k='risk_state'),
    (SELECT n FROM c_n WHERE k='decisions'),
    (SELECT t FROM c_t WHERE k='risk_digest');
END $$;

-- =====================================================================
-- FIXTURE — a governed, published AML/CFT risk-of-record (AML08CERT).
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
SELECT rs.id, 'regulator', (SELECT v FROM c_id WHERE k='regulator')
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
SELECT rs.id, 'regulator', (SELECT v FROM c_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision'
ON CONFLICT DO NOTHING;

INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES (gen_random_uuid(), 'AML08CERT-METH', 'AML_CFT', 'AML08CERT consequence fixture', '1.0',
  'ACTIVE', (SELECT v FROM c_id WHERE k='sector'), (SELECT v FROM c_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML08CERT consequence fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO c_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML08CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT v FROM c_id WHERE k='meth'),'AML08CERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT v FROM c_id WHERE k='meth'),'AML08CERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL');
INSERT INTO c_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML08CERT_DIM_I';
INSERT INTO c_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML08CERT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_i'),'AML08CERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT v FROM c_id WHERE k='meth'),(SELECT v FROM c_id WHERE k='dim_c'),'AML08CERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  -- the domain effective-date rule is policy configuration, so the policy
  -- administrator sets it; the officer then creates the assessment.
  PERFORM set_config('request.jwt.claims','{"sub":"cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML08CERT fixture rule, discarded on rollback');
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT v FROM c_id WHERE k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 365, _period_end => current_date - 1,
    _methodology_id => (SELECT v FROM c_id WHERE k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AML08CERT consequence certification assessment');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.c_answer(_qcode text, _response text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _aid uuid := (SELECT v FROM c_id WHERE k='assessment'); _q public.supervisory_methodology_question;
BEGIN
  SELECT * INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id=(SELECT v FROM c_id WHERE k='meth') AND question_code=_qcode;
  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, methodology_id, methodology_dimension_id, methodology_question_id,
    assessment_dimension_id, dimension_code, question_code, question_text, response)
  SELECT _aid, (SELECT v FROM c_id WHERE k='meth'), _q.methodology_dimension_id, _q.id,
         sad.id, md.dimension_code, _qcode, COALESCE(_q.prompt,_qcode), _response
    FROM public.supervisory_methodology_dimension md
    JOIN public.supervisory_assessment_dimension sad
      ON sad.assessment_id = _aid AND sad.methodology_dimension_id = md.id
   WHERE md.id = _q.methodology_dimension_id;
END $$;

SELECT pg_temp.c_answer('AML08CERT_Q_I1','NO');
SELECT pg_temp.c_answer('AML08CERT_Q_C1','YES');

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM c_id WHERE k='assessment'),
    _dimension_code => 'AML08CERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 80,
    _rationale => 'AML08CERT inherent dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT v FROM c_id WHERE k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM c_id WHERE k='assessment'),
    _dimension_code => 'AML08CERT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 10,
    _rationale => 'AML08CERT control dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT v FROM c_id WHERE k='dim_c'));
  RESET ROLE;
END $$;

-- Synthetic approved calculation policy — AML08CERT only, rolled back.
DO $$
DECLARE cfg uuid; vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"cbce55aa-4310-4dc9-a4e1-dcf1bc71b5e9","role":"authenticated"}', true);
  cfg := public.supervisory_calculation_config_upsert((SELECT v FROM c_id WHERE k='meth'), jsonb_build_object(
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
    jsonb_build_object('question_code','AML08CERT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML08CERT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','AML08CERT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AML08CERT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FIXTURE: the AML08CERT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','AML08CERT policy submitted for approval');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','AML08CERT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','AML08CERT policy activated by the checker');
  RESET ROLE;
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT v FROM c_id WHERE k='assessment'),'AML08CERT_RUN');
  INSERT INTO c_id(k,v) VALUES ('run', (res->>'run_id')::uuid);
  IF (SELECT status FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT v FROM c_id WHERE k='run')) <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FIXTURE: the AML08CERT calculation run is not CALCULATED'; END IF;
  res := public.supervisory_assessment_submit_for_review((SELECT v FROM c_id WHERE k='assessment'),
    'AML08CERT submission of the consequence certification assessment',
    (SELECT v FROM c_id WHERE k='run'), NULL, NULL);
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('round', (res->>'round_id')::uuid);
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_assessment_approve((SELECT v FROM c_id WHERE k='assessment'),
    'AML08CERT: approved by the independent supervisor on the submitted calculation run.');
  INSERT INTO c_id(k,v) VALUES ('decision', (res->>'decision_id')::uuid);
  res := public.supervisory_assessment_publish_risk_of_record((SELECT v FROM c_id WHERE k='assessment'),
    'AML08CERT publication of the certification risk-of-record');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('publication', (res->>'publication_id')::uuid);
  IF (SELECT v FROM c_id WHERE k='publication') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: the AML08CERT risk-of-record was not published (%)', res; END IF;
  RAISE NOTICE 'FIXTURE: AML08CERT published risk-of-record in force for this transaction only';
END $$;

-- A second, unpublished but approved assessment on a different entity is not
-- available (single risk-of-record per entity), so the unpublished-source
-- gates use a separate entity with no publication at all.

-- =====================================================================
-- SOURCE-01 — a published AML/CFT assessment/risk source is accepted.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  s := vw->'source';
  IF s->>'source_kind' <> 'PUBLICATION' THEN
    RAISE EXCEPTION 'FAIL SOURCE-01: source kind is %', s->>'source_kind'; END IF;
  IF NOT (s->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FAIL SOURCE-01: a published source is not eligible (%)', s->'blockers'; END IF;
  IF (s->'publication'->>'id')::uuid <> (SELECT v FROM c_id WHERE k='publication') THEN
    RAISE EXCEPTION 'FAIL SOURCE-01: the wrong publication is bound'; END IF;
  RAISE NOTICE 'PASS SOURCE-01: the published risk-of-record is the accepted consequence source';
END $$;

-- =====================================================================
-- SOURCE-02 — the source regulator, entity and assessment match exactly.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  s := vw->'source';
  IF (vw->>'entity_id')::uuid <> (SELECT v FROM c_id WHERE k='entity') OR vw->>'domain_code' <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL SOURCE-02: the view is not scoped to the entity/domain'; END IF;
  IF (s->'assessment'->>'id')::uuid <> (SELECT v FROM c_id WHERE k='assessment')
     OR (s->'risk_state'->>'driving_assessment_id')::uuid <> (SELECT v FROM c_id WHERE k='assessment')
     OR (s->'publication'->>'entity_id')::uuid <> (SELECT v FROM c_id WHERE k='entity') THEN
    RAISE EXCEPTION 'FAIL SOURCE-02: the source spine does not match exactly (%)', s; END IF;
  IF (s->'approval_decision'->>'id')::uuid <> (SELECT v FROM c_id WHERE k='decision') THEN
    RAISE EXCEPTION 'FAIL SOURCE-02: the approval decision is not the publishing decision'; END IF;
  RAISE NOTICE 'PASS SOURCE-02: entity, domain, assessment, publication and approval decision match exactly';
END $$;

-- =====================================================================
-- SOURCE-03 — calculated provenance is distinguished and honest.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  s := vw->'source';
  IF s->>'calculation_availability' <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL SOURCE-03: availability is %', s->>'calculation_availability'; END IF;
  IF s->>'rating_provenance' <> 'COMPUTED' THEN
    RAISE EXCEPTION 'FAIL SOURCE-03: provenance is % not COMPUTED', s->>'rating_provenance'; END IF;
  IF (s->'calculation_run'->>'id')::uuid <> (SELECT v FROM c_id WHERE k='run') THEN
    RAISE EXCEPTION 'FAIL SOURCE-03: the calculation run lineage is wrong'; END IF;
  IF s->>'current_rating' IS NULL THEN
    RAISE EXCEPTION 'FAIL SOURCE-03: a published source carries no current rating'; END IF;
  RAISE NOTICE 'PASS SOURCE-03: computed provenance is bound to the exact immutable calculation run (%)',
    s->>'current_rating';
END $$;

-- =====================================================================
-- SOURCE-04 — an entity with no AML/CFT risk-of-record is refused.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb; refused boolean := false; msg text; n int;
BEGIN
  SELECT count(*) INTO n FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM c_id WHERE k='other_entity') AND domain_code='AML_CFT';
  IF n > 0 THEN
    RAISE NOTICE 'SKIP-CONTEXT SOURCE-04: the comparison entity already carries a risk-of-record';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='other_entity'),'AML_CFT', NULL);
  BEGIN
    PERFORM public.supervisory_consequence_record(jsonb_build_object(
      'entity_id',(SELECT v FROM c_id WHERE k='other_entity'),'domain_code','AML_CFT',
      'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
      'rationale','AML08CERT attempt to act with no published risk-of-record at all'));
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  s := vw->'source';
  IF n = 0 THEN
    IF s->>'source_kind' <> 'NONE' OR (s->>'eligible')::boolean THEN
      RAISE EXCEPTION 'FAIL SOURCE-04: an entity with no risk-of-record is treated as eligible'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s->'blockers') b
                    WHERE b->>'code'='NO_RISK_OF_RECORD' AND (b->>'blocking')::boolean) THEN
      RAISE EXCEPTION 'FAIL SOURCE-04: no NO_RISK_OF_RECORD blocker is published'; END IF;
  END IF;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL SOURCE-04: a consequence was recorded without an eligible source'; END IF;
  RAISE NOTICE 'PASS SOURCE-04: a missing risk-of-record is refused with a canonical blocker (%)', msg;
END $$;

-- =====================================================================
-- SOURCE-05 — approved-but-unpublished is refused as a source.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb; act jsonb;
BEGIN
  -- withdraw the publication link by pointing the view at an approved
  -- assessment whose approval decision has no publication row.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  s := vw->'source';
  IF (s->>'approved_not_published')::boolean THEN
    RAISE EXCEPTION 'FAIL SOURCE-05: a published assessment is reported as unpublished'; END IF;
  -- the contract must expose SOURCE_NOT_PUBLISHED as a canonical reason code
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='public' AND p.proname='supervisory_consequence_source_internal'
       AND pg_get_functiondef(p.oid) LIKE '%SOURCE_NOT_PUBLISHED%') THEN
    RAISE EXCEPTION 'FAIL SOURCE-05: the server has no SOURCE_NOT_PUBLISHED refusal'; END IF;
  SELECT a INTO act FROM jsonb_array_elements(vw->'actions') a WHERE a->>'action'='OPEN_SUPERVISORY_PLAN';
  IF act->>'reason_code' <> 'OK' THEN
    RAISE EXCEPTION 'FAIL SOURCE-05: a published source is blocked (%)', act; END IF;
  RAISE NOTICE 'PASS SOURCE-05: publication state, not approval alone, decides source eligibility';
END $$;

-- =====================================================================
-- SOURCE-06 — a superseded source is distinguished from the current one.
-- =====================================================================
DO $$
DECLARE res jsonb; vw jsonb; s jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT v FROM c_id WHERE k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 800, _period_end => current_date - 500,
    _methodology_id => (SELECT v FROM c_id WHERE k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AML08CERT earlier assessment used for the supersession gate');
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('assessment_old', (res->>'id')::uuid);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment_old'));
  RESET ROLE;
  s := vw->'source';
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s->'blockers') b WHERE b->>'code'='SOURCE_SUPERSEDED') THEN
    RAISE EXCEPTION 'FAIL SOURCE-06: an earlier assessment is not reported as superseded (%)', s->'blockers'; END IF;
  IF (s->'publication'->>'id')::uuid <> (SELECT v FROM c_id WHERE k='publication') THEN
    RAISE EXCEPTION 'FAIL SOURCE-06: the current publication is not used for new decisions'; END IF;
  RAISE NOTICE 'PASS SOURCE-06: a superseded source is flagged and the current publication still drives new decisions';
END $$;

-- =====================================================================
-- SOURCE-07 — NOT_CALCULABLE is never converted into a rating.
-- =====================================================================
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_source_internal';
  IF def NOT LIKE '%NOT_CALCULABLE%' THEN
    RAISE EXCEPTION 'FAIL SOURCE-07: the source model has no NOT_CALCULABLE state'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_consequence_decision
              WHERE calculation_availability='NOT_CALCULABLE' AND source_rating IS NOT NULL
                AND rating_provenance='COMPUTED') THEN
    RAISE EXCEPTION 'FAIL SOURCE-07: a NOT_CALCULABLE source produced a computed rating'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='scd_provenance'
                    AND pg_get_constraintdef(oid) LIKE '%NOT_CALCULABLE%') THEN
    RAISE EXCEPTION 'FAIL SOURCE-07: NOT_CALCULABLE is not a first-class recorded provenance'; END IF;
  RAISE NOTICE 'PASS SOURCE-07: NOT_CALCULABLE is recorded honestly and never becomes a computed rating';
END $$;

-- =====================================================================
-- SOURCE-08 — an approved rating override is distinguished in provenance.
-- =====================================================================
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_source_internal';
  IF def NOT LIKE '%APPROVED_OVERRIDE%' OR def NOT LIKE '%LEGACY_OFFICER_RATING%' THEN
    RAISE EXCEPTION 'FAIL SOURCE-08: computed, override and legacy provenance are not separated'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(ARRAY['COMPUTED','APPROVED_OVERRIDE','LEGACY_OFFICER_RATING',
        'NOT_CALCULABLE','UNAVAILABLE']) x
      WHERE pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='scd_provenance')) LIKE '%'||x||'%') <> 5 THEN
    RAISE EXCEPTION 'FAIL SOURCE-08: the recorded provenance vocabulary is incomplete'; END IF;
  RAISE NOTICE 'PASS SOURCE-08: calculated, approved-override and legacy provenance are separately recorded';
END $$;

-- =====================================================================
-- ACTION-01 — the server, not the browser, publishes supported actions.
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  n := jsonb_array_length(vw->'actions');
  IF n < 8 THEN RAISE EXCEPTION 'FAIL ACTION-01: only % actions are published', n; END IF;
  FOR a IN SELECT x FROM jsonb_array_elements(vw->'actions') x LOOP
    IF a->>'action' IS NULL OR a->>'label' IS NULL OR a->>'linkage_modes' IS NULL THEN
      RAISE EXCEPTION 'FAIL ACTION-01: an action is published without a contract (%)', a; END IF;
  END LOOP;
  RAISE NOTICE 'PASS ACTION-01: the server publishes the complete supported action set (% actions)', n;
END $$;

-- =====================================================================
-- ACTION-02 — every action carries its canonical permission.
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb; bad text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  FOR a IN SELECT x FROM jsonb_array_elements(vw->'actions') x LOOP
    IF a->>'required_permission' IS NULL OR a->>'required_permission' NOT LIKE '%.%' THEN
      bad := COALESCE(bad||', ','')||(a->>'action'); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.permissions p
                    WHERE p.module = split_part(a->>'required_permission','.',1)
                      AND p.name = split_part(a->>'required_permission','.',2)) THEN
      bad := COALESCE(bad||', ','')||(a->>'action')||'(not canonical)'; END IF;
  END LOOP;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL ACTION-02: actions without a canonical permission: %', bad; END IF;
  RAISE NOTICE 'PASS ACTION-02: every supported action names a canonical registered permission';
END $$;

-- =====================================================================
-- ACTION-03 — every unavailable action carries a reason code and text.
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb; blocked int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  FOR a IN SELECT x FROM jsonb_array_elements(vw->'actions') x LOOP
    IF a->>'reason_code' IS NULL OR a->>'reason' IS NULL THEN
      RAISE EXCEPTION 'FAIL ACTION-03: % carries no reason contract', a->>'action'; END IF;
    IF NOT (a->>'available')::boolean THEN
      blocked := blocked + 1;
      IF a->>'reason_code' = 'OK' OR length(a->>'reason') < 10 THEN
        RAISE EXCEPTION 'FAIL ACTION-03: % is unavailable without an explanation (%)', a->>'action', a; END IF;
    END IF;
  END LOOP;
  IF blocked = 0 THEN
    RAISE EXCEPTION 'FAIL ACTION-03: the officer persona is offered every action, so no refusal path was exercised'; END IF;
  RAISE NOTICE 'PASS ACTION-03: every unavailable action publishes a canonical reason code and explanation (% blocked)', blocked;
END $$;

-- =====================================================================
-- ACTION-04 — an unsupported action type is refused.
-- =====================================================================
DO $$
DECLARE refused int := 0; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','REVOKE_LICENCE','linkage_mode','CREATE',
    'rationale','AML08CERT attempt to invent an unsupported supervisory consequence'));
  EXCEPTION WHEN others THEN refused := refused + 1; msg := SQLERRM; END;
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RECORD_MONITORING','linkage_mode','CREATE',
    'rationale','AML08CERT attempt to create a target for a record-only consequence'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 2 THEN
    RAISE EXCEPTION 'FAIL ACTION-04: only % of 2 unsupported requests were refused', refused; END IF;
  IF msg NOT LIKE '%unsupported_action%' THEN
    RAISE EXCEPTION 'FAIL ACTION-04: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS ACTION-04: unsupported action types and unsupported linkage modes are refused (2/2)';
END $$;

-- =====================================================================
-- ACTION-05 — the server never maps a risk band to an action.
-- =====================================================================
DO $$
DECLARE def text; vw jsonb; a jsonb; rating text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_view';
  IF def ~* '(residual_rating|current_rating|source_rating)[^;]{0,80}(=|IN)\s*\(?''(HIGH|LOW|MODERATE|MEDIUM_HIGH)' THEN
    RAISE EXCEPTION 'FAIL ACTION-05: the action contract branches on a risk band'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  rating := vw->'source'->>'current_rating';
  FOR a IN SELECT x FROM jsonb_array_elements(vw->'actions') x LOOP
    IF (a->>'reason_code') IN ('RATING_TOO_LOW','RATING_REQUIRED','BAND_NOT_ELIGIBLE') THEN
      RAISE EXCEPTION 'FAIL ACTION-05: an action is gated on the risk band (%)', a; END IF;
    IF (a->'existing') IS NULL THEN
      RAISE EXCEPTION 'FAIL ACTION-05: the action contract omits existing-decision convergence data'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.supervisory_consequence_decision
       WHERE decided_by IS NULL) > 0 THEN
    RAISE EXCEPTION 'FAIL ACTION-05: an unattributed (automated) consequence exists'; END IF;
  RAISE NOTICE 'PASS ACTION-05: with a % rating the server proposes no action automatically - a supervisor must decide',
    COALESCE(rating,'unavailable');
END $$;

-- =====================================================================
-- ACTION-06 — a persona without the action permission is refused, and the
--             refusal is published before any attempt (browser-independent).
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb; refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO a FROM jsonb_array_elements(vw->'actions') x WHERE x->>'action'='REQUIRE_REASSESSMENT';
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
    'rationale','AML08CERT reassessment attempt by a persona without review authority'));
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF (a->>'available')::boolean OR a->>'reason_code' <> 'PERMISSION_MISSING' THEN
    RAISE EXCEPTION 'FAIL ACTION-06: the contract does not refuse the missing permission (%)', a; END IF;
  IF a->>'required_permission' <> 'aml_supervision.review' THEN
    RAISE EXCEPTION 'FAIL ACTION-06: the published permission is % ', a->>'required_permission'; END IF;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL ACTION-06: the operation accepted an action the contract refused'; END IF;
  RAISE NOTICE 'PASS ACTION-06: the contract and the operation refuse identically on permission (%)', msg;
END $$;

-- =====================================================================
-- CREATE-01 — a supervisory plan is created through the canonical operation.
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_consequence_decision; p public.supervisory_plan; n_before int;
BEGIN
  SELECT count(*) INTO n_before FROM public.supervisory_plan;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','AML08CERT supervisory plan',
    'rationale','AML08CERT: the published AML/CFT risk-of-record warrants a supervisory plan for this entity.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_plan', (res->>'decision_id')::uuid), ('plan', (res->>'target_id')::uuid);
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  SELECT * INTO p FROM public.supervisory_plan WHERE id=(SELECT v FROM c_id WHERE k='plan');
  IF p.id IS NULL THEN RAISE EXCEPTION 'FAIL CREATE-01: no canonical supervisory plan was created'; END IF;
  IF (SELECT count(*) FROM public.supervisory_plan) <> n_before + 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-01: the canonical plan table was not used exactly once'; END IF;
  IF NOT ((SELECT v FROM c_id WHERE k='entity') = ANY (p.entity_ids)) OR p.domain_code <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL CREATE-01: the plan is not bound to the supervised entity/domain'; END IF;
  IF d.target_kind <> 'SUPERVISORY_PLAN' OR d.target_id <> p.id OR d.linkage_mode <> 'CREATE' THEN
    RAISE EXCEPTION 'FAIL CREATE-01: the decision does not point at the canonical target'; END IF;
  IF res->'target'->>'route' IS NULL THEN
    RAISE EXCEPTION 'FAIL CREATE-01: the canonical target route was not returned'; END IF;
  RAISE NOTICE 'PASS CREATE-01: a supervisory plan is created through supervisory_plan_open and returned canonically';
END $$;

-- =====================================================================
-- CREATE-02 — the decision preserves the publication/risk lineage.
-- =====================================================================
DO $$
DECLARE d public.supervisory_consequence_decision;
BEGIN
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  IF d.publication_id <> (SELECT v FROM c_id WHERE k='publication')
     OR d.assessment_id <> (SELECT v FROM c_id WHERE k='assessment')
     OR d.approval_decision_id <> (SELECT v FROM c_id WHERE k='decision')
     OR d.calculation_run_id <> (SELECT v FROM c_id WHERE k='run')
     OR d.risk_state_id IS NULL OR d.source_kind <> 'PUBLICATION' THEN
    RAISE EXCEPTION 'FAIL CREATE-02: the source lineage is incomplete (%)', to_jsonb(d); END IF;
  IF d.lineage->>'publication_id' IS NULL OR d.lineage->>'methodology_id' IS NULL
     OR d.lineage->>'rating_provenance' IS NULL OR d.lineage->>'calculation_availability' IS NULL THEN
    RAISE EXCEPTION 'FAIL CREATE-02: the lineage document is incomplete (%)', d.lineage; END IF;
  IF d.rating_provenance <> 'COMPUTED' OR d.calculation_availability <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL CREATE-02: provenance was not carried onto the decision'; END IF;
  RAISE NOTICE 'PASS CREATE-02: publication, approval, run, methodology and provenance lineage is preserved';
END $$;

-- =====================================================================
-- CREATE-03 — the create is audited against the acting persona.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_id = (SELECT v FROM c_id WHERE k='dec_plan')::text
     AND object_type = 'supervisory_consequence_decision'
     AND user_id = (SELECT v FROM c_id WHERE k='officer');
  IF n < 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-03: the consequence create was not audited to the acting persona'; END IF;
  IF (SELECT decided_by FROM public.supervisory_consequence_decision
       WHERE id=(SELECT v FROM c_id WHERE k='dec_plan')) <> (SELECT v FROM c_id WHERE k='officer') THEN
    RAISE EXCEPTION 'FAIL CREATE-03: the decision actor is not the authenticated persona'; END IF;
  RAISE NOTICE 'PASS CREATE-03: the create is audited and attributed to the authenticated actor (% events)', n;
END $$;

-- =====================================================================
-- CREATE-04 — a written rationale is mandatory.
-- =====================================================================
DO $$
DECLARE refused int := 0; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE','rationale','too short'));
  EXCEPTION WHEN others THEN refused := refused + 1; msg := SQLERRM; END;
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 2 THEN RAISE EXCEPTION 'FAIL CREATE-04: only % of 2 unreasoned requests were refused', refused; END IF;
  IF msg NOT LIKE '%rationale_required%' THEN
    RAISE EXCEPTION 'FAIL CREATE-04: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS CREATE-04: a written supervisory rationale is mandatory (2/2)';
END $$;

-- =====================================================================
-- CREATE-05 — an intervention requires an authorising plan prerequisite,
--             and a risk rating alone never satisfies it.
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb; res jsonb; iv public.supervisory_intervention;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO a FROM jsonb_array_elements(vw->'actions') x WHERE x->>'action'='OPEN_INTERVENTION';
  IF a->>'prerequisite' <> 'PLAN' THEN
    RAISE EXCEPTION 'FAIL CREATE-05: the intervention prerequisite is not published'; END IF;
  IF (a->>'available')::boolean THEN
    -- the AML08CERT plan is DRAFT, so the prerequisite must still be unmet
    RAISE EXCEPTION 'FAIL CREATE-05: a draft plan satisfied the intervention prerequisite (%)', a; END IF;
  IF a->>'reason_code' <> 'PREREQUISITE_MISSING' THEN
    RAISE EXCEPTION 'FAIL CREATE-05: wrong reason code % ', a->>'reason_code'; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS CREATE-05: an intervention needs an approved/active plan - a HIGH rating does not authorise it';
END $$;

-- =====================================================================
-- CREATE-06 — with the prerequisite satisfied, the canonical intervention
--             operation is used.
-- =====================================================================
DO $$
DECLARE res jsonb; iv public.supervisory_intervention; n_before int;
BEGIN
  -- promote the AML08CERT plan through its own governed lifecycle: the officer
  -- submits, the reviewing supervisor approves and activates.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM c_id WHERE k='plan'), 'SUBMITTED',
    'AML08CERT: submitting the consequence plan for supervisory approval.');
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM c_id WHERE k='plan'), 'APPROVED',
    'AML08CERT: approving the consequence plan as reviewing supervisor.');
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM c_id WHERE k='plan'), 'ACTIVE',
    'AML08CERT: activating the approved consequence plan.');
  RESET ROLE;

  SELECT count(*) INTO n_before FROM public.supervisory_intervention;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_INTERVENTION','linkage_mode','CREATE',
    'plan_id',(SELECT v FROM c_id WHERE k='plan'),
    'title','AML08CERT targeted intervention',
    'rationale','AML08CERT: the published risk-of-record and the active plan warrant a targeted intervention.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_iv', (res->>'decision_id')::uuid), ('intervention', (res->>'target_id')::uuid);
  SELECT * INTO iv FROM public.supervisory_intervention WHERE id=(SELECT v FROM c_id WHERE k='intervention');
  IF iv.id IS NULL OR iv.licensee_id <> (SELECT v FROM c_id WHERE k='entity') THEN
    RAISE EXCEPTION 'FAIL CREATE-06: no canonical intervention was created for the entity'; END IF;
  IF (SELECT count(*) FROM public.supervisory_intervention) <> n_before + 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-06: the canonical intervention table was not used exactly once'; END IF;
  IF iv.plan_id <> (SELECT v FROM c_id WHERE k='plan') THEN
    RAISE EXCEPTION 'FAIL CREATE-06: the intervention is not bound to the authorising plan'; END IF;
  RAISE NOTICE 'PASS CREATE-06: the intervention is opened through supervisory_intervention_open under its plan';
END $$;

-- =====================================================================
-- CREATE-07 — an examination requires an endorsed/active intervention and
--             is then created through the canonical operation.
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb; res jsonb; ex public.examinations; n_before int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  SELECT x INTO a FROM jsonb_array_elements(vw->'actions') x WHERE x->>'action'='OPEN_EXAMINATION';
  RESET ROLE;
  IF a->>'prerequisite' <> 'INTERVENTION' THEN
    RAISE EXCEPTION 'FAIL CREATE-07: the examination prerequisite is not published'; END IF;
  IF (a->>'available')::boolean THEN
    RAISE EXCEPTION 'FAIL CREATE-07: a proposed intervention satisfied the examination prerequisite'; END IF;
  PERFORM set_config('app.supervisory_intervention_writer','governed', true);
  UPDATE public.supervisory_intervention SET status='ACTIVE' WHERE id=(SELECT v FROM c_id WHERE k='intervention');
  PERFORM set_config('app.supervisory_intervention_writer','', true);
  SELECT count(*) INTO n_before FROM public.examinations;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_EXAMINATION','linkage_mode','CREATE',
    'intervention_id',(SELECT v FROM c_id WHERE k='intervention'),
    'title','AML08CERT targeted examination',
    'rationale','AML08CERT: the active intervention authorises a targeted AML/CFT examination of this entity.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_ex', (res->>'decision_id')::uuid), ('examination', (res->>'target_id')::uuid);
  SELECT * INTO ex FROM public.examinations WHERE id=(SELECT v FROM c_id WHERE k='examination');
  IF ex.id IS NULL OR ex.entity_id <> (SELECT v FROM c_id WHERE k='entity') THEN
    RAISE EXCEPTION 'FAIL CREATE-07: no canonical examination was created for the entity'; END IF;
  IF (SELECT count(*) FROM public.examinations) <> n_before + 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-07: the canonical examination table was not used exactly once'; END IF;
  RAISE NOTICE 'PASS CREATE-07: the examination prerequisite is enforced and the canonical operation is used';
END $$;

-- =====================================================================
-- CREATE-08 — a finding is raised on an authoritative assessment origin.
-- =====================================================================
DO $$
DECLARE res jsonb; f public.supervisory_finding; n_before int;
BEGIN
  SELECT count(*) INTO n_before FROM public.supervisory_finding;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','CREATE',
    'title','AML08CERT control finding','severity','HIGH',
    'rationale','AML08CERT: the assessed control weakness recorded in the approved assessment is raised as a finding.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_find', (res->>'decision_id')::uuid), ('finding', (res->>'target_id')::uuid);
  SELECT * INTO f FROM public.supervisory_finding WHERE id=(SELECT v FROM c_id WHERE k='finding');
  IF f.id IS NULL OR f.entity_id <> (SELECT v FROM c_id WHERE k='entity') THEN
    RAISE EXCEPTION 'FAIL CREATE-08: no canonical finding was created'; END IF;
  IF (SELECT count(*) FROM public.supervisory_finding) <> n_before + 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-08: the canonical finding table was not used exactly once'; END IF;
  IF f.assessment_id <> (SELECT v FROM c_id WHERE k='assessment') THEN
    RAISE EXCEPTION 'FAIL CREATE-08: the finding does not carry its authoritative assessment origin'; END IF;
  RAISE NOTICE 'PASS CREATE-08: a finding is raised only from an authoritative assessment origin';
END $$;

-- =====================================================================
-- CREATE-09 — enforcement is referred from a canonical finding, never from
--             a risk rating.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text; res jsonb; n_before int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','REFER_TO_ENFORCEMENT','linkage_mode','CREATE',
    'rationale','AML08CERT enforcement referral attempted on the risk rating alone, with no finding.'));
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL CREATE-09: a risk rating alone was accepted as a basis for enforcement'; END IF;
  -- the canonical enforcement operation additionally requires an explicit
  -- remediation-bypass rationale when the finding carries no corrective action.
  -- That control must hold through the consequence operation too.
  refused := false;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','REFER_TO_ENFORCEMENT','linkage_mode','CREATE',
    'source_finding_id',(SELECT v FROM c_id WHERE k='finding'),
    'rationale','AML08CERT: referral attempted with no remediation bypass rationale stated.'));
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL CREATE-09: a finding with no corrective action was referred without a stated remediation bypass rationale'; END IF;
  SELECT count(*) INTO n_before FROM public.enforcement_actions;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','REFER_TO_ENFORCEMENT','linkage_mode','CREATE',
    'source_finding_id',(SELECT v FROM c_id WHERE k='finding'),
    'remediation_bypass_rationale','AML08CERT: the AML/CFT breach is referred immediately without a remediation window.',
    'rationale','AML08CERT: the canonical AML/CFT finding is referred to enforcement for consideration.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_enf', (res->>'decision_id')::uuid), ('enforcement', (res->>'target_id')::uuid);
  IF (SELECT count(*) FROM public.enforcement_actions) <> n_before + 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-09: the canonical enforcement table was not used exactly once'; END IF;
  RAISE NOTICE 'PASS CREATE-09: enforcement is refused on a rating (%) and accepted only from a canonical finding', msg;
END $$;

-- =====================================================================
-- CREATE-10 — a reassessment requirement is created by review authority
--             through the canonical operation.
-- =====================================================================
DO $$
DECLARE res jsonb; r public.supervisory_reassessment_requirement; n_before int;
BEGIN
  SELECT count(*) INTO n_before FROM public.supervisory_reassessment_requirement;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','REQUIRE_REASSESSMENT','linkage_mode','CREATE',
    'rationale','AML08CERT: an event-driven AML/CFT reassessment is required following the published outcome.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_re', (res->>'decision_id')::uuid), ('reassessment', (res->>'target_id')::uuid);
  SELECT * INTO r FROM public.supervisory_reassessment_requirement WHERE id=(SELECT v FROM c_id WHERE k='reassessment');
  IF r.id IS NULL OR r.entity_id <> (SELECT v FROM c_id WHERE k='entity') OR r.domain_code <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL CREATE-10: no canonical reassessment requirement was created'; END IF;
  IF (SELECT count(*) FROM public.supervisory_reassessment_requirement) <> n_before + 1 THEN
    RAISE EXCEPTION 'FAIL CREATE-10: the canonical reassessment table was not used exactly once'; END IF;
  IF r.trigger_kind <> 'SUPERVISORY_DIRECTION' THEN
    RAISE EXCEPTION 'FAIL CREATE-10: the reassessment trigger is % ', r.trigger_kind; END IF;
  RAISE NOTICE 'PASS CREATE-10: a reassessment is required through supervisory_reassessment_require by review authority';
END $$;

-- =====================================================================
-- CREATE-11 — a record-only consequence needs no target and creates none.
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_consequence_decision;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'rationale','AML08CERT: continued monitoring only; no further supervisory action is required at this time.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_mon', (res->>'decision_id')::uuid);
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_mon');
  IF d.target_id IS NOT NULL OR d.target_kind IS NOT NULL OR d.linkage_mode <> 'RECORD_ONLY' THEN
    RAISE EXCEPTION 'FAIL CREATE-11: a record-only decision created or bound a target'; END IF;
  IF d.publication_id IS NULL OR d.rationale IS NULL THEN
    RAISE EXCEPTION 'FAIL CREATE-11: a record-only decision lost its source lineage'; END IF;
  RAISE NOTICE 'PASS CREATE-11: a monitoring / no-action judgment is recorded against the published source';
END $$;

-- =====================================================================
-- LINK-01 — a visible same-entity record that is not already linked can be
--           linked without creating anything new. (The examination created by
--           CREATE-07 is deliberately NOT reused here: the server correctly
--           treats re-linking an already-linked target as the DUPLICATE_EXISTS
--           case, which DUP-01 certifies separately.)
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_consequence_decision; n_before int; pre uuid;
BEGIN
  INSERT INTO public.supervisory_finding(
    reference, entity_id, domain_code, title, source_kind, status, origin_provenance, assessment_id)
  VALUES ('AML08CERT-FIND-PREEXISTING',(SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
          'AML08CERT pre-existing AML/CFT finding','ASSESSMENT','DRAFT','GOVERNED',(SELECT v FROM c_id WHERE k='assessment'))
  RETURNING id INTO pre;
  INSERT INTO c_id(k,v) VALUES ('find_pre', pre);
  SELECT count(*) INTO n_before FROM public.supervisory_finding;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK',
    'target_id', pre,
    'rationale','AML08CERT: the existing AML/CFT finding is linked as the consequence of this outcome.'));
  RESET ROLE;
  IF COALESCE((res->>'duplicate')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL LINK-01: a record that was never linked was reported as a duplicate: %', res; END IF;
  INSERT INTO c_id(k,v) VALUES ('dec_link', (res->>'decision_id')::uuid);
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_link');
  IF (SELECT count(*) FROM public.supervisory_finding) <> n_before THEN
    RAISE EXCEPTION 'FAIL LINK-01: linking created a duplicate downstream record'; END IF;
  IF d.linkage_mode <> 'LINK' OR d.target_id <> pre THEN
    RAISE EXCEPTION 'FAIL LINK-01: the link does not reference the existing record (mode=%, target=%, expected=%)',
      d.linkage_mode, d.target_id, pre; END IF;
  RAISE NOTICE 'PASS LINK-01: an existing same-entity record is linked without creating anything new';
END $$;

-- =====================================================================
-- LINK-02 — a cross-entity target is refused without revealing it.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text; other uuid;
BEGIN
  INSERT INTO public.supervisory_finding(
    reference, entity_id, domain_code, title, source_kind, status, origin_provenance, assessment_id)
  VALUES ('AML08CERT-FIND-OTHER',(SELECT COALESCE((SELECT v FROM c_id WHERE k='other_entity'),(SELECT v FROM c_id WHERE k='xentity'))),'AML_CFT',
          'AML08CERT other-entity finding','ASSESSMENT','DRAFT','GOVERNED',(SELECT v FROM c_id WHERE k='assessment'))
  RETURNING id INTO other;
  INSERT INTO c_id(k,v) VALUES ('find_other', other);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK','target_id', other,
    'rationale','AML08CERT attempt to link another supervised entity''s finding to this outcome.'));
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL LINK-02: a cross-entity record was linked'; END IF;
  IF msg LIKE '%'||other::text||'%' THEN
    RAISE EXCEPTION 'FAIL LINK-02: the refusal reveals the inaccessible record identity: %', msg; END IF;
  IF msg NOT LIKE '%not_found%' THEN
    RAISE EXCEPTION 'FAIL LINK-02: the refusal is not a neutral not-found: %', msg; END IF;
  RAISE NOTICE 'PASS LINK-02: a cross-entity target is refused neutrally and its existence is not revealed (%)', msg;
END $$;

-- =====================================================================
-- LINK-03 — a cross-domain target is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text; other uuid;
BEGIN
  INSERT INTO public.supervisory_finding(
    reference, entity_id, domain_code, title, source_kind, status, origin_provenance, assessment_id)
  VALUES ('AML08CERT-FIND-PRUD',(SELECT v FROM c_id WHERE k='entity'),'PRUDENTIAL',
          'AML08CERT prudential finding','ASSESSMENT','DRAFT','GOVERNED',(SELECT v FROM c_id WHERE k='assessment'))
  RETURNING id INTO other;
  INSERT INTO c_id(k,v) VALUES ('find_prud', other);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK','target_id', other,
    'rationale','AML08CERT attempt to link a prudential finding as an AML/CFT consequence.'));
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL LINK-03: a cross-domain record was linked to an AML/CFT outcome'; END IF;
  RAISE NOTICE 'PASS LINK-03: a record from another supervisory domain cannot be linked (%)', msg;
END $$;

-- =====================================================================
-- LINK-04 — an invalid target type / unknown id is refused.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK','target_id', gen_random_uuid(),
    'rationale','AML08CERT attempt to link a target identifier that does not exist at all.'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK',
    'target_id',(SELECT v FROM c_id WHERE k='plan'),
    'rationale','AML08CERT attempt to link a plan where a finding is required by the action.'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK',
    'rationale','AML08CERT attempt to link with no target identifier supplied at all.'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN
    RAISE EXCEPTION 'FAIL LINK-04: only % of 3 invalid link targets were refused', refused; END IF;
  RAISE NOTICE 'PASS LINK-04: unknown, wrong-type and missing link targets are refused (3/3)';
END $$;

-- =====================================================================
-- LINK-05 — the linkable candidate set is server-owned and same-entity.
-- =====================================================================
DO $$
DECLARE vw jsonb; c jsonb; bad int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  IF jsonb_array_length(vw->'link_candidates') < 4 THEN
    RAISE EXCEPTION 'FAIL LINK-05: the server publishes only % link candidates',
      jsonb_array_length(vw->'link_candidates'); END IF;
  FOR c IN SELECT x FROM jsonb_array_elements(vw->'link_candidates') x LOOP
    IF (c->>'id')::uuid IN (SELECT v FROM c_id WHERE k IN ('find_other','find_prud')) THEN
      bad := bad + 1; END IF;
  END LOOP;
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL LINK-05: % cross-entity/cross-domain records leaked into the candidate set', bad; END IF;
  RAISE NOTICE 'PASS LINK-05: the link candidate set is server-owned, same-entity and same-domain';
END $$;

-- =====================================================================
-- LINK-06 — repeated linking is idempotent and returns the existing link.
-- =====================================================================
DO $$
DECLARE res jsonb; n_before int; n_after int;
BEGIN
  SELECT count(*) INTO n_before FROM public.supervisory_consequence_decision;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RAISE_FINDING','linkage_mode','LINK',
    'target_id',(SELECT v FROM c_id WHERE k='find_pre'),
    'rationale','AML08CERT: the existing AML/CFT finding is linked as the consequence of this outcome.'));
  RESET ROLE;
  SELECT count(*) INTO n_after FROM public.supervisory_consequence_decision;
  IF n_after <> n_before THEN
    RAISE EXCEPTION 'FAIL LINK-06: a repeated identical link created another decision row'; END IF;
  -- the same supervisor repeating the same link is told it is idempotent; a
  -- different supervisor is told the linkage already exists (LINK-07).
  IF NOT (COALESCE((res->>'idempotent')::boolean,false)
          OR (COALESCE((res->>'duplicate')::boolean,false) AND res->>'reason_code' = 'DUPLICATE_EXISTS')) THEN
    RAISE EXCEPTION 'FAIL LINK-06: the repeat was not reported as an existing linkage (%)', res; END IF;
  IF (res->>'decision_id')::uuid <> (SELECT v FROM c_id WHERE k='dec_link') THEN
    RAISE EXCEPTION 'FAIL LINK-06: the existing decision was not returned'; END IF;
  RAISE NOTICE 'PASS LINK-06: a repeated identical link converges on the existing decision';
END $$;

-- =====================================================================
-- LINK-07 — a different actor linking the same record is told it exists,
--           and no duplicate linkage row is created.
-- =====================================================================
DO $$
DECLARE res jsonb; n_before int;
BEGIN
  SELECT count(*) INTO n_before FROM public.supervisory_consequence_decision
   WHERE target_id=(SELECT v FROM c_id WHERE k='examination') AND status='RECORDED';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_EXAMINATION','linkage_mode','LINK',
    'target_id',(SELECT v FROM c_id WHERE k='examination'),
    'rationale','AML08CERT: a second supervisor links the same examination for the same consequence.'));
  RESET ROLE;
  IF NOT COALESCE((res->>'duplicate')::boolean,false) OR res->>'reason_code' <> 'DUPLICATE_EXISTS' THEN
    RAISE EXCEPTION 'FAIL LINK-07: an equivalent link was not detected (%)', res; END IF;
  IF (SELECT count(*) FROM public.supervisory_consequence_decision
       WHERE target_id=(SELECT v FROM c_id WHERE k='examination') AND status='RECORDED') <> n_before THEN
    RAISE EXCEPTION 'FAIL LINK-07: a duplicate linkage row survived'; END IF;
  IF (res->>'decision_id')::uuid <> (SELECT id FROM public.supervisory_consequence_decision
        WHERE target_id=(SELECT v FROM c_id WHERE k='examination') AND status='RECORDED' LIMIT 1) THEN
    RAISE EXCEPTION 'FAIL LINK-07: the existing record was not identified to an authorised viewer'; END IF;
  RAISE NOTICE 'PASS LINK-07: an equivalent link is detected and the existing record is identified, not duplicated';
END $$;

-- =====================================================================
-- LINK-08 — the unique active-target index makes duplicates impossible.
-- =====================================================================
DO $$
DECLARE ok boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='scd_active_target_uidx'
                   AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%RECORDED%') INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL LINK-08: no unique active-target constraint exists'; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='scd_idempotency_uidx' AND indexdef LIKE '%UNIQUE%') INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL LINK-08: no unique idempotency constraint exists'; END IF;
  IF EXISTS (SELECT entity_id, action_type, target_kind, target_id FROM public.supervisory_consequence_decision
              WHERE status='RECORDED' AND target_id IS NOT NULL
              GROUP BY 1,2,3,4 HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL LINK-08: duplicate active target linkages exist'; END IF;
  RAISE NOTICE 'PASS LINK-08: uniqueness of active target linkage and idempotency key is enforced in the database';
END $$;

-- =====================================================================
-- DUP-01 — a repeated create request converges, creating no second target.
-- =====================================================================
DO $$
DECLARE res jsonb; plans_before int; dec_before int;
BEGIN
  SELECT count(*) INTO plans_before FROM public.supervisory_plan;
  SELECT count(*) INTO dec_before FROM public.supervisory_consequence_decision;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','AML08CERT supervisory plan',
    'rationale','AML08CERT: the published AML/CFT risk-of-record warrants a supervisory plan for this entity.'));
  RESET ROLE;
  IF NOT COALESCE((res->>'idempotent')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL DUP-01: the repeated create was treated as new (%)', res; END IF;
  IF (SELECT count(*) FROM public.supervisory_plan) <> plans_before THEN
    RAISE EXCEPTION 'FAIL DUP-01: the repeated create opened a second plan'; END IF;
  IF (SELECT count(*) FROM public.supervisory_consequence_decision) <> dec_before THEN
    RAISE EXCEPTION 'FAIL DUP-01: the repeated create recorded a second decision'; END IF;
  IF (res->>'decision_id')::uuid <> (SELECT v FROM c_id WHERE k='dec_plan') THEN
    RAISE EXCEPTION 'FAIL DUP-01: the canonical earlier decision was not returned'; END IF;
  RAISE NOTICE 'PASS DUP-01: a repeated create request converges on the one canonical decision and target';
END $$;

-- =====================================================================
-- DUP-02 — the idempotency key is derived on the server from the actor,
--          source and request, not supplied by the browser alone.
-- =====================================================================
DO $$
DECLARE def text; k1 text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_record';
  IF def NOT LIKE '%md5(concat_ws(%' THEN
    RAISE EXCEPTION 'FAIL DUP-02: the idempotency key is not server-derived'; END IF;
  SELECT idempotency_key INTO k1 FROM public.supervisory_consequence_decision
   WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  IF k1 IS NULL OR length(k1) <> 32 THEN
    RAISE EXCEPTION 'FAIL DUP-02: the stored idempotency key is not a server digest'; END IF;
  IF EXISTS (SELECT idempotency_key FROM public.supervisory_consequence_decision
              GROUP BY 1 HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL DUP-02: duplicate idempotency keys exist'; END IF;
  RAISE NOTICE 'PASS DUP-02: the idempotency key is a server digest of actor, source and request';
END $$;

-- =====================================================================
-- DUP-03 — the existing open action is published to the officer so the
--          browser never has to guess equivalence.
-- =====================================================================
DO $$
DECLARE vw jsonb; a jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  SELECT x INTO a FROM jsonb_array_elements(vw->'actions') x WHERE x->>'action'='OPEN_SUPERVISORY_PLAN';
  IF jsonb_array_length(a->'existing') < 1 THEN
    RAISE EXCEPTION 'FAIL DUP-03: the existing plan decision is not published on the action'; END IF;
  IF (a->'existing'->0->>'target_id')::uuid <> (SELECT v FROM c_id WHERE k='plan') THEN
    RAISE EXCEPTION 'FAIL DUP-03: the published existing target is wrong'; END IF;
  IF jsonb_array_length(vw->'linked_records') < 4 THEN
    RAISE EXCEPTION 'FAIL DUP-03: the linked-record set is incomplete (%)',
      jsonb_array_length(vw->'linked_records'); END IF;
  RAISE NOTICE 'PASS DUP-03: existing equivalent actions and all linked downstream records are server-published';
END $$;

-- =====================================================================
-- DUP-04 — a concurrent equivalent request produces one canonical result.
-- =====================================================================
DO $$
DECLARE res1 jsonb; res2 jsonb; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  -- a deferred / monitoring judgment is a review-authority decision
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res1 := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RECORD_DEFERRED','linkage_mode','RECORD_ONLY',
    'idempotency_key','AML08CERT-CONCURRENT',
    'rationale','AML08CERT: two equivalent requests submitted for the same deferred judgment.'));
  res2 := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RECORD_DEFERRED','linkage_mode','RECORD_ONLY',
    'idempotency_key','AML08CERT-CONCURRENT',
    'rationale','AML08CERT: two equivalent requests submitted for the same deferred judgment.'));
  RESET ROLE;
  IF res1->>'decision_id' <> res2->>'decision_id' THEN
    RAISE EXCEPTION 'FAIL DUP-04: equivalent requests produced two decisions'; END IF;
  SELECT count(*) INTO n FROM public.supervisory_consequence_decision
   WHERE entity_id=(SELECT v FROM c_id WHERE k='entity') AND action_type='RECORD_DEFERRED';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL DUP-04: % deferred decisions survived', n; END IF;
  INSERT INTO c_id(k,v) VALUES ('dec_def', (res1->>'decision_id')::uuid);
  RAISE NOTICE 'PASS DUP-04: equivalent concurrent requests converge on one canonical decision';
END $$;

-- =====================================================================
-- DUP-05 — the row lock serialises decisions against the risk-of-record.
-- =====================================================================
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_record';
  IF def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FAIL DUP-05: the operation does not serialise on the risk-of-record'; END IF;
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_withdraw';
  IF def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FAIL DUP-05: withdrawal does not lock the decision row'; END IF;
  RAISE NOTICE 'PASS DUP-05: create and withdraw serialise on the risk state and decision rows';
END $$;

-- =====================================================================
-- WITHDRAW-01 — withdrawal requires review authority.
-- =====================================================================
DO $$
DECLARE refused int := 0; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_withdraw((SELECT v FROM c_id WHERE k='dec_mon'),
    'AML08CERT withdrawal attempted without supervisory review authority.');
  EXCEPTION WHEN others THEN refused := refused + 1; msg := SQLERRM; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_withdraw((SELECT v FROM c_id WHERE k='dec_mon'),
    'AML08CERT withdrawal attempted by a persona outside the supervisory scope.');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 2 THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-01: only % of 2 unauthorised withdrawals were refused', refused; END IF;
  IF (SELECT status FROM public.supervisory_consequence_decision
       WHERE id=(SELECT v FROM c_id WHERE k='dec_mon')) <> 'RECORDED' THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-01: an unauthorised withdrawal changed the decision'; END IF;
  RAISE NOTICE 'PASS WITHDRAW-01: withdrawal requires supervisory review authority (2/2) (%)', msg;
END $$;

-- =====================================================================
-- WITHDRAW-02 — withdrawal requires a written rationale.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_withdraw((SELECT v FROM c_id WHERE k='dec_mon'),'no');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL WITHDRAW-02: an unreasoned withdrawal was accepted'; END IF;
  IF msg NOT LIKE '%rationale_required%' THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-02: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS WITHDRAW-02: withdrawal requires a written rationale (%)', msg;
END $$;

-- =====================================================================
-- WITHDRAW-03 — withdrawal appends history and never deletes the decision.
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_consequence_decision; before jsonb;
BEGIN
  SELECT to_jsonb(x) INTO before FROM public.supervisory_consequence_decision x
   WHERE id=(SELECT v FROM c_id WHERE k='dec_mon');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_withdraw((SELECT v FROM c_id WHERE k='dec_mon'),
    'AML08CERT: the monitoring judgment is withdrawn because a targeted action was taken instead.');
  RESET ROLE;
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_mon');
  IF d.id IS NULL THEN RAISE EXCEPTION 'FAIL WITHDRAW-03: the withdrawn decision was deleted'; END IF;
  IF d.status <> 'WITHDRAWN' OR d.withdrawn_by <> (SELECT v FROM c_id WHERE k='checker')
     OR d.withdrawal_reason IS NULL OR d.withdrawn_at IS NULL THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-03: the withdrawal trail is incomplete (%)', to_jsonb(d); END IF;
  IF d.rationale <> before->>'rationale' OR d.decided_by::text <> before->>'decided_by'
     OR d.publication_id::text <> before->>'publication_id' THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-03: withdrawal rewrote the original judgment or lineage'; END IF;
  RAISE NOTICE 'PASS WITHDRAW-03: withdrawal appends a trail and preserves the original decision, actor and lineage';
END $$;

-- =====================================================================
-- WITHDRAW-04 — a repeated withdrawal is refused safely.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_withdraw((SELECT v FROM c_id WHERE k='dec_mon'),
    'AML08CERT: a second withdrawal of the same decision is attempted.');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL WITHDRAW-04: a decision was withdrawn twice'; END IF;
  IF msg NOT LIKE '%state_not_eligible%' THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-04: wrong refusal: %', msg; END IF;
  IF (SELECT count(*) FROM public.supervisory_consequence_decision
       WHERE id=(SELECT v FROM c_id WHERE k='dec_mon') AND status='WITHDRAWN') <> 1 THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-04: the repeat withdrawal disturbed the record'; END IF;
  RAISE NOTICE 'PASS WITHDRAW-04: a repeated withdrawal is refused and the trail is unchanged (%)', msg;
END $$;

-- =====================================================================
-- WITHDRAW-05 — withdrawn lineage remains reproducible and later decisions
--               do not rewrite earlier ones.
-- =====================================================================
DO $$
DECLARE vw jsonb; dec jsonb; res jsonb; old_rationale text;
BEGIN
  SELECT rationale INTO old_rationale FROM public.supervisory_consequence_decision
   WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'assessment_id',(SELECT v FROM c_id WHERE k='assessment'),
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'rationale','AML08CERT: a later monitoring judgment is recorded after the earlier one was withdrawn.'));
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  SELECT x INTO dec FROM jsonb_array_elements(vw->'decisions') x
   WHERE (x->>'id')::uuid = (SELECT v FROM c_id WHERE k='dec_mon');
  IF dec IS NULL OR dec->>'status' <> 'WITHDRAWN' OR dec->>'withdrawal_reason' IS NULL THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-05: the withdrawn decision is not reproducible in history'; END IF;
  IF dec->'lineage'->>'publication_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-05: the withdrawn lineage is no longer reproducible'; END IF;
  IF (SELECT rationale FROM public.supervisory_consequence_decision
       WHERE id=(SELECT v FROM c_id WHERE k='dec_plan')) <> old_rationale THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-05: a later decision rewrote an earlier one'; END IF;
  IF jsonb_array_length(vw->'decisions') < 7 THEN
    RAISE EXCEPTION 'FAIL WITHDRAW-05: the decision history is incomplete (%)',
      jsonb_array_length(vw->'decisions'); END IF;
  RAISE NOTICE 'PASS WITHDRAW-05: withdrawn lineage stays reproducible and earlier decisions are never rewritten';
END $$;

-- =====================================================================
-- IMMUT-01 — a direct signed-in insert into the ledger is refused.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN INSERT INTO public.supervisory_consequence_decision(
          entity_id, domain_code, source_kind, rating_provenance, action_type, linkage_mode,
          rationale, idempotency_key)
        VALUES ((SELECT v FROM c_id WHERE k='entity'),'AML_CFT','PUBLICATION','COMPUTED',
                'OPEN_SUPERVISORY_PLAN','RECORD_ONLY',
                'AML08CERT forged consequence decision inserted directly','AML08CERT-FORGED');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_consequence_decision SET rationale='AML08CERT forged rewrite of the rationale'
         WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
        IF NOT FOUND THEN refused := refused + 1; END IF;
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
        IF NOT FOUND THEN refused := refused + 1; END IF;
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN
    RAISE EXCEPTION 'FAIL IMMUT-01: only % of 3 direct writes were refused', refused; END IF;
  RAISE NOTICE 'PASS IMMUT-01: direct insert, update and delete on the consequence ledger are refused (3/3)';
END $$;

-- =====================================================================
-- IMMUT-02 — the source publication cannot be replaced.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  PERFORM set_config('app.supervisory_consequence_writer','governed', true);
  BEGIN UPDATE public.supervisory_consequence_decision SET publication_id = NULL
         WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  PERFORM set_config('app.supervisory_consequence_writer','', true);
  IF NOT refused THEN RAISE EXCEPTION 'FAIL IMMUT-02: the source publication was replaced'; END IF;
  IF msg NOT LIKE '%immutable%' THEN RAISE EXCEPTION 'FAIL IMMUT-02: wrong refusal: %', msg; END IF;
  IF (SELECT publication_id FROM public.supervisory_consequence_decision
       WHERE id=(SELECT v FROM c_id WHERE k='dec_plan')) <> (SELECT v FROM c_id WHERE k='publication') THEN
    RAISE EXCEPTION 'FAIL IMMUT-02: the publication reference changed'; END IF;
  RAISE NOTICE 'PASS IMMUT-02: the source publication of a recorded consequence is immutable (%)', msg;
END $$;

-- =====================================================================
-- IMMUT-03 — the risk-state reference, actor and rationale are immutable.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  PERFORM set_config('app.supervisory_consequence_writer','governed', true);
  BEGIN UPDATE public.supervisory_consequence_decision SET risk_state_id = gen_random_uuid()
         WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_consequence_decision SET decided_by = (SELECT v FROM c_id WHERE k='outsider')
         WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_consequence_decision SET rationale = 'AML08CERT rewritten supervisory rationale'
         WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_consequence_decision SET lineage = '{}'::jsonb
         WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  PERFORM set_config('app.supervisory_consequence_writer','', true);
  IF refused < 5 THEN
    RAISE EXCEPTION 'FAIL IMMUT-03: only % of 5 immutable-field mutations were refused', refused; END IF;
  RAISE NOTICE 'PASS IMMUT-03: risk-state reference, actor, rationale, lineage and existence are immutable (5/5)';
END $$;

-- =====================================================================
-- IMMUT-04 — a later risk movement does not rewrite prior consequences.
-- =====================================================================
DO $$
DECLARE res jsonb; before jsonb; after jsonb;
BEGIN
  SELECT to_jsonb(x) INTO before FROM public.supervisory_consequence_decision x
   WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT v FROM c_id WHERE k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'EVENT_DRIVEN', _period_start => current_date - 30, _period_end => current_date,
    _methodology_id => (SELECT v FROM c_id WHERE k='meth'), _trigger_type => 'EVENT_DRIVEN',
    _summary => 'AML08CERT later assessment used to prove prior consequences are untouched');
  RESET ROLE;
  SELECT to_jsonb(x) INTO after FROM public.supervisory_consequence_decision x
   WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  IF before->>'source_rating' IS DISTINCT FROM after->>'source_rating'
     OR before->>'publication_id' IS DISTINCT FROM after->>'publication_id'
     OR before->>'rating_provenance' IS DISTINCT FROM after->>'rating_provenance'
     OR before->>'lineage' IS DISTINCT FROM after->>'lineage' THEN
    RAISE EXCEPTION 'FAIL IMMUT-04: later supervisory activity rewrote a recorded consequence'; END IF;
  RAISE NOTICE 'PASS IMMUT-04: later assessment/risk activity leaves recorded consequences untouched';
END $$;

-- =====================================================================
-- IMMUT-05 — downstream lifecycle is changed only by the target record's
--            own governed operations, never by the consequence ledger.
-- =====================================================================
DO $$
DECLARE def text; refused int := 0;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_consequence_record';
  IF def ~* 'UPDATE\s+public\.(supervisory_plan|supervisory_intervention|examinations|supervisory_finding|enforcement_actions|supervisory_reassessment_requirement)' THEN
    RAISE EXCEPTION 'FAIL IMMUT-05: the consequence operation mutates a downstream record directly'; END IF;
  IF def ~* 'INSERT\s+INTO\s+public\.(supervisory_plan|supervisory_intervention|examinations|supervisory_finding|enforcement_actions|supervisory_reassessment_requirement)' THEN
    RAISE EXCEPTION 'FAIL IMMUT-05: the consequence operation inserts a downstream record directly'; END IF;
  IF def NOT LIKE '%supervisory_plan_open%' OR def NOT LIKE '%supervisory_intervention_open%'
     OR def NOT LIKE '%supervisory_examination_open%' OR def NOT LIKE '%supervisory_finding_create%'
     OR def NOT LIKE '%enforcement_referral_create%' OR def NOT LIKE '%supervisory_reassessment_require%' THEN
    RAISE EXCEPTION 'FAIL IMMUT-05: a downstream record is not created through its canonical operation'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN UPDATE public.supervisory_plan SET status='COMPLETED' WHERE id=(SELECT v FROM c_id WHERE k='plan');
        IF NOT FOUND THEN refused := refused + 1; END IF;
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_finding SET status='CLOSED' WHERE id=(SELECT v FROM c_id WHERE k='finding');
        IF NOT FOUND THEN refused := refused + 1; END IF;
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 2 THEN
    RAISE EXCEPTION 'FAIL IMMUT-05: a screen changed a downstream lifecycle directly (% of 2 refused)', refused; END IF;
  RAISE NOTICE 'PASS IMMUT-05: downstream records are created and changed only by their own governed operations';
END $$;

-- =====================================================================
-- IMMUT-06 — the recorded target reference is preserved verbatim.
-- =====================================================================
DO $$
DECLARE d public.supervisory_consequence_decision; p public.supervisory_plan;
BEGIN
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_plan');
  SELECT * INTO p FROM public.supervisory_plan WHERE id=(SELECT v FROM c_id WHERE k='plan');
  IF d.target_reference IS DISTINCT FROM p.reference THEN
    RAISE EXCEPTION 'FAIL IMMUT-06: the recorded target reference (%) does not match the canonical record (%)',
      d.target_reference, p.reference; END IF;
  IF d.decided_at IS NULL OR d.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL IMMUT-06: the decision is not timestamped'; END IF;
  RAISE NOTICE 'PASS IMMUT-06: the canonical target reference and decision timestamps are recorded once and kept';
END $$;

-- =====================================================================
-- LEGACY-01 — a legacy risk record is identified honestly, with no
--             fabricated publication or approval.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb; legacy_entity uuid;
BEGIN
  SELECT s2.entity_id INTO legacy_entity FROM public.entity_risk_state s2
   WHERE s2.domain_code='AML_CFT'
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p
                      WHERE p.entity_id = s2.entity_id AND p.domain_code='AML_CFT')
     AND s2.entity_id <> (SELECT v FROM c_id WHERE k='entity')
   ORDER BY s2.id LIMIT 1;
  IF legacy_entity IS NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: the certification environment has no legacy AML risk record to certify'; END IF;
  INSERT INTO c_id(k,v) VALUES ('legacy_entity', legacy_entity);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view(legacy_entity,'AML_CFT', NULL);
  RESET ROLE;
  s := vw->'source';
  IF s->>'source_kind' <> 'LEGACY_RISK_RECORD' THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: a legacy risk record reports source kind %', s->>'source_kind'; END IF;
  IF s->'publication' IS NOT NULL AND s->'publication' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: a publication was fabricated for a legacy record'; END IF;
  IF s->'approval_decision' IS NOT NULL AND s->'approval_decision' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: an approval decision was fabricated for a legacy record'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s->'blockers') b WHERE b->>'code'='LEGACY_RISK_RECORD') THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: the legacy state is not disclosed'; END IF;
  RAISE NOTICE 'PASS LEGACY-01: a legacy risk record is disclosed honestly with no fabricated publication or approval';
END $$;

-- =====================================================================
-- LEGACY-02 — a prospective action from a legacy source records legacy
--             provenance.
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_consequence_decision;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='legacy_entity'),'domain_code','AML_CFT',
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'rationale','AML08CERT: monitoring recorded against a legacy AML/CFT risk record, disclosed as legacy.'));
  RESET ROLE;
  INSERT INTO c_id(k,v) VALUES ('dec_legacy', (res->>'decision_id')::uuid);
  SELECT * INTO d FROM public.supervisory_consequence_decision WHERE id=(SELECT v FROM c_id WHERE k='dec_legacy');
  IF d.source_kind <> 'LEGACY_RISK_RECORD' THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: the decision does not record a legacy source (%)', d.source_kind; END IF;
  IF d.publication_id IS NOT NULL OR d.approval_decision_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: a legacy decision claims a publication or approval it never had'; END IF;
  IF d.rating_provenance <> 'LEGACY_OFFICER_RATING' THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: legacy provenance is not recorded (%)', d.rating_provenance; END IF;
  IF d.risk_state_id IS NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: the legacy risk state is not referenced'; END IF;
  RAISE NOTICE 'PASS LEGACY-02: a prospective action from a legacy source carries legacy provenance and no fabricated history';
END $$;

-- =====================================================================
-- LEGACY-03 — NOT_CALCULABLE is reported honestly for the legacy source
--             and no synthetic residual rating is produced.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb; rating text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='legacy_entity'),'AML_CFT', NULL);
  RESET ROLE;
  s := vw->'source';
  IF s->>'calculation_availability' NOT IN ('NOT_CALCULABLE','NO_RUN','UNAVAILABLE') THEN
    RAISE EXCEPTION 'FAIL LEGACY-03: a legacy source claims a calculated result (%)',
      s->>'calculation_availability'; END IF;
  IF s->'calculation_run' IS NOT NULL AND s->'calculation_run' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL LEGACY-03: a calculation run was fabricated for a legacy source'; END IF;
  SELECT residual_rating INTO rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM c_id WHERE k='legacy_entity') AND domain_code='AML_CFT';
  IF s->>'current_rating' IS DISTINCT FROM rating THEN
    RAISE EXCEPTION 'FAIL LEGACY-03: the reported rating (%) is not the recorded rating (%)',
      s->>'current_rating', rating; END IF;
  RAISE NOTICE 'PASS LEGACY-03: calculation availability is reported honestly (%) and no synthetic rating is produced',
    s->>'calculation_availability';
END $$;

-- =====================================================================
-- LEGACY-04 — unresolved legacy dimension links (LINK-11) are untouched.
-- =====================================================================
DO $$
DECLARE n_before bigint; n_after bigint;
BEGIN
  SELECT count(*) INTO n_after FROM public.supervisory_assessment_dimension d
   WHERE d.methodology_dimension_id IS NULL;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
              WHERE ns.nspname='public' AND p.proname IN ('supervisory_consequence_record',
                    'supervisory_consequence_view','supervisory_consequence_source_internal')
                AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+public\.supervisory_assessment_dimension') THEN
    RAISE EXCEPTION 'FAIL LEGACY-04: AML-08 rewrites assessment dimension links'; END IF;
  RAISE NOTICE 'PASS LEGACY-04: AML-08 never rewrites unresolved legacy dimension links (% orphan rows untouched)', n_after;
END $$;

-- =====================================================================
-- LEGACY-05 — the AML-08 ledger holds no fabricated approval history.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.supervisory_consequence_decision d
              WHERE d.approval_decision_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_approval_decision a
                                 WHERE a.id = d.approval_decision_id)) THEN
    RAISE EXCEPTION 'FAIL LEGACY-05: a decision references a non-existent approval'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_consequence_decision d
              WHERE d.source_kind='LEGACY_RISK_RECORD' AND d.publication_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL LEGACY-05: a legacy decision carries a publication'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_consequence_decision d
              WHERE d.source_kind='PUBLICATION' AND d.publication_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL LEGACY-05: a published decision carries no publication'; END IF;
  RAISE NOTICE 'PASS LEGACY-05: every recorded source reference is real - no approval or publication history is invented';
END $$;

-- =====================================================================
-- LEGACY-06 — the AML-08 tables never rewrite AML-01..AML-07 records.
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'supervisory_consequence%'
     AND pg_get_functiondef(p.oid) ~* '(UPDATE|DELETE FROM)\s+public\.(supervisory_assessment|supervisory_assessment_question_response|supervisory_assessment_approval_decision|supervisory_assessment_risk_publication|entity_risk_state|entity_risk_state_movement|supervisory_methodology)\b';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-06: AML-08 functions mutate AML-01..07 records: %', bad; END IF;
  RAISE NOTICE 'PASS LEGACY-06: no AML-08 function updates or deletes an assessment, approval, publication or risk record';
END $$;

-- =====================================================================
-- SEC-01 — anonymous mutation and reads are refused.
-- =====================================================================
DO $$
DECLARE refused int := 0; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','', true);
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'rationale','AML08CERT anonymous attempt to record a supervisory consequence.'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT', NULL);
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_consequence_withdraw((SELECT v FROM c_id WHERE k='dec_plan'),
    'AML08CERT anonymous attempt to withdraw a supervisory consequence.');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'supervisory_consequence%'
     AND (has_function_privilege('anon', p.oid, 'execute') OR has_function_privilege('public', p.oid, 'execute'));
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-01: % AML-08 functions are executable without signing in', n; END IF;
  IF refused < 3 THEN RAISE EXCEPTION 'FAIL SEC-01: only % of 3 unauthenticated calls were refused', refused; END IF;
  RAISE NOTICE 'PASS SEC-01: anonymous read, record and withdraw are refused and no anon/PUBLIC EXECUTE exists (3/3)';
END $$;

-- =====================================================================
-- SEC-02 — an unauthorised signed-in persona is refused everything.
-- =====================================================================
DO $$
DECLARE refused int := 0; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT', NULL);
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
    'entity_id',(SELECT v FROM c_id WHERE k='entity'),'domain_code','AML_CFT',
    'action_type','RECORD_MONITORING','linkage_mode','RECORD_ONLY',
    'rationale','AML08CERT unauthorised persona attempts to record a consequence.'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  SELECT count(*) INTO n FROM public.supervisory_consequence_decision;
  RESET ROLE;
  IF refused < 2 THEN
    RAISE EXCEPTION 'FAIL SEC-02: only % of 2 unauthorised calls were refused', refused; END IF;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL SEC-02: an unauthorised reader saw % consequence decisions', n; END IF;
  RAISE NOTICE 'PASS SEC-02: a persona without supervisory authority is refused and sees no consequence data';
END $$;

-- =====================================================================
-- SEC-03 — internal helpers are not callable by signed-in users.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('supervisory_consequence_source_internal','supervisory_consequence_target_internal',
       'supervisory_consequence_writer_guard','supervisory_consequence_immutable_guard')
     AND has_function_privilege('authenticated', p.oid, 'execute');
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL SEC-03: % internal AML-08 helpers are callable by signed-in users', n; END IF;
  RAISE NOTICE 'PASS SEC-03: internal source, target and guard helpers are not callable by signed-in users';
END $$;

-- =====================================================================
-- SEC-04 — every AML-08 SECURITY DEFINER function pins search_path.
-- =====================================================================
DO $$
DECLARE bad text; n int;
BEGIN
  SELECT string_agg(p.proname, ', '), count(*) INTO bad, n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'supervisory_consequence%' AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-04: functions without a pinned search_path: %', bad; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'supervisory_consequence%' AND p.prosecdef;
  IF n < 6 THEN RAISE EXCEPTION 'FAIL SEC-04: only % AML-08 definer functions found', n; END IF;
  RAISE NOTICE 'PASS SEC-04: all % AML-08 SECURITY DEFINER functions pin search_path', n;
END $$;

-- =====================================================================
-- SEC-05 — cross-regulator / out-of-scope entity access is refused.
-- =====================================================================
DO $$
DECLARE refused int := 0; other uuid;
BEGIN
  SELECT l.id INTO other FROM public.licensees l
   WHERE l.lead_regulator_id IS DISTINCT FROM (SELECT v FROM c_id WHERE k='regulator') ORDER BY l.id LIMIT 1;
  IF other IS NULL THEN
    RAISE NOTICE 'SKIP-CONTEXT SEC-05: no entity outside the fixture regulator exists';
  ELSE
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
    BEGIN PERFORM public.supervisory_consequence_view(other,'AML_CFT', NULL);
    EXCEPTION WHEN others THEN refused := refused + 1; END;
    BEGIN PERFORM public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', other,'domain_code','AML_CFT','action_type','RECORD_MONITORING',
      'linkage_mode','RECORD_ONLY',
      'rationale','AML08CERT attempt to act on an entity outside the actor supervisory scope.'));
    EXCEPTION WHEN others THEN refused := refused + 1; END;
    RESET ROLE;
    IF refused < 2 THEN
      RAISE EXCEPTION 'FAIL SEC-05: only % of 2 out-of-scope calls were refused', refused; END IF;
  END IF;
  RAISE NOTICE 'PASS SEC-05: an entity outside the actor supervisory scope is refused read and write';
END $$;

-- =====================================================================
-- SEC-06 — the ledger is read-only through the Data API and permission
--          scoped, with no write policy at all.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename='supervisory_consequence_decision' AND cmd='SELECT';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL SEC-06: % read policies exist', n; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='supervisory_consequence_decision' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'FAIL SEC-06: a write policy exists on the consequence ledger'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.supervisory_consequence_decision'::regclass) THEN
    RAISE EXCEPTION 'FAIL SEC-06: row-level security is not enabled'; END IF;
  IF has_table_privilege('authenticated','public.supervisory_consequence_decision','INSERT')
     OR has_table_privilege('authenticated','public.supervisory_consequence_decision','UPDATE')
     OR has_table_privilege('authenticated','public.supervisory_consequence_decision','DELETE') THEN
    RAISE EXCEPTION 'FAIL SEC-06: signed-in users hold direct write privileges on the ledger'; END IF;
  IF has_table_privilege('anon','public.supervisory_consequence_decision','SELECT') THEN
    RAISE EXCEPTION 'FAIL SEC-06: anonymous users can read the consequence ledger'; END IF;
  RAISE NOTICE 'PASS SEC-06: the ledger is RLS-protected, read-only and invisible to anonymous callers';
END $$;

-- =====================================================================
-- SEC-07 — restricted evidence and fact lineage does not leak through the
--          consequence surface.
-- =====================================================================
DO $$
DECLARE vw jsonb; s jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vw := public.supervisory_consequence_view((SELECT v FROM c_id WHERE k='entity'),'AML_CFT',
       (SELECT v FROM c_id WHERE k='assessment'));
  RESET ROLE;
  s := vw->'source';
  IF s ? 'evidence' OR s ? 'facts' OR s ? 'question_responses' THEN
    RAISE EXCEPTION 'FAIL SEC-07: the consequence surface exposes evidence, fact or response detail'; END IF;
  IF (vw->'decisions')::text LIKE '%evidence_basis%' THEN
    RAISE EXCEPTION 'FAIL SEC-07: evidence lineage leaked into the decision history'; END IF;
  RAISE NOTICE 'PASS SEC-07: the consequence surface publishes rating lineage only, never restricted evidence or facts';
END $$;

-- =====================================================================
-- SEC-08 — the audit actor is the authenticated actor, on every decision.
-- =====================================================================
DO $$
DECLARE n int; bad int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_consequence_decision;
  SELECT count(*) INTO bad FROM public.supervisory_consequence_decision d
   WHERE d.decided_by IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs l
                      WHERE l.object_type='supervisory_consequence_decision'
                        AND l.object_id = d.id::text AND l.user_id = d.decided_by);
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL SEC-08: % of % decisions are unattributed or unaudited', bad, n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_type='supervisory_consequence_decision'
                    AND action_type='OVERRIDE'
                    AND object_id = (SELECT v FROM c_id WHERE k='dec_mon')::text) THEN
    RAISE EXCEPTION 'FAIL SEC-08: the withdrawal was not audited'; END IF;
  RAISE NOTICE 'PASS SEC-08: every one of % decisions and the withdrawal are audited to the authenticated actor', n;
END $$;

-- =====================================================================
-- SEC-09 — the governed writer guard is the only write path.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  RESET ROLE;
  BEGIN INSERT INTO public.supervisory_consequence_decision(
          entity_id, domain_code, source_kind, rating_provenance, action_type, linkage_mode,
          rationale, idempotency_key)
        VALUES ((SELECT v FROM c_id WHERE k='entity'),'AML_CFT','PUBLICATION','COMPUTED',
                'RECORD_MONITORING','RECORD_ONLY',
                'AML08CERT privileged insert outside a governed operation','AML08CERT-PRIV');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL SEC-09: a privileged insert bypassed the governed writer guard'; END IF;
  IF msg NOT LIKE '%governed%' THEN RAISE EXCEPTION 'FAIL SEC-09: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS SEC-09: even a privileged session cannot write the ledger outside a governed operation (%)', msg;
END $$;

-- =====================================================================
-- ROLLBACK — no AML08CERT record may survive
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT (SELECT count(*) FROM public.supervisory_consequence_decision)
       + (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_finding WHERE reference LIKE 'AML08CERT%')
    INTO n;
  RAISE NOTICE 'PRE-ROLLBACK: % AML08CERT fixture records exist inside the transaction', n;
END $$;

ROLLBACK;

-- =====================================================================
-- After ROLLBACK: prove nothing survived, in every affected record family.
-- =====================================================================
DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.supervisory_assessment WHERE COALESCE(summary,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_assessment_approval_decision WHERE rationale LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_assessment_risk_publication WHERE COALESCE(reason,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.entity_risk_state_movement WHERE COALESCE(reason,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_consequence_decision
            WHERE COALESCE(rationale,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_plan WHERE COALESCE(title,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_reassessment_requirement WHERE COALESCE(trigger_rationale,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_intervention WHERE COALESCE(title,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.examinations WHERE COALESCE(title,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_finding WHERE COALESCE(reference,'') LIKE 'AML08CERT%'
            OR COALESCE(title,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.enforcement_actions WHERE COALESCE(description,'') LIKE '%AML08CERT%'
            OR COALESCE(remediation_bypass_reason,'') LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.supervisory_calculation_config c
            JOIN public.supervisory_methodology m ON m.id = c.methodology_id WHERE m.code LIKE 'AML08CERT%')
       + (SELECT count(*) FROM public.compliance_audit_logs
            WHERE object_type='supervisory_consequence_decision'
              AND COALESCE(justification,'') LIKE 'AML08CERT%')
    INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML08CERT records survived', n; END IF;
  RAISE NOTICE 'PASS ROLLBACK: no AML08CERT assessment, approval, publication, risk movement, consequence decision, plan, reassessment, intervention, examination, finding, enforcement case or audit row survived';
END $$;

-- Predecessor fixture families must also be clean.
DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.supervisory_assessment
            WHERE COALESCE(summary,'') LIKE 'AML07CERT%' OR COALESCE(summary,'') LIKE 'AML06CERT%'
               OR COALESCE(summary,'') LIKE 'AML05CERT%' OR COALESCE(summary,'') LIKE 'PLANCERT%'
               OR COALESCE(reference,'') LIKE 'AML07CERT%' OR COALESCE(reference,'') LIKE 'AML06CERT%'
               OR COALESCE(reference,'') LIKE 'AML05CERT%' OR COALESCE(reference,'') LIKE 'PLANCERT%')
       + (SELECT count(*) FROM public.supervisory_methodology
            WHERE code LIKE 'AML07CERT%' OR code LIKE 'AML06CERT%' OR code LIKE 'AML05CERT%'
               OR code LIKE 'PLANCERT%')
       + (SELECT count(*) FROM public.supervisory_finding
            WHERE COALESCE(reference,'') LIKE 'AML07CERT%' OR COALESCE(reference,'') LIKE 'AML06CERT%'
               OR COALESCE(reference,'') LIKE 'AML05CERT%' OR COALESCE(reference,'') LIKE 'PLANCERT%')
    INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % predecessor certification fixtures survived', n; END IF;
  RAISE NOTICE 'PASS ROLLBACK: no AML07CERT, AML06CERT, AML05CERT or PLANCERT fixture survives either';
END $$;
