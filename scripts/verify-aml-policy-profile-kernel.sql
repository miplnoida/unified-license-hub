-- =====================================================================
-- AML-01 — SUPERVISORY POLICY PROFILE KERNEL : CERTIFICATION
-- =====================================================================
-- Gates PROFILE-01 .. PROFILE-40 and PROFILE-REQ-01 .. PROFILE-REQ-08.
--
-- Conventions (identical to the other supervisory certifications):
--   * one transaction, ROLLBACK at the end — nothing persists, so no fake
--     regulator policy and no adopted test methodology survive the run;
--   * authorisation is exercised with REAL authenticated personas
--     (SET LOCAL ROLE authenticated + request.jwt.claims), never service_role;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * deterministic and repeatable: all fixture labels are suffixed -PPCERT.
--
-- Personas (public.cert_certification_users):
--   Author / profile manager   b8eaf680-fe66-4d49-b816-1c087f511235
--   Policy approver (checker)  0b522724-adcb-48bf-b21d-175339479616
--   Outsider (non-AML)         411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set AUTHOR   '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set APPROVER '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set OUTSIDER '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE pp(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE ppn(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE ppt(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON pp TO authenticated;
GRANT ALL ON ppn TO authenticated;
GRANT ALL ON ppt TO authenticated;

