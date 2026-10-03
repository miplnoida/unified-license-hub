-- =====================================================================
-- AML-07 — ASSESSMENT REVIEW, APPROVAL & RISK-OF-RECORD PUBLICATION :
--          CERTIFICATION
-- =====================================================================
-- Gate families: SUBMIT, REVIEW, CHALLENGE, RESUBMIT, APPROVAL, OVERRIDE,
--                PUBLISH, SUPERSEDE, LINEAGE, DOWNSTREAM, IDEMPOTENCY,
--                CONCURRENCY, LEGACY, SEC.
--
-- Conventions (identical to the AML-01..AML-06 certifications):
--   * one transaction, ROLLBACK at the end — every AML07CERT fixture is
--     discarded, so no operational assessment, calculation policy or
--     entity risk-of-record is changed;
--   * behavioural: gates CALL governed operations under real authenticated
--     personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML07CERT.
--
-- Personas (public.cert_certification_users):
--   Officer / preparer  b8eaf680-fe66-4d49-b816-1c087f511235
--   Supervisor/approver 0b522724-adcb-48bf-b21d-175339479616
--   Outsider            411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

-- Pre-transaction census. Review, approval-decision and publication rows that
-- already exist as genuine operational records must be preserved, so the
-- rollback gate compares against this census rather than against zero.
SELECT (SELECT count(*)::text FROM public.supervisory_assessment_review_round) AS pre_rounds,
       (SELECT count(*)::text FROM public.supervisory_assessment_approval_decision) AS pre_decisions,
       (SELECT count(*)::text FROM public.supervisory_assessment_risk_publication) AS pre_publications
\gset

BEGIN;


CREATE TEMP TABLE r_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE r_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE r_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON r_id TO authenticated;
GRANT ALL ON r_n  TO authenticated;
GRANT ALL ON r_t  TO authenticated;

INSERT INTO r_id(k,v) VALUES
  ('regulator', '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('entity',    'aa220000-0000-4000-8000-000000000001'),
  ('officer',   'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',   '0b522724-adcb-48bf-b21d-175339479616'),
  ('outsider',  '411dd06d-648b-4f32-82cc-897902c0c0b6');

INSERT INTO r_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM r_id WHERE k='entity');
INSERT INTO r_id(k,v)
SELECT 'other_entity', l.id FROM public.licensees l
 WHERE l.id <> (SELECT v FROM r_id WHERE k='entity') ORDER BY l.id LIMIT 1;

