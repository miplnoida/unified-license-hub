-- =====================================================================
-- PCOMP-R2E — INTEGRATED AML/CFT POLICY CHAIN : BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- One governed chain, proved end to end:
--   Policy Profile -> Assessment Policy Basis -> Evidence -> Readiness ->
--   Calculation -> Judgement/Override -> Rating Approval/Publication ->
--   Operative Risk -> Response -> AML-08 Consequence -> SLA deadline.
--
-- Conventions (identical to AML-01..AML-11, PCOMP-R1C and R2A..R2D):
--   * ONE transaction, ROLLBACK at the end. Every R2ECERT fixture is
--     discarded: no policy profile, policy component, methodology,
--     calculation policy, assessment, rating, publication, consequence or
--     deadline survives, and no regulator policy decision is fabricated;
--   * behavioural: the gates call the REAL governed operations under REAL
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims)
--     with row_security on — never service_role;
--   * every fixture identifier is prefixed R2ECERT;
--   * results are printed PASS/FAIL, then the transaction is rolled back
--     and the preservation gates are checked against the pre-census.
--
-- Personas (public.cert_certification_users):
--   maker    b8eaf680-fe66-4d49-b816-1c087f511235  supervisory officer
--   checker  0b522724-adcb-48bf-b21d-175339479616  head of AML/CFT
--   outsider 411dd06d-648b-4f32-82cc-897902c0c0b6  no AML authority
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2e-integrated-policy-chain.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;

SELECT (SELECT count(*)::text FROM public.supervisory_policy_profile)              AS pre_profiles,
       (SELECT count(*)::text FROM public.supervisory_policy_component)            AS pre_components,
       (SELECT count(*)::text FROM public.supervisory_assessment)                  AS pre_assessments,
       (SELECT count(*)::text FROM public.supervisory_assessment_policy_snapshot)  AS pre_snapshots,
       (SELECT count(*)::text FROM public.supervisory_assessment_calculation_run)  AS pre_runs,
       (SELECT count(*)::text FROM public.supervisory_assessment_calculation_override) AS pre_overrides,
       (SELECT count(*)::text FROM public.supervisory_assessment_risk_publication) AS pre_publications,
       (SELECT count(*)::text FROM public.supervisory_consequence_decision)        AS pre_consequences,
       (SELECT count(*)::text FROM public.supervisory_response_sla_obligation)     AS pre_obligations,
       (SELECT count(*)::text FROM public.entity_risk_state_movement)              AS pre_movements,
       (SELECT count(*)::text FROM public.sla_stage_instances)                     AS pre_stages,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-')||':'||
                                       COALESCE(r.inherent_rating,'-')||':'||COALESCE(r.control_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) AS pre_risk_digest
\gset

BEGIN;

CREATE TEMP TABLE e_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE e_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
CREATE TEMP TABLE r2e(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON e_id TO authenticated;
GRANT ALL ON e_t TO authenticated;
GRANT ALL ON r2e TO authenticated;

INSERT INTO e_id(k,v) VALUES
  ('regulator', '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('entity',    'aa220000-0000-4000-8000-000000000001'),
  ('maker',     'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',   '0b522724-adcb-48bf-b21d-175339479616'),
  ('outsider',  '411dd06d-648b-4f32-82cc-897902c0c0b6');

INSERT INTO e_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM e_id WHERE k='entity');

-- ------------------------------------------------------------- personas ----
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
SELECT rs.id, 'regulator', (SELECT v FROM e_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- --------------------------------------------------- methodology fixture ----
INSERT INTO public.supervisory_methodology(
  code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES ('R2ECERT-METH','AML_CFT','R2ECERT integrated chain fixture','1.0','ACTIVE',
  (SELECT v FROM e_id WHERE k='sector'), (SELECT v FROM e_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED','R2ECERT integrated chain fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO e_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='R2ECERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT v FROM e_id WHERE k='meth'),'R2ECERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT'),
  ((SELECT v FROM e_id WHERE k='meth'),'R2ECERT_DIM_C','CONTROL_EFFECTIVENESS','Control fixture',100,2,true,'CONTROL');
INSERT INTO e_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='R2ECERT_DIM_I';
INSERT INTO e_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='R2ECERT_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT v FROM e_id WHERE k='meth'),(SELECT v FROM e_id WHERE k='dim_i'),'R2ECERT_Q_I1','I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT v FROM e_id WHERE k='meth'),(SELECT v FROM e_id WHERE k='dim_c'),'R2ECERT_Q_C1','C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);
INSERT INTO e_id(k,v) SELECT 'q_i1', id FROM public.supervisory_methodology_question WHERE question_code='R2ECERT_Q_I1';
INSERT INTO e_id(k,v) SELECT 'q_c1', id FROM public.supervisory_methodology_question WHERE question_code='R2ECERT_Q_C1';

-- ----------------------------------------- assessment programme fixture ----
INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('R2ECERT-PROGRAMMES','1.0','R2ECERT programme fixture','AML_CFT',
  (SELECT v FROM e_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);
INSERT INTO e_id(k,v) SELECT 'prog_set', id FROM public.supervisory_assessment_programme_set
 WHERE code='R2ECERT-PROGRAMMES';
INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
VALUES ((SELECT v FROM e_id WHERE k='prog_set'),'R2ECERT_P','R2ECERT programme','PERIODIC',
  true,1,'TRAILING_DAYS',365,1,false,false,ARRAY['CORE'],'{}'::text[],'{}'::text[]);
INSERT INTO e_id(k,v) SELECT 'prog', id FROM public.supervisory_assessment_programme
 WHERE programme_code='R2ECERT_P';
INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
VALUES ((SELECT v FROM e_id WHERE k='prog'),'PERIODIC','Periodic cycle',true,true,1);

-- ------------------------------------------- calculation policy fixture ----
DO $$
DECLARE cfg uuid; vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'R2ECERT fixture rule, discarded on rollback');
  cfg := public.supervisory_calculation_config_upsert((SELECT v FROM e_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT','recommendation_policy','WEIGHTED_SCORE'));
  INSERT INTO e_id(k,v) VALUES ('calc', cfg);
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
    jsonb_build_object('question_code','R2ECERT_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','R2ECERT_Q_C1','participation','SCORED','weight',1)));
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, jsonb_build_array(
    jsonb_build_object('dimension_code','R2ECERT_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','R2ECERT_DIM_C','contributes_to','CONTROL','weight',1)));
  vres := public.supervisory_calculation_config_validate(cfg);
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FIXTURE: the R2ECERT calculation policy does not validate: %', vres->'problems'; END IF;
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'REVIEW','R2ECERT calculation policy submitted');
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'APPROVED','R2ECERT calculation policy approved independently');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg,'ACTIVE','R2ECERT calculation policy activated');
  RESET ROLE;
