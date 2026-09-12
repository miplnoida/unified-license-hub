-- =====================================================================
-- PCOMP-R2F — LIVE GOVERNED ADOPTION : CERTIFICATION
-- =====================================================================
-- Verifies the RETAINED live state produced by
--   scripts/pcomp-r2f-live-governed-adoption.sql
--   scripts/pcomp-r2f-live-governed-chain.sql
-- and then proves, ROLLBACK-ONLY, version rollover and the negative
-- governance gates. Nothing this script creates survives; the retained live
-- policy package, assessment, rating, publication and history are not
-- modified, and the preservation gates re-check them after the rollback.
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2f-live-governed-adoption.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;

SELECT (SELECT count(*)::text FROM public.supervisory_policy_profile) AS pre_profiles,
       (SELECT count(*)::text FROM public.supervisory_assessment)     AS pre_assessments,
       (SELECT count(*)::text FROM public.entity_risk_state_movement) AS pre_movements,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                            '|' ORDER BY r.entity_id, r.domain_code),''))
          FROM public.entity_risk_state r) AS pre_risk_digest
\gset

BEGIN;

CREATE TEMP TABLE r2f(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE r2f_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON r2f TO authenticated;
GRANT ALL ON r2f_id TO authenticated;

INSERT INTO r2f_id(k,v) VALUES
  ('regulator','8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('meth',     '1e248dc0-c559-48d7-bcf3-70d6ec5db99a'),
  ('calc',     'daf7d06e-1876-45bc-8a14-6869545f65a5');
INSERT INTO r2f_id(k,v) SELECT 'profile', id FROM public.supervisory_policy_profile
 WHERE code='FSRA-AML-CFT-POLICY' AND profile_version='1.0';
INSERT INTO r2f_id(k,v) SELECT 'entity', id FROM public.licensees WHERE name LIKE 'DEMO AML 22%';
INSERT INTO r2f_id(k,v) SELECT 'assessment', id FROM public.supervisory_assessment
 WHERE summary LIKE '%PCOMP-R2F LIVE CASE%';

-- =====================================================================
-- A. THE RETAINED LIVE PACKAGE
-- =====================================================================
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  prof uuid := (SELECT v FROM r2f_id WHERE k='profile');
  ent  uuid := (SELECT v FROM r2f_id WHERE k='entity');
  a    uuid := (SELECT v FROM r2f_id WHERE k='assessment');
  jv jsonb; n int; ob record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  INSERT INTO r2f VALUES ('R2F-A1-LIVE-PROFILE-ACTIVE',
    EXISTS (SELECT 1 FROM public.supervisory_policy_profile p
             WHERE p.id = prof AND p.status='ACTIVE' AND p.origin='REGULATOR_AUTHORED'
               AND p.regulator_id = (SELECT v FROM r2f_id WHERE k='regulator')),
    (SELECT format('%s version %s, %s, %s', p.code, p.profile_version, p.status, p.origin)
       FROM public.supervisory_policy_profile p WHERE p.id = prof));

  SELECT count(*) INTO n FROM public.supervisory_policy_profile_binding b WHERE b.profile_id = prof;
  INSERT INTO r2f VALUES ('R2F-A2-SEVEN-EXACT-BINDINGS', n = 7,
    format('%s exact component bindings', n));

  INSERT INTO r2f VALUES ('R2F-A3-NO-REFERENCE-CONTENT-BOUND',
    NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile_binding b
                  JOIN public.supervisory_policy_component c ON c.id = b.component_id
                 WHERE b.profile_id = prof AND c.origin='MIPL_REFERENCE')
    AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile_binding b
                      JOIN public.supervisory_assessment_programme_set s ON s.id = b.component_id
                     WHERE b.profile_id = prof AND s.origin='MIPL_REFERENCE')
    AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile_binding b
                      JOIN public.supervisory_methodology m ON m.id = b.component_id
                     WHERE b.profile_id = prof AND m.origin='MIPL_REFERENCE'),
    'no MIPL reference content is operative policy');

  INSERT INTO r2f VALUES ('R2F-A4-BOUND-POLICIES-APPROVED',
    NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile_binding b
                  JOIN public.supervisory_policy_component c ON c.id = b.component_id
                 WHERE b.profile_id = prof AND c.status NOT IN ('APPROVED','ACTIVE')),
    (SELECT string_agg(c.component_type||'='||c.status, ', ' ORDER BY c.component_type)
       FROM public.supervisory_policy_profile_binding b
       JOIN public.supervisory_policy_component c ON c.id = b.component_id
      WHERE b.profile_id = prof));

  jv := public.supervisory_policy_profile_resolve('AML_CFT',
          (SELECT v FROM r2f_id WHERE k='regulator'), (SELECT sector_id FROM public.licensees WHERE id = ent));
  INSERT INTO r2f VALUES ('R2F-A5-SERVER-RESOLVES-THE-LIVE-PACKAGE',
    (jv->>'status')='RESOLVED' AND (jv->>'profile_code')='FSRA-AML-CFT-POLICY',
    format('%s -> %s version %s', jv->>'status', jv->>'profile_code', jv->>'profile_version'));

  -- ------------------------------------------------ the retained assessment
  jv := public.supervisory_assessment_policy_basis(a);
  INSERT INTO r2f VALUES ('R2F-A6-IMMUTABLE-POLICY-BASIS',
    (jv->>'policy_profile_code')='FSRA-AML-CFT-POLICY' AND (jv->>'policy_profile_version')='1.0'
      AND (jv->>'content_hash') IS NOT NULL,
    format('%s version %s, fingerprint %s', jv->>'policy_profile_code', jv->>'policy_profile_version',
           left(COALESCE(jv->>'content_hash','-'),12)));

  BEGIN
    UPDATE public.supervisory_assessment_policy_snapshot SET policy_profile_version='9.9'
     WHERE assessment_id = a;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO r2f VALUES ('R2F-A7-POLICY-BASIS-CANNOT-BE-REWRITTEN', n = 0,
      format('%s row(s) changed (0 expected)', n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-A7-POLICY-BASIS-CANNOT-BE-REWRITTEN', true, left(SQLERRM,120));
  END;

  INSERT INTO r2f VALUES ('R2F-A8-CALCULATED-THEN-JUDGED',
    EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_run r
             WHERE r.assessment_id = a AND r.status='CALCULATED' AND r.recommended_rating='SEVERE')
      AND EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_override o
                   WHERE o.assessment_id = a AND o.status='APPROVED' AND o.proposed_rating='HIGH'
                     AND o.judgement_policy_version IS NOT NULL),
    'calculated SEVERE, one approved band of judgement to HIGH with policy provenance');

  INSERT INTO r2f VALUES ('R2F-A9-PUBLISHED-RISK-OF-RECORD',
    EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p WHERE p.assessment_id = a)
      AND (SELECT residual_rating FROM public.entity_risk_state
            WHERE entity_id = ent AND domain_code='AML_CFT') = 'HIGH',
    format('operative AML/CFT rating %s',
      (SELECT residual_rating FROM public.entity_risk_state WHERE entity_id = ent AND domain_code='AML_CFT')));

  INSERT INTO r2f VALUES ('R2F-A10-PRIOR-RATING-HISTORY-PRESERVED',
    (SELECT count(*) FROM public.entity_risk_state_movement m
      WHERE m.entity_id = ent AND m.domain_code='AML_CFT') >= 2,
    format('%s AML/CFT rating movement(s) on the entity record',
      (SELECT count(*) FROM public.entity_risk_state_movement m
        WHERE m.entity_id = ent AND m.domain_code='AML_CFT')));

  SELECT * INTO ob FROM public.supervisory_response_sla_obligation o
    JOIN public.supervisory_consequence_decision d ON d.id = o.decision_id
   WHERE d.assessment_id = a LIMIT 1;
  INSERT INTO r2f VALUES ('R2F-A11-RESPONSE-AND-DEADLINE-GOVERNED',
    ob.id IS NOT NULL AND ob.sla_policy_rule_code IS NOT NULL AND ob.outcome IN ('ON_TIME','LATE'),
    format('deadline under %s, outcome %s', ob.sla_policy_rule_code, ob.outcome));

  jv := public.supervisory_assessment_policy_trace(a);
  INSERT INTO r2f VALUES ('R2F-A12-INTEGRATED-TRACE',
    (SELECT count(*) FROM jsonb_array_elements(jv->'links') l WHERE l->>'status'='EVALUATED') = 4,
    format('%s of %s runtime stages governed',
      (SELECT count(*) FROM jsonb_array_elements(jv->'links') l WHERE l->>'status'='EVALUATED'),
      jsonb_array_length(jv->'links')));

  RESET ROLE;