-- ---------------------------------------------------------------- census ----
INSERT INTO r_n(k,n) VALUES
  ('assessments',   (SELECT count(*) FROM public.supervisory_assessment)),
  ('rated',         (SELECT count(*) FROM public.supervisory_assessment WHERE residual_rating IS NOT NULL)),
  ('responses',     (SELECT count(*) FROM public.supervisory_assessment_question_response)),
  ('plans',         (SELECT count(*) FROM public.supervisory_assessment_question_plan)),
  ('evidence',      (SELECT count(*) FROM public.supervisory_assessment_evidence_basis)),
  ('facts',         (SELECT count(*) FROM public.supervisory_assessment_fact)),
  ('calc_hist',     (SELECT count(*) FROM public.supervisory_assessment_calculation)),
  ('runs',          (SELECT count(*) FROM public.supervisory_assessment_calculation_run)),
  ('overrides',     (SELECT count(*) FROM public.supervisory_assessment_calculation_override)),
  ('cfg',           (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('risk_state',    (SELECT count(*) FROM public.entity_risk_state)),
  ('risk_moves',    (SELECT count(*) FROM public.entity_risk_state_movement)),
  ('rounds',        (SELECT count(*) FROM public.supervisory_assessment_review_round)),
  ('decisions',     (SELECT count(*) FROM public.supervisory_assessment_approval_decision)),
  ('pubs',          (SELECT count(*) FROM public.supervisory_assessment_risk_publication)),
  ('regulators',    (SELECT count(*) FROM public.regulators));

INSERT INTO r_t(k,t) VALUES
  ('risk_digest',  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
                      FROM public.entity_risk_state r)),
  ('assess_digest',(SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.residual_rating,'-'),'|' ORDER BY a.id))
                      FROM public.supervisory_assessment a)),
  ('entity_rating',(SELECT residual_rating FROM public.entity_risk_state
                     WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT'));

DO $$
BEGIN
  RAISE NOTICE 'CENSUS: % assessments, % risk-of-record rows, risk digest %',
    (SELECT n FROM r_n WHERE k='assessments'),
    (SELECT n FROM r_n WHERE k='risk_state'),
    (SELECT t FROM r_t WHERE k='risk_digest');
END $$;

-- -------------------------------------------------------------- fixtures ----
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: granted by the TEST super administrator, never self-granted
  FROM (VALUES ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
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
SELECT rs.id, 'regulator', (SELECT v FROM r_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- Synthetic methodology publishing both rating scales the calculation
-- contract needs. AML07CERT content only; rolled back.
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES (gen_random_uuid(), 'AML07CERT-METH', 'AML_CFT', 'AML07CERT review fixture', '1.0',
  'ACTIVE', (SELECT v FROM r_id WHERE k='sector'), (SELECT v FROM r_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML07CERT review fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO r_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML07CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT v FROM r_id WHERE k='meth'),'AML07CERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT v FROM r_id WHERE k='meth'),'AML07CERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL');
INSERT INTO r_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML07CERT_DIM_I';
INSERT INTO r_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML07CERT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT v FROM r_id WHERE k='meth'),(SELECT v FROM r_id WHERE k='dim_i'),'AML07CERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT v FROM r_id WHERE k='meth'),(SELECT v FROM r_id WHERE k='dim_c'),'AML07CERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('AML07CERT-PROGRAMMES','1.0','AML07CERT programme fixture','AML_CFT',
  (SELECT v FROM r_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
SELECT s.id,'AML07CERT_P','AML07CERT programme','PERIODIC',true,1,'TRAILING_DAYS',365,1,false,false,
  ARRAY['CORE','CONDITIONAL'],'{}'::text[],'{}'::text[]
  FROM public.supervisory_assessment_programme_set s WHERE s.code='AML07CERT-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
SELECT p.id,'PERIODIC','Periodic cycle',true,true,1
  FROM public.supervisory_assessment_programme p WHERE p.programme_code='AML07CERT_P';

-- AML-CLOSE-02D fixture modernisation (TEST ONLY, rolled back).
-- Obsolete assumption: no active policy profile governs the domain, so any
-- programme set applies. Current runtime: the active regulator profile binds
-- the ASSESSMENT_PROGRAMME the canonical create path must use. The fixture
-- therefore governs its programme set through a TEST sector-scoped profile
-- (more specific than the regulator-wide profile). The creation-time
-- programme control itself is unchanged and still enforced.
INSERT INTO public.supervisory_policy_profile(
  code, profile_version, domain_code, regulator_id, sector_id, name, status, origin, effective_from, notes)
VALUES ('AML07CERT-TEST-POLICY','1','AML_CFT',(SELECT v FROM r_id WHERE k='regulator'),(SELECT v FROM r_id WHERE k='sector'),
  'TEST ONLY — AML07CERT fixture profile','DRAFT','REGULATOR_AUTHORED', current_date - 1,
  'TEST ONLY — not an FSRA policy; discarded on rollback');
INSERT INTO public.supervisory_policy_profile_binding(
  profile_id, component_type, component_table, component_id, component_code, component_version, component_status, rationale)
SELECT pp.id,'ASSESSMENT_PROGRAMME','supervisory_assessment_programme_set', s.id, s.code, s.set_version, 'ACTIVE','TEST fixture binding'
  FROM public.supervisory_policy_profile pp, public.supervisory_assessment_programme_set s
 WHERE pp.code='AML07CERT-TEST-POLICY' AND s.code='AML07CERT-PROGRAMMES';
UPDATE public.supervisory_policy_profile SET status='ACTIVE', approved_at=now(), activated_at=now()
 WHERE code='AML07CERT-TEST-POLICY';

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML07CERT fixture rule, discarded on rollback');
  RESET ROLE;
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM r_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='AML07CERT_P'),
    'PERIODIC', NULL, NULL, 'AML07CERT review certification');
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
  IF (SELECT methodology_id FROM public.supervisory_assessment WHERE id=(SELECT v FROM r_id WHERE k='assessment'))
     <> (SELECT v FROM r_id WHERE k='meth') THEN
    RAISE EXCEPTION 'FIXTURE: the certification assessment did not bind the AML07CERT methodology';
  END IF;
  RAISE NOTICE 'FIXTURE: AML07CERT assessment created through the canonical programmed path';
END $$;

-- =====================================================================
-- SUBMIT-01 — the server, not the browser, publishes the lifecycle contract.
-- =====================================================================
DO $$
DECLARE st jsonb; a jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  st := public.supervisory_assessment_lifecycle_state((SELECT v FROM r_id WHERE k='assessment'));
  RESET ROLE;
  IF st->>'canonical_state' <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL SUBMIT-01: canonical state is % not DRAFT', st->>'canonical_state'; END IF;
  IF NOT (st->>'editing_allowed')::boolean OR (st->>'publication_allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL SUBMIT-01: draft edit/publication flags are wrong'; END IF;
  SELECT x INTO a FROM jsonb_array_elements(st->'actions') x WHERE x->>'action'='SUBMIT_FOR_REVIEW';
  IF a IS NULL OR a->>'required_permission' IS NULL OR a->>'reason_code' IS NULL THEN
    RAISE EXCEPTION 'FAIL SUBMIT-01: the submit action carries no permission/reason contract'; END IF;
  IF jsonb_array_length(st->'actions') < 6 THEN
    RAISE EXCEPTION 'FAIL SUBMIT-01: the action contract is incomplete'; END IF;
  RAISE NOTICE 'PASS SUBMIT-01: the server publishes canonical state, permitted actions, permissions and reason codes';
END $$;

-- =====================================================================
-- SUBMIT-02 — no screen may write a review, decision or publication row.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN INSERT INTO public.supervisory_assessment_review_round(assessment_id, round_seq)
        VALUES ((SELECT v FROM r_id WHERE k='assessment'), 99);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_assessment_review_challenge(
          assessment_id, review_round_id, round_seq, challenge_code, category, narrative)
        VALUES ((SELECT v FROM r_id WHERE k='assessment'), gen_random_uuid(), 1,'X','SCOPE','forged challenge row');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_assessment_approval_decision(
          assessment_id, decision, final_rating_source, rationale)
        VALUES ((SELECT v FROM r_id WHERE k='assessment'),'APPROVED','COMPUTED','forged approval attempt');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_assessment_risk_publication(
          approval_decision_id, assessment_id, entity_id, domain_code, reason)
        VALUES (gen_random_uuid(), (SELECT v FROM r_id WHERE k='assessment'),
                (SELECT v FROM r_id WHERE k='entity'),'AML_CFT','forged publication');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_assessment SET status='approved'
         WHERE id=(SELECT v FROM r_id WHERE k='assessment');
        IF NOT FOUND THEN refused := refused + 1; END IF;
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating)
        VALUES ((SELECT v FROM r_id WHERE k='entity'),'AML07CERT','HIGH');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 6 THEN RAISE EXCEPTION 'FAIL SUBMIT-02: only % of 6 direct writes were refused', refused; END IF;
  RAISE NOTICE 'PASS SUBMIT-02: every direct write to a review, decision, publication or risk record is refused (6/6)';
END $$;

-- =====================================================================
-- SUBMIT-03 — an incomplete assessment cannot be submitted for review.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_submit_for_review(
      (SELECT v FROM r_id WHERE k='assessment'),'AML07CERT premature submission attempt');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SUBMIT-03: an unanswered assessment was accepted for review'; END IF;
  IF msg NOT LIKE '%not_ready%' THEN
    RAISE EXCEPTION 'FAIL SUBMIT-03: refusal is not a readiness refusal: %', msg; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_review_round
       WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment')) <> 0 THEN
    RAISE EXCEPTION 'FAIL SUBMIT-03: a refused submission still created a review round'; END IF;
  RAISE NOTICE 'PASS SUBMIT-03: submission is refused on the committed server state with a readiness reason (%)', msg;
END $$;

-- --------------------------------------------- complete the fixture work ----
CREATE OR REPLACE FUNCTION pg_temp.r_answer(_qcode text, _response text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _aid uuid := (SELECT v FROM r_id WHERE k='assessment'); _q public.supervisory_methodology_question;
BEGIN
  SELECT * INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id=(SELECT v FROM r_id WHERE k='meth') AND question_code=_qcode;
  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, methodology_id, methodology_dimension_id, methodology_question_id,
    assessment_dimension_id, dimension_code, question_code, question_text, response)
  SELECT _aid, (SELECT v FROM r_id WHERE k='meth'), _q.methodology_dimension_id, _q.id,
         sad.id, md.dimension_code, _qcode, COALESCE(_q.prompt,_qcode), _response
    FROM public.supervisory_methodology_dimension md
    JOIN public.supervisory_assessment_dimension sad
      ON sad.assessment_id = _aid AND sad.methodology_dimension_id = md.id
   WHERE md.id = _q.methodology_dimension_id;
END $$;

SELECT pg_temp.r_answer('AML07CERT_Q_I1','NO');
SELECT pg_temp.r_answer('AML07CERT_Q_C1','YES');

-- Governed evidence source belonging to the assessment's own entity.
INSERT INTO public.supervisory_finding(
  reference, entity_id, domain_code, title, source_kind, status, assessment_id, origin_provenance)
VALUES ('AML07CERT-FIND-OK', (SELECT v FROM r_id WHERE k='entity'), 'AML_CFT',
        'AML07CERT accessible finding','ASSESSMENT','DRAFT',
        (SELECT v FROM r_id WHERE k='assessment'),'GOVERNED');
INSERT INTO r_id(k,v) SELECT 'find_ok', id FROM public.supervisory_finding WHERE reference='AML07CERT-FIND-OK';

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_evidence_link((SELECT v FROM r_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM r_id WHERE k='find_ok'),
      'methodology_question_id',(SELECT id FROM public.supervisory_methodology_question
        WHERE methodology_id=(SELECT v FROM r_id WHERE k='meth') AND question_code='AML07CERT_Q_C1'),
      'relevance_note','AML07CERT lineage evidence'));
  -- dimension ratings so the readiness contract is satisfied
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM r_id WHERE k='assessment'),
    _dimension_code => 'AML07CERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 80,
    _rationale => 'AML07CERT inherent dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT v FROM r_id WHERE k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM r_id WHERE k='assessment'),
    _dimension_code => 'AML07CERT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 10,
    _rationale => 'AML07CERT control dimension rationale for the fixture',
    _methodology_dimension_id => (SELECT v FROM r_id WHERE k='dim_c'));
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('evidence', (res->>'evidence_id')::uuid);
END $$;

-- Approved calculation policy (synthetic, rolled back).
DO $$
DECLARE cfg uuid; vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  cfg := public.supervisory_calculation_config_upsert((SELECT v FROM r_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT','recommendation_policy','WEIGHTED_SCORE'));
  INSERT INTO r_id(k,v) VALUES ('cfg', cfg);
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
    jsonb_build_object('question_code','AML07CERT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML07CERT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','AML07CERT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AML07CERT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FIXTURE: the AML07CERT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','AML07CERT policy submitted for approval');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','AML07CERT policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','AML07CERT policy activated by the checker');
  RESET ROLE;
  RAISE NOTICE 'FIXTURE: synthetic AML07CERT calculation policy in force for this transaction only';
END $$;

-- Immutable calculation run for the fixture assessment.
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT v FROM r_id WHERE k='assessment'),'AML07CERT_RUN');
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('run1', (res->>'run_id')::uuid);
  IF (SELECT status FROM public.supervisory_assessment_calculation_run
       WHERE id=(SELECT v FROM r_id WHERE k='run1')) <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FIXTURE: the AML07CERT calculation run is not CALCULATED (%)',
      (SELECT status||'/'||COALESCE(reason_code,'-') FROM public.supervisory_assessment_calculation_run
        WHERE id=(SELECT v FROM r_id WHERE k='run1')); END IF;
  RAISE NOTICE 'FIXTURE: immutable AML07CERT calculation run recorded';
END $$;

-- =====================================================================
-- SUBMIT-04 — a stale browser cannot submit an obsolete result.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_submit_for_review(
      (SELECT v FROM r_id WHERE k='assessment'),'AML07CERT stale hash submission attempt',
      (SELECT v FROM r_id WHERE k='run1'), 'deadbeefdeadbeefdeadbeefdeadbeef');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SUBMIT-04: a stale calculation hash was accepted'; END IF;
  IF msg NOT LIKE '%stale_readiness%' THEN
    RAISE EXCEPTION 'FAIL SUBMIT-04: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS SUBMIT-04: a stale screen result is refused (%)', msg;
END $$;

-- =====================================================================
-- SUBMIT-05 — a superseded calculation run cannot be bound to review.
-- =====================================================================
DO $$
DECLARE res jsonb; refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_calculation_run_record((SELECT v FROM r_id WHERE k='assessment'),'AML07CERT_RUN_2');
  INSERT INTO r_id(k,v) VALUES ('run2', (res->>'run_id')::uuid);
  BEGIN
    PERFORM public.supervisory_assessment_submit_for_review(
      (SELECT v FROM r_id WHERE k='assessment'),'AML07CERT superseded run submission attempt',
      (SELECT v FROM r_id WHERE k='run1'));
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SUBMIT-05: an obsolete calculation run was bound to review'; END IF;
  IF msg NOT LIKE '%stale_calculation%' THEN
    RAISE EXCEPTION 'FAIL SUBMIT-05: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS SUBMIT-05: only the current calculation run may be submitted (%)', msg;
END $$;

-- =====================================================================
-- SUBMIT-06 — submission binds the exact immutable run and opens round 1.
-- =====================================================================
DO $$
DECLARE res jsonb; rr public.supervisory_assessment_review_round; a public.supervisory_assessment;
        hash text;
BEGIN
  SELECT result_hash INTO hash FROM public.supervisory_assessment_calculation_run
   WHERE id=(SELECT v FROM r_id WHERE k='run2');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_submit_for_review(
    (SELECT v FROM r_id WHERE k='assessment'),'AML07CERT submission of the completed fixture assessment',
    (SELECT v FROM r_id WHERE k='run2'), hash, 'Initial submission');
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('round1', (res->>'round_id')::uuid);
  SELECT * INTO rr FROM public.supervisory_assessment_review_round WHERE id=(SELECT v FROM r_id WHERE k='round1');
  SELECT * INTO a FROM public.supervisory_assessment WHERE id=(SELECT v FROM r_id WHERE k='assessment');
  IF rr.round_seq <> 1 OR rr.outcome <> 'PENDING' THEN
    RAISE EXCEPTION 'FAIL SUBMIT-06: round 1 was not opened'; END IF;
  IF rr.calculation_run_id <> (SELECT v FROM r_id WHERE k='run2')
     OR rr.calculation_result_hash <> hash OR rr.calculation_basis <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL SUBMIT-06: the round did not bind the exact calculation run'; END IF;
  IF a.status <> 'submitted' OR a.submitted_run_id <> rr.calculation_run_id OR a.review_round_seq <> 1 THEN
    RAISE EXCEPTION 'FAIL SUBMIT-06: the assessment did not move to review against the bound run'; END IF;
  IF rr.readiness_snapshot->>'can_submit' IS NULL OR rr.submission_snapshot->>'methodology_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL SUBMIT-06: the submission snapshot is incomplete'; END IF;
  RAISE NOTICE 'PASS SUBMIT-06: submission binds the exact immutable calculation run and records the snapshot';
END $$;

-- =====================================================================
-- SUBMIT-07 — an assessment already under review cannot be resubmitted.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_submit_for_review(
      (SELECT v FROM r_id WHERE k='assessment'),'AML07CERT duplicate submission attempt');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SUBMIT-07: a submitted assessment was submitted again'; END IF;
  RAISE NOTICE 'PASS SUBMIT-07: the server owns the transition and refuses a duplicate submission (%)', msg;
END $$;

-- =====================================================================
-- SUBMIT-08 — a persona without submission authority is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_submit_for_review(
      (SELECT v FROM r_id WHERE k='assessment'),'AML07CERT unauthorised submission attempt');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL SUBMIT-08: an unauthorised persona submitted an assessment'; END IF;
  RAISE NOTICE 'PASS SUBMIT-08: submission requires canonical supervisory authority';
END $$;

-- =====================================================================
-- REVIEW-01 — the reviewer contract and maker/checker are server decisions.
-- =====================================================================
DO $$
DECLARE st jsonb; a jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  st := public.supervisory_assessment_lifecycle_state((SELECT v FROM r_id WHERE k='assessment'));
  RESET ROLE;
  IF st->>'canonical_state' <> 'SUBMITTED_FOR_REVIEW' THEN
    RAISE EXCEPTION 'FAIL REVIEW-01: canonical state is %', st->>'canonical_state'; END IF;
  IF (st->>'editing_allowed')::boolean OR (st->>'calculation_allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL REVIEW-01: an assessment under review is still editable/calculable'; END IF;
  SELECT x INTO a FROM jsonb_array_elements(st->'actions') x WHERE x->>'action'='APPROVE';
  IF (a->>'permitted')::boolean OR a->>'reason_code' <> 'MAKER_CHECKER' THEN
    RAISE EXCEPTION 'FAIL REVIEW-01: the preparer is offered approval (%)', a; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  st := public.supervisory_assessment_lifecycle_state((SELECT v FROM r_id WHERE k='assessment'));
  RESET ROLE;
  SELECT x INTO a FROM jsonb_array_elements(st->'actions') x WHERE x->>'action'='APPROVE';
  IF NOT (a->>'permitted')::boolean THEN
    RAISE EXCEPTION 'FAIL REVIEW-01: the independent checker is not offered approval (%)', a; END IF;
  RAISE NOTICE 'PASS REVIEW-01: the server publishes maker/checker separation in the action contract';
END $$;

-- =====================================================================
-- REVIEW-02 — reviewer assignment is governed and audited.
-- =====================================================================
DO $$
DECLARE refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_review_assign((SELECT v FROM r_id WHERE k='assessment'),
      (SELECT v FROM r_id WHERE k='outsider'),'AML07CERT assignment to a persona without review authority');
  EXCEPTION WHEN others THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL REVIEW-02: a reviewer without authority was assigned'; END IF;
  PERFORM public.supervisory_assessment_review_assign((SELECT v FROM r_id WHERE k='assessment'),
    (SELECT v FROM r_id WHERE k='checker'),'AML07CERT reviewer assignment for the certification round');
  RESET ROLE;
  IF (SELECT reviewer_id FROM public.supervisory_assessment_review_round
       WHERE id=(SELECT v FROM r_id WHERE k='round1')) <> (SELECT v FROM r_id WHERE k='checker') THEN
    RAISE EXCEPTION 'FAIL REVIEW-02: the round does not record the assigned reviewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_event
                  WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment')
                    AND event_type='REVIEW_ASSIGNMENT') THEN
    RAISE EXCEPTION 'FAIL REVIEW-02: reassignment was not audited'; END IF;
  RAISE NOTICE 'PASS REVIEW-02: reviewer assignment is governed, scope-checked and audited';
END $$;

-- =====================================================================
-- CHALLENGE-01 — a structured challenge is preserved in full.
-- =====================================================================
DO $$
DECLARE res jsonb; c public.supervisory_assessment_review_challenge;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_assessment_challenge_raise((SELECT v FROM r_id WHERE k='assessment'),
    'EVIDENCE_INSUFFICIENT','EVIDENCE',
    'AML07CERT: the control conclusion is not supported by the cited evidence.',
    jsonb_build_object('question_code','AML07CERT_Q_C1','dimension_code','AML07CERT_DIM_C',
      'evidence_id',(SELECT v FROM r_id WHERE k='evidence')));
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('challenge1', (res->>'challenge_id')::uuid);
  SELECT * INTO c FROM public.supervisory_assessment_review_challenge WHERE id=(SELECT v FROM r_id WHERE k='challenge1');
  IF c.status <> 'OPEN' OR c.review_round_id <> (SELECT v FROM r_id WHERE k='round1')
     OR c.challenge_code <> 'EVIDENCE_INSUFFICIENT' OR c.category <> 'EVIDENCE'
     OR c.question_code <> 'AML07CERT_Q_C1' OR c.raised_by <> (SELECT v FROM r_id WHERE k='checker')
     OR c.calculation_run_id <> (SELECT v FROM r_id WHERE k='run2') THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-01: the challenge record is incomplete (%)', to_jsonb(c); END IF;
  RAISE NOTICE 'PASS CHALLENGE-01: a structured challenge records code, category, narrative, references and reviewer';
END $$;

-- =====================================================================
-- CHALLENGE-02 — approval is refused while a challenge is open.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text; st jsonb; a jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  st := public.supervisory_assessment_lifecycle_state((SELECT v FROM r_id WHERE k='assessment'));
  BEGIN PERFORM public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT approval attempt with an open challenge');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL CHALLENGE-02: approval succeeded with an open challenge'; END IF;
  IF msg NOT LIKE '%CHALLENGE_OPEN%' THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-02: wrong refusal: %', msg; END IF;
  SELECT x INTO a FROM jsonb_array_elements(st->'actions') x WHERE x->>'action'='APPROVE';
  IF (a->>'permitted')::boolean OR a->>'reason_code' <> 'BLOCKED' THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-02: the contract does not report the blocker (%)', a; END IF;
  RAISE NOTICE 'PASS CHALLENGE-02: an open challenge blocks approval in both the contract and the operation';
END $$;

-- =====================================================================
-- CHALLENGE-03 — the return decision needs a written reason and preserves
--                the submitted snapshot.
-- =====================================================================
DO $$
DECLARE refused boolean := false; rr public.supervisory_assessment_review_round; before jsonb;
BEGIN
  SELECT to_jsonb(x) INTO before FROM public.supervisory_assessment_review_round x
   WHERE id=(SELECT v FROM r_id WHERE k='round1');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_review_return((SELECT v FROM r_id WHERE k='assessment'),'too short');
  EXCEPTION WHEN others THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL CHALLENGE-03: a return without a written reason was accepted'; END IF;
  PERFORM public.supervisory_assessment_review_return((SELECT v FROM r_id WHERE k='assessment'),
    'AML07CERT: returned for correction of the control evidence citation.');
  RESET ROLE;
  SELECT * INTO rr FROM public.supervisory_assessment_review_round WHERE id=(SELECT v FROM r_id WHERE k='round1');
  IF rr.outcome <> 'RETURNED' OR rr.outcome_by <> (SELECT v FROM r_id WHERE k='checker') THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-03: the round outcome was not recorded'; END IF;
  IF rr.calculation_run_id::text <> (before->>'calculation_run_id')
     OR rr.submission_snapshot <> (before->'submission_snapshot')
     OR rr.submitted_by::text <> (before->>'submitted_by') THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-03: returning the assessment rewrote the submitted snapshot'; END IF;
  IF (SELECT status FROM public.supervisory_assessment WHERE id=(SELECT v FROM r_id WHERE k='assessment'))
     <> 'returned_for_revision' THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-03: the assessment was not returned'; END IF;
  RAISE NOTICE 'PASS CHALLENGE-03: a return requires a written reason and never rewrites the submitted snapshot';
END $$;

-- =====================================================================
-- CHALLENGE-04 — challenges are resolved with an attributable note; a
--                challenge cannot be raised outside review.
-- =====================================================================
DO $$
DECLARE refused int := 0; c public.supervisory_assessment_review_challenge;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_challenge_raise((SELECT v FROM r_id WHERE k='assessment'),
      'LATE','SCOPE','AML07CERT challenge raised outside a review round');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_challenge_resolve((SELECT v FROM r_id WHERE k='challenge1'),'short');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  PERFORM public.supervisory_assessment_challenge_resolve((SELECT v FROM r_id WHERE k='challenge1'),
    'AML07CERT: evidence citation corrected and the control conclusion restated.');
  BEGIN PERFORM public.supervisory_assessment_challenge_resolve((SELECT v FROM r_id WHERE k='challenge1'),
      'AML07CERT: second resolution attempt on a closed challenge.');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN RAISE EXCEPTION 'FAIL CHALLENGE-04: only % of 3 invalid challenge operations were refused', refused; END IF;
  SELECT * INTO c FROM public.supervisory_assessment_review_challenge WHERE id=(SELECT v FROM r_id WHERE k='challenge1');
  IF c.status <> 'RESOLVED' OR c.resolved_by <> (SELECT v FROM r_id WHERE k='officer')
     OR c.resolved_at IS NULL OR c.resolution_note IS NULL THEN
    RAISE EXCEPTION 'FAIL CHALLENGE-04: the resolution is not attributable'; END IF;
  RAISE NOTICE 'PASS CHALLENGE-04: challenge resolution is attributable and invalid challenge operations are refused (3/3)';
END $$;

-- =====================================================================
-- RESUBMIT-01 — resubmission opens a new round; the first round is intact.
-- =====================================================================
DO $$
DECLARE res jsonb; r1 public.supervisory_assessment_review_round; r2 public.supervisory_assessment_review_round;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  -- the corrected work is recalculated, so a new immutable run exists
  res := public.supervisory_assessment_calculation_run_record((SELECT v FROM r_id WHERE k='assessment'),'AML07CERT_RUN_3');
  INSERT INTO r_id(k,v) VALUES ('run3', (res->>'run_id')::uuid);
  res := public.supervisory_assessment_submit_for_review((SELECT v FROM r_id WHERE k='assessment'),
    'AML07CERT resubmission after correction of the control evidence',
    (SELECT v FROM r_id WHERE k='run3'), NULL,
    'Corrected the control evidence citation and recalculated');
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('round2', (res->>'round_id')::uuid);
  SELECT * INTO r1 FROM public.supervisory_assessment_review_round WHERE id=(SELECT v FROM r_id WHERE k='round1');
  SELECT * INTO r2 FROM public.supervisory_assessment_review_round WHERE id=(SELECT v FROM r_id WHERE k='round2');
  IF r2.round_seq <> 2 OR r2.outcome <> 'PENDING' OR r2.change_summary IS NULL THEN
    RAISE EXCEPTION 'FAIL RESUBMIT-01: round 2 was not opened with a change summary'; END IF;
  IF r1.outcome <> 'RETURNED' OR r1.calculation_run_id <> (SELECT v FROM r_id WHERE k='run2') THEN
    RAISE EXCEPTION 'FAIL RESUBMIT-01: the earlier round was rewritten'; END IF;
  IF r2.calculation_run_id <> (SELECT v FROM r_id WHERE k='run3') THEN
    RAISE EXCEPTION 'FAIL RESUBMIT-01: the new round did not bind the new run'; END IF;
  RAISE NOTICE 'PASS RESUBMIT-01: resubmission opens a new round bound to the new run and preserves round 1';
END $$;

-- =====================================================================
-- RESUBMIT-02 — the register shows the complete round history.
-- =====================================================================
DO $$
DECLARE reg jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  reg := public.supervisory_assessment_review_register((SELECT v FROM r_id WHERE k='assessment'));
  RESET ROLE;
  IF jsonb_array_length(reg->'rounds') <> 2 THEN
    RAISE EXCEPTION 'FAIL RESUBMIT-02: the register reports % rounds', jsonb_array_length(reg->'rounds'); END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(reg->'rounds') r
                  WHERE jsonb_array_length(r->'challenges') > 0) THEN
    RAISE EXCEPTION 'FAIL RESUBMIT-02: the round history does not carry its challenges'; END IF;
  IF (reg->'lifecycle'->>'canonical_state') <> 'RESUBMITTED' THEN
    RAISE EXCEPTION 'FAIL RESUBMIT-02: canonical state is %', reg->'lifecycle'->>'canonical_state'; END IF;
  RAISE NOTICE 'PASS RESUBMIT-02: the review register publishes the full round and challenge history';
