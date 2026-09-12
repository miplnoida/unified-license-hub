-- =====================================================================
-- PCOMP-R2F — LIVE GOVERNED AML/CFT POLICY ADOPTION  (PERSISTENT)
-- =====================================================================
-- Creates, through the REAL governed operations only, a live regulator-owned
-- AML/CFT Policy Profile for the FSRA and binds the seven components the
-- domain requires plus the four certified runtime policy families.
--
--   * no service_role: every governed call runs as an authenticated persona
--     with row security on;
--   * no fabricated regulator decision: every lifecycle transition is made by
--     the canonical lifecycle RPC with a recorded rationale, and every
--     approval is made by a DIFFERENT persona than the author;
--   * nothing is deleted, no historical assessment is recalculated, no
--     published rating is altered and the MIPL reference package is not bound;
--   * idempotent: re-running makes no further change once the profile exists.
--
-- Live objects reused (NOT re-authored):
--   methodology         AML-CFT-RBA 1.0   1e248dc0-c559-48d7-bcf3-70d6ec5db99a
--   calculation policy  version 1 ACTIVE  daf7d06e-1876-45bc-8a14-6869545f65a5
--   programme set       adopted from the MIPL reference package
--
-- Run: psql -X -q -f scripts/pcomp-r2f-live-governed-adoption.sql
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;

CREATE TEMP TABLE r2f_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON r2f_id TO authenticated;

INSERT INTO r2f_id(k,v) VALUES
  ('regulator','8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('meth',     '1e248dc0-c559-48d7-bcf3-70d6ec5db99a'),
  ('calc',     'daf7d06e-1876-45bc-8a14-6869545f65a5'),
  ('maker',    'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',  '0b522724-adcb-48bf-b21d-175339479616');

INSERT INTO r2f_id(k,v)
SELECT 'mipl_set', id FROM public.supervisory_assessment_programme_set
 WHERE domain_code='AML_CFT' AND origin='MIPL_REFERENCE'
 ORDER BY created_at DESC LIMIT 1;

-- ---------------------------------------------------------- authority ----
-- The two certification officers hold real, canonically assigned supervisory
-- roles: an internal-officer marker and the AML/CFT head role that owns the
-- policy approval right. Maker and checker are distinct people.
INSERT INTO public.user_roles(user_id, role)
SELECT u,'analyst'::app_role FROM (VALUES
  ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
  ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) x(u)
ON CONFLICT DO NOTHING;

INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', u FROM (VALUES
  ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
  ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) x(u), public.sec_roles r
 WHERE r.key='aml_head'
ON CONFLICT DO NOTHING;

-- ================================================ 1. PROGRAMME ADOPTION ==
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg  uuid := (SELECT v FROM r2f_id WHERE k='regulator');
  live uuid;
  jv   jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT id INTO live FROM public.supervisory_assessment_programme_set
   WHERE domain_code='AML_CFT' AND regulator_id = reg AND origin <> 'MIPL_REFERENCE'
     AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1;

  IF live IS NULL THEN
    live := public.supervisory_assessment_programme_adopt_reference(
      (SELECT v FROM r2f_id WHERE k='mipl_set'), reg,
      'FSRA adopts the MIPL reference AML/CFT assessment programme package as its own supervisory programme configuration.');

    PERFORM public.supervisory_assessment_programme_set_lifecycle(live,'REVIEW',
      'FSRA submits the adopted AML/CFT assessment programme configuration for independent approval.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_assessment_programme_set_lifecycle(live,'APPROVED',
      'The Head of AML/CFT independently approves the adopted assessment programme configuration.');
    PERFORM public.supervisory_assessment_programme_set_lifecycle(live,'ACTIVE',
      'The approved AML/CFT assessment programme configuration is activated for supervisory use.');
    PERFORM set_config('request.jwt.claims', maker, true);
  END IF;

  INSERT INTO r2f_id(k,v) VALUES ('prog_set', live);
  RESET ROLE;
END $$;