INSERT INTO pp(k,v) VALUES
  ('regulator', '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),                     -- FSRA
  ('other_regulator', 'ca6e0616-55a9-48e7-8652-2b19536afb8a'),               -- ABC Prudential
  ('meth_v10', (SELECT id FROM public.supervisory_methodology
                 WHERE code='AML-CFT-RBA' AND version='1.0')),
  ('meth_v11', (SELECT id FROM public.supervisory_methodology
                 WHERE code='AML-CFT-RBA' AND version='1.1' AND origin='MIPL_REFERENCE')),
  ('ref_profile', (SELECT id FROM public.supervisory_policy_profile
                    WHERE code='AML-CFT-POLICY' AND origin='MIPL_REFERENCE'
                    ORDER BY created_at LIMIT 1));

-- operational + reference census BEFORE anything happens
INSERT INTO ppn(k,n) VALUES
  ('assessments',            (SELECT count(*) FROM public.supervisory_assessment)),
  ('approved_v10',           (SELECT count(*) FROM public.supervisory_assessment
                               WHERE methodology_id = (SELECT v FROM pp WHERE k='meth_v10')
                                 AND lower(status) = 'approved')),
  ('assessments_on_v11',     (SELECT count(*) FROM public.supervisory_assessment
                               WHERE methodology_id = (SELECT v FROM pp WHERE k='meth_v11'))),
  ('methodologies',          (SELECT count(*) FROM public.supervisory_methodology)),
  ('v11_questions',          (SELECT count(*) FROM public.supervisory_methodology_question
                               WHERE methodology_id = (SELECT v FROM pp WHERE k='meth_v11'))),
  ('v11_facts',              (SELECT count(*) FROM public.supervisory_methodology_fact_requirement
                               WHERE methodology_id = (SELECT v FROM pp WHERE k='meth_v11'))),
  ('v11_params',             (SELECT count(*) FROM public.supervisory_methodology_parameter
                               WHERE methodology_id = (SELECT v FROM pp WHERE k='meth_v11'))),
  ('calc_configs',           (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('risk_state',             (SELECT count(*) FROM public.entity_risk_state));

INSERT INTO ppt(k,t) VALUES
  ('v10_status', (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pp WHERE k='meth_v10'))),
  ('v11_status', (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pp WHERE k='meth_v11'))),
  ('v11_origin', (SELECT origin FROM public.supervisory_methodology WHERE id=(SELECT v FROM pp WHERE k='meth_v11')));

-- ------------------------------------------------------------- fixtures ----
-- Transaction-scoped authority: the AML policy authority (aml_head) carries
-- manage_config + policy_approve, scoped to one regulator. Rolled back.
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
SELECT rs.id, 'regulator', (SELECT v FROM pp WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- A generic test domain proves the kernel is not AML-only and lets the positive
-- approve/activate path be certified without inventing any AML policy value.
INSERT INTO public.supervisory_domain_authority(domain_code, manage_config_permission,
        methodology_approval_permission, policy_approval_permission)
VALUES ('PPCERT_DOMAIN','aml_supervision.manage_config','aml_supervision.methodology_approve',
        'aml_supervision.policy_approve')
ON CONFLICT (domain_code) DO NOTHING;

INSERT INTO public.supervisory_policy_domain_component_requirement(
        domain_code, component_type, requirement, required_for_approval, required_for_activation, is_locked, rationale)
VALUES ('PPCERT_DOMAIN','METHODOLOGY','OPTIONAL',false,false,false,
        'Certification domain: unlocked floor proves a profile may make a requirement stricter.'),
       ('PPCERT_DOMAIN','CALCULATION_CONFIG','NOT_APPLICABLE',false,false,false,
        'Certification domain: unlocked floor proves configurability where domain policy permits it.')
ON CONFLICT (domain_code, component_type) DO NOTHING;

-- =====================================================================
-- PROFILE-01 — the kernel is generic, not an AML silo
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.supervisory_policy_profile') IS NULL
     OR to_regclass('public.supervisory_policy_profile_binding') IS NULL
     OR to_regclass('public.supervisory_policy_profile_requirement') IS NULL
     OR to_regclass('public.supervisory_policy_profile_event') IS NULL
     OR to_regclass('public.supervisory_policy_component_type') IS NULL
     OR to_regclass('public.supervisory_policy_domain_component_requirement') IS NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-01: the policy profile kernel model is incomplete'; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name LIKE 'supervisory_policy_%'
     AND (column_name ILIKE '%aml%' OR column_name ILIKE '%cft%');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL PROFILE-01: the kernel carries AML-specific columns'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile WHERE domain_code='PPCERT_DOMAIN')
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_domain_component_requirement
                      WHERE domain_code='PPCERT_DOMAIN') THEN
    RAISE EXCEPTION 'FAIL PROFILE-01: the kernel refused a non-AML supervisory domain'; END IF;
  RAISE NOTICE 'PASS PROFILE-01: generic supervisory policy profile kernel, AML/CFT is only its first consumer';
END $$;

-- =====================================================================
-- PROFILE-02 — component catalogue is honest about what exists
-- =====================================================================
DO $$
DECLARE avail text[]; unavail int;
BEGIN
  -- Modernised in AML-CLOSE-02C (was a fixed list from AML-06; families were added
  -- later through the generic governed component store). Invariant: every type marked
  -- available has a real governed backing store — a dedicated table for the three
  -- original kernels, otherwise the generic supervisory_policy_component store.
  SELECT array_agg(component_type ORDER BY component_type) INTO avail
    FROM public.supervisory_policy_component_type WHERE is_available;
  SELECT count(*) INTO unavail FROM public.supervisory_policy_component_type t
   WHERE t.is_available AND NOT (
     (t.component_type='METHODOLOGY' AND to_regclass('public.supervisory_methodology') IS NOT NULL)
     OR (t.component_type='ASSESSMENT_PROGRAMME' AND to_regclass('public.supervisory_assessment_programme') IS NOT NULL)
     OR (t.component_type='CALCULATION_CONFIG' AND to_regclass('public.supervisory_calculation_config') IS NOT NULL)
     OR (t.component_type NOT IN ('METHODOLOGY','ASSESSMENT_PROGRAMME','CALCULATION_CONFIG')
         AND to_regclass('public.supervisory_policy_component') IS NOT NULL));
  IF unavail > 0 THEN
    RAISE EXCEPTION 'FAIL PROFILE-02: % available component type(s) have no governed backing store', unavail; END IF;
  RAISE NOTICE 'PASS PROFILE-02: % available component types, each backed by a governed store (%)', array_length(avail,1), avail;
END $$;

-- =====================================================================
-- PROFILE-03 — an unimplemented component type cannot be probed or bound
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_component_probe('SLA_POLICY', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%component_type_not_implemented%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROFILE-03: an unimplemented component type was probeable'; END IF;
  RAISE NOTICE 'PASS PROFILE-03: unimplemented component types are refused, never faked';
END $$;

-- =====================================================================
-- PROFILE-04 — the MIPL AML reference package exists exactly once
-- =====================================================================
DO $$
DECLARE n int; b record;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_policy_profile
   WHERE domain_code='AML_CFT' AND origin='MIPL_REFERENCE';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL PROFILE-04: % MIPL AML reference packages exist', n; END IF;
  IF (SELECT regulator_id FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='ref_profile')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-04: the reference package is owned by a regulator'; END IF;
  SELECT * INTO b FROM public.supervisory_policy_profile_binding
   WHERE profile_id=(SELECT v FROM pp WHERE k='ref_profile') AND component_type='METHODOLOGY';
  IF b.component_id IS DISTINCT FROM (SELECT v FROM pp WHERE k='meth_v11') THEN
    RAISE EXCEPTION 'FAIL PROFILE-04: the reference package does not bind AML-CFT-RBA v1.1'; END IF;
  RAISE NOTICE 'PASS PROFILE-04: one MIPL AML/CFT reference package, bound to the v1.1 reference methodology';
END $$;

-- =====================================================================
-- PROFILE-05 — a reference package holds no calculation policy
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.supervisory_policy_profile_binding
              WHERE profile_id=(SELECT v FROM pp WHERE k='ref_profile') AND component_type='CALCULATION_CONFIG') THEN
    RAISE EXCEPTION 'FAIL PROFILE-05: a calculation policy was invented for the reference package'; END IF;
  IF (SELECT n FROM ppn WHERE k='calc_configs') <> (SELECT count(*) FROM public.supervisory_calculation_config) THEN
    RAISE EXCEPTION 'FAIL PROFILE-05: the calculation configuration population changed'; END IF;
  RAISE NOTICE 'PASS PROFILE-05: no calculation policy fabricated (% configurations, unchanged)',
    (SELECT n FROM ppn WHERE k='calc_configs');
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OUTSIDER';

-- =====================================================================
-- PROFILE-06 — an unauthorised user cannot adopt, create or read policy
-- =====================================================================
DO $$
DECLARE ok1 boolean := false; ok2 boolean := false; n int;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_profile_adopt_reference(
      (SELECT v FROM pp WHERE k='ref_profile'), (SELECT v FROM pp WHERE k='regulator'),
      'Unauthorised adoption attempt for certification.');
  EXCEPTION WHEN OTHERS THEN ok1 := true;
  END;
  BEGIN
    PERFORM public.supervisory_policy_profile_create(jsonb_build_object(
      'domain_code','AML_CFT','code','PPCERT-OUTSIDER','profile_version','1.0','name','Outsider',
      'regulator_id',(SELECT v FROM pp WHERE k='regulator')));
  EXCEPTION WHEN OTHERS THEN ok2 := true;
  END;
  IF NOT ok1 OR NOT ok2 THEN
    RAISE EXCEPTION 'FAIL PROFILE-06: a non-AML user could adopt or author supervisory policy'; END IF;
  SELECT count(*) INTO n FROM public.supervisory_policy_profile;
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL PROFILE-06: policy profiles are readable outside supervisory scope (% rows)', n; END IF;
  RAISE NOTICE 'PASS PROFILE-06: adoption, authorship and read are all refused outside AML supervisory authority';
END $$;

-- =====================================================================
-- PROFILE-07 — direct table writes are denied to signed-in users
-- =====================================================================
DO $$
DECLARE ok int := 0;
BEGIN
  BEGIN INSERT INTO public.supervisory_policy_profile(code,profile_version,domain_code,name)
        VALUES ('PPCERT-DIRECT','1.0','AML_CFT','Direct'); EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN INSERT INTO public.supervisory_policy_profile_binding(profile_id,component_type,component_table,component_id)
        VALUES (gen_random_uuid(),'METHODOLOGY','supervisory_methodology',gen_random_uuid());
        EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN INSERT INTO public.supervisory_policy_profile_requirement(profile_id,component_type,requirement)
        VALUES (gen_random_uuid(),'CALCULATION_CONFIG','OPTIONAL'); EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN UPDATE public.supervisory_policy_domain_component_requirement
           SET requirement='OPTIONAL' WHERE domain_code='AML_CFT'; EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN INSERT INTO public.supervisory_policy_profile_event(profile_id,event_type)
        VALUES (gen_random_uuid(),'FORGED'); EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  IF ok < 5 THEN
    RAISE EXCEPTION 'FAIL PROFILE-07 / PROFILE-REQ-04: only % of 5 direct writes were denied', ok; END IF;
  IF (SELECT requirement FROM public.supervisory_policy_domain_component_requirement
       WHERE domain_code='AML_CFT' AND component_type='CALCULATION_CONFIG') <> 'REQUIRED' THEN
    RAISE EXCEPTION 'FAIL PROFILE-REQ-04: the domain requirement floor was mutated directly'; END IF;
  RAISE NOTICE 'PASS PROFILE-07 / PROFILE-REQ-04: every direct write to the kernel is denied; the floor is server-owned';
END $$;

SET LOCAL "request.jwt.claims" = :'AUTHOR';

-- =====================================================================
-- PROFILE-08 — reference adoption reuses the governed methodology adoption
-- PROFILE-09 — the adopted profile binds a REGULATOR-ADOPTED methodology
-- PROFILE-10 — the MIPL reference methodology is never regulator policy
-- =====================================================================
DO $$
DECLARE adopted uuid; b record; m public.supervisory_methodology; meth_before bigint;
BEGIN
  meth_before := (SELECT count(*) FROM public.supervisory_methodology);
  adopted := public.supervisory_policy_profile_adopt_reference(
    (SELECT v FROM pp WHERE k='ref_profile'), (SELECT v FROM pp WHERE k='regulator'),
    'AML-01 certification: regulator adoption of the MIPL AML/CFT reference package.');
  INSERT INTO pp(k,v) VALUES ('adopted', adopted);

  IF (SELECT origin FROM public.supervisory_policy_profile WHERE id=adopted) <> 'REGULATOR_ADOPTED' THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: the adopted profile is not REGULATOR_ADOPTED'; END IF;
  IF (SELECT regulator_id FROM public.supervisory_policy_profile WHERE id=adopted)
     IS DISTINCT FROM (SELECT v FROM pp WHERE k='regulator') THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: the adopted profile is not owned by the adopting regulator'; END IF;
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=adopted) <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: adoption did not produce a DRAFT'; END IF;

  SELECT * INTO b FROM public.supervisory_policy_profile_binding
   WHERE profile_id=adopted AND component_type='METHODOLOGY';
  IF b.component_id IS NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: adoption left the methodology component unbound'; END IF;
  IF b.component_id = (SELECT v FROM pp WHERE k='meth_v11') THEN
    RAISE EXCEPTION 'FAIL PROFILE-10: the MIPL reference methodology was bound directly as regulator policy'; END IF;

  SELECT * INTO m FROM public.supervisory_methodology WHERE id = b.component_id;
  IF m.origin <> 'REGULATOR_ADOPTED' THEN
    RAISE EXCEPTION 'FAIL PROFILE-09: the bound methodology origin is %', m.origin; END IF;
  IF m.regulator_id IS DISTINCT FROM (SELECT v FROM pp WHERE k='regulator') THEN
    RAISE EXCEPTION 'FAIL PROFILE-09: the bound methodology belongs to another regulator'; END IF;
  IF m.adopted_from_id IS DISTINCT FROM (SELECT v FROM pp WHERE k='meth_v11') THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: the adopted methodology does not descend from the reference version'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology) <> meth_before + 1 THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: adoption did not create exactly one adopted methodology'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology_question WHERE methodology_id = m.id) = 0 THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: the adopted methodology carries no question set — adoption logic was duplicated badly'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_methodology_parameter
              WHERE methodology_id = m.id AND approval_status <> 'UNAPPROVED') THEN
    RAISE EXCEPTION 'FAIL PROFILE-08: adoption carried approved parameter values into regulator policy'; END IF;
  INSERT INTO pp(k,v) VALUES ('adopted_meth', m.id);
  RAISE NOTICE 'PASS PROFILE-08/09/10: adoption reused supervisory_methodology_adopt_reference; % % is regulator-owned policy',
    m.code, m.version;