END $$;

-- =====================================================================
-- FIXTURE: the four runtime policy components and the governing profile
-- =====================================================================
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg     uuid := (SELECT v FROM e_id WHERE k='regulator');
  comp    uuid;
  crec    record;
  prof    uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  FOR crec IN SELECT * FROM (VALUES
    ('evidence','EVIDENCE_POLICY','R2ECERT-EVIDENCE',
      jsonb_build_object('rules', jsonb_build_array(
        jsonb_build_object('rule_code','R2ECERT-EV-ASSESSMENT','scope_type','ASSESSMENT',
          'evidence_requirement','REQUIRED','minimum_items',1,
          'permitted_source_kinds', jsonb_build_array('FINDING','ENTERPRISE_DOCUMENT'),
          'exception_allowed',false,
          'label','At least one qualifying evidence item supports the assessment'),
        jsonb_build_object('rule_code','R2ECERT-EV-QUESTION','scope_type','QUESTION',
          'scope_reference','R2ECERT_Q_C1','evidence_requirement','REQUIRED','minimum_items',1,
          'permitted_source_kinds', jsonb_build_array('PRIOR_EXAMINATION'),
          'exception_allowed',true,'exception_approval_required',true,
          'label','Control testing evidence, exception available')))),
    ('judgement','JUDGEMENT_POLICY','R2ECERT-JUDGEMENT',
      jsonb_build_object('rules', jsonb_build_array(
        jsonb_build_object('rule_code','R2ECERT-JU-1','direction','BOTH','max_band_steps',1,
          'rationale_min_length',40,'override_permitted',true,'rationale_required',true,
          'prohibited_target_ratings', jsonb_build_array('LOW'),
          'label','One band of supervisory judgement, never to Low')))),
    ('response','RESPONSE_POLICY','R2ECERT-RESPONSE',
      jsonb_build_object('responses', jsonb_build_array(
        jsonb_build_object('rule_code','R2ECERT-RE-REQ','risk_band','HIGH','action','SUPERVISORY_PLAN',
          'response_level','REQUIRED','rationale_required',true),
        jsonb_build_object('rule_code','R2ECERT-RE-REC','risk_band','HIGH','action','EXAMINATION',
          'response_level','RECOMMENDED'),
        jsonb_build_object('rule_code','R2ECERT-RE-PERM','risk_band','HIGH','action','MONITORING',
          'response_level','PERMITTED'),
        jsonb_build_object('rule_code','R2ECERT-RE-PROH','risk_band','HIGH','action','DEFERRAL',
          'response_level','PROHIBITED'),
        jsonb_build_object('rule_code','R2ECERT-RE-MH','risk_band','MEDIUM_HIGH','action','SUPERVISORY_PLAN',
          'response_level','REQUIRED')))),
    ('sla','SLA_POLICY','R2ECERT-SLA',
      jsonb_build_object('stages', jsonb_build_array(
        jsonb_build_object('rule_code','R2ECERT-SLA-PLAN','stage','Open supervisory plan',
          'applies_to_action','SUPERVISORY_PLAN','duration_days',10,'calendar_mode','CALENDAR_DAYS',
          'breach_severity','HIGH','pause_permitted',true,
          'pause_reasons', jsonb_build_array('AWAITING_ENTITY_INFORMATION'),
          'label','Supervisory plan opened within ten days'),
        jsonb_build_object('rule_code','R2ECERT-SLA-MON','stage','Record monitoring',
          'applies_to_action','MONITORING','duration_days',30,'calendar_mode','CALENDAR_DAYS',
          'breach_severity','LOW','pause_permitted',false,
          'label','Monitoring recorded within thirty days'))))
  ) AS t(key, ctype, code, content)
  LOOP
    comp := (public.supervisory_policy_component_create(jsonb_build_object(
      'component_type', crec.ctype,'domain_code','AML_CFT','regulator_id', reg,
      'code', crec.code,'component_version','1.0',
      'name','R2ECERT '||crec.ctype||' for the integrated chain certification',
      'content', crec.content)))->>'component_id';
    PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED',
      'R2ECERT submits the governed policy component for independent approval.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED',
      'R2ECERT independent approval of the governed policy component.');
    PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE',
      'R2ECERT activation of the governed policy component.');
    PERFORM set_config('request.jwt.claims', maker, true);
    INSERT INTO e_id(k,v) VALUES (crec.key, comp);
  END LOOP;

  -- the governing profile, version 1.0
  prof := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg,'code','R2ECERT-PROFILE',
    'profile_version','1.0','name','R2ECERT integrated chain profile',
    'origin','REGULATOR_AUTHORED','rationale','R2ECERT integrated chain certification profile'));
  INSERT INTO e_id(k,v) VALUES ('profile', prof);

  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM e_id WHERE k='meth'),
    'rationale','R2ECERT binds the fixture methodology'));
  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM e_id WHERE k='calc'),
    'rationale','R2ECERT binds the matching calculation policy'));
  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','ASSESSMENT_PROGRAMME','component_id',(SELECT v FROM e_id WHERE k='prog_set'),
    'rationale','R2ECERT binds the fixture assessment programme'));
  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','EVIDENCE_POLICY','component_id',(SELECT v FROM e_id WHERE k='evidence'),
    'rationale','R2ECERT binds the evidence policy'));
  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','JUDGEMENT_POLICY','component_id',(SELECT v FROM e_id WHERE k='judgement'),
    'rationale','R2ECERT binds the judgement policy'));
  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','RESPONSE_POLICY','component_id',(SELECT v FROM e_id WHERE k='response'),
    'rationale','R2ECERT binds the response policy'));
  PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
    'component_type','SLA_POLICY','component_id',(SELECT v FROM e_id WHERE k='sla'),
    'rationale','R2ECERT binds the SLA policy'));
  PERFORM public.supervisory_policy_profile_save(prof, jsonb_build_object(
    'effective_from', (current_date - 1)::text));
  PERFORM public.supervisory_policy_profile_lifecycle(prof,'REVIEW','R2ECERT submits the complete policy package.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(prof,'APPROVED','R2ECERT independent approval of the package.');
  PERFORM public.supervisory_policy_profile_lifecycle(prof,'ACTIVE','R2ECERT activation of the approved package.');
  RESET ROLE;
END $$;

-- =====================================================================
-- CHAIN — profile, basis and the four runtimes on ONE assessment
-- =====================================================================
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg     uuid := (SELECT v FROM e_id WHERE k='regulator');
  entity  uuid := (SELECT v FROM e_id WHERE k='entity');
  prof    uuid := (SELECT v FROM e_id WHERE k='profile');
  jv jsonb; jw jsonb; snap jsonb; a uuid; fid uuid; run uuid; n int; st text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- ------------------------------------------------------- PROFILE ------
  jv := public.supervisory_policy_profile_compatibility(prof);
  INSERT INTO r2e VALUES ('R2E-01-PACKAGE-COMPATIBLE', (jv->>'compatible')::boolean,
    format('errors=%s findings=%s', jv->>'error_count', jv->'findings'));

  jv := public.supervisory_policy_profile_effective('AML_CFT', reg, NULL, entity, current_date);
  INSERT INTO r2e VALUES ('R2E-02-PROFILE-RESOLVES',
    (jv->>'status')='RESOLVED' AND ((jv->'profile')->>'policy_profile_id')::uuid = prof,
    format('%s %s %s', jv->>'status', (jv->'profile')->>'code', (jv->'profile')->>'profile_version'));

  -- ------------------------------------------------- ASSESSMENT BASIS ---
  jv := public.supervisory_assessment_create_programmed(
    entity,'AML_CFT',(SELECT v FROM e_id WHERE k='prog'),'PERIODIC',NULL,NULL,
    'R2ECERT integrated chain certification assessment');
  a := (jv->>'id')::uuid;
  INSERT INTO e_id(k,v) VALUES ('assessment', a);
  snap := public.supervisory_assessment_policy_basis(a);

  INSERT INTO r2e VALUES ('R2E-03-BASIS-STAMPED',
    (snap->>'status')='SNAPSHOTTED' AND (snap->>'policy_profile_id')::uuid = prof
      AND (snap->>'policy_profile_version')='1.0',
    format('%s %s %s', snap->>'status', snap->>'policy_profile_code', snap->>'policy_profile_version'));

  INSERT INTO r2e VALUES ('R2E-04-BASIS-CARRIES-FOUR-RUNTIMES',
    (SELECT count(*) FROM jsonb_array_elements(snap->'components') c
      WHERE c->>'component_type' IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY')) = 4
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snap->'components') c WHERE c->>'content_hash' IS NULL),
    format('%s bound component(s), all fingerprinted', jsonb_array_length(snap->'components')));

  -- ------------------------------------------------------- EVIDENCE -----
  jv := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2e VALUES ('R2E-05-EVIDENCE-GOVERNED',
    ((jv->'evaluation')->>'status')='EVALUATED'
      AND ((jv->'evaluation')->>'policy_component_version') IS NOT NULL,
    format('%s, pinned version %s, %s blocking',
      (jv->'evaluation')->>'status', (jv->'evaluation')->>'policy_component_version',
      (jv->'evaluation')->>'blocking_count'));

  INSERT INTO r2e VALUES ('R2E-06-EVIDENCE-DEFICIENCY-SEEN',
    ((jv->'evaluation')->>'blocking_count')::int >= 1
      AND EXISTS (SELECT 1 FROM jsonb_array_elements((jv->'evaluation')->'decisions') d
                   WHERE d->>'decision' IN ('UNSATISFIED','EXCEPTION_REQUIRED')),
    format('%s outstanding evidence requirement(s)', (jv->'evaluation')->>'blocking_count'));

  jv := public.supervisory_assessment_readiness(a);
  INSERT INTO r2e VALUES ('R2E-07-READINESS-CONSUMES-EVIDENCE',
    NOT (jv->>'can_submit')::boolean,
    format('can_submit=%s, %s blocking check(s)', jv->>'can_submit', jv->>'blocking_check_count'));

  -- answer the governed question plan
  PERFORM public.supervisory_assessment_question_upsert(a,(SELECT v FROM e_id WHERE k='q_i1'),'NO',
    'R2ECERT inherent observation for the integrated chain certification.');
  PERFORM public.supervisory_assessment_question_upsert(a,(SELECT v FROM e_id WHERE k='q_c1'),'YES',
    'R2ECERT control observation for the integrated chain certification.');

  -- a canonical finding, then a governed evidence link that satisfies the
  -- assessment-level evidence rule
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', entity,'domain_code','AML_CFT','assessment_id', a,
    'severity','HIGH','title','R2ECERT customer due diligence weakness',
    'observation','R2ECERT fixture observation for the integrated chain certification.',
    'required_action','R2ECERT fixture required action.'));
  INSERT INTO e_id(k,v) VALUES ('finding', fid);
  PERFORM public.supervisory_assessment_evidence_link(a, jsonb_build_object(
    'evidence_type','FINDING','source_object_id', fid,
    'methodology_question_id',(SELECT v FROM e_id WHERE k='q_i1'),
    'relevance_note','R2ECERT evidence supporting the assessment-level requirement'));

  jv := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2e VALUES ('R2E-08-EVIDENCE-SATISFIED-BY-FACT',
    EXISTS (SELECT 1 FROM jsonb_array_elements((jv->'evaluation')->'decisions') d
             WHERE d->>'rule_code'='R2ECERT-EV-ASSESSMENT' AND d->>'decision'='SATISFIED'),
    format('assessment-level rule now %s',
      (SELECT d->>'decision' FROM jsonb_array_elements((jv->'evaluation')->'decisions') d
        WHERE d->>'rule_code'='R2ECERT-EV-ASSESSMENT')));

  -- the question-level requirement remains outstanding and offers an exception
  INSERT INTO r2e VALUES ('R2E-09-EXCEPTION-OFFERED-BY-POLICY',
    EXISTS (SELECT 1 FROM jsonb_array_elements((jv->'evaluation')->'decisions') d
             WHERE d->>'rule_code'='R2ECERT-EV-QUESTION'
               AND (d->>'exception_allowed')::boolean
               AND d->>'decision' IN ('UNSATISFIED','EXCEPTION_REQUIRED')),
    'the question-level rule is outstanding and an exception is available');

  jv := public.supervisory_assessment_evidence_exception_request(jsonb_build_object(
    'assessment_id', a,'rule_code','R2ECERT-EV-QUESTION','scope_type','QUESTION',
    'question_id',(SELECT v FROM e_id WHERE k='q_c1'),
    'dimension_id',(SELECT v FROM e_id WHERE k='dim_c'),
    'rationale','R2ECERT: the control testing evidence is held by the prior examination file and cannot be relinked.'));
  INSERT INTO e_id(k,v) VALUES ('exception', (jv->>'exception_id')::uuid);
  INSERT INTO r2e VALUES ('R2E-10-EXCEPTION-REQUESTED', (jv->>'status')='REQUESTED',
    format('exception %s', jv->>'status'));

  BEGIN
    PERFORM public.supervisory_assessment_evidence_exception_decide(
      (SELECT v FROM e_id WHERE k='exception'),'APPROVED','R2ECERT self-approval attempt.');
    INSERT INTO r2e VALUES ('R2E-11-EXCEPTION-INDEPENDENT', false, 'the requester approved their own exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-11-EXCEPTION-INDEPENDENT', true, left(SQLERRM,120));
  END;

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_assessment_evidence_exception_decide(
    (SELECT v FROM e_id WHERE k='exception'),'APPROVED',
    'R2ECERT: the deficiency is accepted on the recorded supervisory rationale.');
  PERFORM set_config('request.jwt.claims', maker, true);

  jv := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2e VALUES ('R2E-12-EXCEPTION-CLEARS-BLOCK',
    ((jv->'evaluation')->>'blocking_count')::int = 0
      AND EXISTS (SELECT 1 FROM jsonb_array_elements((jv->'evaluation')->'decisions') d
                   WHERE d->>'rule_code'='R2ECERT-EV-QUESTION' AND d->>'decision'='EXCEPTION_APPROVED'),
    format('%s blocking after the approved exception', (jv->'evaluation')->>'blocking_count'));

  -- ---------------------------------------------------- CALCULATION -----
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => a, _dimension_code => 'R2ECERT_DIM_I', _dimension_group => 'INHERENT_RISK',
    _residual_rating => 'HIGH', _score => 100,
    _rationale => 'R2ECERT inherent dimension rationale for the integrated fixture',
    _methodology_dimension_id => (SELECT v FROM e_id WHERE k='dim_i'));
  PERFORM public.supervisory_assessment_dimension_upsert(
    _assessment_id => a, _dimension_code => 'R2ECERT_DIM_C', _dimension_group => 'CONTROL_EFFECTIVENESS',
    _residual_rating => 'LOW', _score => 0,
    _rationale => 'R2ECERT control dimension rationale for the integrated fixture',
    _override_reason => 'R2ECERT fixture: control dimension recorded as assessed by the reviewing officer',
    _methodology_dimension_id => (SELECT v FROM e_id WHERE k='dim_c'));

  jv := public.supervisory_assessment_calculation_run_record(a,'R2ECERT_RUN');
  run := (jv->>'run_id')::uuid;
  INSERT INTO e_id(k,v) VALUES ('run', run);
  SELECT status INTO st FROM public.supervisory_assessment_calculation_run WHERE id = run;
  INSERT INTO e_t(k,t) SELECT 'calculated_rating', residual_rating
    FROM public.supervisory_assessment_calculation_run WHERE id = run;
  INSERT INTO r2e VALUES ('R2E-13-CALCULATED-FROM-PINNED-POLICY',
    st = 'CALCULATED' AND (SELECT t FROM e_t WHERE k='calculated_rating') IS NOT NULL,
    format('run %s, residual %s', st, (SELECT t FROM e_t WHERE k='calculated_rating')));

  BEGIN
    UPDATE public.supervisory_assessment_calculation_run SET residual_rating='LOW' WHERE id = run;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r2e VALUES ('R2E-14-RUN-IMMUTABLE', n = 0, format('%s row(s) changed (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-14-RUN-IMMUTABLE', true, left(SQLERRM,120));
  END;

  -- ----------------------------------------------------- JUDGEMENT ------
  jv := public.supervisory_assessment_judgement_policy_view(a);
  INSERT INTO r2e VALUES ('R2E-15-JUDGEMENT-GOVERNED',
    ((jv->'evaluation')->>'status')='EVALUATED'
      AND (((jv->'evaluation')->'policy')->>'component_version') IS NOT NULL,
    format('%s, pinned version %s', (jv->'evaluation')->>'status',
      ((jv->'evaluation')->'policy')->>'component_version'));

  INSERT INTO r2e VALUES ('R2E-16-JUDGEMENT-TARGETS-SERVER-DECIDED',
    EXISTS (SELECT 1 FROM jsonb_array_elements((jv->'evaluation')->'target_ratings') c
             WHERE c->>'rating'='LOW' AND NOT (c->>'permitted')::boolean),
    format('targets=%s', (SELECT string_agg(c->>'rating'||'='||(c->>'permitted'),',')
      FROM jsonb_array_elements((jv->'evaluation')->'target_ratings') c)));

  BEGIN
    PERFORM public.supervisory_calculation_override_propose(a,'LOW',
      'R2ECERT attempts a departure to a rating the governing policy prohibits, with a full rationale.');
    INSERT INTO r2e VALUES ('R2E-17-PROHIBITED-OVERRIDE-REFUSED', false, 'the prohibited departure was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-17-PROHIBITED-OVERRIDE-REFUSED', true, left(SQLERRM,140));
  END;

  BEGIN
    PERFORM public.supervisory_calculation_override_propose(a,'MEDIUM_HIGH','too short');
    INSERT INTO r2e VALUES ('R2E-18-RATIONALE-MINIMUM-ENFORCED', false, 'a short rationale was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-18-RATIONALE-MINIMUM-ENFORCED', true, left(SQLERRM,140));
  END;

  jv := public.supervisory_calculation_override_propose(a,'MEDIUM_HIGH',
    'R2ECERT: one band of supervisory judgement is applied because the control testing evidence is accepted under an approved exception.');
  INSERT INTO e_id(k,v) VALUES ('override', (jv->>'override_id')::uuid);
  INSERT INTO r2e VALUES ('R2E-19-PERMITTED-OVERRIDE-PROPOSED',
    (jv->>'override_id') IS NOT NULL,
    format('override proposed: %s', jv->>'status'));

  INSERT INTO r2e VALUES ('R2E-20-OVERRIDE-CARRIES-POLICY-PROVENANCE',
    EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_override o
             WHERE o.id=(SELECT v FROM e_id WHERE k='override')
               AND o.judgement_policy_version IS NOT NULL
               AND o.judgement_rule_code IS NOT NULL),
    (SELECT format('rule %s, policy version %s', o.judgement_rule_code,
                   o.judgement_policy_version)
       FROM public.supervisory_assessment_calculation_override o
      WHERE o.id=(SELECT v FROM e_id WHERE k='override')));

  BEGIN
    PERFORM public.supervisory_calculation_override_decide(
      (SELECT v FROM e_id WHERE k='override'),'APPROVED','R2ECERT self-approval attempt.');
    INSERT INTO r2e VALUES ('R2E-21-OVERRIDE-INDEPENDENT', false, 'the proposer approved their own departure');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-21-OVERRIDE-INDEPENDENT', true, left(SQLERRM,120));
  END;

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_calculation_override_decide(
    (SELECT v FROM e_id WHERE k='override'),'APPROVED',
    'R2ECERT: the departure is approved independently on the recorded rationale.');
  PERFORM set_config('request.jwt.claims', maker, true);
  INSERT INTO r2e VALUES ('R2E-22-OVERRIDE-APPROVED',
    (SELECT status FROM public.supervisory_assessment_calculation_override
      WHERE id=(SELECT v FROM e_id WHERE k='override')) = 'APPROVED',
    (SELECT format('override %s', status) FROM public.supervisory_assessment_calculation_override
      WHERE id=(SELECT v FROM e_id WHERE k='override')));

  -- --------------------------------------- SUBMISSION AND PUBLICATION --
  jv := public.supervisory_assessment_readiness(a);
  INSERT INTO r2e VALUES ('R2E-23-READY-ONLY-WHEN-POLICY-SATISFIED',
    (jv->>'can_submit')::boolean,
    format('can_submit=%s after evidence, calculation and judgement are settled', jv->>'can_submit'));

  jv := public.supervisory_assessment_submit_for_review(a,
    'R2ECERT submits the integrated chain assessment for independent review.', run, NULL, NULL);
  INSERT INTO r2e VALUES ('R2E-24-SUBMITTED-ON-THE-RUN', (jv->>'round_id') IS NOT NULL,
    format('review round opened on calculation run %s', run));

  PERFORM set_config('request.jwt.claims', checker, true);
  jv := public.supervisory_assessment_approve(a,
    'R2ECERT: the independent supervisor approves the submitted rating on the governed calculation run.');
  INSERT INTO e_id(k,v) VALUES ('decision', (jv->>'decision_id')::uuid);
  jv := public.supervisory_assessment_publish_risk_of_record(a,
    'R2ECERT publication of the certification risk-of-record');
  INSERT INTO e_id(k,v) VALUES ('publication', (jv->>'publication_id')::uuid);
  INSERT INTO e_t(k,t) SELECT 'operative_rating', residual_rating FROM public.entity_risk_state
   WHERE entity_id = entity AND domain_code='AML_CFT';
  INSERT INTO r2e VALUES ('R2E-25-PUBLISHED-RISK-OF-RECORD',
    (SELECT v FROM e_id WHERE k='publication') IS NOT NULL
      AND (SELECT t FROM e_t WHERE k='operative_rating') IS NOT NULL,
    format('operative AML/CFT rating %s', (SELECT t FROM e_t WHERE k='operative_rating')));

  INSERT INTO r2e VALUES ('R2E-26-OPERATIVE-RATING-IS-THE-APPROVED-JUDGEMENT',
    (SELECT t FROM e_t WHERE k='operative_rating') = 'MEDIUM_HIGH',
    format('calculated %s, approved judgement MEDIUM_HIGH, operative %s',
      (SELECT t FROM e_t WHERE k='calculated_rating'), (SELECT t FROM e_t WHERE k='operative_rating')));

  RESET ROLE;
