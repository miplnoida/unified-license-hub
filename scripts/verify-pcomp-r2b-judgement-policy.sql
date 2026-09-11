-- =====================================================================
-- PCOMP-R2B — JUDGEMENT & RATING OVERRIDE POLICY RUNTIME : CERTIFICATION
-- =====================================================================
-- Gate families: CONTRACT, SEMANTICS, COMPATIBILITY, RUNTIME, PROPOSAL,
--                PROVENANCE, SECURITY, CAPABILITY, READMODEL, PRESERVATION.
--
-- Conventions (identical to AML-01..AML-11, PCOMP-R1C and PCOMP-R2A):
--   * ONE transaction, ROLLBACK at the end. Nothing this script touches
--     survives: no policy component, no override, no assessment, no
--     rating and no regulator policy decision is created or fabricated;
--   * behavioural wherever a real call is possible: gates call the REAL
--     governed functions, and identity gates run with
--     SET LOCAL ROLE authenticated and row_security on;
--   * every fixture identifier is prefixed R2BCERT;
--   * results are collected and printed as PASS/FAIL, then the
--     transaction is rolled back and preservation is checked against the
--     pre-transaction census.
--
-- Personas (public.cert_certification_users):
--   maker    b8eaf680-fe66-4d49-b816-1c087f511235
--   checker  0b522724-adcb-48bf-b21d-175339479616
--   outsider 411dd06d-648b-4f32-82cc-897902c0c0b6
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2b-judgement-policy.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;

SELECT (SELECT count(*)::text FROM public.supervisory_policy_component) AS pre_components,
       (SELECT count(*)::text FROM public.supervisory_assessment) AS pre_assessments,
       (SELECT count(*)::text FROM public.supervisory_assessment_calculation_override) AS pre_overrides,
       (SELECT count(*)::text FROM public.supervisory_assessment_calculation_run) AS pre_runs,
       (SELECT count(*)::text FROM public.entity_risk_state_movement) AS pre_movements,
       (SELECT count(*)::text FROM public.supervisory_assessment_risk_publication) AS pre_publications,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) AS pre_risk_digest
\gset

BEGIN;