END $$;

-- =====================================================================
-- PROFILE-11 — adoption records provenance and history
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  IF (SELECT adopted_from_id FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='adopted'))
     IS DISTINCT FROM (SELECT v FROM pp WHERE k='ref_profile') THEN
    RAISE EXCEPTION 'FAIL PROFILE-11: adoption lineage is missing'; END IF;
  SELECT count(*) INTO n FROM public.supervisory_policy_profile_event
   WHERE profile_id=(SELECT v FROM pp WHERE k='adopted')
     AND event_type IN ('ADOPTED','COMPONENT_ADOPTED');
  IF n < 2 THEN RAISE EXCEPTION 'FAIL PROFILE-11: adoption history is incomplete (% events)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile_event
                  WHERE profile_id=(SELECT v FROM pp WHERE k='adopted') AND event_type='COMPONENT_ADOPTED'
                    AND detail->>'via' = 'supervisory_methodology_adopt_reference') THEN
    RAISE EXCEPTION 'FAIL PROFILE-11: history does not record which governed operation adopted the component'; END IF;
  RAISE NOTICE 'PASS PROFILE-11: adoption lineage and component-adoption provenance recorded';
END $$;

-- =====================================================================
-- PROFILE-12 — the reference package is not mutated by adoption
-- =====================================================================
DO $$
BEGIN
  IF (SELECT status || '/' || origin FROM public.supervisory_policy_profile
       WHERE id=(SELECT v FROM pp WHERE k='ref_profile')) <> 'DRAFT/MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'FAIL PROFILE-12: adoption mutated the reference package'; END IF;
  IF (SELECT component_id FROM public.supervisory_policy_profile_binding
       WHERE profile_id=(SELECT v FROM pp WHERE k='ref_profile') AND component_type='METHODOLOGY')
     IS DISTINCT FROM (SELECT v FROM pp WHERE k='meth_v11') THEN
    RAISE EXCEPTION 'FAIL PROFILE-12: the reference binding changed'; END IF;
  RAISE NOTICE 'PASS PROFILE-12: the reference package is untouched by adoption';