END $$;

-- =====================================================================
-- RESPONSE, CONSEQUENCE AND SLA on the published risk-of-record
-- =====================================================================
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  entity  uuid := (SELECT v FROM e_id WHERE k='entity');
  a       uuid := (SELECT v FROM e_id WHERE k='assessment');
  jv jsonb; jw jsonb; dec uuid; ob record; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  jv := public.supervisory_consequence_response_policy_view(entity,'AML_CFT', a);
  INSERT INTO r2e VALUES ('R2E-27-RESPONSE-GOVERNED',
    ((jv->'evaluation')->>'status')='EVALUATED'
      AND (((jv->'evaluation')->'policy')->>'component_version') IS NOT NULL,
    format('%s on the operative rating %s', (jv->'evaluation')->>'status',
      (jv->'evaluation')->>'source_rating'));

  INSERT INTO r2e VALUES ('R2E-28-RESPONSE-LEVELS-SERVER-DECIDED',
    (SELECT count(DISTINCT r->>'response_level') FROM jsonb_array_elements((jv->'evaluation')->'expectations') r
      WHERE r->>'response_level' IN ('REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED')) >= 2,
    (SELECT string_agg(DISTINCT (r->>'action')||'='||(r->>'response_level'), ', ')
       FROM jsonb_array_elements((jv->'evaluation')->'expectations') r));

  BEGIN
    PERFORM public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', entity,'domain_code','AML_CFT','assessment_id', a,
      'action_type','RECORD_DEFERRED','linkage_mode','RECORD',
      'rationale','R2ECERT attempts a deferral the governing response policy prohibits at this rating.'));
    INSERT INTO r2e VALUES ('R2E-29-PROHIBITED-RESPONSE-REFUSED', false, 'the prohibited response was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-29-PROHIBITED-RESPONSE-REFUSED', true, left(SQLERRM,140));
  END;

  jv := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id', entity,'domain_code','AML_CFT','assessment_id', a,
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','R2ECERT supervisory plan',
    'rationale','R2ECERT: the published AML/CFT risk-of-record requires a governed supervisory plan.'));
  dec := (jv->>'decision_id')::uuid;
  INSERT INTO e_id(k,v) VALUES ('dec_plan', dec), ('plan', (jv->>'target_id')::uuid);
  INSERT INTO r2e VALUES ('R2E-30-REQUIRED-RESPONSE-RECORDED', dec IS NOT NULL,
    format('supervisory plan recorded under decision %s', dec));

  INSERT INTO r2e VALUES ('R2E-31-CONSEQUENCE-CARRIES-RESPONSE-PROVENANCE',
    EXISTS (SELECT 1 FROM public.supervisory_consequence_decision d
             WHERE d.id = dec AND d.response_policy_version IS NOT NULL
               AND d.response_policy_rule_code IS NOT NULL
               AND d.response_policy_level IS NOT NULL),
    (SELECT format('rule %s, level %s, policy version %s', d.response_policy_rule_code,
                   d.response_policy_level, d.response_policy_version)
       FROM public.supervisory_consequence_decision d WHERE d.id = dec));

  -- ------------------------------------------------------------- SLA ---
  SELECT * INTO ob FROM public.supervisory_response_sla_obligation WHERE decision_id = dec;
  INSERT INTO r2e VALUES ('R2E-32-SLA-OPENED-ON-THE-CONSEQUENCE', ob.id IS NOT NULL,
    format('deadline %s, stage instance %s', ob.due_at, ob.stage_instance_id));

  INSERT INTO r2e VALUES ('R2E-33-SLA-CARRIES-POLICY-PROVENANCE',
    ob.sla_policy_version IS NOT NULL AND ob.sla_policy_rule_code IS NOT NULL
      AND ob.sla_duration_days IS NOT NULL,
    format('rule %s, %s day(s), policy version %s', ob.sla_policy_rule_code,
      ob.sla_duration_days, ob.sla_policy_version));

  INSERT INTO r2e VALUES ('R2E-34-SLA-USES-CANONICAL-STAGE-ENGINE',
    EXISTS (SELECT 1 FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id),
    'the deadline is held by the platform SLA stage engine');

  jv := public.supervisory_response_sla_view(entity,'AML_CFT', a);
  INSERT INTO r2e VALUES ('R2E-35-SLA-READ-MODEL',
    jsonb_array_length(COALESCE(jv->'obligations','[]'::jsonb)) >= 1,
    format('%s governed deadline(s) reported', jsonb_array_length(COALESCE(jv->'obligations','[]'::jsonb))));

  PERFORM public.supervisory_response_sla_pause(ob.id,'AWAITING_ENTITY_INFORMATION', false);
  INSERT INTO r2e VALUES ('R2E-36-SLA-HOLD-WHERE-POLICY-PERMITS',
    (SELECT s.state FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id) = 'paused',
    (SELECT format('deadline state %s', s.state) FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id));

  BEGIN
    PERFORM public.supervisory_response_sla_pause(ob.id,'BECAUSE_WE_FEEL_LIKE_IT', false);
    INSERT INTO r2e VALUES ('R2E-37-SLA-HOLD-REASON-CONTROLLED', false, 'an uncontrolled hold reason was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-37-SLA-HOLD-REASON-CONTROLLED', true, left(SQLERRM,140));
  END;

  PERFORM public.supervisory_response_sla_pause(ob.id,'AWAITING_ENTITY_INFORMATION', true);
  PERFORM public.supervisory_response_sla_complete(ob.id,
    'R2ECERT: the supervisory plan was opened within the governed timeframe.');
  INSERT INTO r2e VALUES ('R2E-38-SLA-OUTCOME-SERVER-OWNED',
    (SELECT outcome FROM public.supervisory_response_sla_obligation WHERE id = ob.id) IN ('ON_TIME','LATE')
      AND (SELECT s.state FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id) = 'completed',
    (SELECT format('stage %s, outcome %s',
       (SELECT s.state FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id), o.outcome)
       FROM public.supervisory_response_sla_obligation o WHERE o.id = ob.id));

  BEGIN
    UPDATE public.supervisory_response_sla_obligation SET sla_policy_rule_code='R2ECERT-TAMPER' WHERE id = ob.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r2e VALUES ('R2E-39-SLA-PROVENANCE-IMMUTABLE', n = 0, format('%s row(s) changed (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-39-SLA-PROVENANCE-IMMUTABLE', true, left(SQLERRM,120));
  END;

  RESET ROLE;
END $$;

-- =====================================================================
-- ROLLOVER, INCOMPATIBILITY AND TRACE
-- =====================================================================
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg     uuid := (SELECT v FROM e_id WHERE k='regulator');
  entity  uuid := (SELECT v FROM e_id WHERE k='entity');
  a       uuid := (SELECT v FROM e_id WHERE k='assessment');
  prof    uuid := (SELECT v FROM e_id WHERE k='profile');
  v2 uuid; comp uuid; jv jsonb; snap jsonb; a2 uuid; bad uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- a successor evidence policy version and a successor profile version
  comp := public.supervisory_policy_component_new_version((SELECT v FROM e_id WHERE k='evidence'),'1.1',
    'R2ECERT successor evidence policy version.');
  PERFORM public.supervisory_policy_component_save(comp, jsonb_build_object(
    'content', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'rule_code','R2ECERT-EV-ASSESSMENT','scope_type','ASSESSMENT','evidence_requirement','REQUIRED',
      'minimum_items',2,'permitted_source_kinds', jsonb_build_array('FINDING','ENTERPRISE_DOCUMENT'),
      'label','Two qualifying evidence items from version 1.1')))));
  PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED','R2ECERT submits the successor evidence policy.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED','R2ECERT approves the successor evidence policy.');
  PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE','R2ECERT activates the successor evidence policy.');
  PERFORM set_config('request.jwt.claims', maker, true);

  v2 := public.supervisory_policy_profile_new_version(prof,'2.0','R2ECERT successor policy profile version.');
  PERFORM public.supervisory_policy_profile_binding_set(v2, jsonb_build_object(
    'component_type','EVIDENCE_POLICY','component_id', comp,
    'rationale','R2ECERT binds the successor evidence policy into version 2.0'));
  PERFORM public.supervisory_policy_profile_save(v2, jsonb_build_object('effective_from', current_date::text));
  PERFORM public.supervisory_policy_profile_lifecycle(v2,'REVIEW','R2ECERT submits version 2.0.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(v2,'APPROVED','R2ECERT independent approval of version 2.0.');
  PERFORM public.supervisory_policy_profile_lifecycle(v2,'ACTIVE','R2ECERT activation of version 2.0.');
  PERFORM set_config('request.jwt.claims', maker, true);

  snap := public.supervisory_assessment_policy_basis(a);
  INSERT INTO r2e VALUES ('R2E-40-ROLLOVER-DOES-NOT-REWRITE-HISTORY',
    (snap->>'policy_profile_version') = '1.0',
    format('the certified assessment remains governed by version %s', snap->>'policy_profile_version'));

  jv := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2e VALUES ('R2E-41-EVALUATION-STAYS-ON-PINNED-VERSION',
    ((jv->'evaluation')->>'policy_component_version') = '1.0',
    format('evidence still evaluated against version %s', (jv->'evaluation')->>'policy_component_version'));

  jv := public.supervisory_assessment_create_programmed(
    entity,'AML_CFT',(SELECT v FROM e_id WHERE k='prog'),'PERIODIC',
    (current_date - 30)::date,(current_date - 1)::date,'R2ECERT successor-version assessment');
  a2 := (jv->>'id')::uuid;
  INSERT INTO e_id(k,v) VALUES ('assessment_v2', a2);
  snap := public.supervisory_assessment_policy_basis(a2);
  INSERT INTO r2e VALUES ('R2E-42-NEW-WORK-TAKES-NEW-VERSION',
    (snap->>'policy_profile_version') = '2.0',
    format('the new assessment is governed by version %s', snap->>'policy_profile_version'));

  jv := public.supervisory_assessment_evidence_policy_view(a2);
  INSERT INTO r2e VALUES ('R2E-43-NEW-VERSION-CHANGES-REQUIREMENTS',
    ((jv->'evaluation')->>'policy_component_version') = '1.1',
    format('the new assessment is judged against evidence policy version %s',
      (jv->'evaluation')->>'policy_component_version'));

  -- an incompatible package can never become operative policy
  bad := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg,'code','R2ECERT-INCOMPATIBLE',
    'profile_version','1.0','name','R2ECERT deliberately incompatible package',
    'origin','REGULATOR_AUTHORED'));
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM e_id WHERE k='meth'),'rationale','R2ECERT fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM e_id WHERE k='calc'),'rationale','R2ECERT fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','ASSESSMENT_PROGRAMME','component_id',(SELECT v FROM e_id WHERE k='prog_set'),'rationale','R2ECERT fixture'));
  comp := (public.supervisory_policy_component_create(jsonb_build_object(
    'component_type','EVIDENCE_POLICY','domain_code','AML_CFT','regulator_id', reg,
    'code','R2ECERT-EVIDENCE-BAD','component_version','1.0',
    'name','R2ECERT evidence policy naming a question the methodology does not own',
    'content', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'rule_code','R2ECERT-EV-BAD','scope_type','QUESTION','scope_reference','R2ECERT_NOT_A_QUESTION',
      'evidence_requirement','REQUIRED','minimum_items',1,
      'permitted_source_kinds', jsonb_build_array('FINDING')))))))->>'component_id';
  PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED','R2ECERT submits the incompatible fixture.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED','R2ECERT approves the incompatible fixture.');
  PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE','R2ECERT activates the incompatible fixture.');
  PERFORM set_config('request.jwt.claims', maker, true);
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','EVIDENCE_POLICY','component_id', comp,
    'rationale','R2ECERT binds evidence content the bound methodology cannot satisfy'));
  jv := public.supervisory_policy_profile_compatibility(bad);
  INSERT INTO r2e VALUES ('R2E-44-INCOMPATIBLE-PACKAGE-REPORTED',
    NOT (jv->>'compatible')::boolean AND jsonb_array_length(jv->'findings') >= 1,
    format('%s error(s): %s', jv->>'error_count',
      (SELECT string_agg(f->>'code',',') FROM jsonb_array_elements(jv->'findings') f)));

  PERFORM public.supervisory_policy_profile_lifecycle(bad,'REVIEW','R2ECERT submits the incompatible package.');
  PERFORM set_config('request.jwt.claims', checker, true);
  BEGIN
    PERFORM public.supervisory_policy_profile_lifecycle(bad,'APPROVED','R2ECERT approval attempt on an incompatible package.');
    INSERT INTO r2e VALUES ('R2E-45-INCOMPATIBLE-PACKAGE-REFUSED', false, 'the incompatible package was APPROVED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-45-INCOMPATIBLE-PACKAGE-REFUSED', true, left(SQLERRM,140));
  END;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- ------------------------------------------------------ POLICY TRACE --
  jv := public.supervisory_assessment_policy_trace(a);
  INSERT INTO r2e VALUES ('R2E-46-TRACE-PROFILE-AND-BASIS',
    ((jv->'policy_basis')->>'policy_profile_version') = '1.0'
      AND (jv->>'assessment_id')::uuid = a,
    format('trace pinned to profile %s %s', (jv->'policy_basis')->>'policy_profile_code',
      (jv->'policy_basis')->>'policy_profile_version'));

  INSERT INTO r2e VALUES ('R2E-47-TRACE-LINKS-FOUR-RUNTIMES',
    (SELECT count(*) FROM jsonb_array_elements(jv->'links') l
      WHERE l->>'stage' IN ('EVIDENCE','JUDGEMENT','RESPONSE','SLA')) = 4,
    (SELECT string_agg(l->>'stage'||'='||COALESCE(l->>'status','-'), ', ')
       FROM jsonb_array_elements(jv->'links') l));

  INSERT INTO r2e VALUES ('R2E-48-TRACE-CARRIES-VERSIONS',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(jv->'links') l
                 WHERE l->>'status' = 'EVALUATED' AND l->>'policy_component_version' IS NULL),
    'every evaluated stage in the trace names the exact policy version it used');

  INSERT INTO r2e VALUES ('R2E-49-TRACE-SHOWS-THE-RATING-CHAIN',
    (jv->'rating')->>'calculated_rating' IS NOT NULL
      AND (jv->'rating')->>'operative_rating' = 'MEDIUM_HIGH'
      AND (jv->'rating')->>'published_at' IS NOT NULL,
    format('calculated %s, approved judgement %s, operative %s',
      (jv->'rating')->>'calculated_rating', (jv->'rating')->>'approved_rating',
      (jv->'rating')->>'operative_rating'));

  INSERT INTO r2e VALUES ('R2E-50-TRACE-IS-READ-ONLY',
    (SELECT NOT p.prosecdef OR p.provolatile IN ('s','i')
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='supervisory_assessment_policy_trace'),
    'the trace read model cannot write');

  RESET ROLE;