CREATE TEMP TABLE r2b(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON r2b TO authenticated;
CREATE TEMP TABLE r2b_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON r2b_id TO authenticated;

-- =====================================================================
-- CONTRACT — the published authoring contract for JUDGEMENT_POLICY
-- =====================================================================
DO $$
DECLARE jv jsonb; n int;
BEGIN
  jv := public.supervisory_policy_component_content_contract('JUDGEMENT_POLICY');

  INSERT INTO r2b VALUES ('R2B-01-CONTRACT-COLLECTION',
    jv->>'collection' = 'rules', format('collection=%s', jv->>'collection'));

  INSERT INTO r2b VALUES ('R2B-02-CONTRACT-REQUIRED-FIELDS',
    (jv->'required_fields') ? 'rule_code', format('required=%s', jv->'required_fields'));

  INSERT INTO r2b VALUES ('R2B-03-CONTRACT-DIRECTION-ENUM',
    (jv->'enums'->'direction') ?& ARRAY['UPWARD','DOWNWARD','BOTH'],
    format('direction=%s', jv->'enums'->'direction'));

  INSERT INTO r2b VALUES ('R2B-04-CONTRACT-STEP-LIMIT-IS-A-NUMBER',
    (jv->'positive_numbers') ?| ARRAY['max_band_steps','rationale_min_length'],
    format('positive_numbers=%s', jv->'positive_numbers'));

  SELECT count(*) INTO n FROM jsonb_array_elements_text(
    COALESCE(jv->'enum_arrays'->'applies_to_ratings', '[]'::jsonb));
  INSERT INTO r2b VALUES ('R2B-05-CONTRACT-RATINGS-ARE-CONTROLLED', n >= 1,
    format('%s canonical rating(s) published for authoring', n));

  INSERT INTO r2b VALUES ('R2B-06-CONTRACT-PROHIBITED-TARGETS-CONTROLLED',
    (jv->'enum_arrays') ? 'prohibited_target_ratings',
    'prohibited target ratings are a controlled vocabulary, not free text');
END $$;

-- =====================================================================
-- SEMANTICS — normalisation and configuration validation
-- =====================================================================
DO $$
DECLARE jv jsonb; errs text[];
BEGIN
  jv := public.supervisory_judgement_policy_rules(jsonb_build_object('rules', jsonb_build_array(
          jsonb_build_object('rule_code','r2bcert-a','direction','up','max_movement',2,
                             'applies_to_ratings', jsonb_build_array('moderate'),
                             'prohibited_ratings', jsonb_build_array('severe'),
                             'minimum_rationale_length', 40))));
  INSERT INTO r2b VALUES ('R2B-10-NORMALISES-DIRECTION',
    (jv->0->>'direction') = 'UPWARD', format('direction stored as %s', jv->0->>'direction'));
  INSERT INTO r2b VALUES ('R2B-11-NORMALISES-RATINGS',
    (jv->0->'applies_to_ratings')->>0 = 'MODERATE'
      AND (jv->0->'prohibited_target_ratings')->>0 = 'SEVERE',
    format('rule = %s', jv->0));
  INSERT INTO r2b VALUES ('R2B-12-NORMALISES-LIMITS',
    (jv->0->>'max_band_steps')::int = 2 AND (jv->0->>'rationale_min_length')::int = 40,
    format('max_band_steps=%s rationale_min_length=%s',
           jv->0->>'max_band_steps', jv->0->>'rationale_min_length'));

  -- Nonsense limits are clamped rather than stored.
  jv := public.supervisory_judgement_policy_rules(jsonb_build_object('rules', jsonb_build_array(
          jsonb_build_object('rule_code','R2BCERT-B','max_band_steps',-4,'rationale_min_length',2))));
  INSERT INTO r2b VALUES ('R2B-13-NONSENSE-LIMITS-CLAMPED',
    (jv->0->>'max_band_steps')::int >= 1 AND (jv->0->>'rationale_min_length')::int >= 10,
    format('max_band_steps=%s rationale_min_length=%s',
           jv->0->>'max_band_steps', jv->0->>'rationale_min_length'));

  -- Independent approval is a platform control and always survives.
  jv := public.supervisory_judgement_policy_rules(jsonb_build_object('rules', jsonb_build_array(
          jsonb_build_object('rule_code','R2BCERT-C','independent_approval_required', false))));
  INSERT INTO r2b VALUES ('R2B-14-INDEPENDENT-APPROVAL-NOT-DISABLABLE',
    (jv->0->>'independent_approval_required')::boolean,
    'independent approval remains required whatever the policy authored');

  errs := public.supervisory_judgement_policy_content_errors(jsonb_build_object('rules',
            jsonb_build_array(jsonb_build_object('rule_code','R2BCERT-C',
              'independent_approval_required', false))));
  INSERT INTO r2b VALUES ('R2B-15-DISABLING-APPROVAL-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('errors=%s', errs));

  -- An empty configuration is not silently valid.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('JUDGEMENT_POLICY','{}'::jsonb)->'errors'));
  INSERT INTO r2b VALUES ('R2B-16-EMPTY-CONFIG-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('%s error(s) for an empty judgement policy', COALESCE(array_length(errs,1),0)));

  -- An unknown direction is refused.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('JUDGEMENT_POLICY',
              jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
                'rule_code','R2BCERT-D','direction','SIDEWAYS'))))->'errors'));
  INSERT INTO r2b VALUES ('R2B-17-UNKNOWN-DIRECTION-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('errors=%s', errs));

  -- Two rules governing the same calculated rating are indeterminate.
  errs := public.supervisory_judgement_policy_content_errors(jsonb_build_object('rules', jsonb_build_array(
            jsonb_build_object('rule_code','R2BCERT-E','applies_to_ratings', jsonb_build_array('LOW')),
            jsonb_build_object('rule_code','R2BCERT-F','applies_to_ratings', jsonb_build_array('LOW')))));
  INSERT INTO r2b VALUES ('R2B-18-INDETERMINATE-RULES-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('errors=%s', errs));

  -- Two catch-all rules are indeterminate.
  errs := public.supervisory_judgement_policy_content_errors(jsonb_build_object('rules', jsonb_build_array(
            jsonb_build_object('rule_code','R2BCERT-G'), jsonb_build_object('rule_code','R2BCERT-H'))));
  INSERT INTO r2b VALUES ('R2B-19-DUPLICATE-CATCHALL-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('errors=%s', errs));

  -- Duplicate rule references are refused.
  errs := public.supervisory_judgement_policy_content_errors(jsonb_build_object('rules', jsonb_build_array(
            jsonb_build_object('rule_code','R2BCERT-I','applies_to_ratings', jsonb_build_array('LOW')),
            jsonb_build_object('rule_code','R2BCERT-I','applies_to_ratings', jsonb_build_array('HIGH')))));
  INSERT INTO r2b VALUES ('R2B-20-DUPLICATE-CODE-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('errors=%s', errs));

  -- Contradiction: a rating cannot be both governed and prohibited by one rule.
  errs := public.supervisory_judgement_policy_content_errors(jsonb_build_object('rules', jsonb_build_array(
            jsonb_build_object('rule_code','R2BCERT-J','applies_to_ratings', jsonb_build_array('HIGH'),
                               'prohibited_target_ratings', jsonb_build_array('HIGH')))));
  INSERT INTO r2b VALUES ('R2B-21-CONTRADICTORY-RULE-REFUSED', COALESCE(array_length(errs,1),0) >= 1,
    format('errors=%s', errs));

  -- A complete, canonical rule is accepted.
  errs := ARRAY(SELECT jsonb_array_elements_text(
            public.supervisory_policy_component_content_validate('JUDGEMENT_POLICY',
              jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
                'rule_code','R2BCERT-K','direction','BOTH','max_band_steps',1,
                'rationale_min_length',30))))->'errors'));
  INSERT INTO r2b VALUES ('R2B-22-VALID-RULE-ACCEPTED', COALESCE(array_length(errs,1),0) = 0,
    format('errors=%s', errs));
END $$;

-- =====================================================================
-- FIXTURE — a methodology, a bound judgement policy, an assessment with
--           an immutable policy basis and a calculated run.
--           Everything here is discarded on ROLLBACK.
-- =====================================================================
INSERT INTO r2b_id(k,v)
SELECT 'regulator', id FROM public.regulators WHERE lower(status)='active' ORDER BY created_at LIMIT 1;
INSERT INTO r2b_id(k,v)
SELECT 'entity', entity_id FROM public.supervisory_assessment
 WHERE reference = 'SUP-AML_CFT-2026-00744';
INSERT INTO r2b_id(k,v) VALUES ('maker','b8eaf680-fe66-4d49-b816-1c087f511235');
INSERT INTO r2b_id(k,v) VALUES ('checker','0b522724-adcb-48bf-b21d-175339479616');

INSERT INTO public.supervisory_methodology(
  code, version, name, domain_code, regulator_id, origin, status, scoring_scale,
  effective_from)
VALUES ('R2BCERT-RBA','1.0','R2BCERT judgement fixture','AML_CFT',
  (SELECT v FROM r2b_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE',
  jsonb_build_array(
    jsonb_build_object('code','LOW','label','Low','ordinal',1),
    jsonb_build_object('code','MODERATE','label','Moderate','ordinal',2),
    jsonb_build_object('code','MEDIUM_HIGH','label','Medium-high','ordinal',3),
    jsonb_build_object('code','HIGH','label','High','ordinal',4),
    jsonb_build_object('code','SEVERE','label','Severe','ordinal',5)),
  current_date - 1);
INSERT INTO r2b_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='R2BCERT-RBA';

INSERT INTO public.supervisory_policy_component(
  component_type, code, component_version, name, domain_code, regulator_id, origin, status,
  content, effective_from)
VALUES ('JUDGEMENT_POLICY','R2BCERT-JUD','1.0','R2BCERT judgement policy','AML_CFT',
  (SELECT v FROM r2b_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE',
  jsonb_build_object('rules', jsonb_build_array(
    jsonb_build_object('rule_code','R2BCERT-MOD','label','Moderate calculated rating',
      'applies_to_ratings', jsonb_build_array('MODERATE'),
      'direction','UPWARD','max_band_steps',1,
      'prohibited_target_ratings', jsonb_build_array('SEVERE'),
      'rationale_min_length',40),
    jsonb_build_object('rule_code','R2BCERT-LOW','label','Low calculated rating',
      'applies_to_ratings', jsonb_build_array('LOW'),
      'override_permitted', false))),
  current_date - 1);
INSERT INTO r2b_id(k,v) SELECT 'component', id FROM public.supervisory_policy_component
 WHERE code='R2BCERT-JUD' AND component_version='1.0';

-- Fixture assessment, its policy basis and its calculated result.
INSERT INTO public.supervisory_assessment(
  reference, entity_id, domain_code, assessment_type, trigger_type, status,
  methodology_id, methodology_version, summary)
VALUES ('R2BCERT-ASSESS-1',(SELECT v FROM r2b_id WHERE k='entity'),'AML_CFT','PERIODIC','PERIODIC',
  'draft',(SELECT v FROM r2b_id WHERE k='meth'),'1.0','R2BCERT judgement policy certification');
INSERT INTO r2b_id(k,v) SELECT 'assessment', id FROM public.supervisory_assessment
 WHERE reference='R2BCERT-ASSESS-1';

INSERT INTO public.supervisory_policy_profile(code, profile_version, domain_code, name)
VALUES ('R2BCERT-PROFILE','1.0','AML_CFT','R2BCERT judgement profile fixture');
INSERT INTO r2b_id(k,v) SELECT 'profile', id FROM public.supervisory_policy_profile
 WHERE code='R2BCERT-PROFILE' AND profile_version='1.0';

INSERT INTO public.supervisory_assessment_policy_snapshot(
  assessment_id, domain_code, policy_profile_id, policy_profile_code, policy_profile_version,
  policy_profile_origin, regulator_id, resolved_as_of, methodology_id, methodology_code,
  methodology_version, components, resolution, content_hash)
VALUES ((SELECT v FROM r2b_id WHERE k='assessment'),'AML_CFT',(SELECT v FROM r2b_id WHERE k='profile'),
  'R2BCERT-PROFILE','1.0','REGULATOR_AUTHORED',(SELECT v FROM r2b_id WHERE k='regulator'),
  current_date, (SELECT v FROM r2b_id WHERE k='meth'),'R2BCERT-RBA','1.0',
  jsonb_build_array(jsonb_build_object(
    'component_type','JUDGEMENT_POLICY',
    'component_id',(SELECT v FROM r2b_id WHERE k='component'),
    'code','R2BCERT-JUD','component_version','1.0',
    'content_hash','r2bcert-hash')),
  jsonb_build_object('status','RESOLVED'),'r2bcert-profile-hash');

INSERT INTO public.supervisory_assessment_calculation_run(
  assessment_id, run_seq, engine_version, methodology_id, methodology_version, status,
  recommended_rating, residual_rating, inherent_band, control_band,
  inputs_hash, result_hash, event_reason, calculated_by)
VALUES ((SELECT v FROM r2b_id WHERE k='assessment'),1,'R2BCERT',
  (SELECT v FROM r2b_id WHERE k='meth'),'1.0','CALCULATED','MODERATE','MODERATE',
  'MODERATE','SATISFACTORY','r2bcert-in','r2bcert-out','R2BCERT fixture run',
  (SELECT v FROM r2b_id WHERE k='maker'));

-- =====================================================================
-- RUNTIME — the evaluator resolves through the pinned policy basis
-- =====================================================================
DO $$
DECLARE jv jsonb; src text; t jsonb;
BEGIN
  jv := public.supervisory_assessment_judgement_policy_internal((SELECT v FROM r2b_id WHERE k='assessment'));

  INSERT INTO r2b VALUES ('R2B-30-EVALUATED',
    (jv->>'status') = 'EVALUATED' AND (jv->>'governed')::boolean,
    format('status=%s governed=%s', jv->>'status', jv->>'governed'));

  INSERT INTO r2b VALUES ('R2B-31-PINS-POLICY-VERSION',
    jv->'policy'->>'code' = 'R2BCERT-JUD' AND jv->'policy'->>'component_version' = '1.0'
      AND jv->'policy_profile'->>'code' = 'R2BCERT-PROFILE',
    format('policy=%s v%s profile=%s', jv->'policy'->>'code',
           jv->'policy'->>'component_version', jv->'policy_profile'->>'code'));

  INSERT INTO r2b VALUES ('R2B-32-SELECTS-THE-APPLICABLE-RULE',
    jv->'rule'->>'rule_code' = 'R2BCERT-MOD',
    format('rule=%s for calculated rating %s', jv->'rule'->>'rule_code',
           jv->'calculation'->>'calculated_rating'));

  INSERT INTO r2b VALUES ('R2B-33-REPORTS-POLICY-LIMITS',
    (jv->>'direction') = 'UPWARD' AND (jv->>'max_band_steps')::int = 1
      AND (jv->>'rationale_min_length')::int = 40
      AND (jv->'prohibited_target_ratings') @> '"SEVERE"'::jsonb,
    format('direction=%s steps=%s min_rationale=%s prohibited=%s',
           jv->>'direction', jv->>'max_band_steps', jv->>'rationale_min_length',
           jv->'prohibited_target_ratings'));

  INSERT INTO r2b VALUES ('R2B-34-RATING-ORDER-IS-METHODOLOGY-OWNED',
    (SELECT string_agg(x->>'code','>' ORDER BY (x->>'ordinal')::int)
       FROM jsonb_array_elements(jv->'rating_order') x)
      = 'LOW>MODERATE>MEDIUM_HIGH>HIGH>SEVERE',
    format('order=%s', (SELECT string_agg(x->>'code','>' ORDER BY (x->>'ordinal')::int)
                          FROM jsonb_array_elements(jv->'rating_order') x)));

  SELECT x INTO t FROM jsonb_array_elements(jv->'target_ratings') x WHERE x->>'code'='MEDIUM_HIGH';
  INSERT INTO r2b VALUES ('R2B-35-PERMITTED-TARGET-OFFERED',
    (t->>'permitted')::boolean AND (t->>'steps')::int = 1 AND (t->>'movement') = 'UPWARD',
    format('MEDIUM_HIGH = %s', t));

  SELECT x INTO t FROM jsonb_array_elements(jv->'target_ratings') x WHERE x->>'code'='LOW';
  INSERT INTO r2b VALUES ('R2B-36-WRONG-DIRECTION-NOT-OFFERED',
    NOT (t->>'permitted')::boolean, format('LOW = %s', t));

  SELECT x INTO t FROM jsonb_array_elements(jv->'target_ratings') x WHERE x->>'code'='HIGH';
  INSERT INTO r2b VALUES ('R2B-37-TOO-MANY-STEPS-NOT-OFFERED',
    NOT (t->>'permitted')::boolean AND (t->>'steps')::int = 2, format('HIGH = %s', t));

  SELECT x INTO t FROM jsonb_array_elements(jv->'target_ratings') x WHERE x->>'code'='SEVERE';
  INSERT INTO r2b VALUES ('R2B-38-PROHIBITED-TARGET-NOT-OFFERED',
    NOT (t->>'permitted')::boolean, format('SEVERE = %s', t));

  INSERT INTO r2b VALUES ('R2B-39-INDEPENDENT-APPROVAL-ALWAYS-REPORTED',
    (jv->>'independent_approval_required')::boolean AND (jv->>'rationale_required')::boolean,
    'the evaluation always reports independent approval and a written reason as required');

  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_judgement_policy_internal';
  INSERT INTO r2b VALUES ('R2B-40-EVALUATOR-USES-SNAPSHOT',
    src LIKE '%supervisory_assessment_policy_snapshot%'
      AND src NOT LIKE '%supervisory_policy_profile_effective%',
    'the evaluator reads the immutable assessment policy basis, not the currently active profile');
END $$;

-- =====================================================================
-- PROPOSAL — the server refuses and accepts by policy, behaviourally
-- =====================================================================
DO $$
DECLARE refused int := 0; sqlm text; ovr uuid; o public.supervisory_assessment_calculation_override;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

  -- Downward movement is refused by the rule's permitted direction.
  BEGIN
    PERFORM public.supervisory_calculation_override_propose(
      (SELECT v FROM r2b_id WHERE k='assessment'),'LOW',
      'R2BCERT: a downward departure the policy does not permit, tested behaviourally.');
  EXCEPTION WHEN others THEN refused := refused + 1; sqlm := SQLERRM; END;
  INSERT INTO r2b VALUES ('R2B-41-DIRECTION-REFUSED',
    refused = 1 AND sqlm LIKE '%direction%', COALESCE(sqlm,'not refused'));

  -- A movement of two rating steps exceeds the policy limit.
  refused := 0;
  BEGIN
    PERFORM public.supervisory_calculation_override_propose(
      (SELECT v FROM r2b_id WHERE k='assessment'),'HIGH',
      'R2BCERT: a two-step departure the policy limit does not permit, tested behaviourally.');
  EXCEPTION WHEN others THEN refused := refused + 1; sqlm := SQLERRM; END;
  INSERT INTO r2b VALUES ('R2B-42-STEP-LIMIT-REFUSED',
    refused = 1 AND sqlm LIKE '%movement%', COALESCE(sqlm,'not refused'));

  -- A prohibited target rating is refused.
  refused := 0;
  BEGIN
    PERFORM public.supervisory_calculation_override_propose(
      (SELECT v FROM r2b_id WHERE k='assessment'),'SEVERE',
      'R2BCERT: a prohibited target rating, refused by the judgement policy, tested behaviourally.');
  EXCEPTION WHEN others THEN refused := refused + 1; sqlm := SQLERRM; END;
  INSERT INTO r2b VALUES ('R2B-43-PROHIBITED-TARGET-REFUSED',
    refused = 1 AND sqlm LIKE '%prohibit%', COALESCE(sqlm,'not refused'));

  -- A reason shorter than the policy minimum is refused.
  refused := 0;
  BEGIN
    PERFORM public.supervisory_calculation_override_propose(
      (SELECT v FROM r2b_id WHERE k='assessment'),'MEDIUM_HIGH','R2BCERT too short');
  EXCEPTION WHEN others THEN refused := refused + 1; sqlm := SQLERRM; END;
  INSERT INTO r2b VALUES ('R2B-44-POLICY-RATIONALE-LENGTH-ENFORCED',
    refused = 1 AND sqlm LIKE '%40%', COALESCE(sqlm,'not refused'));

  -- The permitted departure is accepted.
  ovr := public.supervisory_calculation_override_propose(
    (SELECT v FROM r2b_id WHERE k='assessment'),'MEDIUM_HIGH',
    'R2BCERT: a one-step upward departure that the judgement policy expressly permits.');
  RESET ROLE;
  INSERT INTO r2b_id(k,v) VALUES ('override', ovr);
  SELECT * INTO o FROM public.supervisory_assessment_calculation_override x WHERE x.id = ovr;

  INSERT INTO r2b VALUES ('R2B-45-PERMITTED-PROPOSAL-ACCEPTED',
    o.status = 'PENDING_APPROVAL' AND o.proposed_rating = 'MEDIUM_HIGH',
    format('status=%s target=%s', o.status, o.proposed_rating));

  INSERT INTO r2b VALUES ('R2B-46-PROVENANCE-POLICY-VERSION',
    o.judgement_policy_component_id = (SELECT v FROM r2b_id WHERE k='component')
      AND o.judgement_policy_code = 'R2BCERT-JUD' AND o.judgement_policy_version = '1.0',
    format('policy=%s v%s', o.judgement_policy_code, o.judgement_policy_version));

  INSERT INTO r2b VALUES ('R2B-47-PROVENANCE-RULE-AND-MOVEMENT',
    o.judgement_rule_code = 'R2BCERT-MOD' AND o.judgement_direction = 'UPWARD'
      AND o.judgement_band_steps = 1 AND o.judgement_max_band_steps = 1,
    format('rule=%s direction=%s steps=%s/%s', o.judgement_rule_code, o.judgement_direction,
           o.judgement_band_steps, o.judgement_max_band_steps));

  INSERT INTO r2b VALUES ('R2B-48-PROVENANCE-BASIS-AND-EVALUATION',
    o.policy_basis_status = 'EVALUATED' AND o.judgement_policy_profile_code = 'R2BCERT-PROFILE'
      AND o.judgement_evaluation IS NOT NULL
      AND o.judgement_rationale_min_length = 40,
    format('basis=%s profile=%s min=%s', o.policy_basis_status,
           o.judgement_policy_profile_code, o.judgement_rationale_min_length));

  INSERT INTO r2b VALUES ('R2B-49-COMPUTED-RESULT-CAPTURED',
    o.computed_recommended_rating = 'MODERATE' AND o.computed_result_hash = 'r2bcert-out',
    format('calculated=%s hash=%s', o.computed_recommended_rating, o.computed_result_hash));
END $$;

-- Second proposal while one is pending is refused.
DO $$
DECLARE refused boolean := false; sqlm text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_calculation_override_propose(
      (SELECT v FROM r2b_id WHERE k='assessment'),'MEDIUM_HIGH',
      'R2BCERT: a second proposal while one already awaits a decision, refused by the platform.');
  EXCEPTION WHEN others THEN refused := true; sqlm := SQLERRM; END;
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-50-ONE-PENDING-PROPOSAL', refused, COALESCE(sqlm,'not refused'));
END $$;

-- =====================================================================
-- DECISION — independent approval is enforced by the platform
-- =====================================================================
DO $$
DECLARE refused boolean := false; sqlm text; o public.supervisory_assessment_calculation_override;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_calculation_override_decide(
      (SELECT v FROM r2b_id WHERE k='override'),'APPROVED',
      'R2BCERT: the proposer attempting to approve their own departure.');
  EXCEPTION WHEN others THEN refused := true; sqlm := SQLERRM; END;
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-51-NO-SELF-APPROVAL', refused, COALESCE(sqlm,'not refused'));

  refused := false;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_calculation_override_decide(
      (SELECT v FROM r2b_id WHERE k='override'),'APPROVED',
      'R2BCERT: a persona with no supervisory authority attempting to decide.');
  EXCEPTION WHEN others THEN refused := true; sqlm := SQLERRM; END;
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-52-DECISION-NEEDS-AUTHORITY', refused, COALESCE(sqlm,'not refused'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_override_decide(
    (SELECT v FROM r2b_id WHERE k='override'),'APPROVED',
    'R2BCERT: an independent approval of the permitted departure.');
  RESET ROLE;
  SELECT * INTO o FROM public.supervisory_assessment_calculation_override
   WHERE id = (SELECT v FROM r2b_id WHERE k='override');
  INSERT INTO r2b VALUES ('R2B-53-INDEPENDENT-APPROVAL-RECORDED',
    o.status = 'APPROVED' AND o.decided_by <> o.proposed_by AND o.decided_at IS NOT NULL,
    format('status=%s decided_by<>proposed_by=%s', o.status, o.decided_by <> o.proposed_by));

  refused := false;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_calculation_override_decide(
      (SELECT v FROM r2b_id WHERE k='override'),'REJECTED',
      'R2BCERT: attempting to decide an already decided departure.');
  EXCEPTION WHEN others THEN refused := true; sqlm := SQLERRM; END;
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-54-DECISION-IS-FINAL', refused, COALESCE(sqlm,'not refused'));
END $$;

-- =====================================================================
-- SECURITY — direct writes and internal functions are closed
-- =====================================================================
DO $$
DECLARE refused int := 0; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    INSERT INTO public.supervisory_assessment_calculation_override(
      assessment_id, run_id, computed_result_hash, proposed_rating, rationale, status)
    VALUES ((SELECT v FROM r2b_id WHERE k='assessment'), gen_random_uuid(),'x','SEVERE',
            'R2BCERT forged departure bypassing the judgement policy','APPROVED');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN
    UPDATE public.supervisory_assessment_calculation_override
       SET proposed_rating = 'SEVERE'
     WHERE id = (SELECT v FROM r2b_id WHERE k='override');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN
    DELETE FROM public.supervisory_assessment_calculation_override
     WHERE id = (SELECT v FROM r2b_id WHERE k='override');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-60-DIRECT-WRITES-REFUSED', refused = 3,
    format('%s of 3 direct writes to the override register were refused', refused));

  SELECT count(*) INTO n FROM pg_trigger t
   WHERE t.tgrelid = 'public.supervisory_assessment_calculation_override'::regclass
     AND NOT t.tgisinternal;
  INSERT INTO r2b VALUES ('R2B-61-GUARD-TRIGGER-PRESENT', n >= 1,
    format('%s guard trigger(s) protect the override register', n));

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_assessment_judgement_policy_internal'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO r2b VALUES ('R2B-62-INTERNAL-EVALUATOR-PRIVATE', n = 0,
    'the internal judgement evaluator is not callable by a signed-in identity');

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('supervisory_assessment_judgement_policy_view',
                                               'supervisory_judgement_policy_authoring_options')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO r2b VALUES ('R2B-63-READ-MODELS-ARE-THE-PUBLIC-PATH', n = 2,
    format('%s of 2 governed read models are callable by a signed-in identity', n));

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('supervisory_assessment_judgement_policy_internal',
                       'supervisory_assessment_judgement_policy_view',
                       'supervisory_judgement_policy_rules',
                       'supervisory_judgement_policy_content_errors',
                       'supervisory_judgement_policy_compatibility',
                       'supervisory_methodology_rating_order',
                       'supervisory_judgement_policy_authoring_options')
     AND p.proconfig::text LIKE '%search_path%';
  INSERT INTO r2b VALUES ('R2B-64-SEARCH-PATH-PINNED', n = 7,
    format('%s of 7 judgement policy functions pin search_path', n));

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_calculation_override_guard'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO r2b VALUES ('R2B-65-GUARD-NOT-CALLABLE', n = 0,
    'the override guard is not callable by a signed-in identity');