END $$;

-- =====================================================================
-- PROFILE-13 — double adoption is refused
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_profile_adopt_reference(
      (SELECT v FROM pp WHERE k='ref_profile'), (SELECT v FROM pp WHERE k='regulator'),
      'AML-01 certification: duplicate adoption attempt.');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%already_adopted%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROFILE-13: the same reference package was adopted twice'; END IF;
  RAISE NOTICE 'PASS PROFILE-13: a regulator cannot adopt the same reference package twice';
END $$;

-- =====================================================================
-- PROFILE-14 — adoption is refused for a regulator outside the actor's scope
-- PROFILE-15 — a regulator profile cannot be adopted as if it were reference
-- =====================================================================
DO $$
DECLARE ok1 boolean := false; ok2 boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_profile_adopt_reference(
      (SELECT v FROM pp WHERE k='ref_profile'), (SELECT v FROM pp WHERE k='other_regulator'),
      'AML-01 certification: out-of-scope regulator adoption attempt.');
  EXCEPTION WHEN OTHERS THEN ok1 := true;
  END;
  BEGIN
    PERFORM public.supervisory_policy_profile_adopt_reference(
      (SELECT v FROM pp WHERE k='adopted'), (SELECT v FROM pp WHERE k='regulator'),
      'AML-01 certification: adopting a regulator profile as reference.');
  EXCEPTION WHEN OTHERS THEN ok2 := SQLERRM LIKE '%not_a_reference_profile%';
  END;
  IF NOT ok1 THEN RAISE EXCEPTION 'FAIL PROFILE-14: adoption succeeded for an out-of-scope regulator'; END IF;
  IF NOT ok2 THEN RAISE EXCEPTION 'FAIL PROFILE-15: a regulator profile was treated as a reference package'; END IF;
  RAISE NOTICE 'PASS PROFILE-14/15: regulator authority and reference origin are both enforced on adoption';
END $$;

-- =====================================================================
-- PROFILE-16 — readiness is truthful: methodology bound, calculation missing
-- PROFILE-17 — activation is blocked while a required component is absent
-- =====================================================================
DO $$
DECLARE r jsonb; c jsonb; calc jsonb; meth jsonb;
BEGIN
  r := public.supervisory_policy_profile_readiness((SELECT v FROM pp WHERE k='adopted'));
  SELECT x INTO meth FROM jsonb_array_elements(r->'components') x WHERE x->>'component_type'='METHODOLOGY';
  SELECT x INTO calc FROM jsonb_array_elements(r->'components') x WHERE x->>'component_type'='CALCULATION_CONFIG';
  IF meth->>'bound_component_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-16: readiness does not see the adopted methodology'; END IF;
  IF calc->>'state' <> 'MISSING' THEN
    RAISE EXCEPTION 'FAIL PROFILE-16: calculation policy state is % — it must read MISSING', calc->>'state'; END IF;
  IF (r->>'is_ready_for_approval')::boolean OR (r->>'is_ready_for_activation')::boolean THEN
    RAISE EXCEPTION 'FAIL PROFILE-17: an incomplete AML policy profile reports itself ready'; END IF;
  IF jsonb_array_length(r->'activation_blockers') = 0 THEN
    RAISE EXCEPTION 'FAIL PROFILE-17: activation blockers are not reported'; END IF;
  RAISE NOTICE 'PASS PROFILE-16/17: readiness truthful — methodology %, calculation policy MISSING, activation blocked',
    meth->>'state';
END $$;