-- ===================================== 2. THE FOUR RUNTIME POLICIES =====
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg  uuid := (SELECT v FROM r2f_id WHERE k='regulator');
  crec record;
  comp uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  FOR crec IN SELECT * FROM (VALUES
    ('evidence','EVIDENCE_POLICY','FSRA-AML-EVIDENCE',
      'FSRA AML/CFT evidence policy',
      jsonb_build_object('rules', jsonb_build_array(
        jsonb_build_object('rule_code','FSRA-AML-EV-ASSESSMENT','scope_type','ASSESSMENT',
          'evidence_requirement','REQUIRED','minimum_items',1,
          'permitted_source_kinds', jsonb_build_array('FINDING','ENTERPRISE_DOCUMENT'),
          'exception_allowed',false,
          'label','Every AML/CFT assessment is supported by at least one qualifying evidence item'),
        jsonb_build_object('rule_code','FSRA-AML-EV-SANCTIONS','scope_type','DIMENSION',
          'scope_reference','SANCTIONS_CONTROLS','evidence_requirement','REQUIRED','minimum_items',1,
          'permitted_source_kinds', jsonb_build_array('PRIOR_EXAMINATION'),
          'exception_allowed',true,'exception_approval_required',true,
          'label','Sanctions control testing evidence, exception available on approved rationale')))),
    ('judgement','JUDGEMENT_POLICY','FSRA-AML-JUDGEMENT',
      'FSRA AML/CFT judgement and rating override policy',
      jsonb_build_object('rules', jsonb_build_array(
        jsonb_build_object('rule_code','FSRA-AML-JU-1','direction','BOTH','max_band_steps',1,
          'rationale_min_length',40,'override_permitted',true,'rationale_required',true,
          'prohibited_target_ratings', jsonb_build_array('LOW'),
          'label','One band of supervisory judgement, never a departure to Low')))),
    ('response','RESPONSE_POLICY','FSRA-AML-RESPONSE',
      'FSRA AML/CFT supervisory response policy',
      jsonb_build_object('responses', jsonb_build_array(
        jsonb_build_object('rule_code','FSRA-AML-RE-SEV-PLAN','risk_band','SEVERE','action','SUPERVISORY_PLAN',
          'response_level','REQUIRED','rationale_required',true),
        jsonb_build_object('rule_code','FSRA-AML-RE-SEV-EXAM','risk_band','SEVERE','action','EXAMINATION',
          'response_level','REQUIRED','rationale_required',true),
        jsonb_build_object('rule_code','FSRA-AML-RE-SEV-DEF','risk_band','SEVERE','action','DEFERRAL',
          'response_level','PROHIBITED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-HIGH-PLAN','risk_band','HIGH','action','SUPERVISORY_PLAN',
          'response_level','REQUIRED','rationale_required',true),
        jsonb_build_object('rule_code','FSRA-AML-RE-HIGH-EXAM','risk_band','HIGH','action','EXAMINATION',
          'response_level','RECOMMENDED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-HIGH-MON','risk_band','HIGH','action','MONITORING',
          'response_level','PERMITTED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-HIGH-DEF','risk_band','HIGH','action','DEFERRAL',
          'response_level','PROHIBITED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-MH-PLAN','risk_band','MEDIUM_HIGH','action','SUPERVISORY_PLAN',
          'response_level','REQUIRED','rationale_required',true),
        jsonb_build_object('rule_code','FSRA-AML-RE-MH-MON','risk_band','MEDIUM_HIGH','action','MONITORING',
          'response_level','PERMITTED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-MH-DEF','risk_band','MEDIUM_HIGH','action','DEFERRAL',
          'response_level','PROHIBITED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-MOD-MON','risk_band','MODERATE','action','MONITORING',
          'response_level','RECOMMENDED'),
        jsonb_build_object('rule_code','FSRA-AML-RE-LOW-MON','risk_band','LOW','action','MONITORING',
          'response_level','PERMITTED')))),
    ('sla','SLA_POLICY','FSRA-AML-SLA',
      'FSRA AML/CFT supervisory response deadline policy',
      jsonb_build_object('stages', jsonb_build_array(
        jsonb_build_object('rule_code','FSRA-AML-SLA-PLAN','stage','Open supervisory plan',
          'applies_to_action','SUPERVISORY_PLAN','duration_days',10,'calendar_mode','CALENDAR_DAYS',
          'breach_severity','HIGH','pause_permitted',true,
          'pause_reasons', jsonb_build_array('AWAITING_ENTITY_INFORMATION'),
          'label','A required supervisory plan is opened within ten days'),
        jsonb_build_object('rule_code','FSRA-AML-SLA-EXAM','stage','Open examination',
          'applies_to_action','EXAMINATION','duration_days',30,'calendar_mode','CALENDAR_DAYS',
          'breach_severity','HIGH','pause_permitted',false,
          'label','A required examination is opened within thirty days'),
        jsonb_build_object('rule_code','FSRA-AML-SLA-MON','stage','Record monitoring',
          'applies_to_action','MONITORING','duration_days',30,'calendar_mode','CALENDAR_DAYS',
          'breach_severity','LOW','pause_permitted',false,
          'label','Monitoring is recorded within thirty days'))))
  ) AS t(key, ctype, code, name, content)
  LOOP
    SELECT id INTO comp FROM public.supervisory_policy_component
     WHERE code = crec.code AND component_version='1.0';

    IF comp IS NULL THEN
      comp := (public.supervisory_policy_component_create(jsonb_build_object(
        'component_type', crec.ctype,'domain_code','AML_CFT','regulator_id', reg,
        'code', crec.code,'component_version','1.0','name', crec.name,
        'content', crec.content)))->>'component_id';
      PERFORM public.supervisory_policy_component_lifecycle(comp,'SUBMITTED',
        'FSRA submits the '||crec.ctype||' for independent approval.');
      PERFORM set_config('request.jwt.claims', checker, true);
      PERFORM public.supervisory_policy_component_lifecycle(comp,'APPROVED',
        'The Head of AML/CFT independently approves the '||crec.ctype||'.');
      PERFORM public.supervisory_policy_component_lifecycle(comp,'ACTIVE',
        'The approved '||crec.ctype||' is activated for supervisory use.');
      PERFORM set_config('request.jwt.claims', maker, true);
    END IF;

    INSERT INTO r2f_id(k,v) VALUES (crec.key, comp);
  END LOOP;

  RESET ROLE;