END $$;

-- =====================================================================
-- B. ROLLOVER AND NEGATIVE GOVERNANCE  (rolled back)
-- =====================================================================
DO $$
DECLARE
  maker    text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker  text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  outsider text := '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}';
  prof uuid := (SELECT v FROM r2f_id WHERE k='profile');
  ent  uuid := (SELECT v FROM r2f_id WHERE k='entity');
  a    uuid := (SELECT v FROM r2f_id WHERE k='assessment');
  reg  uuid := (SELECT v FROM r2f_id WHERE k='regulator');
  v2 uuid; comp uuid; jv jsonb; a2 uuid; prog uuid; bad uuid;
BEGIN
  SET LOCAL ROLE authenticated;

  -- a governed successor evidence policy and a successor profile version
  PERFORM set_config('request.jwt.claims', maker, true);
  comp := public.supervisory_policy_component_new_version(
    (SELECT b.component_id FROM public.supervisory_policy_profile_binding b
      JOIN public.supervisory_policy_component c ON c.id = b.component_id
     WHERE b.profile_id = prof AND c.component_type='EVIDENCE_POLICY'),
    '1.1','R2FCERT successor evidence policy version, discarded on rollback.');
  PERFORM public.supervisory_policy_component_save(comp, jsonb_build_object(
    'content', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'rule_code','FSRA-AML-EV-ASSESSMENT','scope_type','ASSESSMENT','evidence_requirement','REQUIRED',
      'minimum_items',2,'permitted_source_kinds', jsonb_build_array('FINDING','ENTERPRISE_DOCUMENT'),
      'label','Two qualifying evidence items from version 1.1')))));
  PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED','R2FCERT submits the successor evidence policy.');

  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED','R2FCERT self-approval attempt.');
    INSERT INTO r2f VALUES ('R2F-B1-AUTHOR-CANNOT-APPROVE', false, 'the author approved their own policy');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-B1-AUTHOR-CANNOT-APPROVE', true, left(SQLERRM,130));
  END;

  PERFORM set_config('request.jwt.claims', outsider, true);
  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED','R2FCERT outsider approval attempt.');
    INSERT INTO r2f VALUES ('R2F-B2-OUTSIDER-CANNOT-APPROVE', false, 'an officer without AML authority approved policy');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-B2-OUTSIDER-CANNOT-APPROVE', true, left(SQLERRM,130));
  END;

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED','R2FCERT independent approval.');
  PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE','R2FCERT activation.');
  PERFORM set_config('request.jwt.claims', maker, true);

  v2 := public.supervisory_policy_profile_new_version(prof,'2.0',
    'R2FCERT successor policy package version, discarded on rollback.');
  PERFORM public.supervisory_policy_profile_binding_set(v2, jsonb_build_object(
    'component_type','EVIDENCE_POLICY','component_id', comp,
    'rationale','R2FCERT binds the successor evidence policy into version 2.0'));
  PERFORM public.supervisory_policy_profile_save(v2, jsonb_build_object('effective_from', current_date::text));
  PERFORM public.supervisory_policy_profile_lifecycle(v2,'REVIEW','R2FCERT submits version 2.0.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_profile_lifecycle(v2,'APPROVED','R2FCERT independent approval of version 2.0.');
  PERFORM public.supervisory_policy_profile_lifecycle(v2,'ACTIVE','R2FCERT activation of version 2.0.');
  PERFORM set_config('request.jwt.claims', maker, true);

  jv := public.supervisory_assessment_policy_basis(a);
  INSERT INTO r2f VALUES ('R2F-B3-ROLLOVER-DOES-NOT-REWRITE-HISTORY',
    (jv->>'policy_profile_version')='1.0',
    format('the retained assessment remains governed by version %s', jv->>'policy_profile_version'));

  jv := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2f VALUES ('R2F-B4-EVALUATION-STAYS-ON-PINNED-VERSION',
    ((jv->'evaluation')->>'policy_component_version')='1.0',
    format('evidence still judged against version %s', (jv->'evaluation')->>'policy_component_version'));

  jv := public.supervisory_assessment_programme_options_for_entity(ent,'AML_CFT');
  SELECT (p->>'programme_id')::uuid INTO prog FROM jsonb_array_elements(jv->'programmes') p
   WHERE p->>'assessment_type'='PERIODIC' LIMIT 1;
  jv := public.supervisory_assessment_create_programmed(ent,'AML_CFT', prog,'PERIODIC', NULL, NULL,
    'R2FCERT successor-version assessment, discarded on rollback.');
  a2 := (jv->>'id')::uuid;
  jv := public.supervisory_assessment_policy_basis(a2);
  INSERT INTO r2f VALUES ('R2F-B5-NEW-WORK-TAKES-THE-NEW-VERSION',
    (jv->>'policy_profile_version')='2.0',
    format('new supervisory work is governed by version %s', jv->>'policy_profile_version'));

  jv := public.supervisory_assessment_evidence_policy_view(a2);
  INSERT INTO r2f VALUES ('R2F-B6-NEW-VERSION-CHANGES-REQUIREMENTS',
    ((jv->'evaluation')->>'policy_component_version')='1.1',
    format('the new assessment is judged against evidence policy version %s',
      (jv->'evaluation')->>'policy_component_version'));

  -- an internally incompatible package can never become operative policy
  bad := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','AML_CFT','regulator_id', reg,'code','R2FCERT-INCOMPATIBLE',
    'profile_version','1.0','name','R2FCERT deliberately incompatible package',
    'origin','REGULATOR_AUTHORED','rationale','R2FCERT negative fixture, discarded on rollback.'));
  comp := (public.supervisory_policy_component_create(jsonb_build_object(
    'component_type','EVIDENCE_POLICY','domain_code','AML_CFT','regulator_id', reg,
    'code','R2FCERT-EVIDENCE-BAD','component_version','1.0',
    'name','R2FCERT evidence policy naming a dimension the methodology does not own',
    'content', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object(
      'rule_code','R2FCERT-EV-BAD','scope_type','DIMENSION','scope_reference','R2FCERT_NOT_A_DIMENSION',
      'evidence_requirement','REQUIRED','minimum_items',1,
      'permitted_source_kinds', jsonb_build_array('FINDING')))))))->>'component_id';
  PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED','R2FCERT submits the incompatible fixture.');
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED','R2FCERT approves the incompatible fixture.');
  PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE','R2FCERT activates the incompatible fixture.');
  PERFORM set_config('request.jwt.claims', maker, true);
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','METHODOLOGY','component_id',(SELECT v FROM r2f_id WHERE k='meth'),'rationale','R2FCERT fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','CALCULATION_CONFIG','component_id',(SELECT v FROM r2f_id WHERE k='calc'),'rationale','R2FCERT fixture'));
  PERFORM public.supervisory_policy_profile_binding_set(bad, jsonb_build_object(
    'component_type','EVIDENCE_POLICY','component_id', comp,'rationale','R2FCERT fixture'));
  jv := public.supervisory_policy_profile_compatibility(bad);
  INSERT INTO r2f VALUES ('R2F-B7-INCOMPATIBLE-PACKAGE-DETECTED',
    NOT COALESCE((jv->>'compatible')::boolean, true),
    format('%s compatibility finding(s)', jv->>'error_count'));

  BEGIN
    PERFORM public.supervisory_policy_profile_lifecycle(bad,'REVIEW','R2FCERT submits the incompatible package.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_policy_profile_lifecycle(bad,'APPROVED','R2FCERT approves the incompatible package.');
    INSERT INTO r2f VALUES ('R2F-B8-INCOMPATIBLE-PACKAGE-REFUSED', false,
      'an internally incompatible package was approved');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-B8-INCOMPATIBLE-PACKAGE-REFUSED', true, left(SQLERRM,140));
  END;

  RESET ROLE;
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r2f ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) AS total FROM r2f;

