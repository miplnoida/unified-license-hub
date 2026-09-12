-- =====================================================================
-- PCOMP-R1C — EFFECTIVE POLICY SPINE : BEHAVIOURAL CERTIFICATION
-- =====================================================================
-- Gate families: RESOLUTION, COMPATIBILITY, SNAPSHOT, GOVERNANCE,
--                CAPABILITY, ROLLBACK.
--
-- Conventions (identical to the AML-01..AML-11 certifications):
--   * ONE transaction, ROLLBACK at the end — every R1CCERT fixture is
--     discarded. No policy profile, policy component, methodology,
--     calculation configuration or assessment survives, and no regulator
--     policy decision is fabricated;
--   * behavioural: gates call the REAL governed RPCs under REAL
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims)
--     with row_security on — never service_role;
--   * every fixture identifier is prefixed R1CCERT;
--   * results are collected and printed as PASS/FAIL, then the transaction
--     is rolled back and the preservation gates are checked afterwards.
--
-- Personas (public.cert_certification_users):
--   maker    b8eaf680-fe66-4d49-b816-1c087f511235  configuration officer
--   checker  0b522724-adcb-48bf-b21d-175339479616  head of AML/CFT
--   outsider 411dd06d-648b-4f32-82cc-897902c0c0b6  no AML authority
--
-- Run: psql -X -q -f scripts/verify-pcomp-r1-effective-policy-spine.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;

-- Pre-transaction census, kept in psql variables so it survives the ROLLBACK.
SELECT count(*)::text AS pre_assessments,
       (SELECT count(*)::text FROM public.supervisory_policy_profile) AS pre_profiles,
       (SELECT count(*)::text FROM public.supervisory_policy_component) AS pre_components,
       (SELECT count(*)::text FROM public.supervisory_assessment_policy_snapshot) AS pre_snapshots,
       (SELECT count(*)::text FROM public.supervisory_methodology) AS pre_methodologies,
       (SELECT count(*)::text FROM public.supervisory_calculation_config) AS pre_calc,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-')||':'||
                                       COALESCE(r.inherent_rating,'-')||':'||COALESCE(r.control_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) AS pre_risk_digest,
       (SELECT count(*)::text FROM public.entity_risk_state_movement) AS pre_movements
  FROM public.supervisory_assessment \gset

BEGIN;