END $$;

-- =====================================================================
-- READMODEL — the governed read model a screen may use
-- =====================================================================
DO $$
DECLARE jv jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  jv := public.supervisory_assessment_judgement_policy_view((SELECT v FROM r2b_id WHERE k='assessment'));
  RESET ROLE;

  INSERT INTO r2b VALUES ('R2B-70-VIEW-RETURNS-EVALUATION',
    (jv->'evaluation'->>'status') = 'EVALUATED', format('status=%s', jv->'evaluation'->>'status'));
  INSERT INTO r2b VALUES ('R2B-71-VIEW-RETURNS-HISTORY',
    jsonb_array_length(jv->'overrides') >= 1 AND jv->'overrides'->0->>'judgement_rule_code' = 'R2BCERT-MOD',
    format('%s override(s) with policy provenance', jsonb_array_length(jv->'overrides')));
  INSERT INTO r2b VALUES ('R2B-72-VIEW-OWNS-CAPABILITIES',
    (jv->'capabilities') ? 'can_propose_override' AND (jv->'capabilities') ? 'can_decide_override',
    format('capabilities=%s', jv->'capabilities'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_judgement_policy_view(
      (SELECT v FROM r2b_id WHERE k='assessment'));
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-73-VIEW-SCOPED-TO-AUTHORITY', refused,
    'a persona outside the supervisory authority cannot read the judgement policy state');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  jv := public.supervisory_judgement_policy_authoring_options((SELECT v FROM r2b_id WHERE k='component'));
  RESET ROLE;
  INSERT INTO r2b VALUES ('R2B-74-AUTHORING-VOCABULARY-IS-SERVER-OWNED',
    jsonb_array_length(COALESCE(jv->'ratings','[]'::jsonb)) >= 1
      AND jsonb_array_length(COALESCE(jv->'directions','[]'::jsonb)) = 3,
    format('%s rating(s), %s direction(s)',
           jsonb_array_length(COALESCE(jv->'ratings','[]'::jsonb)),
           jsonb_array_length(COALESCE(jv->'directions','[]'::jsonb))));
END $$;

-- =====================================================================
-- COMPATIBILITY & CAPABILITY
-- =====================================================================
DO $$
DECLARE jv jsonb; n int; caps jsonb; c jsonb;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_judgement_policy_compatibility';
  INSERT INTO r2b VALUES ('R2B-80-COMPATIBILITY-EXISTS', n = 1,
    format('%s compatibility function(s)', n));

  jv := public.supervisory_judgement_policy_compatibility(NULL,
          (SELECT v FROM r2b_id WHERE k='component'), (SELECT v FROM r2b_id WHERE k='meth'));
  INSERT INTO r2b VALUES ('R2B-81-COMPATIBLE-CONTENT-CLEARS',
    jsonb_array_length(COALESCE(jv,'[]'::jsonb)) = 0, format('findings=%s', jv));

  -- An unknown rating in the policy is incompatible with the methodology.
  -- Approved content is immutable, so the incompatible cases are authored as
  -- separate draft versions rather than by editing the active one.
  INSERT INTO public.supervisory_policy_component(
    component_type, code, component_version, name, domain_code, regulator_id, origin, status, content)
  VALUES ('JUDGEMENT_POLICY','R2BCERT-JUD-BAD','1.0','R2BCERT unknown rating','AML_CFT',
    (SELECT v FROM r2b_id WHERE k='regulator'),'REGULATOR_AUTHORED','DRAFT',
    jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'rule_code','R2BCERT-BAD','applies_to_ratings', jsonb_build_array('CATASTROPHIC')))));
  jv := public.supervisory_judgement_policy_compatibility(NULL,
          (SELECT id FROM public.supervisory_policy_component WHERE code='R2BCERT-JUD-BAD'),
          (SELECT v FROM r2b_id WHERE k='meth'));
  INSERT INTO r2b VALUES ('R2B-82-UNKNOWN-RATING-INCOMPATIBLE',
    jsonb_array_length(COALESCE(jv,'[]'::jsonb)) >= 1, format('findings=%s', jv));

  -- A step limit larger than the rating scale allows is reported.
  INSERT INTO public.supervisory_policy_component(
    component_type, code, component_version, name, domain_code, regulator_id, origin, status, content)
  VALUES ('JUDGEMENT_POLICY','R2BCERT-JUD-BIG','1.0','R2BCERT impossible movement','AML_CFT',
    (SELECT v FROM r2b_id WHERE k='regulator'),'REGULATOR_AUTHORED','DRAFT',
    jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'rule_code','R2BCERT-BIG','applies_to_ratings', jsonb_build_array('LOW'),
      'max_band_steps', 12))));
  jv := public.supervisory_judgement_policy_compatibility(NULL,
          (SELECT id FROM public.supervisory_policy_component WHERE code='R2BCERT-JUD-BIG'),
          (SELECT v FROM r2b_id WHERE k='meth'));
  INSERT INTO r2b VALUES ('R2B-83-IMPOSSIBLE-MOVEMENT-INCOMPATIBLE',
    jsonb_array_length(COALESCE(jv,'[]'::jsonb)) >= 1, format('findings=%s', jv));

  -- Capability truth: JUDGEMENT_POLICY is runtime consumed, the eight
  -- remaining generic areas are not.
  caps := public.supervisory_policy_capability_state();
  SELECT x INTO c FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(caps) = 'array' THEN caps ELSE COALESCE(caps->'areas','[]'::jsonb) END) x
   WHERE x->>'area' = 'JUDGEMENT_POLICY' OR x->>'component_type' = 'JUDGEMENT_POLICY';
  INSERT INTO r2b VALUES ('R2B-84-CAPABILITY-JUDGEMENT-RUNTIME',
    COALESCE((c->>'runtime_consumed')::boolean, false), format('judgement capability=%s', c));

  SELECT count(*) INTO n FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(caps) = 'array' THEN caps ELSE COALESCE(caps->'areas','[]'::jsonb) END) x
   WHERE COALESCE((x->>'runtime_consumed')::boolean, false)
     AND COALESCE(x->>'area', x->>'component_type') NOT IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY');
  INSERT INTO r2b VALUES ('R2B-85-OTHER-AREAS-STILL-CONFIGURATION-ONLY', n = 0,
    format('%s area(s) beyond evidence and judgement claim runtime behaviour', n));