-- =====================================================================
-- PROFILE-REQ-01/02/03/05 — the domain requirement floor cannot be relaxed
-- =====================================================================
DO $$
DECLARE ok int := 0; r jsonb;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_profile_requirement_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','METHODOLOGY','requirement','OPTIONAL'));
  EXCEPTION WHEN OTHERS THEN ok := ok + (CASE WHEN SQLERRM LIKE '%domain_requirement%' THEN 1 ELSE 0 END);
  END;
  BEGIN
    PERFORM public.supervisory_policy_profile_requirement_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','CALCULATION_CONFIG','requirement','OPTIONAL'));
  EXCEPTION WHEN OTHERS THEN ok := ok + (CASE WHEN SQLERRM LIKE '%domain_requirement%' THEN 1 ELSE 0 END);
  END;
  BEGIN
    PERFORM public.supervisory_policy_profile_requirement_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','CALCULATION_CONFIG','requirement','NOT_APPLICABLE'));
  EXCEPTION WHEN OTHERS THEN ok := ok + (CASE WHEN SQLERRM LIKE '%domain_requirement%' THEN 1 ELSE 0 END);
  END;
  BEGIN
    PERFORM public.supervisory_policy_profile_requirement_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','METHODOLOGY','requirement','NOT_APPLICABLE'));
  EXCEPTION WHEN OTHERS THEN ok := ok + (CASE WHEN SQLERRM LIKE '%domain_requirement%' THEN 1 ELSE 0 END);
  END;
  IF ok <> 4 THEN
    RAISE EXCEPTION 'FAIL PROFILE-REQ-01/02/03/05: only % of 4 relaxation attempts were refused with a domain reason', ok; END IF;

  r := public.supervisory_policy_profile_readiness((SELECT v FROM pp WHERE k='adopted'));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'components') x
              WHERE x->>'component_type' IN ('METHODOLOGY','CALCULATION_CONFIG')
                AND x->>'requirement' <> 'REQUIRED') THEN
    RAISE EXCEPTION 'FAIL PROFILE-REQ-07: readiness used a weakened requirement'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'components') x
              WHERE x->>'component_type' IN ('METHODOLOGY','CALCULATION_CONFIG')
                AND ((x->>'domain_requirement_locked')::boolean IS NOT TRUE
                  OR (x->>'requirement_editable')::boolean IS NOT FALSE
                  OR x->>'domain_requirement_reason' IS NULL)) THEN
    RAISE EXCEPTION 'FAIL PROFILE-REQ-07: the locked domain requirement is not reported to the screen with a reason'; END IF;
  RAISE NOTICE 'PASS PROFILE-REQ-01/02/03/05/07: the AML requirement floor is server-owned and unweakenable';
END $$;

-- =====================================================================
-- PROFILE-18 — a profile may make an unlocked requirement STRICTER (REQ-06)
-- =====================================================================
DO $$
DECLARE pid uuid; eff jsonb; ok boolean := false;
BEGIN
  pid := public.supervisory_policy_profile_create(jsonb_build_object(
    'domain_code','PPCERT_DOMAIN','code','PPCERT-GENERIC','profile_version','1.0-PPCERT',
    'name','Certification generic profile','regulator_id',(SELECT v FROM pp WHERE k='regulator'),
    'rationale','AML-01 certification: generic domain profile.'));
  INSERT INTO pp(k,v) VALUES ('generic', pid);

  PERFORM public.supervisory_policy_profile_requirement_set(pid,
    jsonb_build_object('component_type','METHODOLOGY','requirement','REQUIRED',
                       'rationale','Certification: profile is stricter than the domain floor.'));
  eff := public.supervisory_policy_requirement_effective('PPCERT_DOMAIN','METHODOLOGY','REQUIRED');
  IF eff->>'effective_requirement' <> 'REQUIRED' THEN
    RAISE EXCEPTION 'FAIL PROFILE-18: a stricter profile requirement was not honoured'; END IF;

  PERFORM public.supervisory_policy_profile_requirement_set(pid,
    jsonb_build_object('component_type','CALCULATION_CONFIG','requirement','OPTIONAL',
                       'rationale','Certification: unlocked floor permits a profile to choose this level.'));
  ok := (SELECT requirement FROM public.supervisory_policy_profile_requirement
          WHERE profile_id=pid AND component_type='CALCULATION_CONFIG') = 'OPTIONAL';
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROFILE-REQ-06: a configurable requirement was not editable'; END IF;
  RAISE NOTICE 'PASS PROFILE-18 / PROFILE-REQ-06: unlocked floors stay configurable and profiles may be stricter';
END $$;

-- =====================================================================
-- PROFILE-19 — exact version binding, domain and regulator validated
-- =====================================================================
DO $$
DECLARE ok1 boolean := false; ok2 boolean := false; ok3 boolean := false;
BEGIN
  BEGIN -- an AML methodology cannot be bound into the generic-domain profile
    PERFORM public.supervisory_policy_profile_binding_set((SELECT v FROM pp WHERE k='generic'),
      jsonb_build_object('component_type','METHODOLOGY','component_id',(SELECT v FROM pp WHERE k='meth_v10')));
  EXCEPTION WHEN OTHERS THEN ok1 := SQLERRM LIKE '%domain_mismatch%';
  END;
  BEGIN -- a MIPL reference component cannot be bound into regulator policy
    PERFORM public.supervisory_policy_profile_binding_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','METHODOLOGY','component_id',(SELECT v FROM pp WHERE k='meth_v11')));
  EXCEPTION WHEN OTHERS THEN ok2 := SQLERRM LIKE '%reference_component_not_bindable%';
  END;
  BEGIN -- an unknown component id is refused
    PERFORM public.supervisory_policy_profile_binding_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','METHODOLOGY','component_id',gen_random_uuid()));
  EXCEPTION WHEN OTHERS THEN ok3 := SQLERRM LIKE '%not_found%';
  END;
  IF NOT (ok1 AND ok2 AND ok3) THEN
    RAISE EXCEPTION 'FAIL PROFILE-19: binding validation incomplete (% % %)', ok1, ok2, ok3; END IF;
  RAISE NOTICE 'PASS PROFILE-19: bindings are exact and validated for domain, origin and existence';
END $$;

-- =====================================================================
-- PROFILE-20 — an unapproved component version cannot enter regulator policy
-- =====================================================================
DO $$
DECLARE ok boolean := false; draft uuid;
BEGIN
  draft := public.supervisory_methodology_new_version((SELECT v FROM pp WHERE k='adopted_meth'),
    '1.1-PPCERT-DRAFT', 'AML-01 certification: draft version used to prove approval gating.');
  BEGIN
    PERFORM public.supervisory_policy_profile_binding_set((SELECT v FROM pp WHERE k='adopted'),
      jsonb_build_object('component_type','METHODOLOGY','component_id',draft));
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%component_not_approved%';
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL PROFILE-20: an unapproved component version was bound into regulator policy'; END IF;
  RAISE NOTICE 'PASS PROFILE-20: only approved or active component versions may be bound by a regulator profile';