CREATE TEMP TABLE r1c_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE r1c(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON r1c_id TO authenticated;
GRANT ALL ON r1c TO authenticated;

INSERT INTO r1c_id(k,v) VALUES
  ('regulator',       '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),   -- FSRA (active)
  ('other_regulator', 'ca6e0616-55a9-48e7-8652-2b19536afb8a'),   -- ABC Prudential (inactive)
  ('entity',          'aa220000-0000-4000-8000-000000000001'),
  ('maker',           'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',         '0b522724-adcb-48bf-b21d-175339479616'),
  ('outsider',        '411dd06d-648b-4f32-82cc-897902c0c0b6');

INSERT INTO r1c_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM r1c_id WHERE k='entity');
INSERT INTO r1c_id(k,v)
SELECT 'other_sector', s.id FROM public.sectors s
 WHERE s.id IS DISTINCT FROM (SELECT v FROM r1c_id WHERE k='sector') ORDER BY s.code LIMIT 1;

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
SELECT rs.id, 'regulator', (SELECT v FROM r1c_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- ------------------------------------------------- methodology fixtures ----
-- Synthetic certification methodology, rolled back. AML-CFT-RBA v1.0 and the
-- v1.1 reference methodology are never read for write and never modified.
INSERT INTO public.supervisory_methodology(
  code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES ('R1CCERT-METH','AML_CFT','R1CCERT policy spine fixture','1.0','ACTIVE',
  (SELECT v FROM r1c_id WHERE k='sector'), (SELECT v FROM r1c_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED','R1CCERT policy spine fixture',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"HIGH","label":"High","ordinal":2}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO r1c_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='R1CCERT-METH';

INSERT INTO public.supervisory_methodology(
  code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale)
VALUES ('R1CCERT-METH-B','AML_CFT','R1CCERT unrelated methodology','1.0','ACTIVE',
  (SELECT v FROM r1c_id WHERE k='other_sector'), (SELECT v FROM r1c_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED','R1CCERT unrelated methodology',
  '[{"code":"LOW","label":"Low","ordinal":1}]'::jsonb);
INSERT INTO r1c_id(k,v) SELECT 'meth_b', id FROM public.supervisory_methodology WHERE code='R1CCERT-METH-B';

INSERT INTO public.supervisory_methodology_fact_requirement(
  methodology_id, fact_code, label, data_type, is_required, auto_prefill_allowed,
  officer_edit_allowed, definition_status, description)
VALUES ((SELECT v FROM r1c_id WHERE k='meth'),'R1CCERT_F_RATIO','R1CCERT fixture ratio','percentage',
  false,true,true,'DEFINED','Canonical fixture fact used by the convergence gates');

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES ((SELECT v FROM r1c_id WHERE k='meth'),'R1CCERT_DIM_I','INHERENT_RISK','Inherent fixture',100,1,true,'INHERENT');
INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
SELECT (SELECT v FROM r1c_id WHERE k='meth'), d.id, 'R1CCERT_Q1','Q1',
  ARRAY['YES','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1
  FROM public.supervisory_methodology_dimension d WHERE d.dimension_code='R1CCERT_DIM_I';

-- Fixture calculation configurations (ACTIVE) — one for each methodology, so a
-- methodology/calculation mismatch can be exercised through real bindings.
INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, status, effective_from)
VALUES ((SELECT v FROM r1c_id WHERE k='meth'), 1, 'ACTIVE', current_date - 1),
       ((SELECT v FROM r1c_id WHERE k='meth_b'), 1, 'ACTIVE', current_date - 1);
INSERT INTO r1c_id(k,v) SELECT 'calc', id FROM public.supervisory_calculation_config
 WHERE methodology_id=(SELECT v FROM r1c_id WHERE k='meth');
INSERT INTO r1c_id(k,v) SELECT 'calc_b', id FROM public.supervisory_calculation_config
 WHERE methodology_id=(SELECT v FROM r1c_id WHERE k='meth_b');

-- Fixture assessment programme set + programme.
INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('R1CCERT-PROGRAMMES','1.0','R1CCERT programme fixture','AML_CFT',
  (SELECT v FROM r1c_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);
INSERT INTO r1c_id(k,v) SELECT 'prog_set', id FROM public.supervisory_assessment_programme_set
 WHERE code='R1CCERT-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
VALUES ((SELECT v FROM r1c_id WHERE k='prog_set'),'R1CCERT_P','R1CCERT programme','PERIODIC',
  true,1,'TRAILING_DAYS',365,1,false,false,ARRAY['CORE'],'{}'::text[],'{}'::text[]);
INSERT INTO r1c_id(k,v) SELECT 'prog', id FROM public.supervisory_assessment_programme
 WHERE programme_code='R1CCERT_P';
INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
VALUES ((SELECT v FROM r1c_id WHERE k='prog'),'PERIODIC','Periodic cycle',true,true,1);

-- The domain must publish an effective-date rule for calculation resolution.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'R1CCERT fixture rule, discarded on rollback');
  PERFORM set_config('request.jwt.claims','',true);
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
END $$;

-- =====================================================================
-- GATES
-- =====================================================================
DO $$
DECLARE
  maker    text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker  text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg      uuid := (SELECT v FROM r1c_id WHERE k='regulator');
  other    uuid := (SELECT v FROM r1c_id WHERE k='other_regulator');
  sector   uuid := (SELECT v FROM r1c_id WHERE k='sector');
  osector  uuid := (SELECT v FROM r1c_id WHERE k='other_sector');
  entity   uuid := (SELECT v FROM r1c_id WHERE k='entity');
  base uuid; second uuid; sectorp uuid; future uuid; expired uuid; refp uuid; inactivep uuid;
  comp uuid; jv jsonb; jw jsonb; a1 uuid; a2 uuid; snap1 jsonb; n int; st text; hash1 text; crec record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- ---------------------------------------------------------- fixtures ----
  base := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg, 'code','R1CCERT-PROFILE',
    'profile_version','1.0','name','R1CCERT certification profile',
    'origin','REGULATOR_AUTHORED','rationale','R1CCERT certification fixture profile'));
  INSERT INTO r1c_id(k,v) VALUES ('base', base);

  PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM r1c_id WHERE k='meth'),
    'rationale','R1CCERT binds the fixture methodology'));
  PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r1c_id WHERE k='calc'),
    'rationale','R1CCERT binds the matching calculation configuration'));
  PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
    'component_type','ASSESSMENT_PROGRAMME','component_id',(SELECT v FROM r1c_id WHERE k='prog_set'),
    'rationale','R1CCERT binds the fixture assessment programme set'));

  -- R1C-10 — a profile whose components agree passes compatibility
  jv := public.supervisory_policy_profile_compatibility(base);
  INSERT INTO r1c VALUES ('R1C-10-COMPATIBLE', (jv->>'compatible')::boolean,
    format('errors=%s findings=%s', jv->>'error_count', jv->'findings'));

  -- R1C-11 — a calculation configuration built on another methodology blocks approval
  PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r1c_id WHERE k='calc_b'),
    'rationale','R1CCERT deliberately binds a mismatched calculation configuration'));
  jv := public.supervisory_policy_profile_compatibility(base);
  INSERT INTO r1c VALUES ('R1C-11-METH-CALC-MISMATCH',
    NOT (jv->>'compatible')::boolean
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(jv->'findings') f
                   WHERE f->>'code' LIKE '%CALCULATION%'),
    format('errors=%s codes=%s', jv->>'error_count',
      (SELECT string_agg(f->>'code',',') FROM jsonb_array_elements(jv->'findings') f)));

  PERFORM public.supervisory_policy_profile_lifecycle(base,'REVIEW','R1CCERT submits the profile for review.');
  PERFORM set_config('request.jwt.claims', checker, true);
  BEGIN
    PERFORM public.supervisory_policy_profile_lifecycle(base,'APPROVED',
      'R1CCERT approval attempt while the bound package is incompatible.');
    INSERT INTO r1c VALUES ('R1C-11B-APPROVAL-BLOCKED', false, 'the approval was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-11B-APPROVAL-BLOCKED', SQLERRM LIKE 'compatibility_refused%', left(SQLERRM,110));
  END;

  -- restore the matching calculation configuration
  PERFORM set_config('request.jwt.claims', maker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(base,'DRAFT','R1CCERT returns the profile to draft.');
  PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r1c_id WHERE k='calc'),
    'rationale','R1CCERT restores the matching calculation configuration'));

  -- R1C-12..R1C-16G — cross-component semantic convergence. Each area is bound
  -- with content that contradicts the canonical vocabulary, the profile must
  -- report the exact structured finding, and the same area bound with canonical
  -- content must clear it. Compatibility is the gate; nothing is guessed.
  FOR crec IN SELECT * FROM (VALUES
    -- PCOMP-R2D made SLA policy content itself governed: rule code, canonical
    -- action, duration and calendar basis are now refused at authoring, so an
    -- unknown stage name can no longer be submitted at all. The remaining
    -- incompatibility an SLA policy can express is timing work by a risk band
    -- the bound methodology does not own.
    ('R1C-14-SLA-STAGE-INVALID','SLA_POLICY','SLA_RATING_UNKNOWN',
      jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
        'rule_code','R1CCERT-SLA-BAD','stage','Assessment review','applies_to_action','SUPERVISORY_PLAN',
        'risk_band','SEVERE','duration_days',10,'calendar_mode','CALENDAR_DAYS'))),
      jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
        'rule_code','R1CCERT-SLA-OK','stage','Assessment review',
        'applies_to_action','SUPERVISORY_PLAN','duration_days',10,'calendar_mode','CALENDAR_DAYS')))),
    -- PCOMP-R2A made evidence policy content itself governed, so an unknown
    -- evidence kind can no longer be submitted at all. The remaining
    -- incompatibility an evidence policy can express is naming a question the
    -- bound methodology does not own.
    ('R1C-15-EVIDENCE-VOCAB-INVALID','EVIDENCE_POLICY','EVIDENCE_SCOPE_REFERENCE_UNKNOWN',
      jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
        'rule_code','R1CCERT-EV-BAD','scope_type','QUESTION',
        'scope_reference','R1CCERT_NOT_A_QUESTION','evidence_requirement','REQUIRED',
        'permitted_source_kinds', jsonb_build_array(public.supervisory_policy_vocabulary('EVIDENCE_KIND')->>0),
        'minimum_items',1))),
      jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
        'rule_code','R1CCERT-EV-OK','scope_type','ASSESSMENT','evidence_requirement','REQUIRED',
        'permitted_source_kinds', jsonb_build_array(public.supervisory_policy_vocabulary('EVIDENCE_KIND')->>0),
        'minimum_items',1)))),

    ('R1C-16-FACT-NOT-CANONICAL','FACT_CONFIG','FACT_NOT_CANONICAL',
      jsonb_build_object('facts', jsonb_build_array(jsonb_build_object(
        'fact_code','R1CCERT_NOT_A_FACT','data_type','PERCENT'))),
      jsonb_build_object('facts', jsonb_build_array(jsonb_build_object(
        'fact_code', public.supervisory_policy_vocabulary('FACT', base)->>0,'data_type','PERCENT')))),
    ('R1C-16B-JUDGEMENT-RULE-INVALID','JUDGEMENT_POLICY','JUDGEMENT_BAND_STEPS_INVALID',
      jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
        'direction','BOTH','max_band_steps',99,'rationale_min_length',50))),
      jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
        'direction','BOTH','max_band_steps',1,'rationale_min_length',50)))),
    ('R1C-16C-SECTOR-UNKNOWN','SECTOR_OVERLAY','SECTOR_CODE_UNKNOWN',
      jsonb_build_object('sectors', jsonb_build_array(jsonb_build_object(
        'sector_code','NOT_A_SECTOR','applicability','APPLICABLE'))),
      jsonb_build_object('sectors', jsonb_build_array(jsonb_build_object(
        'sector_code', public.supervisory_policy_vocabulary('SECTOR')->>0,'applicability','APPLICABLE')))),
    ('R1C-16D-SOURCE-FACT-UNKNOWN','SOURCE_BINDING','SOURCE_FACT_UNKNOWN',
      jsonb_build_object('bindings', jsonb_build_array(jsonb_build_object(
        'fact_code','R1CCERT_NOT_A_FACT','source_kind','RETURN','source_reference','R1CCERT return'))),
      jsonb_build_object('bindings', jsonb_build_array(jsonb_build_object(
        'fact_code', public.supervisory_policy_vocabulary('FACT', base)->>0,
        'source_kind','RETURN','source_reference','R1CCERT return')))),
    ('R1C-16E-MATERIALITY-MEASURE-UNKNOWN','MATERIALITY_POLICY','MATERIALITY_MEASURE_UNKNOWN',
      jsonb_build_object('thresholds', jsonb_build_array(jsonb_build_object(
        'measure','R1CCERT_NOT_A_MEASURE','operator','GT','value',10))),
      jsonb_build_object('thresholds', jsonb_build_array(jsonb_build_object(
        'measure', public.supervisory_policy_vocabulary('MATERIALITY_MEASURE', base)->>0,
        'operator','GT','value',10)))),
    ('R1C-16F-DASHBOARD-METRIC-UNKNOWN','DASHBOARD_POLICY','DASHBOARD_METRIC_UNKNOWN',
      jsonb_build_object('tiles', jsonb_build_array(jsonb_build_object(
        'tile_key','r1ccert_tile','metric','R1CCERT_NOT_A_METRIC','audience','REGULATOR'))),
      jsonb_build_object('tiles', jsonb_build_array(jsonb_build_object(
        'tile_key','r1ccert_tile','metric', public.supervisory_policy_vocabulary('METRIC')->>0,
        'audience','REGULATOR')))),
    ('R1C-16G-NOTIFICATION-EVENT-UNKNOWN','NOTIFICATION_POLICY','NOTIFICATION_EVENT_UNKNOWN',
      jsonb_build_object('triggers', jsonb_build_array(jsonb_build_object(
        'event','R1CCERT.NOT_AN_EVENT',
        'channels', jsonb_build_array(public.supervisory_policy_vocabulary('NOTIFICATION_CHANNEL')->>0),
        'recipients', jsonb_build_array(public.supervisory_policy_vocabulary('RECIPIENT_ROLE')->>0)))),
      jsonb_build_object('triggers', jsonb_build_array(jsonb_build_object(
        'event', public.supervisory_policy_vocabulary('NOTIFICATION_EVENT')->>0,
        'channels', jsonb_build_array(public.supervisory_policy_vocabulary('NOTIFICATION_CHANNEL')->>0),
        'recipients', jsonb_build_array(public.supervisory_policy_vocabulary('RECIPIENT_ROLE')->>0)))))
  ) AS t(gate, ctype, finding_code, bad_content, good_content)
  LOOP
    comp := (public.supervisory_policy_component_create(jsonb_build_object(
      'component_type', crec.ctype,'domain_code','AML_CFT','regulator_id', reg,
      'code','R1CCERT-'||replace(crec.gate,'_','-'),'component_version','1.0',
      'name','R1CCERT '||crec.ctype||' contradicting the canonical vocabulary',
      'content', crec.bad_content)))->>'component_id';
    PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED',
      'R1CCERT submits the governed fixture for independent approval.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED',
      'R1CCERT independent approval of the governed fixture.');
    PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE',
      'R1CCERT activation of the governed fixture.');
    PERFORM set_config('request.jwt.claims', maker, true);
    PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
      'component_type', crec.ctype,'component_id', comp,
      'rationale','R1CCERT binds deliberately incompatible '||crec.ctype||' content'));
    jv := public.supervisory_policy_profile_compatibility(base);

    comp := (public.supervisory_policy_component_create(jsonb_build_object(
      'component_type', crec.ctype,'domain_code','AML_CFT','regulator_id', reg,
      'code','R1CCERT-'||replace(crec.gate,'_','-')||'-OK','component_version','1.0',
      'name','R1CCERT '||crec.ctype||' using canonical vocabulary',
      'content', crec.good_content)))->>'component_id';
    PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED',
      'R1CCERT submits the governed fixture for independent approval.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED',
      'R1CCERT independent approval of the governed fixture.');
    PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE',
      'R1CCERT activation of the governed fixture.');
    PERFORM set_config('request.jwt.claims', maker, true);
    PERFORM public.supervisory_policy_profile_binding_set(base, jsonb_build_object(
      'component_type', crec.ctype,'component_id', comp,
      'rationale','R1CCERT binds canonical '||crec.ctype||' content'));
    jw := public.supervisory_policy_profile_compatibility(base);

    INSERT INTO r1c VALUES (crec.gate,
      EXISTS (SELECT 1 FROM jsonb_array_elements(jv->'findings') f WHERE f->>'code' = crec.finding_code)
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(jw->'findings') f WHERE f->>'code' = crec.finding_code),
      format('%s raised then cleared (%s error(s) remain)', crec.finding_code, jw->>'error_count'));
  END LOOP;


  -- R1C-12/R1C-13 — PCOMP-R2C moved response-policy vocabulary defence upstream:
  -- an unknown risk band or an action that is not a canonical supervisory
  -- consequence is now refused when the policy is authored, so it can never be
  -- approved, activated or bound. The refusal is the gate.
  BEGIN
    PERFORM public.supervisory_policy_component_create(jsonb_build_object(
      'component_type','RESPONSE_POLICY','domain_code','AML_CFT','regulator_id', reg,
      'code','R1CCERT-RESPONSE-BAND','component_version','1.0',
      'name','R1CCERT response policy naming a rating that does not exist',
      'content', jsonb_build_object('responses', jsonb_build_array(jsonb_build_object(
        'rule_code','R1CCERT-1','risk_band','SEVERE','action','EXAMINATION',
        'response_level','REQUIRED')))));
    PERFORM public.supervisory_policy_component_lifecycle(
      (SELECT id FROM public.supervisory_policy_component WHERE code = 'R1CCERT-RESPONSE-BAND'),
      'SUBMITTED','R1CCERT submits response content naming an unknown rating.');
    INSERT INTO r1c VALUES ('R1C-12-RESPONSE-BAND-INVALID', false,
      'an unknown risk band was accepted for governed response policy');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-12-RESPONSE-BAND-INVALID', true,
      'refused at authoring: ' || left(SQLERRM, 160));
  END;

  BEGIN
    PERFORM public.supervisory_policy_component_create(jsonb_build_object(
      'component_type','RESPONSE_POLICY','domain_code','AML_CFT','regulator_id', reg,
      'code','R1CCERT-RESPONSE-ACTION','component_version','1.0',
      'name','R1CCERT response policy naming an action that does not exist',
      'content', jsonb_build_object('responses', jsonb_build_array(jsonb_build_object(
        'rule_code','R1CCERT-2',
        'risk_band', public.supervisory_policy_vocabulary('RISK_BAND', base)->>0,
        'action','DEPORTATION','response_level','REQUIRED')))));
    PERFORM public.supervisory_policy_component_lifecycle(
      (SELECT id FROM public.supervisory_policy_component WHERE code = 'R1CCERT-RESPONSE-ACTION'),
      'SUBMITTED','R1CCERT submits response content naming an unknown action.');
    INSERT INTO r1c VALUES ('R1C-13-RESPONSE-ACTION-INVALID', false,
      'an action outside the canonical supervisory consequence catalogue was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-13-RESPONSE-ACTION-INVALID', true,
      'refused at authoring: ' || left(SQLERRM, 160));
  END;

  -- R1C-17 — compatibility findings are structured and deterministic
  jv := public.supervisory_policy_profile_compatibility(base);
  jw := public.supervisory_policy_profile_compatibility(base);
  INSERT INTO r1c VALUES ('R1C-17-FINDINGS-DETERMINISTIC',
    (jv->'findings') = (jw->'findings')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(jv->'findings') f
                       WHERE f->>'code' IS NULL OR f->>'severity' IS NULL OR f->>'message' IS NULL),
    format('%s finding(s), identical on re-read', jsonb_array_length(jv->'findings')));

  -- ------------------------------------------- activate the base profile ----
  PERFORM public.supervisory_policy_profile_save(base, jsonb_build_object(
    'effective_from', (current_date - 1)::text));
  PERFORM public.supervisory_policy_profile_lifecycle(base,'REVIEW','R1CCERT resubmits the compatible profile.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(base,'APPROVED',
    'R1CCERT independent approval of the compatible policy package.');
  PERFORM public.supervisory_policy_profile_lifecycle(base,'ACTIVE',
    'R1CCERT activation of the approved policy package.');
  SELECT status INTO st FROM public.supervisory_policy_profile WHERE id = base;
  INSERT INTO r1c VALUES ('R1C-00-BASE-ACTIVE', st = 'ACTIVE', format('base profile status %s', st));

  -- ------------------------------------------------------- RESOLUTION ----
  PERFORM set_config('request.jwt.claims', maker, true);

  jv := public.supervisory_policy_profile_effective('AML_CFT', reg, NULL, entity, current_date);
  INSERT INTO r1c VALUES ('R1C-01-RESOLVES-ONE',
    (jv->>'status') = 'RESOLVED' AND ((jv->'profile')->>'policy_profile_id')::uuid = base,
    format('%s %s %s', jv->>'status', (jv->'profile')->>'code', (jv->'profile')->>'profile_version'));

  -- R1C-04 — the MIPL reference profile is never resolved as regulator policy
  INSERT INTO r1c VALUES ('R1C-04-REFERENCE-NEVER-RESOLVES',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(jv->'candidates','[]'::jsonb)) c
                 JOIN public.supervisory_policy_profile p ON p.id = (c->>'id')::uuid
                 WHERE p.origin = 'MIPL_REFERENCE')
      AND ((jv->'profile')->>'origin') <> 'MIPL_REFERENCE',
    format('resolved origin %s, no reference candidate offered', (jv->'profile')->>'origin'));

  -- R1C-05 — a future profile does not resolve early
  future := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg,'sector_id', osector,
    'code','R1CCERT-FUTURE','profile_version','1.0',
    'name','R1CCERT future profile','origin','REGULATOR_AUTHORED'));
  PERFORM public.supervisory_policy_profile_binding_set(future, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM r1c_id WHERE k='meth'),'rationale','R1CCERT future fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(future, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r1c_id WHERE k='calc'),'rationale','R1CCERT future fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(future, jsonb_build_object(
    'component_type','ASSESSMENT_PROGRAMME','component_id',(SELECT v FROM r1c_id WHERE k='prog_set'),'rationale','R1CCERT future fixture'));
  PERFORM public.supervisory_policy_profile_save(future, jsonb_build_object(
    'effective_from', (current_date + 30)::text));
  PERFORM public.supervisory_policy_profile_lifecycle(future,'REVIEW','R1CCERT submits the future profile.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(future,'APPROVED','R1CCERT approves the future-dated profile.');
  PERFORM public.supervisory_policy_profile_lifecycle(future,'ACTIVE','R1CCERT activates the future-dated profile.');
  PERFORM set_config('request.jwt.claims', maker, true);
  jv := public.supervisory_policy_profile_effective('AML_CFT', reg, osector, NULL, current_date);
  INSERT INTO r1c VALUES ('R1C-05-FUTURE-NOT-EARLY',
    (jv->>'status') = 'RESOLVED' AND ((jv->'profile')->>'policy_profile_id')::uuid <> future,
    format('%s resolved %s', jv->>'status', (jv->'profile')->>'code'));

  -- R1C-06 — an expired profile does not resolve
  -- the fixture profile is dated into the past directly: an operative profile is
  -- immutable once ACTIVE, so no governed operation can produce this state

  RESET ROLE;   -- fixture-only state that no governed operation can produce
  UPDATE public.supervisory_policy_profile
     SET effective_from = current_date - 60, effective_to = current_date - 30 WHERE id = future;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);
  jv := public.supervisory_policy_profile_effective('AML_CFT', reg, osector, NULL, current_date);
  INSERT INTO r1c VALUES ('R1C-06-EXPIRED-NOT-RESOLVED',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(jv->'candidates','[]'::jsonb)) c
                 WHERE (c->>'id')::uuid = future),
    format('%s, expired profile absent from candidates', jv->>'status'));
  RESET ROLE;   -- fixture-only state that no governed operation can produce
  UPDATE public.supervisory_policy_profile SET status='RETIRED' WHERE id = future;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- R1C-03 — two equally applicable active profiles are AMBIGUOUS, never guessed
  second := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg,'code','R1CCERT-TWIN','profile_version','1.0',
    'name','R1CCERT twin profile','origin','REGULATOR_AUTHORED'));
  PERFORM public.supervisory_policy_profile_binding_set(second, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM r1c_id WHERE k='meth'),'rationale','R1CCERT twin fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(second, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r1c_id WHERE k='calc'),'rationale','R1CCERT twin fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(second, jsonb_build_object(
    'component_type','ASSESSMENT_PROGRAMME','component_id',(SELECT v FROM r1c_id WHERE k='prog_set'),'rationale','R1CCERT twin fixture'));
  RESET ROLE;   -- fixture-only state that no governed operation can produce
  UPDATE public.supervisory_policy_profile
     SET status='ACTIVE', approved_by=(SELECT v FROM r1c_id WHERE k='checker'),
         approved_at=now(), activated_at=now(), effective_from=current_date - 1
   WHERE id = second;                                     -- deliberate conflicting state
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);
  jv := public.supervisory_policy_profile_effective('AML_CFT', reg, NULL, NULL, current_date);
  INSERT INTO r1c VALUES ('R1C-03-AMBIGUOUS',
    (jv->>'status') = 'AMBIGUOUS' AND (jv->>'reason_code') = 'MULTIPLE_ACTIVE_PROFILES',
    format('%s / %s', jv->>'status', jv->>'reason_code'));
  RESET ROLE;   -- fixture-only state that no governed operation can produce
  UPDATE public.supervisory_policy_profile SET status='RETIRED' WHERE id = second;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- R1C-09 — a sector-specific profile resolves only for its own sector
  sectorp := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg,'sector_id', sector,
    'code','R1CCERT-SECTOR','profile_version','1.0','name','R1CCERT sector profile',
    'origin','REGULATOR_AUTHORED'));
  PERFORM public.supervisory_policy_profile_binding_set(sectorp, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM r1c_id WHERE k='meth'),'rationale','R1CCERT sector fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(sectorp, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r1c_id WHERE k='calc'),'rationale','R1CCERT sector fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(sectorp, jsonb_build_object(
    'component_type','ASSESSMENT_PROGRAMME','component_id',(SELECT v FROM r1c_id WHERE k='prog_set'),'rationale','R1CCERT sector fixture'));
  RESET ROLE;   -- fixture-only state that no governed operation can produce
  UPDATE public.supervisory_policy_profile
     SET status='ACTIVE', approved_by=(SELECT v FROM r1c_id WHERE k='checker'),
         approved_at=now(), activated_at=now(), effective_from=current_date - 1
   WHERE id = sectorp;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);
  jv := public.supervisory_policy_profile_effective('AML_CFT', reg, sector, NULL, current_date);
  jw := public.supervisory_policy_profile_effective('AML_CFT', reg, osector, NULL, current_date);
  INSERT INTO r1c VALUES ('R1C-09-SECTOR-SPECIFIC',
    (jv->>'status')='RESOLVED' AND ((jv->'profile')->>'policy_profile_id')::uuid = sectorp
      AND (jw->>'status')='RESOLVED' AND ((jw->'profile')->>'policy_profile_id')::uuid = base,
    format('own sector -> %s, other sector -> %s',
      (jv->'profile')->>'code', (jw->'profile')->>'code'));
  RESET ROLE;   -- fixture-only state that no governed operation can produce
  UPDATE public.supervisory_policy_profile SET status='RETIRED' WHERE id = sectorp;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- R1C-02 — no applicable profile is UNRESOLVED, never a silent pick
  jv := public.supervisory_policy_profile_effective('PRUDENTIAL', NULL, NULL, NULL, current_date);
  INSERT INTO r1c VALUES ('R1C-02-UNRESOLVED',
    (jv->>'status') = 'UNRESOLVED' AND (jv->>'reason_code') IS NOT NULL,
    format('%s / %s', jv->>'status', jv->>'reason_code'));

  -- R1C-07 — an inactive regulator can never supply operative policy
  inactivep := NULL;
  RESET ROLE;   -- fixture-only state that no governed operation can produce
  INSERT INTO public.supervisory_policy_profile(
    code, profile_version, domain_code, regulator_id, name, status, origin,
    effective_from, approved_by, approved_at, activated_at, created_by)
  VALUES ('R1CCERT-INACTIVE-REG','1.0','AML_CFT', other,'R1CCERT inactive regulator profile',
    'ACTIVE','REGULATOR_AUTHORED', current_date - 1,(SELECT v FROM r1c_id WHERE k='checker'),
    now(), now(),(SELECT v FROM r1c_id WHERE k='maker'))
  RETURNING id INTO inactivep;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);
  jv := public.supervisory_policy_profile_effective('AML_CFT', other, NULL, NULL, current_date);
  INSERT INTO r1c VALUES ('R1C-07-INACTIVE-REGULATOR',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(jv->'candidates','[]'::jsonb)) c
                 WHERE (c->>'id')::uuid = inactivep),
    format('%s, inactive-regulator profile never offered', jv->>'status'));

  -- R1C-08 — resolution outside the officer's regulator scope is refused
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub','411dd06d-648b-4f32-82cc-897902c0c0b6','role','authenticated')::text, true);
    PERFORM public.supervisory_policy_profile_effective('AML_CFT', reg, NULL, NULL, current_date);
    INSERT INTO r1c VALUES ('R1C-08-CROSS-REGULATOR-REFUSED', false, 'the resolution was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-08-CROSS-REGULATOR-REFUSED', SQLERRM LIKE 'not_authorized%', left(SQLERRM,110));
  END;
  PERFORM set_config('request.jwt.claims', maker, true);

  -- --------------------------------------------------------- SNAPSHOT ----
  jv := public.supervisory_assessment_create_programmed(
    entity,'AML_CFT',(SELECT v FROM r1c_id WHERE k='prog'),'PERIODIC',NULL,NULL,
    'R1CCERT certification assessment');
  a1 := (jv->>'id')::uuid;
  INSERT INTO r1c_id(k,v) VALUES ('a1', a1);
  snap1 := public.supervisory_assessment_policy_basis(a1);
  hash1 := snap1->>'content_hash';

  INSERT INTO r1c VALUES ('R1C-18-CREATION-RESOLVES-PROFILE',
    ((jv->'policy_basis')->>'stamped')::boolean, format('policy_basis=%s', jv->'policy_basis'));
  INSERT INTO r1c VALUES ('R1C-19-SNAPSHOT-PROFILE',
    (snap1->>'status')='SNAPSHOTTED' AND (snap1->>'policy_profile_id')::uuid = base
      AND (snap1->>'policy_profile_version') = '1.0',
    format('%s %s', snap1->>'policy_profile_code', snap1->>'policy_profile_version'));
  INSERT INTO r1c VALUES ('R1C-20-SNAPSHOT-METHODOLOGY',
    (snap1->>'methodology_id')::uuid = (SELECT v FROM r1c_id WHERE k='meth')
      AND (snap1->>'methodology_version') = '1.0',
    format('%s %s', snap1->>'methodology_code', snap1->>'methodology_version'));
  INSERT INTO r1c VALUES ('R1C-21-SNAPSHOT-PROGRAMME',
    (snap1->>'programme_set_id')::uuid = (SELECT v FROM r1c_id WHERE k='prog_set'),
    format('%s %s', snap1->>'programme_code', snap1->>'programme_version'));
  INSERT INTO r1c VALUES ('R1C-22-SNAPSHOT-CALCULATION',
    (snap1->>'calculation_config_id')::uuid = (SELECT v FROM r1c_id WHERE k='calc'),
    format('calculation configuration version %s', snap1->>'calculation_config_version'));
  INSERT INTO r1c VALUES ('R1C-23-SNAPSHOT-COMPONENT-HASHES',
    jsonb_array_length(snap1->'components') >= 3
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snap1->'components') c
                       WHERE c->>'content_hash' IS NULL),
    format('%s bound component(s), every one fingerprinted', jsonb_array_length(snap1->'components')));

  -- R1C-24 — the snapshot is immutable
  BEGIN
    UPDATE public.supervisory_assessment_policy_snapshot
       SET policy_profile_version = '9.9' WHERE assessment_id = a1;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r1c VALUES ('R1C-24-SNAPSHOT-IMMUTABLE', n = 0,
      format('%s row(s) changed by a direct write (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-24-SNAPSHOT-IMMUTABLE', true, left(SQLERRM,110));
  END;
  BEGIN
    DELETE FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = a1;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r1c VALUES ('R1C-24B-SNAPSHOT-UNDELETABLE', n = 0,
      format('%s row(s) deleted (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-24B-SNAPSHOT-UNDELETABLE', true, left(SQLERRM,110));
  END;

  -- R1C-25/26 — a newer profile version governs new work only
  second := public.supervisory_policy_profile_new_version(base, '2.0',
    'R1CCERT successor policy profile version for certification.');
  PERFORM public.supervisory_policy_profile_save(second, jsonb_build_object(
    'effective_from', (current_date)::text));
  PERFORM public.supervisory_policy_profile_lifecycle(second,'REVIEW','R1CCERT submits the successor version.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(second,'APPROVED','R1CCERT independent approval of version 2.0.');
  PERFORM public.supervisory_policy_profile_lifecycle(second,'ACTIVE','R1CCERT activation of version 2.0.');
  PERFORM set_config('request.jwt.claims', maker, true);

  jv := public.supervisory_assessment_policy_basis(a1);
  INSERT INTO r1c VALUES ('R1C-25-OLD-SNAPSHOT-UNCHANGED',
    (jv->>'policy_profile_version') = '1.0' AND (jv->>'content_hash') = hash1
      AND (jv->>'policy_profile_id')::uuid = base,
    format('still version %s with the original fingerprint', jv->>'policy_profile_version'));

  jw := public.supervisory_assessment_create_programmed(
    entity,'AML_CFT',(SELECT v FROM r1c_id WHERE k='prog'),'PERIODIC',NULL,NULL,
    'R1CCERT second certification assessment under the successor profile');
  a2 := (jw->>'id')::uuid;
  INSERT INTO r1c_id(k,v) VALUES ('a2', a2);
  jv := public.supervisory_assessment_policy_basis(a2);
  INSERT INTO r1c VALUES ('R1C-26-NEW-ASSESSMENT-NEW-BASIS',
    (jv->>'status')='SNAPSHOTTED' AND (jv->>'policy_profile_id')::uuid = second
      AND (jv->>'policy_profile_version') = '2.0',
    format('new assessment governed by version %s', jv->>'policy_profile_version'));

  -- R1C-27/28 — legacy assessments keep no fabricated snapshot
  SELECT count(*) INTO n FROM public.supervisory_assessment a
   WHERE a.id NOT IN (a1, a2)
     AND EXISTS (SELECT 1 FROM public.supervisory_assessment_policy_snapshot s WHERE s.assessment_id = a.id);
  INSERT INTO r1c VALUES ('R1C-27-LEGACY-NOT-BACKFILLED', n = 0,
    format('%s pre-existing assessment(s) carry a snapshot (0 expected)', n));

  SELECT count(*) INTO n FROM public.supervisory_assessment a
   WHERE a.id NOT IN (a1, a2) AND a.methodology_id = (SELECT v FROM r1c_id WHERE k='meth');
  INSERT INTO r1c VALUES ('R1C-28-HISTORICAL-METHODOLOGY-UNTOUCHED', n = 0,
    format('%s historical assessment(s) rebound to the fixture methodology (0 expected)', n));

  -- ------------------------------------------------------- GOVERNANCE ----
  -- R1C-29 — regulator-owned content requires an ACTIVE owning regulator
  BEGIN
    PERFORM public.supervisory_policy_component_create(jsonb_build_object(
      'component_type','SLA_POLICY','domain_code','AML_CFT','regulator_id', other,
      'code','R1CCERT-INACTIVE-OWNER','component_version','1.0','name','R1CCERT inactive owner'));
    INSERT INTO r1c VALUES ('R1C-29-INACTIVE-OWNER-REFUSED', false, 'the create was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-29-INACTIVE-OWNER-REFUSED', true, left(SQLERRM,110));
  END;

  -- R1C-30 — platform reference material is not authored by a regulator officer
  BEGIN
    PERFORM public.supervisory_policy_component_create(jsonb_build_object(
      'component_type','SLA_POLICY','domain_code','AML_CFT','origin','MIPL_REFERENCE',
      'code','R1CCERT-REFERENCE','component_version','1.0','name','R1CCERT reference attempt'));
    INSERT INTO r1c VALUES ('R1C-30-REFERENCE-AUTHORING-REFUSED', false, 'the create was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-30-REFERENCE-AUTHORING-REFUSED', SQLERRM LIKE 'not_authorized%', left(SQLERRM,110));
  END;

  -- R1C-31..R1C-35 — maker/checker separation, immutability and history
  comp := (public.supervisory_policy_component_create(jsonb_build_object(
    'component_type','SLA_POLICY','domain_code','AML_CFT','regulator_id', reg,
    'code','R1CCERT-SLA-GOV','component_version','1.0','name','R1CCERT governed SLA policy',
    'content', jsonb_build_object('stages', jsonb_build_array(
      jsonb_build_object('rule_code','R1CCERT-SLA-REVIEW','stage','ASSESSMENT_REVIEW',
        'applies_to_action','SUPERVISORY_PLAN','duration_days',10,'calendar_mode','CALENDAR_DAYS'),
      jsonb_build_object('rule_code','R1CCERT-SLA-APPROVAL','stage','RATING_APPROVAL',
        'applies_to_action','MONITORING','duration_days',5,'calendar_mode','CALENDAR_DAYS'))))))->>'component_id';
  INSERT INTO r1c_id(k,v) VALUES ('gov_comp', comp);
  PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED',
    'R1CCERT submits the governed service levels for independent approval.');
  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED',
      'R1CCERT self-approval attempt for certification purposes.');
    INSERT INTO r1c VALUES ('R1C-31-NO-SELF-APPROVAL', false, 'self-approval was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-31-NO-SELF-APPROVAL', true, left(SQLERRM,110));
  END;

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED',
    'R1CCERT independent approval of the governed service levels.');
  PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE',
    'R1CCERT activation of the approved service levels.');
  SELECT status INTO st FROM public.supervisory_policy_component WHERE id = comp;
  INSERT INTO r1c VALUES ('R1C-32-CHECKER-APPROVES',
    st = 'ACTIVE' AND (SELECT approved_by IS DISTINCT FROM submitted_by
                         FROM public.supervisory_policy_component WHERE id = comp),
    format('status %s under an independent approver', st));

  BEGIN
    UPDATE public.supervisory_policy_component SET content='{}'::jsonb WHERE id = comp;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r1c VALUES ('R1C-33-APPROVED-CONTENT-IMMUTABLE', n = 0,
      format('%s row(s) changed by a direct write (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-33-APPROVED-CONTENT-IMMUTABLE', true, left(SQLERRM,110));
  END;

  PERFORM set_config('request.jwt.claims', maker, true);
  jv := public.supervisory_policy_component_new_version(comp,'1.1',
    'R1CCERT successor version of the governed service levels.');
  SELECT count(*) INTO n FROM public.supervisory_policy_component
   WHERE code='R1CCERT-SLA-GOV' AND component_version IN ('1.0','1.1');
  INSERT INTO r1c VALUES ('R1C-34-NEW-VERSION-PRESERVES-OLD',
    n = 2 AND jsonb_array_length((SELECT content->'stages' FROM public.supervisory_policy_component WHERE id = comp)) = 2,
    format('%s versions retained with the approved content intact', n));

  BEGIN
    DELETE FROM public.supervisory_policy_component_event WHERE component_id = comp;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r1c VALUES ('R1C-35-HISTORY-APPEND-ONLY', n = 0,
      format('%s history row(s) deleted (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-35-HISTORY-APPEND-ONLY', true, left(SQLERRM,110));
  END;

  -- ------------------------------------------------------- CAPABILITY ----
  jv := public.supervisory_policy_component_capability('METHODOLOGY');
  INSERT INTO r1c VALUES ('R1C-36-METHODOLOGY-CAPABILITY',
    ((jv->0)->>'runtime_consumed')::boolean AND ((jv->0)->>'certified')::boolean
      AND ((jv->0)->>'capability_state') = 'CERTIFIED',
    format('%s', (jv->0)->>'capability_state'));
  jv := public.supervisory_policy_component_capability('ASSESSMENT_PROGRAMME');
  INSERT INTO r1c VALUES ('R1C-37-PROGRAMME-CAPABILITY',
    ((jv->0)->>'runtime_consumed')::boolean, format('%s', (jv->0)->>'capability_state'));
  jv := public.supervisory_policy_component_capability('CALCULATION_CONFIG');
  INSERT INTO r1c VALUES ('R1C-38-CALCULATION-CAPABILITY',
    ((jv->0)->>'runtime_consumed')::boolean, format('%s', (jv->0)->>'capability_state'));

  -- PCOMP-R2A promoted EVIDENCE_POLICY, and only EVIDENCE_POLICY, to runtime.
  SELECT count(*) INTO n FROM public.supervisory_policy_component_type
   WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING',
                            'MATERIALITY_POLICY',
                            'DASHBOARD_POLICY','NOTIFICATION_POLICY')
     AND NOT is_runtime_consumed AND NOT is_certified;
  -- R2C promoted RESPONSE_POLICY and R2D promoted SLA_POLICY, leaving six areas
  -- configuration-only.
  INSERT INTO r1c VALUES ('R1C-39-SEVEN-AREAS-NOT-RUNTIME', n = 6,
    format('%s of 6 configuration-only areas truthfully report not runtime consumed', n));

  SELECT count(*) INTO n FROM public.supervisory_policy_component_type
   WHERE component_type = 'EVIDENCE_POLICY' AND is_runtime_consumed AND is_certified;
  INSERT INTO r1c VALUES ('R1C-39B-EVIDENCE-POLICY-RUNTIME', n = 1,
    format('EVIDENCE_POLICY runtime/certified rows: %s of 1 expected', n));

  -- R1C-40 — capability is server state; no client-writable promotion exists
  BEGIN
    UPDATE public.supervisory_policy_component_type
       SET is_runtime_consumed = true, is_certified = true WHERE component_type = 'DASHBOARD_POLICY';
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r1c VALUES ('R1C-40-CAPABILITY-NOT-PROMOTABLE', n = 0,
      format('%s capability row(s) changed by a signed-in identity (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r1c VALUES ('R1C-40-CAPABILITY-NOT-PROMOTABLE', true, left(SQLERRM,110));
  END;
  jv := public.supervisory_policy_component_capability('DASHBOARD_POLICY');
  INSERT INTO r1c VALUES ('R1C-40B-CAPABILITY-STILL-TRUTHFUL',
    NOT ((jv->0)->>'runtime_consumed')::boolean, format('%s', (jv->0)->>'capability_state'));

  PERFORM set_config('request.jwt.claims','',true);
  RESET ROLE;
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r1c ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total FROM r1c;

ROLLBACK;

-- =====================================================================
-- ROLLBACK GATES — nothing certification-related may survive
-- =====================================================================
SELECT 'R1C-41-NO-CERT-ASSESSMENT' AS gate,
       CASE WHEN count(*) = :'pre_assessments'::bigint THEN 'PASS' ELSE 'FAIL' END AS result,
       format('%s assessment(s), %s before the run', count(*), :'pre_assessments') AS detail
  FROM public.supervisory_assessment
UNION ALL
SELECT 'R1C-41B-NO-CERT-SNAPSHOT',
       CASE WHEN (SELECT count(*) FROM public.supervisory_assessment_policy_snapshot) = :'pre_snapshots'::bigint
            THEN 'PASS' ELSE 'FAIL' END,
       format('%s snapshot(s), %s before the run',
              (SELECT count(*) FROM public.supervisory_assessment_policy_snapshot), :'pre_snapshots')
UNION ALL
SELECT 'R1C-42-NO-CERT-POLICY',
       CASE WHEN (SELECT count(*) FROM public.supervisory_policy_profile) = :'pre_profiles'::bigint
             AND (SELECT count(*) FROM public.supervisory_policy_component) = :'pre_components'::bigint
             AND (SELECT count(*) FROM public.supervisory_methodology) = :'pre_methodologies'::bigint
             AND (SELECT count(*) FROM public.supervisory_calculation_config) = :'pre_calc'::bigint
            THEN 'PASS' ELSE 'FAIL' END,
       format('profiles %s/%s, components %s/%s, methodologies %s/%s, calculation configurations %s/%s',
              (SELECT count(*) FROM public.supervisory_policy_profile), :'pre_profiles',
              (SELECT count(*) FROM public.supervisory_policy_component), :'pre_components',
              (SELECT count(*) FROM public.supervisory_methodology), :'pre_methodologies',
              (SELECT count(*) FROM public.supervisory_calculation_config), :'pre_calc')
UNION ALL
SELECT 'R1C-42B-NO-R1CCERT-ARTEFACT',
       CASE WHEN (SELECT count(*) FROM public.supervisory_policy_profile WHERE code LIKE 'R1CCERT%')
                 + (SELECT count(*) FROM public.supervisory_policy_component WHERE code LIKE 'R1CCERT%')
                 + (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'R1CCERT%')
                 + (SELECT count(*) FROM public.supervisory_assessment_programme_set WHERE code LIKE 'R1CCERT%')
                 = 0 THEN 'PASS' ELSE 'FAIL' END,
       'no R1CCERT fixture of any kind remains'
UNION ALL
SELECT 'R1C-43-RISK-UNALTERED',
       CASE WHEN (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-')||':'||
                                                 COALESCE(r.inherent_rating,'-')||':'||COALESCE(r.control_rating,'-'),
                                      '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) = :'pre_risk_digest'
             AND (SELECT count(*) FROM public.entity_risk_state_movement) = :'pre_movements'::bigint
            THEN 'PASS' ELSE 'FAIL' END,
       format('risk-of-record digest unchanged, %s movement(s)',
              (SELECT count(*) FROM public.entity_risk_state_movement));