END $$;

-- =====================================================================
-- LEGACY — an assessment without a policy basis is not retro-governed
-- =====================================================================
DO $$
DECLARE a uuid; jv jsonb;
BEGIN
  SELECT sa.id INTO a FROM public.supervisory_assessment sa
    LEFT JOIN public.supervisory_assessment_policy_snapshot s ON s.assessment_id = sa.id
   WHERE s.id IS NULL AND sa.reference <> 'R2BCERT-ASSESS-1' LIMIT 1;
  IF a IS NULL THEN
    INSERT INTO r2b VALUES ('R2B-90-LEGACY-NOT-GOVERNED', true,
      'no assessment without a policy basis exists to test');
  ELSE
    jv := public.supervisory_assessment_judgement_policy_internal(a);
    INSERT INTO r2b VALUES ('R2B-90-LEGACY-NOT-GOVERNED',
      (jv->>'status') = 'NOT_GOVERNED' AND (jv->>'reason_code') = 'NO_POLICY_BASIS'
        AND NOT (jv->>'governed')::boolean,
      format('status=%s reason=%s', jv->>'status', jv->>'reason_code'));
    INSERT INTO r2b VALUES ('R2B-91-LEGACY-PLATFORM-CONTROLS-REMAIN',
      (jv->>'independent_approval_required')::boolean AND (jv->>'rationale_min_length')::int >= 10,
      'independent approval and a written reason still apply without a judgement policy');
  END IF;