END $$;

-- =====================================================================
-- OVERRIDE-01 — an undecided override blocks approval.
-- =====================================================================
DO $$
DECLARE res uuid; refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_calculation_override_propose((SELECT v FROM r_id WHERE k='assessment'),'LOW',
    'AML07CERT first override proposal, expected to be rejected');
  INSERT INTO r_id(k,v) VALUES ('ovr1', res);
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT approval attempt with an undecided override');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-01: approval succeeded with an undecided override'; END IF;
  IF msg NOT LIKE '%OVERRIDE_UNRESOLVED%' THEN
    RAISE EXCEPTION 'FAIL OVERRIDE-01: wrong refusal: %', msg; END IF;
  RAISE NOTICE 'PASS OVERRIDE-01: an undecided rating override blocks approval (%)', msg;
END $$;

-- =====================================================================
-- OVERRIDE-02 — the proposer cannot decide their own override; a rejected
--               override never becomes the approved result.
-- =====================================================================
DO $$
DECLARE refused boolean := false; res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_override_decide((SELECT v FROM r_id WHERE k='ovr1'),'APPROVED',
      'AML07CERT self approval attempt on an override');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL OVERRIDE-02: the proposer decided their own override'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_override_decide((SELECT v FROM r_id WHERE k='ovr1'),'REJECTED',
    'AML07CERT: the proposed rating is not supported by the evidence.');
  RESET ROLE;
  IF (SELECT status FROM public.supervisory_assessment_calculation_override
       WHERE id=(SELECT v FROM r_id WHERE k='ovr1')) <> 'REJECTED' THEN
    RAISE EXCEPTION 'FAIL OVERRIDE-02: the override was not rejected'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-02: override maker/checker separation is enforced and the rejection is recorded';