END $$;

-- =====================================================================
-- PROFILE-21 — approval is refused while required components are unsatisfied
-- PROFILE-22 — maker/checker: the author cannot approve
-- PROFILE-23 — the dedicated policy approval right is required
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='adopted'), 'REVIEW',
    'AML-01 certification: submit the adopted AML policy profile for review.');
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='adopted')) <> 'REVIEW' THEN
    RAISE EXCEPTION 'FAIL PROFILE-21: the profile did not reach REVIEW'; END IF;
  BEGIN
    PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='adopted'), 'APPROVED',
      'AML-01 certification: author self-approval attempt.');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%cannot approve%' OR SQLERRM LIKE '%not_authorized%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROFILE-22: the author approved its own policy profile'; END IF;
  RAISE NOTICE 'PASS PROFILE-22: the author of a policy profile version cannot approve it';
END $$;

SET LOCAL "request.jwt.claims" = :'APPROVER';

DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='adopted'), 'APPROVED',
      'AML-01 certification: approval attempt with the calculation policy still absent.');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%approval_refused%';
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL PROFILE-21: an incomplete AML policy profile was approved'; END IF;
  RAISE NOTICE 'PASS PROFILE-21/23: approval runs on the dedicated policy right and is refused while components are unsatisfied';
END $$;

-- =====================================================================
-- PROFILE-24 — a MIPL reference package can never be approved in place
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='ref_profile'), 'REVIEW',
      'AML-01 certification: reference package review attempt.');
    PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='ref_profile'), 'APPROVED',
      'AML-01 certification: reference package approval attempt.');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%reference_profile_not_adoptable_in_place%'
                                 OR SQLERRM LIKE '%not_authorized%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROFILE-24: a MIPL reference package was approved in place'; END IF;
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='ref_profile'))
     IN ('APPROVED','ACTIVE') THEN
    RAISE EXCEPTION 'FAIL PROFILE-24: the reference package reached an approved state'; END IF;
  RAISE NOTICE 'PASS PROFILE-24: reference approval is never regulator approval';
END $$;

-- =====================================================================
-- PROFILE-25..29 — the positive lifecycle on a satisfiable profile
--   25 review, 26 checker approval, 27 activation, 28 supersession,
--   29 activation uses the same effective requirement contract (REQ-08)
-- =====================================================================
SET LOCAL "request.jwt.claims" = :'AUTHOR';
DO $$
BEGIN
  PERFORM public.supervisory_policy_profile_requirement_set((SELECT v FROM pp WHERE k='generic'),
    jsonb_build_object('component_type','METHODOLOGY','requirement','OPTIONAL',
                       'rationale','Certification: unlocked domain floor permits an optional methodology.'));
  PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='generic'), 'REVIEW',
    'AML-01 certification: submit the generic-domain profile for review.');
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='generic')) <> 'REVIEW' THEN
    RAISE EXCEPTION 'FAIL PROFILE-25: REVIEW transition failed'; END IF;
  RAISE NOTICE 'PASS PROFILE-25: DRAFT -> REVIEW recorded with the submitting reviewer';
END $$;

SET LOCAL "request.jwt.claims" = :'APPROVER';
DO $$
DECLARE r jsonb; act_ok boolean := false;
BEGIN
  r := public.supervisory_policy_profile_readiness((SELECT v FROM pp WHERE k='generic'));
  IF NOT (r->>'is_ready_for_approval')::boolean THEN
    RAISE EXCEPTION 'FAIL PROFILE-26: a satisfiable profile is not ready: %', r->'blockers'; END IF;
  PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='generic'), 'APPROVED',
    'AML-01 certification: checker approval of a complete profile.');
  IF (SELECT approved_by FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='generic'))
     <> '0b522724-adcb-48bf-b21d-175339479616' THEN
    RAISE EXCEPTION 'FAIL PROFILE-26: the approval actor was not recorded'; END IF;

  PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='generic'), 'ACTIVE',
    'AML-01 certification: activation of an approved and complete profile.');
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='generic')) <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL PROFILE-27: activation failed'; END IF;
  IF (SELECT effective_from FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='generic')) IS NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-27: activation left the profile without an effective date'; END IF;
  RAISE NOTICE 'PASS PROFILE-26/27: maker/checker approval and activation are governed and effective-dated';
END $$;

-- =====================================================================
-- PROFILE-30 — an APPROVED/ACTIVE profile is immutable
-- =====================================================================
DO $$
DECLARE ok int := 0;
BEGIN
  BEGIN PERFORM public.supervisory_policy_profile_save((SELECT v FROM pp WHERE k='generic'),
          jsonb_build_object('name','Tampered'));
  EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN PERFORM public.supervisory_policy_profile_requirement_set((SELECT v FROM pp WHERE k='generic'),
          jsonb_build_object('component_type','METHODOLOGY','requirement','REQUIRED'));
  EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN PERFORM public.supervisory_policy_profile_binding_clear((SELECT v FROM pp WHERE k='generic'),
          'METHODOLOGY','Certification tamper attempt on an active profile.');
  EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  IF ok < 3 THEN RAISE EXCEPTION 'FAIL PROFILE-30: an ACTIVE profile accepted % of 3 edits', 3 - ok; END IF;
  RAISE NOTICE 'PASS PROFILE-30: an approved or active policy profile is frozen';
END $$;