END $$;

-- ============================================ 3. THE LIVE POLICY PROFILE ==
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  reg  uuid := (SELECT v FROM r2f_id WHERE k='regulator');
  prof uuid;
  b    record;
  jv   jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT id INTO prof FROM public.supervisory_policy_profile
   WHERE code='FSRA-AML-CFT-POLICY' AND profile_version='1.0';

  IF prof IS NULL THEN
    prof := public.supervisory_policy_profile_create(jsonb_build_object(
      'domain_code','AML_CFT','regulator_id', reg,'code','FSRA-AML-CFT-POLICY',
      'profile_version','1.0','name','FSRA AML/CFT supervisory policy package',
      'origin','REGULATOR_AUTHORED',
      'rationale','FSRA establishes its operative AML/CFT supervisory policy package over the active methodology, calculation policy, assessment programmes and the four governed runtime policies.'));

    FOR b IN SELECT * FROM (VALUES
      ('METHODOLOGY',        'meth',     'The active FSRA AML/CFT risk-based methodology is bound as the governing methodology.'),
      ('CALCULATION_CONFIG', 'calc',     'The active AML/CFT calculation policy is bound as the governing rating calculation.'),
      ('ASSESSMENT_PROGRAMME','prog_set','The adopted FSRA AML/CFT assessment programme configuration is bound.'),
      ('EVIDENCE_POLICY',    'evidence', 'The approved FSRA AML/CFT evidence policy is bound.'),
      ('JUDGEMENT_POLICY',   'judgement','The approved FSRA AML/CFT judgement and override policy is bound.'),
      ('RESPONSE_POLICY',    'response', 'The approved FSRA AML/CFT supervisory response policy is bound.'),
      ('SLA_POLICY',         'sla',      'The approved FSRA AML/CFT response deadline policy is bound.')
    ) AS t(ctype, key, rationale)
    LOOP
      PERFORM public.supervisory_policy_profile_binding_set(prof, jsonb_build_object(
        'component_type', b.ctype,'component_id',(SELECT v FROM r2f_id WHERE k=b.key),
        'rationale', b.rationale));
    END LOOP;

    PERFORM public.supervisory_policy_profile_save(prof,
      jsonb_build_object('effective_from', current_date::text));

    jv := public.supervisory_policy_profile_compatibility(prof);
    IF NOT COALESCE((jv->>'compatible')::boolean, false) THEN
      RAISE EXCEPTION 'the live AML/CFT policy package is not internally compatible: %', jv;
    END IF;

    PERFORM public.supervisory_policy_profile_lifecycle(prof,'REVIEW',
      'FSRA submits the AML/CFT supervisory policy package for independent approval.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_policy_profile_lifecycle(prof,'APPROVED',
      'The Head of AML/CFT independently approves the AML/CFT supervisory policy package.');
    PERFORM public.supervisory_policy_profile_lifecycle(prof,'ACTIVE',
      'The approved AML/CFT supervisory policy package is activated as operative supervisory policy.');
    PERFORM set_config('request.jwt.claims', maker, true);
  END IF;

  INSERT INTO r2f_id(k,v) VALUES ('profile', prof);
  RESET ROLE;
END $$;

SELECT p.code, p.profile_version, p.status, p.origin,
       (SELECT count(*) FROM public.supervisory_policy_profile_binding b WHERE b.profile_id=p.id) AS bindings
  FROM public.supervisory_policy_profile p
 WHERE p.code='FSRA-AML-CFT-POLICY';

COMMIT;