END $$;

-- =====================================================================
-- OVERRIDE-03 — an approved override takes precedence, once, and only
--               when it refers to the submitted run.
-- =====================================================================
DO $$
DECLARE res uuid; o public.supervisory_assessment_calculation_override;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_calculation_override_propose((SELECT v FROM r_id WHERE k='assessment'),'MEDIUM_HIGH',
    'AML07CERT supervisory override reflecting qualitative concerns');
  INSERT INTO r_id(k,v) VALUES ('ovr2', res);
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_override_decide((SELECT v FROM r_id WHERE k='ovr2'),'APPROVED',
    'AML07CERT: override accepted by the independent checker.');
  RESET ROLE;
  SELECT * INTO o FROM public.supervisory_assessment_calculation_override WHERE id=(SELECT v FROM r_id WHERE k='ovr2');
  IF o.status <> 'APPROVED' OR o.decided_by = o.proposed_by OR o.run_id <> (SELECT v FROM r_id WHERE k='run3') THEN
    RAISE EXCEPTION 'FAIL OVERRIDE-03: the approved override is not independently decided against the current run'; END IF;
  RAISE NOTICE 'PASS OVERRIDE-03: an independently approved override is bound to the submitted run';
END $$;

-- =====================================================================
-- APPROVAL-01 — the preparer cannot approve; rationale is mandatory.
-- =====================================================================
DO $$
DECLARE refused int := 0; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT self approval attempt by the preparer');
  EXCEPTION WHEN others THEN refused := refused + 1; msg := SQLERRM; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),'short');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT approval attempt without any supervisory authority');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN RAISE EXCEPTION 'FAIL APPROVAL-01: only % of 3 invalid approvals were refused', refused; END IF;
  IF msg NOT LIKE '%cannot approve it%' THEN
    RAISE EXCEPTION 'FAIL APPROVAL-01: the maker/checker refusal is not explicit: %', msg; END IF;
  RAISE NOTICE 'PASS APPROVAL-01: self-approval, unreasoned approval and unauthorised approval are refused (3/3)';