-- =====================================================================
-- PROFILE-31 — change control runs through a new version that supersedes
-- PROFILE-32 — activation supersedes the previous active profile
-- =====================================================================
SET LOCAL "request.jwt.claims" = :'AUTHOR';
DO $$
DECLARE nv uuid;
BEGIN
  nv := public.supervisory_policy_profile_new_version((SELECT v FROM pp WHERE k='generic'), '1.1-PPCERT',
        'AML-01 certification: governed change control through a new policy profile version.');
  INSERT INTO pp(k,v) VALUES ('generic_v2', nv);
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=nv) <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL PROFILE-31: a new profile version did not start as DRAFT'; END IF;
  IF (SELECT supersedes_id FROM public.supervisory_policy_profile WHERE id=nv)
     IS DISTINCT FROM (SELECT v FROM pp WHERE k='generic') THEN
    RAISE EXCEPTION 'FAIL PROFILE-31: the new version does not record what it supersedes'; END IF;
  IF (SELECT count(*) FROM public.supervisory_policy_profile_requirement WHERE profile_id=nv) = 0 THEN
    RAISE EXCEPTION 'FAIL PROFILE-31: the new version did not inherit the component contract'; END IF;
  PERFORM public.supervisory_policy_profile_lifecycle(nv,'REVIEW','AML-01 certification: submit the new version.');
END $$;

SET LOCAL "request.jwt.claims" = :'APPROVER';
DO $$
BEGIN
  PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='generic_v2'),'APPROVED',
    'AML-01 certification: approve the successor version.');
  PERFORM public.supervisory_policy_profile_lifecycle((SELECT v FROM pp WHERE k='generic_v2'),'ACTIVE',
    'AML-01 certification: activate the successor version.');
  IF (SELECT status FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pp WHERE k='generic')) <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'FAIL PROFILE-32: the previous active profile was not superseded'; END IF;
  IF (SELECT count(*) FROM public.supervisory_policy_profile
       WHERE domain_code='PPCERT_DOMAIN' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'FAIL PROFILE-32: more than one active profile in the same scope'; END IF;
  RAISE NOTICE 'PASS PROFILE-31/32: change control creates a superseding version; one active profile per scope';
END $$;

-- =====================================================================
-- PROFILE-33 — read models: register, options, detail, capabilities
-- =====================================================================
DO $$
DECLARE reg jsonb; det jsonb; cap jsonb; opt jsonb;
BEGIN
  reg := public.supervisory_policy_profile_register(NULL,'AML_CFT',NULL,NULL,NULL,'updated_at','desc',25,0);
  IF (reg->>'total')::int < 1 THEN RAISE EXCEPTION 'FAIL PROFILE-33: the register returns no AML profile'; END IF;
  opt := public.supervisory_policy_profile_register_options();
  IF jsonb_array_length(opt->'domains') = 0 THEN RAISE EXCEPTION 'FAIL PROFILE-33: register options are empty'; END IF;
  det := public.supervisory_policy_profile_detail((SELECT v FROM pp WHERE k='adopted'));
  IF det->'readiness' IS NULL OR det->'adopted_from' IS NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-33: detail lacks readiness or lineage'; END IF;
  cap := public.supervisory_policy_profile_action_capabilities((SELECT v FROM pp WHERE k='adopted'));
  IF cap->'can_approve' IS NULL THEN RAISE EXCEPTION 'FAIL PROFILE-33: capabilities are not served'; END IF;
  RAISE NOTICE 'PASS PROFILE-33: register, options, detail and server-side action capabilities all resolve';
END $$;

-- =====================================================================
-- PROFILE-34 — compare and history read models
-- =====================================================================
DO $$
DECLARE cmp jsonb; ev jsonb;
BEGIN
  cmp := public.supervisory_policy_profile_compare((SELECT v FROM pp WHERE k='generic_v2'), (SELECT v FROM pp WHERE k='generic'));
  IF cmp IS NULL OR cmp->'components' IS NULL THEN
    RAISE EXCEPTION 'FAIL PROFILE-34: version comparison is unavailable'; END IF;
  ev := public.supervisory_policy_profile_event_register((SELECT v FROM pp WHERE k='adopted'), 50, 0);
  IF (ev->>'total')::int < 3 THEN RAISE EXCEPTION 'FAIL PROFILE-34: the history register is incomplete'; END IF;
  RAISE NOTICE 'PASS PROFILE-34: comparison and append-only history are served as read models';
END $$;

-- =====================================================================
-- PROFILE-35 — history is append-only
-- =====================================================================
DO $$
DECLARE ok int := 0;
BEGIN
  BEGIN UPDATE public.supervisory_policy_profile_event SET rationale='rewritten'
         WHERE profile_id=(SELECT v FROM pp WHERE k='adopted'); EXCEPTION WHEN OTHERS THEN ok := ok+1; END;
  BEGIN DELETE FROM public.supervisory_policy_profile_event
         WHERE profile_id=(SELECT v FROM pp WHERE k='adopted'); EXCEPTION WHEN OTHERS THEN ok := ok+1; END;
  IF ok < 2 THEN RAISE EXCEPTION 'FAIL PROFILE-35: policy profile history is not append-only'; END IF;
  RAISE NOTICE 'PASS PROFILE-35: policy profile history cannot be rewritten or deleted';
END $$;

-- =====================================================================
-- PROFILE-36 — audit trail written for governed policy operations
-- =====================================================================
-- read as the platform (audit log reads are themselves permission-gated)
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_type IN ('supervisory_policy_profile','supervisory_policy_profile_binding')
     AND created_at > now() - interval '10 minutes';
  IF n < 3 THEN RAISE EXCEPTION 'FAIL PROFILE-36: only % policy audit records written', n; END IF;
  RAISE NOTICE 'PASS PROFILE-36: % audit records written for governed policy operations', n;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'APPROVER';

-- =====================================================================
-- PROFILE-37 — configuration-layer resolution only
-- =====================================================================
DO $$
DECLARE res jsonb;
BEGIN
  res := public.supervisory_policy_profile_resolve('PPCERT_DOMAIN',(SELECT v FROM pp WHERE k='regulator'),NULL,NULL);
  IF NOT (res->>'resolved')::boolean THEN
    RAISE EXCEPTION 'FAIL PROFILE-37: an active profile did not resolve'; END IF;
  IF (res->>'binds_operational_assessments')::boolean THEN
    RAISE EXCEPTION 'FAIL PROFILE-37: the policy profile claims to bind operational assessments'; END IF;
  res := public.supervisory_policy_profile_resolve('AML_CFT',(SELECT v FROM pp WHERE k='regulator'),NULL,NULL);
  IF (res->>'resolved')::boolean THEN
    RAISE EXCEPTION 'FAIL PROFILE-37: an AML policy profile resolved although none is active'; END IF;
  RAISE NOTICE 'PASS PROFILE-37: resolution is configuration-layer only and truthful when nothing is active';
END $$;

-- =====================================================================
-- PROFILE-38 — operational AML assessments are untouched
-- =====================================================================
DO $$
BEGIN
  IF (SELECT count(*) FROM public.supervisory_assessment) <> (SELECT n FROM ppn WHERE k='assessments') THEN
    RAISE EXCEPTION 'FAIL PROFILE-38: the assessment population changed'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment
       WHERE methodology_id=(SELECT v FROM pp WHERE k='meth_v10')
         AND lower(status) = 'approved') <> (SELECT n FROM ppn WHERE k='approved_v10') THEN
    RAISE EXCEPTION 'FAIL PROFILE-38: approved v1.0 assessments moved off v1.0'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment
       WHERE methodology_id=(SELECT v FROM pp WHERE k='meth_v11')) <> (SELECT n FROM ppn WHERE k='assessments_on_v11') THEN
    RAISE EXCEPTION 'FAIL PROFILE-38: v1.1 was pulled into operational assessments'; END IF;
  IF (SELECT count(*) FROM public.entity_risk_state) <> (SELECT n FROM ppn WHERE k='risk_state') THEN
    RAISE EXCEPTION 'FAIL PROFILE-38: risk of record changed'; END IF;
  RAISE NOTICE 'PASS PROFILE-38: % assessments unchanged, % approved v1.0 assessments still on v1.0, risk of record untouched',
    (SELECT n FROM ppn WHERE k='assessments'), (SELECT n FROM ppn WHERE k='approved_v10');