END $$;

-- =====================================================================
-- SECURITY — the trace and the chain are for authorised supervisors only
-- =====================================================================
DO $$
DECLARE a uuid := (SELECT v FROM e_id WHERE k='assessment'); ok boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_policy_trace(a);
    INSERT INTO r2e VALUES ('R2E-51-TRACE-SCOPE-CHECKED', false, 'an officer without AML authority read the trace');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-51-TRACE-SCOPE-CHECKED', true, left(SQLERRM,120));
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims','',true);
  BEGIN
    PERFORM public.supervisory_assessment_policy_trace(a);
    INSERT INTO r2e VALUES ('R2E-52-TRACE-NOT-ANON', false, 'a signed-out caller read the trace');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2e VALUES ('R2E-52-TRACE-NOT-ANON', true, left(SQLERRM,120));
  END;
  RESET ROLE;
END $$;

-- =====================================================================
-- CAPABILITY — the four runtimes are reported as consumed and certified
-- =====================================================================
INSERT INTO r2e
SELECT 'R2E-53-CAPABILITY-FOUR-RUNTIMES',
  count(*) FILTER (WHERE is_runtime_consumed) = 4,
  string_agg(component_type||'='||is_runtime_consumed::text, ', ' ORDER BY component_type)
  FROM public.supervisory_policy_component_type
 WHERE component_type IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY');