END $$;

-- =====================================================================
-- APPROVAL-02 — approval binds an immutable decision and does not
--               recalculate; the approved override takes precedence.
-- =====================================================================
DO $$
DECLARE res jsonb; d public.supervisory_assessment_approval_decision; runs_before int; runs_after int;
        a public.supervisory_assessment;
BEGIN
  SELECT count(*) INTO runs_before FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),
    'AML07CERT: approved by the independent supervisor on the submitted calculation run.');
  RESET ROLE;
  INSERT INTO r_id(k,v) VALUES ('decision', (res->>'decision_id')::uuid);
  SELECT count(*) INTO runs_after FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment');
  IF runs_after <> runs_before THEN
    RAISE EXCEPTION 'FAIL APPROVAL-02: approval silently recalculated the assessment'; END IF;
  SELECT * INTO d FROM public.supervisory_assessment_approval_decision WHERE id=(SELECT v FROM r_id WHERE k='decision');
  SELECT * INTO a FROM public.supervisory_assessment WHERE id=(SELECT v FROM r_id WHERE k='assessment');
  IF d.decision <> 'APPROVED' OR d.calculation_run_id <> (SELECT v FROM r_id WHERE k='run3')
     OR d.calculation_result_hash IS NULL OR d.methodology_id <> (SELECT v FROM r_id WHERE k='meth')
     OR d.round_seq <> 2 OR d.decided_by <> (SELECT v FROM r_id WHERE k='checker') THEN
    RAISE EXCEPTION 'FAIL APPROVAL-02: the approval decision does not bind the exact record (%)', to_jsonb(d); END IF;
  IF d.final_rating_source <> 'APPROVED_OVERRIDE' OR d.final_rating <> 'MEDIUM_HIGH'
     OR d.override_id <> (SELECT v FROM r_id WHERE k='ovr2') OR d.computed_rating IS NULL THEN
    RAISE EXCEPTION 'FAIL APPROVAL-02: override precedence was not applied by the server (%)', to_jsonb(d); END IF;
  IF a.status <> 'approved' OR a.approved_rating <> d.final_rating
     OR a.approved_rating_source <> 'APPROVED_OVERRIDE' OR a.approval_decision_id <> d.id THEN
    RAISE EXCEPTION 'FAIL APPROVAL-02: the assessment does not carry the approved result'; END IF;
  IF jsonb_array_length(d.review_history) <> 2 THEN
    RAISE EXCEPTION 'FAIL APPROVAL-02: the decision does not carry the review-round history'; END IF;
  RAISE NOTICE 'PASS APPROVAL-02: approval binds an immutable decision, applies override precedence and never recalculates';
END $$;

-- =====================================================================
-- APPROVAL-03 — the approval decision cannot be edited or deleted.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  BEGIN UPDATE public.supervisory_assessment_approval_decision SET final_rating='LOW'
         WHERE id=(SELECT v FROM r_id WHERE k='decision');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_approval_decision
         WHERE id=(SELECT v FROM r_id WHERE k='decision');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  IF refused < 2 THEN RAISE EXCEPTION 'FAIL APPROVAL-03: only % of 2 mutations were refused', refused; END IF;
  RAISE NOTICE 'PASS APPROVAL-03: a recorded approval decision is immutable (2/2)';
END $$;