END $$;

-- =====================================================================
-- RESULTS
-- =====================================================================
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM r2b ORDER BY gate;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total
  FROM r2b;

DO $$
DECLARE n int; f text;
BEGIN
  SELECT count(*) INTO n FROM r2b WHERE NOT ok;
  IF n > 0 THEN
    SELECT string_agg(gate || ' — ' || detail, E'\n') INTO f FROM r2b WHERE NOT ok;
    RAISE WARNING E'PCOMP-R2B FAILED GATES (%):\n%', n, f;
  ELSE
    RAISE NOTICE 'PCOMP-R2B: every gate passed';
  END IF;
END $$;

ROLLBACK;

-- =====================================================================
-- PRESERVATION — nothing this certification did survives, and no
-- existing policy, rating, override or risk record changed.
-- =====================================================================
SELECT
  (SELECT count(*) FROM public.supervisory_policy_component)::text = :'pre_components'
    AS components_preserved,
  (SELECT count(*) FROM public.supervisory_assessment)::text = :'pre_assessments'
    AS assessments_preserved,
  (SELECT count(*) FROM public.supervisory_assessment_calculation_override)::text = :'pre_overrides'
    AS overrides_preserved,
  (SELECT count(*) FROM public.supervisory_assessment_calculation_run)::text = :'pre_runs'
    AS calculation_runs_preserved,
  (SELECT count(*) FROM public.entity_risk_state_movement)::text = :'pre_movements'
    AS risk_movements_preserved,
  (SELECT count(*) FROM public.supervisory_assessment_risk_publication)::text = :'pre_publications'
    AS publications_preserved,
  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
              '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) = :'pre_risk_digest'
    AS risk_of_record_unchanged,
  (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'R2BCERT%') = 0
    AS no_fixture_methodology_survived,
  (SELECT count(*) FROM public.supervisory_policy_component WHERE code LIKE 'R2BCERT%') = 0
    AS no_fixture_policy_survived;