INSERT INTO r2e
SELECT 'R2E-54-CAPABILITY-REMAINDER-CONFIG-ONLY',
  count(*) FILTER (WHERE NOT is_runtime_consumed) = 6,
  string_agg(component_type||'='||is_runtime_consumed::text, ', ' ORDER BY component_type)
  FROM public.supervisory_policy_component_type
 WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING',
                          'MATERIALITY_POLICY','DASHBOARD_POLICY','NOTIFICATION_POLICY');

-- =====================================================================
-- RESULTS
-- =====================================================================
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r2e ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total FROM r2e;

DO $$
DECLARE f int;
BEGIN
  SELECT count(*) INTO f FROM r2e WHERE NOT ok;
  IF f > 0 THEN RAISE WARNING 'PCOMP-R2E: % gate(s) FAILED', f;
  ELSE RAISE NOTICE 'PCOMP-R2E: every gate passed'; END IF;
END $$;

ROLLBACK;

-- =====================================================================
-- PRESERVATION — nothing this certification did survives
-- =====================================================================
SELECT (SELECT count(*) FROM public.supervisory_policy_profile)::text = :'pre_profiles' AS profiles_preserved,
       (SELECT count(*) FROM public.supervisory_policy_component)::text = :'pre_components' AS components_preserved,
       (SELECT count(*) FROM public.supervisory_assessment)::text = :'pre_assessments' AS assessments_preserved,
       (SELECT count(*) FROM public.supervisory_assessment_policy_snapshot)::text = :'pre_snapshots' AS snapshots_preserved,
       (SELECT count(*) FROM public.supervisory_assessment_calculation_run)::text = :'pre_runs' AS runs_preserved,
       (SELECT count(*) FROM public.supervisory_assessment_calculation_override)::text = :'pre_overrides' AS overrides_preserved,
       (SELECT count(*) FROM public.supervisory_assessment_risk_publication)::text = :'pre_publications' AS publications_preserved,
       (SELECT count(*) FROM public.supervisory_consequence_decision)::text = :'pre_consequences' AS consequences_preserved,
       (SELECT count(*) FROM public.supervisory_response_sla_obligation)::text = :'pre_obligations' AS obligations_preserved,
       (SELECT count(*) FROM public.entity_risk_state_movement)::text = :'pre_movements' AS movements_preserved,
       (SELECT count(*) FROM public.sla_stage_instances)::text = :'pre_stages' AS sla_stages_preserved,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-')||':'||
                                       COALESCE(r.inherent_rating,'-')||':'||COALESCE(r.control_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) = :'pre_risk_digest'
         AS risk_of_record_unchanged,
       (SELECT count(*) FROM public.supervisory_policy_component WHERE code LIKE 'R2ECERT%') = 0 AS no_fixture_policy_survived,
       (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'R2ECERT%') = 0 AS no_fixture_methodology_survived;