-- =====================================================================
-- APPROVAL-04 — a second approval on the same assessment is refused.
-- =====================================================================
DO $$
DECLARE refused boolean := false; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_approve((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT second approval attempt on an approved assessment');
  EXCEPTION WHEN others THEN refused := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL APPROVAL-04: an approved assessment was approved twice'; END IF;
  RAISE NOTICE 'PASS APPROVAL-04: a concurrent or repeated approval is refused (%)', msg;
END $$;

-- =====================================================================
-- PUBLISH-01 — approval published the risk-of-record atomically.
-- =====================================================================
DO $$
DECLARE p public.supervisory_assessment_risk_publication; s public.entity_risk_state;
BEGIN
  SELECT * INTO p FROM public.supervisory_assessment_risk_publication
   WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment');
  IF p.id IS NULL THEN RAISE EXCEPTION 'FAIL PUBLISH-01: approval did not publish a risk-of-record'; END IF;
  IF p.approval_decision_id <> (SELECT v FROM r_id WHERE k='decision')
     OR p.published_rating <> 'MEDIUM_HIGH' OR p.published_by <> (SELECT v FROM r_id WHERE k='checker')
     OR p.movement_id IS NULL OR p.reason IS NULL THEN
    RAISE EXCEPTION 'FAIL PUBLISH-01: the publication ledger is incomplete (%)', to_jsonb(p); END IF;
  IF p.previous_rating IS DISTINCT FROM (SELECT t FROM r_t WHERE k='entity_rating') THEN
    RAISE EXCEPTION 'FAIL PUBLISH-01: the superseded rating was not captured (% vs %)',
      p.previous_rating, (SELECT t FROM r_t WHERE k='entity_rating'); END IF;
  SELECT * INTO s FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT';
  IF s.residual_rating <> 'MEDIUM_HIGH' OR s.driving_assessment_id <> (SELECT v FROM r_id WHERE k='assessment') THEN
    RAISE EXCEPTION 'FAIL PUBLISH-01: the canonical risk-of-record does not reflect the approved result'; END IF;
  IF (SELECT count(*) FROM public.entity_risk_state
       WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT') <> 1 THEN
    RAISE EXCEPTION 'FAIL PUBLISH-01: more than one current risk record exists'; END IF;
  RAISE NOTICE 'PASS PUBLISH-01: approval published the canonical risk-of-record atomically with lineage';
END $$;

-- =====================================================================
-- PUBLISH-02 — the publication ledger is immutable.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  BEGIN UPDATE public.supervisory_assessment_risk_publication SET published_rating='LOW'
         WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_risk_publication
         WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  IF refused < 2 THEN RAISE EXCEPTION 'FAIL PUBLISH-02: only % of 2 mutations were refused', refused; END IF;
  RAISE NOTICE 'PASS PUBLISH-02: the risk publication ledger is immutable (2/2)';
END $$;

-- =====================================================================
-- PUBLISH-03 — an unapproved assessment can never publish.
-- =====================================================================
DO $$
DECLARE res jsonb; refused int := 0; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create(
    _entity_id => (SELECT v FROM r_id WHERE k='entity'), _domain_code => 'AML_CFT',
    _assessment_type => 'PERIODIC', _period_start => current_date - 400, _period_end => current_date - 200,
    _methodology_id => (SELECT v FROM r_id WHERE k='meth'), _trigger_type => 'PERIODIC',
    _summary => 'AML07CERT second fixture assessment for publication refusals');
  INSERT INTO r_id(k,v) VALUES ('assessment_b', (res->>'id')::uuid);
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_publish_risk_of_record((SELECT v FROM r_id WHERE k='assessment_b'),
      'AML07CERT publication attempt from a draft assessment');
  EXCEPTION WHEN others THEN refused := refused + 1; msg := SQLERRM; END;
  RESET ROLE;
  IF refused < 1 THEN RAISE EXCEPTION 'FAIL PUBLISH-03: a draft assessment published a risk-of-record'; END IF;
  IF msg NOT LIKE '%only an approved assessment can publish%' THEN
    RAISE EXCEPTION 'FAIL PUBLISH-03: wrong refusal: %', msg; END IF;
  IF (SELECT driving_assessment_id FROM public.entity_risk_state
       WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT')
     <> (SELECT v FROM r_id WHERE k='assessment') THEN
    RAISE EXCEPTION 'FAIL PUBLISH-03: an unapproved assessment changed the risk-of-record'; END IF;
  RAISE NOTICE 'PASS PUBLISH-03: only an approved assessment can publish (%)', msg;
END $$;

-- =====================================================================
-- IDEMPOTENCY-01 — repeat publication does not duplicate the record.
-- =====================================================================
DO $$
DECLARE res jsonb; n_pub int; n_state int; n_mv int;
BEGIN
  SELECT count(*) INTO n_mv FROM public.entity_risk_state_movement
   WHERE new_assessment_id=(SELECT v FROM r_id WHERE k='assessment');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  res := public.supervisory_assessment_publish_risk_of_record((SELECT v FROM r_id WHERE k='assessment'),
    'AML07CERT repeat publication attempt');
  RESET ROLE;
  IF NOT (res->>'already_published')::boolean THEN
    RAISE EXCEPTION 'FAIL IDEMPOTENCY-01: a repeat publication was treated as new'; END IF;
  SELECT count(*) INTO n_pub FROM public.supervisory_assessment_risk_publication
   WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment');
  SELECT count(*) INTO n_state FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT';
  IF n_pub <> 1 OR n_state <> 1
     OR n_mv <> (SELECT count(*) FROM public.entity_risk_state_movement
                  WHERE new_assessment_id=(SELECT v FROM r_id WHERE k='assessment')) THEN
    RAISE EXCEPTION 'FAIL IDEMPOTENCY-01: publication duplicated records (% ledger, % state)', n_pub, n_state; END IF;
  RAISE NOTICE 'PASS IDEMPOTENCY-01: publication is idempotent — one ledger row, one current risk record, one movement';
END $$;

-- =====================================================================
-- CONCURRENCY-01 — two publication attempts produce one valid outcome.
-- =====================================================================
DO $$
DECLARE r1 jsonb; r2 jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  r1 := public.supervisory_assessment_publish_risk_of_record((SELECT v FROM r_id WHERE k='assessment'),
    'AML07CERT concurrent publication attempt A');
  r2 := public.supervisory_assessment_publish_risk_of_record((SELECT v FROM r_id WHERE k='assessment'),
    'AML07CERT concurrent publication attempt B');
  RESET ROLE;
  IF (r1->>'publication_id') <> (r2->>'publication_id') THEN
    RAISE EXCEPTION 'FAIL CONCURRENCY-01: two publications produced two ledger rows'; END IF;
  RAISE NOTICE 'PASS CONCURRENCY-01: concurrent publication resolves to one governed outcome';
END $$;

-- =====================================================================
-- CONCURRENCY-02 — a review action on stale state is refused.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_review_return((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT return attempt on an already approved assessment');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_review_reject((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT rejection attempt on an already approved assessment');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_challenge_raise((SELECT v FROM r_id WHERE k='assessment'),
      'LATE','SCOPE','AML07CERT challenge attempt on an already approved assessment');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN
    RAISE EXCEPTION 'FAIL CONCURRENCY-02: only % of 3 stale review actions were refused', refused; END IF;
  RAISE NOTICE 'PASS CONCURRENCY-02: review actions on stale lifecycle state are refused (3/3)';
END $$;

-- =====================================================================
-- SUPERSEDE-01 — the previous assessment is superseded, never deleted.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_assessment;
  IF n < (SELECT r_n.n FROM r_n WHERE k='assessments') THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-01: assessments were deleted'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment
       WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT'
         AND is_current AND status IN ('approved','closed','superseded')) <> 1 THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-01: more than one current assessment for the entity and domain'; END IF;
  IF NOT (SELECT is_current FROM public.supervisory_assessment WHERE id=(SELECT v FROM r_id WHERE k='assessment')) THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-01: the approved assessment is not the current one'; END IF;
  RAISE NOTICE 'PASS SUPERSEDE-01: the previous current assessment is superseded and preserved';
END $$;

-- =====================================================================
-- SUPERSEDE-02 — the movement records the full change of risk-of-record.
-- =====================================================================
DO $$
DECLARE m public.entity_risk_state_movement; h jsonb;
BEGIN
  SELECT m2.* INTO m FROM public.entity_risk_state_movement m2
    JOIN public.supervisory_assessment_risk_publication p ON p.movement_id = m2.id
   WHERE p.assessment_id=(SELECT v FROM r_id WHERE k='assessment');
  IF m.id IS NULL THEN RAISE EXCEPTION 'FAIL SUPERSEDE-02: no risk movement was recorded'; END IF;
  IF m.new_rating <> 'MEDIUM_HIGH' OR m.approved_by <> (SELECT v FROM r_id WHERE k='checker')
     OR m.reason IS NULL OR m.trigger_kind IS NULL THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-02: the movement record is incomplete (%)', to_jsonb(m); END IF;
  IF m.previous_rating IS DISTINCT FROM (SELECT t FROM r_t WHERE k='entity_rating') THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-02: the previous rating is not preserved'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  h := public.supervisory_entity_risk_history((SELECT v FROM r_id WHERE k='entity'),'AML_CFT');
  RESET ROLE;
  IF h->'current'->>'residual_rating' <> 'MEDIUM_HIGH' THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-02: the risk history does not report the current published rating'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(h->'movements') x
                  WHERE x->>'id' = m.id::text AND x->'decision'->>'final_rating' = 'MEDIUM_HIGH'
                    AND x->'publication'->>'approval_decision_id' = (SELECT v FROM r_id WHERE k='decision')::text) THEN
    RAISE EXCEPTION 'FAIL SUPERSEDE-02: the history does not chain movement, publication and decision'; END IF;
  RAISE NOTICE 'PASS SUPERSEDE-02: the supersession chain records previous and new rating, actor, reason and lineage';
END $$;

-- =====================================================================
-- SUPERSEDE-03 — published risk history is immutable.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  BEGIN UPDATE public.entity_risk_state_movement SET new_rating='LOW'
         WHERE new_assessment_id=(SELECT v FROM r_id WHERE k='assessment');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.entity_risk_state_movement
         WHERE new_assessment_id=(SELECT v FROM r_id WHERE k='assessment');
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  IF refused < 2 THEN RAISE EXCEPTION 'FAIL SUPERSEDE-03: only % of 2 history mutations were refused', refused; END IF;
  RAISE NOTICE 'PASS SUPERSEDE-03: published risk history cannot be overwritten or deleted (2/2)';
END $$;

-- =====================================================================
-- LINEAGE-01 — the published risk-of-record traces the whole chain.
-- =====================================================================
DO $$
DECLARE l jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  l := public.supervisory_assessment_risk_lineage((SELECT v FROM r_id WHERE k='assessment'));
  RESET ROLE;
  IF NOT (l->>'complete')::boolean THEN
    RAISE EXCEPTION 'FAIL LINEAGE-01: the lineage is not complete (%)', l; END IF;
  IF l->'risk_of_record'->>'publication_id' IS NULL
     OR l->'approval_decision'->>'id' IS NULL
     OR l->'review_round'->>'round_seq' IS NULL
     OR l->'calculation_run'->>'result_hash' IS NULL
     OR l->'calculation_policy'->>'config_id' IS NULL
     OR l->'methodology'->>'id' IS NULL
     OR l->'programme'->>'id' IS NULL
     OR (l->'question_plan'->>'rows')::int < 1
     OR (l->'responses'->>'count')::int < 2
     OR l->'facts'->>'count' IS NULL
     OR (l->'evidence'->>'accessible_count')::int < 1 THEN
    RAISE EXCEPTION 'FAIL LINEAGE-01: a lineage hop is missing (%)', l; END IF;
  IF l->'approval_decision'->>'final_rating_source' <> 'APPROVED_OVERRIDE' THEN
    RAISE EXCEPTION 'FAIL LINEAGE-01: the lineage does not report the override precedence'; END IF;
  RAISE NOTICE 'PASS LINEAGE-01: risk-of-record traces decision, round, run, policy, methodology, programme, plan, responses, facts and evidence';
END $$;

-- =====================================================================
-- LINEAGE-02 — restricted sources are never disclosed through lineage.
-- =====================================================================
DO $$
DECLARE l jsonb; refused boolean := false;
BEGIN
  -- the cited source now belongs to a different entity: the reader loses access
  UPDATE public.supervisory_finding SET entity_id=(SELECT v FROM r_id WHERE k='other_entity')
   WHERE id=(SELECT v FROM r_id WHERE k='find_ok');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  l := public.supervisory_assessment_risk_lineage((SELECT v FROM r_id WHERE k='assessment'));
  RESET ROLE;
  IF (l->'evidence'->>'accessible_count')::int <> 0 OR jsonb_array_length(l->'evidence'->'items') <> 0 THEN
    RAISE EXCEPTION 'FAIL LINEAGE-02: lineage disclosed a restricted evidence source'; END IF;
  IF (l->'evidence')::text LIKE '%AML07CERT accessible finding%' THEN
    RAISE EXCEPTION 'FAIL LINEAGE-02: a restricted source title leaked'; END IF;
  UPDATE public.supervisory_finding SET entity_id=(SELECT v FROM r_id WHERE k='entity')
   WHERE id=(SELECT v FROM r_id WHERE k='find_ok');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_risk_lineage((SELECT v FROM r_id WHERE k='assessment'));
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL LINEAGE-02: an unauthorised reader obtained the lineage'; END IF;
  RAISE NOTICE 'PASS LINEAGE-02: lineage respects source visibility and refuses unauthorised readers';
END $$;

-- =====================================================================
-- LINEAGE-03 / LEGACY-01 — a historical approval is honest, not fabricated.
-- =====================================================================
DO $$
DECLARE l jsonb; legacy uuid;
BEGIN
  SELECT a.id INTO legacy FROM public.supervisory_assessment a
   WHERE a.status IN ('approved','superseded') AND a.reference NOT LIKE 'AML07CERT%'
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_approval_decision d WHERE d.assessment_id=a.id)
   ORDER BY a.created_at LIMIT 1;
  IF legacy IS NULL THEN
    RAISE NOTICE 'PASS LEGACY-01: no historical approval lacks a governed decision (nothing to reinterpret)';
    RETURN; END IF;
  INSERT INTO r_id(k,v) VALUES ('legacy', legacy);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  l := public.supervisory_assessment_risk_lineage(legacy);
  RESET ROLE;
  IF (l->>'complete')::boolean THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: a historical approval was presented as governed AML-07 lineage'; END IF;
  IF l->>'legacy_state' <> 'LEGACY_APPROVAL_WITHOUT_GOVERNED_DECISION' THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: the legacy lineage state is % ', l->>'legacy_state'; END IF;
  IF l->'calculation_run'->>'result_hash' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: a calculation-run hash was fabricated for a historical record'; END IF;
  RAISE NOTICE 'PASS LEGACY-01: a historical approval reports an honest legacy lineage state without fabrication';
END $$;

-- =====================================================================
-- LEGACY-02 — historical records are untouched by the AML-07 gates.
-- =====================================================================
DO $$
BEGIN
  IF (SELECT count(*) FROM public.supervisory_assessment_calculation
       WHERE assessment_id NOT IN (SELECT v FROM r_id WHERE k IN ('assessment','assessment_b')))
     <> (SELECT n FROM r_n WHERE k='calc_hist') THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: historical calculation results changed'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_question_response
       WHERE assessment_id NOT IN (SELECT v FROM r_id WHERE k IN ('assessment','assessment_b')))
     <> (SELECT n FROM r_n WHERE k='responses') THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: existing responses changed'; END IF;
  IF (SELECT count(*) FROM public.regulators) <> (SELECT n FROM r_n WHERE k='regulators') THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: regulator records changed'; END IF;
  IF (SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.residual_rating,'-'),'|' ORDER BY a.id))
        FROM public.supervisory_assessment a
       WHERE a.reference NOT LIKE 'AML07CERT%'
         AND a.entity_id <> (SELECT v FROM r_id WHERE k='entity'))
     <> (SELECT md5(string_agg(x,'|' ORDER BY x)) FROM (
           SELECT a.id::text||':'||a.status||':'||COALESCE(a.residual_rating,'-') x
             FROM public.supervisory_assessment a
            WHERE a.reference NOT LIKE 'AML07CERT%'
              AND a.entity_id <> (SELECT v FROM r_id WHERE k='entity')) y) THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: assessments outside the fixture entity changed'; END IF;
  RAISE NOTICE 'PASS LEGACY-02: historical calculations, responses, regulators and other entities are untouched';