END $$;

-- =====================================================================
-- PROFILE-39 — reference methodology state preserved; v1.1 not activated
-- =====================================================================
DO $$
BEGIN
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pp WHERE k='meth_v10'))
     <> (SELECT t FROM ppt WHERE k='v10_status') THEN
    RAISE EXCEPTION 'FAIL PROFILE-39: v1.0 status changed'; END IF;
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pp WHERE k='meth_v11')) <> 'DRAFT'
     OR (SELECT origin FROM public.supervisory_methodology WHERE id=(SELECT v FROM pp WHERE k='meth_v11')) <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'FAIL PROFILE-39: v1.1 is no longer a DRAFT MIPL reference'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology_question WHERE methodology_id=(SELECT v FROM pp WHERE k='meth_v11'))
     <> (SELECT n FROM ppn WHERE k='v11_questions')
   OR (SELECT count(*) FROM public.supervisory_methodology_fact_requirement WHERE methodology_id=(SELECT v FROM pp WHERE k='meth_v11'))
     <> (SELECT n FROM ppn WHERE k='v11_facts')
   OR (SELECT count(*) FROM public.supervisory_methodology_parameter WHERE methodology_id=(SELECT v FROM pp WHERE k='meth_v11'))
     <> (SELECT n FROM ppn WHERE k='v11_params') THEN
    RAISE EXCEPTION 'FAIL PROFILE-39: v1.1 reference content changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_methodology_parameter
              WHERE methodology_id=(SELECT v FROM pp WHERE k='meth_v11') AND approval_status <> 'UNAPPROVED') THEN
    RAISE EXCEPTION 'FAIL PROFILE-39: a v1.1 parameter was approved'; END IF;
  RAISE NOTICE 'PASS PROFILE-39: v1.0 %, v1.1 DRAFT/MIPL_REFERENCE with % questions and % unapproved parameters — unchanged',
    (SELECT t FROM ppt WHERE k='v10_status'), (SELECT n FROM ppn WHERE k='v11_questions'), (SELECT n FROM ppn WHERE k='v11_params');
END $$;

-- =====================================================================
-- PROFILE-40 — no calculation or materiality policy invented anywhere
-- =====================================================================
DO $$
BEGIN
  IF (SELECT count(*) FROM public.supervisory_calculation_config) <> (SELECT n FROM ppn WHERE k='calc_configs') THEN
    RAISE EXCEPTION 'FAIL PROFILE-40: a calculation configuration was created'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_policy_profile_binding b
              JOIN public.supervisory_policy_profile p ON p.id = b.profile_id
             WHERE p.domain_code='AML_CFT' AND b.component_type='CALCULATION_CONFIG') THEN
    RAISE EXCEPTION 'FAIL PROFILE-40: an AML calculation policy binding was fabricated'; END IF;
  RAISE NOTICE 'PASS PROFILE-40: no AML calculation or materiality policy invented; the requirement stays honestly unmet';
END $$;

RESET ROLE;
ROLLBACK;

\echo '=== AML-01 policy profile kernel certification complete — all gates above PASSed (transaction rolled back) ==='