ROLLBACK;

-- =====================================================================
-- C. PRESERVATION AFTER ROLLBACK
-- =====================================================================
SELECT 'R2F-C1-NO-FIXTURE-SURVIVES' AS gate,
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile WHERE code LIKE 'R2FCERT%')
                 AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_component WHERE code LIKE 'R2FCERT%')
                 AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile
                                  WHERE code='FSRA-AML-CFT-POLICY' AND profile_version='2.0')
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'R2F-C2-LIVE-PACKAGE-UNCHANGED' AS gate,
       CASE WHEN (SELECT count(*) FROM public.supervisory_policy_profile
                   WHERE code='FSRA-AML-CFT-POLICY' AND profile_version='1.0' AND status='ACTIVE') = 1
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'R2F-C3-COUNTS-AND-RATINGS-UNCHANGED' AS gate,
       CASE WHEN (SELECT count(*) FROM public.supervisory_policy_profile) = :'pre_profiles'::int
                 AND (SELECT count(*) FROM public.supervisory_assessment) = :'pre_assessments'::int
                 AND (SELECT count(*) FROM public.entity_risk_state_movement) = :'pre_movements'::int
                 AND (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                                          '|' ORDER BY r.entity_id, r.domain_code),''))
                        FROM public.entity_risk_state r) = :'pre_risk_digest'
            THEN 'PASS' ELSE 'FAIL' END AS result;