END $$;

-- =====================================================================
-- LEGACY-03 — old approvals remain valid under the new gates.
-- =====================================================================
DO $$
DECLARE st jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM r_id WHERE k='legacy') THEN
    RAISE NOTICE 'PASS LEGACY-03: no legacy approval to re-validate';
    RETURN; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  st := public.supervisory_assessment_lifecycle_state((SELECT v FROM r_id WHERE k='legacy'));
  RESET ROLE;
  IF st->>'canonical_state' IS NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY-03: a legacy assessment has no lifecycle state'; END IF;
  IF st->>'canonical_state' NOT IN ('APPROVED','APPROVED_NOT_PUBLISHED','SUPERSEDED','CLOSED') THEN
    RAISE EXCEPTION 'FAIL LEGACY-03: a legacy approval was invalidated (%)', st->>'canonical_state'; END IF;
  RAISE NOTICE 'PASS LEGACY-03: a legacy approved assessment remains valid and readable (%)', st->>'canonical_state';
END $$;

-- =====================================================================
-- DOWNSTREAM-01 — supervisory read models consume the published record.
-- =====================================================================
DO $$
DECLARE panel jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  panel := public.aml_entity_panel((SELECT v FROM r_id WHERE k='entity'));
  RESET ROLE;
  IF panel IS NULL THEN RAISE EXCEPTION 'FAIL DOWNSTREAM-01: the entity AML panel is unavailable'; END IF;
  IF panel::text NOT LIKE '%MEDIUM_HIGH%' THEN
    RAISE EXCEPTION 'FAIL DOWNSTREAM-01: the entity panel does not reflect the published risk-of-record'; END IF;
  RAISE NOTICE 'PASS DOWNSTREAM-01: downstream entity and portfolio read models consume the published risk-of-record';
END $$;

-- =====================================================================
-- DOWNSTREAM-02 — an unpublished assessment does not move downstream risk.
-- =====================================================================
DO $$
DECLARE before_rating text; after_rating text;
BEGIN
  SELECT residual_rating INTO before_rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => (SELECT v FROM r_id WHERE k='assessment_b'),
    _dimension_code => 'AML07CERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 95,
    _rationale => 'AML07CERT draft work that must not move downstream risk',
    _methodology_dimension_id => (SELECT v FROM r_id WHERE k='dim_i'));
  RESET ROLE;
  SELECT residual_rating INTO after_rating FROM public.entity_risk_state
   WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT';
  IF after_rating IS DISTINCT FROM before_rating THEN
    RAISE EXCEPTION 'FAIL DOWNSTREAM-02: draft assessment work changed the published risk-of-record'; END IF;
  IF (SELECT driving_assessment_id FROM public.entity_risk_state
       WHERE entity_id=(SELECT v FROM r_id WHERE k='entity') AND domain_code='AML_CFT')
     = (SELECT v FROM r_id WHERE k='assessment_b') THEN
    RAISE EXCEPTION 'FAIL DOWNSTREAM-02: an unapproved assessment drives the risk-of-record'; END IF;
  RAISE NOTICE 'PASS DOWNSTREAM-02: draft, submitted or merely calculated work never alters downstream risk';
END $$;

-- =====================================================================
-- DOWNSTREAM-03 — monitoring and work-queue read models stay consistent.
-- =====================================================================
DO $$
DECLARE wq int; ov jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  SELECT count(*) INTO wq FROM public.aml_work_queue(25);
  ov := public.aml_overview_metrics();
  RESET ROLE;
  IF wq IS NULL OR ov IS NULL THEN
    RAISE EXCEPTION 'FAIL DOWNSTREAM-03: an AML work-queue or overview read model failed after publication'; END IF;
  RAISE NOTICE 'PASS DOWNSTREAM-03: work-queue and overview read models refresh from the published state';
END $$;

-- =====================================================================
-- SEC-01 — no AML-07 operation is callable without signing in.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('supervisory_assessment_lifecycle_state','supervisory_assessment_submit_for_review',
       'supervisory_assessment_review_assign','supervisory_assessment_challenge_raise',
       'supervisory_assessment_challenge_resolve','supervisory_assessment_review_return',
       'supervisory_assessment_review_reject','supervisory_assessment_approve',
       'supervisory_assessment_publish_risk_of_record','supervisory_assessment_review_register',
       'supervisory_assessment_risk_lineage','supervisory_entity_risk_history',
       'supervisory_assessment_review_blockers_internal','supervisory_assessment_review_config_internal',
       'supervisory_assessment_publish_internal')
     AND (has_function_privilege('anon', p.oid, 'execute') OR has_function_privilege('public', p.oid, 'execute'));
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-01: % AML-07 functions are executable without signing in', n; END IF;
  RAISE NOTICE 'PASS SEC-01: no AML-07 function is executable by anon or PUBLIC';
END $$;

-- =====================================================================
-- SEC-02 — internal helpers are not callable by signed-in users.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('supervisory_assessment_review_blockers_internal',
       'supervisory_assessment_review_config_internal','supervisory_assessment_publish_internal',
       'supervisory_review_writer_guard','supervisory_review_record_immutable')
     AND has_function_privilege('authenticated', p.oid, 'execute');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-02: % internal AML-07 helpers are callable by signed-in users', n; END IF;
  RAISE NOTICE 'PASS SEC-02: internal review, publication and guard helpers are not callable by signed-in users';
END $$;

-- =====================================================================
-- SEC-03 — every AML-07 SECURITY DEFINER function pins search_path.
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.prosecdef
     AND (p.proname LIKE 'supervisory_assessment_review%' OR p.proname LIKE 'supervisory_assessment_challenge%'
          OR p.proname IN ('supervisory_assessment_approve','supervisory_assessment_publish_internal',
             'supervisory_assessment_publish_risk_of_record','supervisory_assessment_lifecycle_state',
             'supervisory_assessment_submit_for_review','supervisory_assessment_risk_lineage',
             'supervisory_entity_risk_history','supervisory_review_writer_guard',
             'supervisory_review_record_immutable'))
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-03: functions without a pinned search_path: %', bad; END IF;
  RAISE NOTICE 'PASS SEC-03: every AML-07 SECURITY DEFINER function pins search_path';
END $$;

-- =====================================================================
-- SEC-04 — the audit actor cannot be spoofed.
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_assessment_event
   WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment')
     AND event_type IN ('SUBMISSION','RESUBMISSION','REVIEW_RETURN','APPROVAL','RISK_PUBLICATION')
     AND actor_id IS NOT NULL;
  IF n < 5 THEN RAISE EXCEPTION 'FAIL SEC-04: only % attributable lifecycle events were recorded', n; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_event
              WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment')
                AND event_type='APPROVAL' AND actor_id <> (SELECT v FROM r_id WHERE k='checker')) THEN
    RAISE EXCEPTION 'FAIL SEC-04: the approval event actor is not the approving persona'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_event
              WHERE assessment_id=(SELECT v FROM r_id WHERE k='assessment')
                AND event_type='SUBMISSION' AND actor_id <> (SELECT v FROM r_id WHERE k='officer')) THEN
    RAISE EXCEPTION 'FAIL SEC-04: the submission event actor is not the submitting persona'; END IF;
  RAISE NOTICE 'PASS SEC-04: every lifecycle event is attributed to the acting persona (% events)', n;
END $$;

-- =====================================================================
-- SEC-05 — cross-scope access is refused.
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_lifecycle_state((SELECT v FROM r_id WHERE k='assessment'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_review_register((SELECT v FROM r_id WHERE k='assessment'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_entity_risk_history((SELECT v FROM r_id WHERE k='entity'),'AML_CFT');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_publish_risk_of_record((SELECT v FROM r_id WHERE k='assessment'),
      'AML07CERT unauthorised publication attempt');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 4 THEN RAISE EXCEPTION 'FAIL SEC-05: only % of 4 unauthorised reads/writes were refused', refused; END IF;
  RAISE NOTICE 'PASS SEC-05: a persona outside the supervisory scope is refused review, lineage and publication (4/4)';
END $$;

-- =====================================================================
-- SEC-06 — the new tables are readable only under supervisory permission
--          and never writable through the Data API.
-- =====================================================================
DO $$
DECLARE n int; refused int := 0;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('supervisory_assessment_review_round','supervisory_assessment_review_challenge',
     'supervisory_assessment_approval_decision','supervisory_assessment_risk_publication')
     AND cmd = 'SELECT';
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL SEC-06: % of 4 read policies present', n; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename IN ('supervisory_assessment_review_round','supervisory_assessment_review_challenge',
                'supervisory_assessment_approval_decision','supervisory_assessment_risk_publication')
                AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'FAIL SEC-06: a write policy exists on an AML-07 record table'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.supervisory_assessment_approval_decision;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL SEC-06: an unauthorised reader saw % approval decisions', n; END IF;
  RAISE NOTICE 'PASS SEC-06: AML-07 records are read-only, permission-scoped and invisible without authority';
END $$;

-- =====================================================================
-- ROLLBACK — no AML07CERT record survives
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT (SELECT count(*) FROM public.supervisory_assessment WHERE reference LIKE 'AML07CERT%'
            OR summary LIKE 'AML07CERT%')
       + (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'AML07CERT%')
       + (SELECT count(*) FROM public.supervisory_finding WHERE reference LIKE 'AML07CERT%')
    INTO n;
  RAISE NOTICE 'PRE-ROLLBACK: % AML07CERT fixture records exist inside the transaction', n;
END $$;

ROLLBACK;

-- After ROLLBACK: prove nothing survived and the risk-of-record is unchanged.
DO $$
DECLARE n int;
BEGIN
  SELECT (SELECT count(*) FROM public.supervisory_assessment WHERE COALESCE(summary,'') LIKE 'AML07CERT%')
       + (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'AML07CERT%')
       + (SELECT count(*) FROM public.supervisory_finding WHERE reference LIKE 'AML07CERT%')
    INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML07CERT records survived', n; END IF;
  RAISE NOTICE 'PASS ROLLBACK: no AML07CERT fixture record survived';
END $$;

-- Genuine operational review, approval and publication records are preserved
-- exactly as they were before this certification ran.
SELECT
  (SELECT count(*) FROM public.supervisory_assessment_review_round)::text = :'pre_rounds'
    AS review_rounds_preserved,
  (SELECT count(*) FROM public.supervisory_assessment_approval_decision)::text = :'pre_decisions'
    AS approval_decisions_preserved,
  (SELECT count(*) FROM public.supervisory_assessment_risk_publication)::text = :'pre_publications'
    AS publications_preserved;


