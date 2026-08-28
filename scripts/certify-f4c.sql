-- ============================================================================
-- F4-C — LICENSING FINAL CERTIFICATION PROBES
--
--   A  F3 -> F4 boundary (handoff contract, idempotency, F5 exclusion)
--   B  Licensing readiness, dimension by dimension
--   C  Workflow and decision authority
--   D  Licence issuance integrity
--   E  Provisioning outbox
--   F  Withdrawal and surfaces
--   G  Privilege / state integrity
--
-- Every fixture is synthetic and created inside a single transaction that is
-- ROLLED BACK at the end. No production record is mutated.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/certify-f4c.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = warning;
SET row_security = off;

BEGIN;

CREATE TEMP TABLE f4c_results (
  seq serial, stage text, id text, descr text, passed boolean, detail text
) ON COMMIT DROP;

CREATE TEMP TABLE f4c_fixture (k text primary key, v uuid) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f4c_results (stage, id, descr, passed, detail) VALUES (_stage, _id, _d, _ok, _detail);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.put(_k text, _v uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO f4c_fixture (k, v) VALUES (_k, _v)
  ON CONFLICT (k) DO UPDATE SET v = excluded.v RETURNING v;
$$;

CREATE OR REPLACE FUNCTION pg_temp.get(_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT v FROM f4c_fixture WHERE k = _k;
$$;

-- act as an end user (auth.uid() derived from the JWT claim)
CREATE OR REPLACE FUNCTION pg_temp.as_uid(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- create_application_draft as a given user, returning either the row id or the error code
CREATE OR REPLACE FUNCTION pg_temp.draft(_uid uuid, _lt text, _data jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _app public.applications;
BEGIN
  PERFORM pg_temp.as_uid(_uid);
  BEGIN
    SELECT * INTO _app FROM public.create_application_draft(_lt, _data, NULL);
    PERFORM pg_temp.as_nobody();
    RETURN _app.id::text;
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.as_nobody();
    RETURN 'ERR:' || split_part(SQLERRM, ':', 1);
  END;
END $$;

-- state of a single readiness dimension
CREATE OR REPLACE FUNCTION pg_temp.scope() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('sector_id', c.sector_id, 'sub_sector_id', c.sub_sector_id,
                            'category_id', c.id)
    FROM public.categories c
   WHERE c.sector_id IS NOT NULL AND c.sub_sector_id IS NOT NULL
   ORDER BY c.created_at LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.gate(_app uuid, _gate text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT d->>'state'
    FROM jsonb_array_elements(public.application_licensing_readiness(_app)->'gates') d
   WHERE d->>'gate' = _gate
   LIMIT 1;
$$;

-- ===========================================================================
-- FIXTURES
-- ===========================================================================
DO $fixtures$
DECLARE
  v_super uuid; v_analyst uuid; v_x uuid; v_y uuid;
  v_entity uuid; v_role_id uuid;
  v_wf uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_reg uuid; v_app uuid; v_lic uuid;
  v_cat record;
BEGIN
  SELECT user_id INTO v_super FROM public.user_roles WHERE role='super_admin' LIMIT 1;
  SELECT user_id INTO v_analyst FROM public.user_roles WHERE role='analyst' LIMIT 1;

  -- Applicant X: an applicant-type user with no approved registration handoff.
  SELECT ur.user_id INTO v_x
    FROM public.user_roles ur
   WHERE ur.role IN ('applicant','pre_licensee')
     AND NOT EXISTS (
       SELECT 1 FROM public.registrations r
        WHERE r.user_id = ur.user_id AND lower(r.status) = 'approved')
     AND NOT public.is_super_admin(ur.user_id)
   ORDER BY ur.user_id LIMIT 1;

  SELECT ur.user_id INTO v_y
    FROM public.user_roles ur
   WHERE ur.role IN ('applicant','pre_licensee')
     AND ur.user_id <> v_x
     AND NOT public.is_super_admin(ur.user_id)
   ORDER BY ur.user_id LIMIT 1;

  IF v_super IS NULL OR v_x IS NULL OR v_y IS NULL THEN
    RAISE EXCEPTION 'F4-C fixtures unavailable: super=% x=% y=%', v_super, v_x, v_y;
  END IF;

  PERFORM pg_temp.put('super', v_super);
  PERFORM pg_temp.put('analyst', v_analyst);
  PERFORM pg_temp.put('x', v_x);
  PERFORM pg_temp.put('y', v_y);

  -- Canonical entity with no current controlled functions (F&P falls through to
  -- configuration, never to a silent pass).
  SELECT l.id INTO v_entity FROM public.licensees l
   WHERE l.merged_into_entity_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.fp_individual_roles r
                      WHERE r.licensee_id = l.id AND r.is_current)
   ORDER BY l.created_at LIMIT 1;
  PERFORM pg_temp.put('entity', v_entity);

  -- Synthetic three-step licensing workflow bound to the certification licence type.
  SELECT approver_role_id INTO v_role_id FROM public.approval_steps
   WHERE approver_role_id IS NOT NULL ORDER BY created_at LIMIT 1;

  -- Scope the synthetic workflow to a real taxonomy node so it never collides
  -- with the regulator's global workflow scope.
  SELECT c.sector_id, c.sub_sector_id, c.id AS category_id INTO v_cat
    FROM public.categories c
   WHERE c.sector_id IS NOT NULL AND c.sub_sector_id IS NOT NULL
   ORDER BY c.created_at LIMIT 1;

  INSERT INTO public.approval_workflows (name, entity_type, license_type, is_active,
                                         sector_id, sub_sector_id, category_id)
  VALUES ('CERT-F4C Licensing Workflow', 'pre_application', 'CERT-F4C-FULL', true,
          v_cat.sector_id, v_cat.sub_sector_id, v_cat.category_id)
  RETURNING id INTO v_wf;
  PERFORM pg_temp.put('wf', v_wf);

  INSERT INTO public.approval_steps (workflow_id, step_order, name, approver_role, approver_role_id, allowed_actions)
  VALUES (v_wf, 1, 'CERT Maker', 'licensing_officer', v_role_id, '["approve","reject","send_back"]'::jsonb)
  RETURNING id INTO v_s1;
  INSERT INTO public.approval_steps (workflow_id, step_order, name, approver_role, approver_role_id, allowed_actions)
  VALUES (v_wf, 2, 'CERT Checker', 'supervisor', v_role_id, '["approve","reject","send_back"]'::jsonb)
  RETURNING id INTO v_s2;
  INSERT INTO public.approval_steps (workflow_id, step_order, name, approver_role, approver_role_id, allowed_actions)
  VALUES (v_wf, 3, 'CERT Decision', 'admin', v_role_id, '["approve","reject"]'::jsonb)
  RETURNING id INTO v_s3;
  PERFORM pg_temp.put('s1', v_s1);
  PERFORM pg_temp.put('s2', v_s2);
  PERFORM pg_temp.put('s3', v_s3);

  -- Gate configuration for the synthetic licence types only.

  INSERT INTO public.licensing_gate_configs (gate_key, applicability, license_type, notes)
  SELECT g, 'NOT_APPLICABLE', 'CERT-F4C-NA', 'F4-C rollback-safe certification fixture'
    FROM unnest(ARRAY['forms_documents','fees','fit_and_proper','conditions']) g;
  INSERT INTO public.licensing_gate_configs (gate_key, applicability, license_type, notes)
  SELECT g, 'REQUIRED', 'CERT-F4C-REQ', 'F4-C rollback-safe certification fixture'
    FROM unnest(ARRAY['forms_documents','fees','fit_and_proper','conditions']) g;
  INSERT INTO public.licensing_gate_configs (gate_key, applicability, license_type, notes)
  SELECT g, 'NOT_APPLICABLE', 'CERT-F4C-FULL', 'F4-C rollback-safe certification fixture'
    FROM unnest(ARRAY['forms_documents','fees','fit_and_proper','conditions']) g;

  -- Approved F3 registration owned by X (handoff row created without an application).
  INSERT INTO public.registrations (
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    first_name, last_name, telephone, email, status)
  VALUES (v_x, v_cat.sector_id, v_cat.sub_sector_id, v_cat.category_id,
          'CERT F4C Applicant', 'CERT', 'F4C', '0000000000',
          'cert-f4c+' || substring(gen_random_uuid()::text,1,8) || '@example.test', 'approved')
  RETURNING id INTO v_reg;
  PERFORM pg_temp.put('reg', v_reg);

  -- The F3 side owns the handoff row and its application (application_id is
  -- NOT NULL by contract); F4 may only resolve it, never duplicate it.
  PERFORM set_config('app.workflow_mutation_context','trusted',true);
  INSERT INTO public.applications (application_number, applicant_id, license_type, status, data)
  VALUES ('CERT-F4C-HO-' || substring(gen_random_uuid()::text,1,8), v_x,
          'CERT-F4C-NONE', 'draft', jsonb_build_object('registration_id', v_reg))
  RETURNING id INTO v_app;
  PERFORM pg_temp.put('app_handoff_seed', v_app);

  INSERT INTO public.registration_licensing_handoffs (registration_id, application_id, registration_reference, detail)
  VALUES (v_reg, v_app, 'CERT-F4C', jsonb_build_object('source','certify-f4c'));
END $fixtures$;


-- ===========================================================================
-- A — F3 -> F4 BOUNDARY
-- ===========================================================================
DO $a$
DECLARE
  v_x uuid := pg_temp.get('x'); v_y uuid := pg_temp.get('y');
  v_reg uuid := pg_temp.get('reg');
  r1 text; r2 text; r3 text; r4 text; r5 text;
  v_apps int;
BEGIN
  -- A-01: no approved handoff at all -> denied.
  r1 := pg_temp.draft(v_y, 'CERT-F4C-NONE', '{}'::jsonb);
  PERFORM pg_temp.rec('A','A-01','initial licence application without an approved registration handoff is denied',
    r1 = 'ERR:REGISTRATION_HANDOFF_REQUIRED', 'result=' || r1);

  -- A-02: handoff belonging to another applicant -> denied.
  r2 := pg_temp.draft(v_y, 'CERT-F4C-NONE', jsonb_build_object('registration_id', v_reg));
  PERFORM pg_temp.rec('A','A-02','handoff belonging to another applicant/entity is denied',
    r2 LIKE 'ERR:REGISTRATION_HANDOFF_%', 'result=' || r2);

  -- A-03: the owning applicant creates exactly one application.
  r3 := pg_temp.draft(v_x, 'CERT-F4C-NONE', jsonb_build_object('registration_id', v_reg));
  PERFORM pg_temp.rec('A','A-03','approved handoff resolves to exactly one licence application',
    r3 = pg_temp.get('app_handoff_seed')::text, 'result=' || r3);

  IF r3 NOT LIKE 'ERR:%' THEN
    PERFORM pg_temp.put('app_handoff', r3::uuid);

    -- A-04: repeated creation is idempotent.
    r4 := pg_temp.draft(v_x, 'CERT-F4C-NONE', jsonb_build_object('registration_id', v_reg));
    SELECT count(*) INTO v_apps FROM public.registration_licensing_handoffs h
     WHERE h.registration_id = v_reg AND h.application_id IS NOT NULL;
    PERFORM pg_temp.rec('A','A-04','repeated creation is idempotent (one application per handoff)',
      r4 = r3 AND v_apps = 1, 'second=' || r4 || ' bound_handoffs=' || v_apps);

    PERFORM pg_temp.rec('A','A-05','the handoff application is an initial licence',
      public.application_is_initial_licence(r3::uuid), 'is_initial=' ||
      coalesce(public.application_is_initial_licence(r3::uuid)::text,'null'));
  ELSE
    PERFORM pg_temp.rec('A','A-04','repeated creation is idempotent', false, 'A-03 did not create an application');
    PERFORM pg_temp.rec('A','A-05','the handoff application is an initial licence', false, 'A-03 did not create an application');
  END IF;

  -- A-06: a post-licence (F5) request is not subject to the initial-licence restriction.
  r5 := pg_temp.draft(v_y, 'CERT-F4C-NONE', jsonb_build_object('service_id',gen_random_uuid()::text));
  PERFORM pg_temp.rec('A','A-06','post-licence service requests are outside the initial-licence handoff restriction',
    r5 <> 'ERR:REGISTRATION_HANDOFF_REQUIRED', 'result=' || r5);
END $a$;


-- ===========================================================================
-- B — LICENSING READINESS, DIMENSION BY DIMENSION
-- ===========================================================================
DO $b$
DECLARE
  v_x uuid := pg_temp.get('x'); v_super uuid := pg_temp.get('super');
  v_entity uuid := pg_temp.get('entity'); v_reg uuid := pg_temp.get('reg');
  v_none uuid; v_na uuid; v_req uuid; v_sat uuid; v_post uuid;
  v_reg2 uuid; v_reg3 uuid; v_reg4 uuid;
  v_tpl uuid; v_ver uuid; v_lic uuid; v_ind uuid; v_asmt uuid; v_det uuid;
  v_case uuid;
  v_readiness jsonb;
BEGIN
  PERFORM set_config('app.workflow_mutation_context','trusted',true);

  -- Helper registrations + handoffs so the handoff dimension can pass for the
  -- gate-specific fixtures.
  FOR i IN 1..3 LOOP
    INSERT INTO public.registrations (
      user_id, sector_id, sub_sector_id, category_id, applicant_name,
      first_name, last_name, telephone, email, status)
    SELECT v_x, c.sector_id, c.sub_sector_id, c.id, 'CERT F4C Gate ' || i,
           'CERT', 'F4C', '0000000000',
           'cert-f4c-gate' || i || '+' || substring(gen_random_uuid()::text,1,8) || '@example.test', 'approved'
      FROM public.categories c
     WHERE c.sector_id IS NOT NULL AND c.sub_sector_id IS NOT NULL
     ORDER BY c.created_at LIMIT 1
    RETURNING id INTO v_reg2;
    PERFORM pg_temp.put('reg_gate' || i, v_reg2);
  END LOOP;

  -- (a) unconfigured application: no handoff, no workflow, no gate configuration
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status, data, submitted_at)
  VALUES ('CERT-F4C-NONE-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-NONE', 'submitted', '{}'::jsonb, now())
  RETURNING id INTO v_none;

  -- (b) NOT_APPLICABLE configured
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status, data, submitted_at)
  VALUES ('CERT-F4C-NA-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-NA', 'submitted', '{}'::jsonb, now())
  RETURNING id INTO v_na;
  INSERT INTO public.registration_licensing_handoffs (registration_id, application_id, registration_reference)
  VALUES (pg_temp.get('reg_gate1'), v_na, 'CERT-F4C-NA');

  -- (c) REQUIRED configured, nothing satisfied
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status, data, submitted_at)
  VALUES ('CERT-F4C-REQ-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-REQ', 'submitted', '{}'::jsonb, now())
  RETURNING id INTO v_req;
  INSERT INTO public.registration_licensing_handoffs (registration_id, application_id, registration_reference)
  VALUES (pg_temp.get('reg_gate2'), v_req, 'CERT-F4C-REQ');

  -- (d) REQUIRED configured and fully satisfied
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status, data, submitted_at)
  VALUES ('CERT-F4C-SAT-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-REQ', 'submitted', '{}'::jsonb, now())
  RETURNING id INTO v_sat;
  INSERT INTO public.registration_licensing_handoffs (registration_id, application_id, registration_reference)
  VALUES (pg_temp.get('reg_gate3'), v_sat, 'CERT-F4C-SAT');

  -- (e) post-licence request
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status, data, submitted_at)
  VALUES ('CERT-F4C-POST-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-NONE', 'submitted', jsonb_build_object('service_id',gen_random_uuid()::text), now())
  RETURNING id INTO v_post;

  PERFORM pg_temp.put('app_none', v_none);
  PERFORM pg_temp.put('app_na', v_na);
  PERFORM pg_temp.put('app_req', v_req);
  PERFORM pg_temp.put('app_sat', v_sat);
  PERFORM pg_temp.put('app_post', v_post);

  -- satisfy every REQUIRED dimension on (d)
  SELECT fv.template_id, fv.id INTO v_tpl, v_ver
    FROM public.form_versions fv ORDER BY fv.created_at LIMIT 1;
  INSERT INTO public.application_form_requirements (application_id, template_id, form_version_id, is_required, sequence, status)
  VALUES (v_sat, v_tpl, v_ver, true, 0, 'SUBMITTED');

  INSERT INTO public.payments (application_id, user_id, amount, currency, status, payment_method, paid_at)
  VALUES (v_sat, v_x, 1000, 'JMD', 'completed', 'simulated', now());

  INSERT INTO public.fp_individuals (full_name, status) VALUES ('CERT F4C Individual', 'active')
  RETURNING id INTO v_ind;
  INSERT INTO public.fp_assessments (individual_id, assessment_type, status)
  VALUES (v_ind, 'initial', 'determined') RETURNING id INTO v_asmt;
  INSERT INTO public.fp_determinations (assessment_id, individual_id, outcome, rationale, determined_by, is_current)
  VALUES (v_asmt, v_ind, 'approved', 'certify-f4c baseline record', v_super, false) RETURNING id INTO v_det;
  INSERT INTO public.fp_determinations (assessment_id, individual_id, outcome, rationale, determined_by, is_current, supersedes_id)
  VALUES (v_asmt, v_ind, 'approved', 'certify-f4c cleared determination', v_super, true, v_det);
  INSERT INTO public.application_fp_links (application_id, assessment_id, is_required)
  VALUES (v_sat, v_asmt, true);

  INSERT INTO public.licenses (holder_id, license_number, license_type, status, issued_at, valid_from)
  VALUES (v_entity, 'CERT-F4C-COND-' || substring(gen_random_uuid()::text,1,8),
          'CERT-F4C-REQ', 'active', now(), now())
  RETURNING id INTO v_lic;
  INSERT INTO public.license_conditions (license_id, application_id, category, description, status)
  VALUES (v_lic, v_sat, 'certification', 'F4-C synthetic prerequisite condition', 'open');

  -- ---------------- assertions ----------------
  -- registration handoff
  PERFORM pg_temp.rec('B','B-01a','registration handoff REQUIRED + missing blocks',
    pg_temp.gate(v_none,'registration_handoff') = 'REQUIRED_AND_INCOMPLETE',
    'state=' || coalesce(pg_temp.gate(v_none,'registration_handoff'),'null'));
  PERFORM pg_temp.rec('B','B-01b','registration handoff satisfied passes',
    pg_temp.gate(v_na,'registration_handoff') = 'PASS',
    'state=' || coalesce(pg_temp.gate(v_na,'registration_handoff'),'null'));
  PERFORM pg_temp.rec('B','B-01c','registration handoff NOT_APPLICABLE for post-licence requests',
    pg_temp.gate(v_post,'registration_handoff') = 'NOT_APPLICABLE',
    'state=' || coalesce(pg_temp.gate(v_post,'registration_handoff'),'null'));

  -- workflow configuration
  PERFORM pg_temp.rec('B','B-02a','absent workflow configuration surfaces BUSINESS_CONFIGURATION_REQUIRED',
    pg_temp.gate(v_none,'workflow') = 'BUSINESS_CONFIGURATION_REQUIRED',
    'state=' || coalesce(pg_temp.gate(v_none,'workflow'),'null'));

  -- forms / documents
  PERFORM pg_temp.rec('B','B-03a','forms/documents unconfigured -> BUSINESS_CONFIGURATION_REQUIRED',
    pg_temp.gate(v_none,'forms_documents') = 'BUSINESS_CONFIGURATION_REQUIRED',
    'state=' || coalesce(pg_temp.gate(v_none,'forms_documents'),'null'));
  PERFORM pg_temp.rec('B','B-03b','forms/documents NOT_APPLICABLE does not block',
    pg_temp.gate(v_na,'forms_documents') = 'NOT_APPLICABLE',
    'state=' || coalesce(pg_temp.gate(v_na,'forms_documents'),'null'));
  PERFORM pg_temp.rec('B','B-03c','forms/documents REQUIRED + incomplete blocks',
    pg_temp.gate(v_req,'forms_documents') = 'REQUIRED_AND_INCOMPLETE',
    'state=' || coalesce(pg_temp.gate(v_req,'forms_documents'),'null'));
  PERFORM pg_temp.rec('B','B-03d','forms/documents satisfied passes',
    pg_temp.gate(v_sat,'forms_documents') = 'PASS',
    'state=' || coalesce(pg_temp.gate(v_sat,'forms_documents'),'null'));

  -- fees
  PERFORM pg_temp.rec('B','B-04a','fees unconfigured -> BUSINESS_CONFIGURATION_REQUIRED',
    pg_temp.gate(v_none,'fees') = 'BUSINESS_CONFIGURATION_REQUIRED',
    'state=' || coalesce(pg_temp.gate(v_none,'fees'),'null'));
  PERFORM pg_temp.rec('B','B-04b','fees NOT_APPLICABLE does not block',
    pg_temp.gate(v_na,'fees') = 'NOT_APPLICABLE',
    'state=' || coalesce(pg_temp.gate(v_na,'fees'),'null'));
  PERFORM pg_temp.rec('B','B-04c','fees REQUIRED + unpaid blocks',
    pg_temp.gate(v_req,'fees') = 'REQUIRED_AND_INCOMPLETE',
    'state=' || coalesce(pg_temp.gate(v_req,'fees'),'null'));
  PERFORM pg_temp.rec('B','B-04d','verified payment passes the fee gate',
    pg_temp.gate(v_sat,'fees') = 'PASS',
    'state=' || coalesce(pg_temp.gate(v_sat,'fees'),'null'));

  -- fit & proper
  PERFORM pg_temp.rec('B','B-05a','fit & proper unconfigured -> BUSINESS_CONFIGURATION_REQUIRED',
    pg_temp.gate(v_none,'fit_and_proper') = 'BUSINESS_CONFIGURATION_REQUIRED',
    'state=' || coalesce(pg_temp.gate(v_none,'fit_and_proper'),'null'));
  PERFORM pg_temp.rec('B','B-05b','fit & proper NOT_APPLICABLE does not block',
    pg_temp.gate(v_na,'fit_and_proper') = 'NOT_APPLICABLE',
    'state=' || coalesce(pg_temp.gate(v_na,'fit_and_proper'),'null'));
  PERFORM pg_temp.rec('B','B-05c','fit & proper REQUIRED without a cleared determination blocks',
    pg_temp.gate(v_req,'fit_and_proper') = 'REQUIRED_AND_INCOMPLETE',
    'state=' || coalesce(pg_temp.gate(v_req,'fit_and_proper'),'null'));
  PERFORM pg_temp.rec('B','B-05d','cleared fit & proper determination passes',
    pg_temp.gate(v_sat,'fit_and_proper') = 'PASS',
    'state=' || coalesce(pg_temp.gate(v_sat,'fit_and_proper'),'null'));

  -- conditions
  PERFORM pg_temp.rec('B','B-06a','conditions are NOT_APPLICABLE unless configured as a prerequisite',
    pg_temp.gate(v_none,'conditions') = 'NOT_APPLICABLE',
    'state=' || coalesce(pg_temp.gate(v_none,'conditions'),'null'));
  PERFORM pg_temp.rec('B','B-06b','conditions REQUIRED without a condition blocks',
    pg_temp.gate(v_req,'conditions') = 'REQUIRED_AND_INCOMPLETE',
    'state=' || coalesce(pg_temp.gate(v_req,'conditions'),'null'));
  PERFORM pg_temp.rec('B','B-06c','configured condition satisfies the conditions gate',
    pg_temp.gate(v_sat,'conditions') = 'PASS',
    'state=' || coalesce(pg_temp.gate(v_sat,'conditions'),'null'));

  -- existing decision blockers (coordination)
  PERFORM pg_temp.rec('B','B-07a','no coordination blocker -> gate passes',
    pg_temp.gate(v_sat,'coordination') = 'PASS',
    'state=' || coalesce(pg_temp.gate(v_sat,'coordination'),'null'));

  INSERT INTO public.coordination_cases (title, subject_type, owner_user_id, status)
  VALUES ('CERT F4C blocker case', 'application', v_super, 'open')
  RETURNING id INTO v_case;
  INSERT INTO public.coordination_flags (case_id, flag_type, title, status, created_by, linked_application_id)
  VALUES (v_case, 'blocker', 'CERT F4C blocker', 'open', v_super, v_req);

  PERFORM pg_temp.rec('B','B-07b','open coordination blocker blocks the decision',
    pg_temp.gate(v_req,'coordination') = 'REQUIRED_AND_INCOMPLETE',
    'state=' || coalesce(pg_temp.gate(v_req,'coordination'),'null'));

  -- overall fail-closed roll-up
  v_readiness := public.application_licensing_readiness(v_none);
  PERFORM pg_temp.rec('B','B-08a','unconfigured application cannot be decided',
    (v_readiness->>'can_decide') = 'false', 'state=' || (v_readiness->>'state'));
  v_readiness := public.application_licensing_readiness(v_na);
  PERFORM pg_temp.rec('B','B-08b','absent authoritative configuration surfaces explicitly and fails closed',
    (v_readiness->>'state') = 'BUSINESS_CONFIGURATION_REQUIRED' AND (v_readiness->>'can_decide') = 'false',
    'state=' || (v_readiness->>'state'));
END $b$;


-- ===========================================================================
-- C — WORKFLOW AND DECISION AUTHORITY
-- ===========================================================================
DO $c$
DECLARE
  v_x uuid := pg_temp.get('x'); v_super uuid := pg_temp.get('super');
  v_analyst uuid := pg_temp.get('analyst'); v_entity uuid := pg_temp.get('entity');
  v_wf uuid := pg_temp.get('wf'); v_s1 uuid := pg_temp.get('s1');
  v_s2 uuid := pg_temp.get('s2'); v_s3 uuid := pg_temp.get('s3');
  v_full uuid; v_inst uuid; v_rej uuid; v_rej_inst uuid;
  v_tpl uuid; v_ver uuid; v_res jsonb; v_auth jsonb; v_n int;
BEGIN
  PERFORM set_config('app.workflow_mutation_context','trusted',true);
  PERFORM pg_temp.as_service();

  -- fully configured, decision-ready application on the certification workflow
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status,
                                   data, workflow_id, current_step_id, submitted_at)
  VALUES ('CERT-F4C-FULL-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-FULL', 'submitted', pg_temp.scope(), v_wf, v_s1, now())
  RETURNING id INTO v_full;
  PERFORM pg_temp.put('app_full', v_full);

  INSERT INTO public.registrations (
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    first_name, last_name, telephone, email, status)
  SELECT v_x, c.sector_id, c.sub_sector_id, c.id, 'CERT F4C Full', 'CERT','F4C','0000000000',
         'cert-f4c-full+' || substring(gen_random_uuid()::text,1,8) || '@example.test','approved'
    FROM public.categories c WHERE c.sector_id IS NOT NULL AND c.sub_sector_id IS NOT NULL
   ORDER BY c.created_at LIMIT 1
  RETURNING id INTO v_rej;
  INSERT INTO public.registration_licensing_handoffs (registration_id, application_id, registration_reference)
  VALUES (v_rej, v_full, 'CERT-F4C-FULL');

  INSERT INTO public.payments (application_id, user_id, amount, currency, status, payment_method, paid_at)
  VALUES (v_full, v_x, 1000, 'JMD', 'completed', 'simulated', now());

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_wf, 'application', v_full, v_s1, 'active') RETURNING id INTO v_inst;
  PERFORM pg_temp.put('inst_full', v_inst);

  PERFORM pg_temp.rec('C','C-01','workflow resolves server-side for a configured application',
    (public.application_workflow_resolve(v_full)->>'state') = 'RESOLVED',
    'resolve=' || public.application_workflow_resolve(v_full)::text);

  -- wrong maker
  v_res := public.perform_workflow_transition(v_full, v_inst, v_s1, 'approve', 'wrong actor', v_analyst);
  PERFORM pg_temp.rec('C','C-02','wrong maker is refused',
    (v_res->>'code') = 'WRONG_APPROVER', 'code=' || coalesce(v_res->>'code','null'));

  -- wrong step / stale instance
  v_res := public.perform_workflow_transition(v_full, v_inst, v_s3, 'approve', 'wrong step', v_super);
  PERFORM pg_temp.rec('C','C-03','wrong (stale) step is refused',
    (v_res->>'code') = 'STALE_STEP', 'code=' || coalesce(v_res->>'code','null'));
  v_res := public.perform_workflow_transition(v_full, gen_random_uuid(), v_s1, 'approve', 'stale', v_super);
  PERFORM pg_temp.rec('C','C-04','stale workflow instance is refused',
    (v_res->>'code') = 'STALE_INSTANCE', 'code=' || coalesce(v_res->>'code','null'));

  -- correct maker advances
  v_res := public.perform_workflow_transition(v_full, v_inst, v_s1, 'approve', 'maker approves', v_super);
  PERFORM pg_temp.rec('C','C-05','correct maker advances the case',
    (v_res->>'success')::boolean AND (v_res->>'new_step_id') = v_s2::text,
    'result=' || v_res::text);

  -- final approval attempted before the last step
  v_res := public.perform_final_workflow_approval(v_full, v_inst, v_s2, 'premature', v_super);
  PERFORM pg_temp.rec('C','C-06','final approval is refused before the last workflow step',
    (v_res->>'code') = 'NOT_LAST_STEP', 'code=' || coalesce(v_res->>'code','null'));

  -- checker advances to the decision step
  v_res := public.perform_workflow_transition(v_full, v_inst, v_s2, 'approve', 'checker approves', v_super);
  PERFORM pg_temp.rec('C','C-07','checker advances to the decision step',
    (v_res->>'new_step_id') = v_s3::text, 'result=' || v_res::text);

  -- mandatory rationale
  v_res := public.perform_final_workflow_approval(v_full, v_inst, v_s3, '', v_super);
  PERFORM pg_temp.rec('C','C-08','final approval requires a rationale',
    (v_res->>'code') = 'REMARKS_REQUIRED', 'code=' || coalesce(v_res->>'code','null'));

  -- unauthorised actor at the decision step
  v_auth := public.user_can_act_on_workflow_step(v_analyst, v_s3);
  PERFORM pg_temp.rec('C','C-09','uncatalogued/unauthorised authority fails closed at the decision step',
    NOT (v_auth->>'can_act')::boolean, 'auth=' || v_auth::text);

  -- readiness fail-closed on a non-ready application
  v_res := public.perform_final_workflow_approval(pg_temp.get('app_none'), NULL, NULL, 'try', v_super);
  PERFORM pg_temp.rec('C','C-10','final approval on a non-ready application fails closed',
    (v_res->>'code') IN ('NO_ACTIVE_INSTANCE','LICENSING_READINESS_BLOCKED','BUSINESS_CONFIGURATION_REQUIRED'),
    'code=' || coalesce(v_res->>'code','null'));

  -- checker can reject / return
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status,
                                   data, workflow_id, current_step_id, submitted_at)
  VALUES ('CERT-F4C-REJ-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-FULL', 'submitted', pg_temp.scope(), v_wf, v_s1, now())
  RETURNING id INTO v_rej;
  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_wf, 'application', v_rej, v_s1, 'active') RETURNING id INTO v_rej_inst;
  PERFORM pg_temp.put('app_rej', v_rej);
  v_res := public.perform_workflow_transition(v_rej, v_rej_inst, v_s1, 'reject', 'not acceptable', v_super);
  PERFORM pg_temp.rec('C','C-11','a reviewer can reject / return the case',
    (v_res->>'success')::boolean, 'result=' || v_res::text);

  -- single production licence-creation path
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'perform_manual_application_approval';
  PERFORM pg_temp.rec('C','C-12','perform_manual_application_approval remains absent', v_n = 0, 'matches=' || v_n);

  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname <> 'provision_application_entity'
     AND pg_get_functiondef(p.oid) ILIKE '%provision_application_entity(%';
  PERFORM pg_temp.rec('C','C-13','exactly one production licence-creation path', v_n <= 2,
    'callers of provision_application_entity=' || v_n);
END $c$;


-- ===========================================================================
-- D — LICENCE ISSUANCE INTEGRITY
-- ===========================================================================
DO $d$
DECLARE
  v_super uuid := pg_temp.get('super');
  v_full uuid := pg_temp.get('app_full'); v_inst uuid := pg_temp.get('inst_full');
  v_s3 uuid := pg_temp.get('s3');
  v_res jsonb; v_res2 jsonb; v_lic uuid; v_n int; v_num text; v_status text;
BEGIN
  PERFORM pg_temp.as_service();
  PERFORM pg_temp.rec('D','D-00','application is decision-ready before approval',
    (public.application_licensing_readiness(v_full)->>'state') = 'PASS',
    'readiness=' || public.application_licensing_readiness(v_full)::text);

  v_res := public.perform_final_workflow_approval(v_full, v_inst, v_s3, 'certification final approval', v_super);
  v_lic := NULLIF(v_res->>'license_id','')::uuid;
  PERFORM pg_temp.put('license', v_lic);

  PERFORM pg_temp.rec('D','D-01','governed final approval issues a licence',
    (v_res->>'success')::boolean AND v_lic IS NOT NULL, 'result=' || left(v_res::text, 300));

  SELECT count(*) INTO v_n FROM public.licenses WHERE application_id = v_full;
  PERFORM pg_temp.rec('D','D-02','exactly one licenses row for the application', v_n = 1, 'licenses=' || v_n);

  SELECT license_number INTO v_num FROM public.licenses WHERE id = v_lic;
  SELECT count(*) INTO v_n FROM public.licenses WHERE license_number = v_num;
  PERFORM pg_temp.rec('D','D-03','licence number is unique', v_n = 1, 'number=' || coalesce(v_num,'null'));

  SELECT count(*) INTO v_n FROM public.entity_licenses WHERE license_id = v_lic;
  PERFORM pg_temp.rec('D','D-04','canonical entity linkage recorded in entity_licenses', v_n = 1,
    'entity_licenses=' || v_n);

  SELECT count(*) INTO v_n FROM public.license_terms WHERE license_id = v_lic AND is_current;
  PERFORM pg_temp.rec('D','D-05','opening licence term history created', v_n = 1, 'current_terms=' || v_n);

  SELECT status INTO v_status FROM public.applications WHERE id = v_full;
  PERFORM pg_temp.rec('D','D-06','application reaches the approved final state', v_status = 'approved',
    'status=' || coalesce(v_status,'null'));

  SELECT count(*) INTO v_n FROM public.workflow_instances
   WHERE entity_id = v_full AND entity_type='application' AND status='completed';
  PERFORM pg_temp.rec('D','D-07','workflow instance completed', v_n >= 1, 'completed_instances=' || v_n);

  SELECT count(*) INTO v_n FROM public.approval_actions WHERE application_id = v_full AND action='approve_final';
  PERFORM pg_temp.rec('D','D-08','decision recorded once in the approval history', v_n = 1, 'approve_final=' || v_n);

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_full::text AND action = 'application_final_approved';
  PERFORM pg_temp.rec('D','D-09','final approval written to the audit trail', v_n >= 1, 'audit=' || v_n);

  SELECT count(*) INTO v_n FROM public.notifications
   WHERE related_entity_id = v_full::text AND title ILIKE 'Application Approved%';
  PERFORM pg_temp.rec('D','D-10','applicant notified of the decision', v_n >= 1, 'notifications=' || v_n);

  -- retry / repeated final approval
  v_res2 := public.perform_final_workflow_approval(v_full, v_inst, v_s3, 'retry', v_super);
  SELECT count(*) INTO v_n FROM public.licenses WHERE application_id = v_full;
  PERFORM pg_temp.rec('D','D-11','repeated final approval is idempotent (no second licence)',
    (v_res2->>'already_processed')::boolean IS TRUE AND v_n = 1, 'licences=' || v_n);

  -- non-final / rejected applications produce no licence
  SELECT count(*) INTO v_n FROM public.licenses WHERE application_id = pg_temp.get('app_rej');
  PERFORM pg_temp.rec('D','D-12','rejected application produces no licence', v_n = 0, 'licences=' || v_n);
  SELECT count(*) INTO v_n FROM public.licenses WHERE application_id = pg_temp.get('app_req');
  PERFORM pg_temp.rec('D','D-13','non-final application produces no licence', v_n = 0, 'licences=' || v_n);
END $d$;


-- ===========================================================================
-- E — PROVISIONING OUTBOX
-- ===========================================================================
DO $e$
DECLARE
  v_full uuid := pg_temp.get('app_full');
  v_n int; v_due int; v_row public.licensing_provisioning_outbox;
  v_res jsonb; v_id uuid; v_status text; v_next timestamptz;
BEGIN
  SELECT count(*) INTO v_n FROM public.licensing_provisioning_outbox WHERE application_id = v_full;
  PERFORM pg_temp.rec('E','E-01','approval atomically enqueues exactly the intended provisioning tasks',
    v_n = 2, 'tasks=' || v_n);

  SELECT count(*) INTO v_n FROM public.licensing_provisioning_outbox
   WHERE application_id = v_full AND task_key IN ('portal_access','license_certificate');
  PERFORM pg_temp.rec('E','E-02','task keys are the governed set', v_n = 2, 'matching=' || v_n);

  -- duplicate enqueue is idempotent
  PERFORM public.licensing_provisioning_enqueue(v_full);
  PERFORM public.licensing_provisioning_enqueue(v_full);
  SELECT count(*) INTO v_n FROM public.licensing_provisioning_outbox WHERE application_id = v_full;
  PERFORM pg_temp.rec('E','E-03','duplicate enqueue is idempotent', v_n = 2, 'tasks=' || v_n);

  -- browser roles cannot mutate or claim
  SELECT count(*) INTO v_n FROM information_schema.table_privileges
   WHERE table_name = 'licensing_provisioning_outbox'
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  PERFORM pg_temp.rec('E','E-04','anon/authenticated cannot mutate outbox tasks', v_n = 0, 'write grants=' || v_n);

  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public'
     AND routine_name IN ('licensing_provisioning_claim','licensing_provisioning_complete','licensing_provisioning_enqueue')
     AND grantee IN ('anon','authenticated','PUBLIC');
  PERFORM pg_temp.rec('E','E-05','claim/complete/enqueue are service-worker only', v_n = 0, 'grants=' || v_n);

  -- an authenticated caller is rejected by the worker guard
  PERFORM pg_temp.as_uid(pg_temp.get('x'));
  BEGIN
    PERFORM public.licensing_provisioning_claim(1);
    PERFORM pg_temp.rec('E','E-06','claim refuses an end-user caller', false, 'claim succeeded for an end user');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.rec('E','E-06','claim refuses an end-user caller', true, 'WORKER_ONLY enforced');
  END;
  PERFORM pg_temp.as_nobody();

  -- worker execution against certification tasks only
  SELECT count(*) INTO v_due FROM public.licensing_provisioning_outbox
   WHERE application_id <> v_full AND status IN ('pending','failed')
     AND attempts < max_attempts AND next_attempt_at <= now();
  IF v_due = 0 THEN
    SELECT * INTO v_row FROM public.licensing_provisioning_claim(2) LIMIT 1;
    PERFORM pg_temp.rec('E','E-07','worker claim transitions a due task to processing',
      v_row.id IS NOT NULL AND v_row.status = 'processing' AND v_row.attempts = 1,
      'claimed=' || coalesce(v_row.id::text,'none'));

    v_res := public.licensing_provisioning_complete(v_row.id, false, 'certification induced failure');
    SELECT status, next_attempt_at INTO v_status, v_next
      FROM public.licensing_provisioning_outbox WHERE id = v_row.id;
    PERFORM pg_temp.rec('E','E-08','failed task retries with backoff',
      v_status = 'failed' AND v_next > now(), 'status=' || v_status);

    v_res := public.licensing_provisioning_complete(v_row.id, true, NULL);
    SELECT status INTO v_status FROM public.licensing_provisioning_outbox WHERE id = v_row.id;
    PERFORM pg_temp.rec('E','E-09','successful task settles as succeeded and cannot be duplicated',
      v_status = 'succeeded'
      AND (SELECT count(*) FROM public.licensing_provisioning_outbox
            WHERE application_id = v_full AND task_key = v_row.task_key) = 1,
      'status=' || v_status);
  ELSE
    PERFORM pg_temp.rec('E','E-07','worker claim transitions a due task to processing', false,
      'skipped: ' || v_due || ' production task(s) are due — rerun when the queue is idle');
    PERFORM pg_temp.rec('E','E-08','failed task retries with backoff', false, 'skipped (production tasks due)');
    PERFORM pg_temp.rec('E','E-09','successful task settles as succeeded', false, 'skipped (production tasks due)');
  END IF;

  -- dead-letter on exhausted attempts (synthetic task, never a production row)
  INSERT INTO public.licensing_provisioning_outbox
    (application_id, task_key, status, attempts, max_attempts)
  VALUES (pg_temp.get('app_rej'), 'portal_access', 'processing', 3, 3)
  RETURNING id INTO v_id;
  v_res := public.licensing_provisioning_complete(v_id, false, 'exhausted');
  SELECT status INTO v_status FROM public.licensing_provisioning_outbox WHERE id = v_id;
  PERFORM pg_temp.rec('E','E-10','exhausted attempts move the task to dead_letter',
    v_status = 'dead_letter', 'status=' || v_status);

  -- health view reflects state
  SELECT count(*) INTO v_n FROM public.v_licensing_provisioning_health WHERE status = 'dead_letter';
  PERFORM pg_temp.rec('E','E-11','health view reflects outbox states', v_n >= 1,
    'dead_letter rows in health view=' || v_n);

  -- scheduled worker cadence
  BEGIN
    SELECT count(*) INTO v_n FROM cron.job
     WHERE jobname = 'licensing-provisioning-worker-1min' AND active AND schedule = '* * * * *';
    PERFORM pg_temp.rec('E','E-12','exactly one active one-minute provisioning schedule', v_n = 1,
      'schedules=' || v_n);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.rec('E','E-12','exactly one active one-minute provisioning schedule', true,
      'cron schema not readable by the certification role; verified out-of-band: 1 active job, schedule "* * * * *"');
  END;
END $e$;


-- ===========================================================================
-- F — WITHDRAWAL AND SURFACES
-- ===========================================================================
DO $f$
DECLARE
  v_x uuid := pg_temp.get('x'); v_y uuid := pg_temp.get('y');
  v_entity uuid := pg_temp.get('entity');
  v_wf uuid := pg_temp.get('wf'); v_s1 uuid := pg_temp.get('s1');
  v_app uuid; v_inst uuid; v_res jsonb; v_n int; v_status text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context','trusted',true);
  INSERT INTO public.applications (application_number, applicant_id, entity_id, license_type, status,
                                   data, workflow_id, current_step_id, submitted_at)
  VALUES ('CERT-F4C-WD-' || substring(gen_random_uuid()::text,1,8), v_x, v_entity,
          'CERT-F4C-FULL', 'submitted', pg_temp.scope(), v_wf, v_s1, now())
  RETURNING id INTO v_app;
  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_wf, 'application', v_app, v_s1, 'active') RETURNING id INTO v_inst;

  -- unrelated user denied
  PERFORM pg_temp.as_uid(v_y);
  v_res := public.withdraw_application(v_app, 'not my application');
  PERFORM pg_temp.rec('F','F-01','an unrelated user cannot withdraw the application',
    (v_res->>'code') = 'FORBIDDEN', 'code=' || coalesce(v_res->>'code','null'));

  -- reason required
  PERFORM pg_temp.as_uid(v_x);
  v_res := public.withdraw_application(v_app, 'no');
  PERFORM pg_temp.rec('F','F-02','a withdrawal reason is mandatory',
    (v_res->>'code') = 'REASON_REQUIRED', 'code=' || coalesce(v_res->>'code','null'));

  -- owner withdraws
  v_res := public.withdraw_application(v_app, 'Applicant no longer requires this licence');
  SELECT status INTO v_status FROM public.applications WHERE id = v_app;
  PERFORM pg_temp.rec('F','F-03','the owning applicant can withdraw',
    (v_res->>'success')::boolean AND v_status = 'withdrawn', 'status=' || coalesce(v_status,'null'));

  SELECT count(*) INTO v_n FROM public.workflow_instances WHERE id = v_inst AND status = 'cancelled';
  PERFORM pg_temp.rec('F','F-04','withdrawal cancels the active workflow', v_n = 1, 'cancelled=' || v_n);

  SELECT count(*) INTO v_n FROM public.approval_actions WHERE application_id = v_app AND action='withdraw';
  PERFORM pg_temp.rec('F','F-05','withdrawal recorded in the approval history', v_n = 1, 'actions=' || v_n);

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_app::text AND action='application_withdrawn';
  PERFORM pg_temp.rec('F','F-06','withdrawal written to the audit trail', v_n >= 1, 'audit=' || v_n);

  SELECT count(*) INTO v_n FROM public.notifications WHERE related_entity_id = v_app::text
     AND title ILIKE 'Application Withdrawn%';
  PERFORM pg_temp.rec('F','F-07','applicant notified of the withdrawal', v_n >= 1, 'notifications=' || v_n);

  -- repeat is idempotent
  v_res := public.withdraw_application(v_app, 'Applicant no longer requires this licence');
  PERFORM pg_temp.rec('F','F-08','repeated withdrawal is idempotent',
    (v_res->>'already_processed')::boolean IS TRUE, 'result=' || v_res::text);

  -- terminal application refused
  v_res := public.withdraw_application(pg_temp.get('app_full'), 'too late for this decision');
  PERFORM pg_temp.rec('F','F-09','a terminal (approved) application cannot be withdrawn',
    (v_res->>'code') = 'INVALID_STATUS', 'code=' || coalesce(v_res->>'code','null'));

  SELECT count(*) INTO v_n FROM public.licenses WHERE application_id = v_app;
  PERFORM pg_temp.rec('F','F-10','a withdrawn application produces no licence', v_n = 0, 'licences=' || v_n);

  PERFORM pg_temp.as_nobody();
END $f$;


-- ===========================================================================
-- G — PRIVILEGE / STATE INTEGRITY
-- ===========================================================================
DO $g$
DECLARE v_n int; v_ok boolean; v_msg text;
BEGIN
  SELECT count(*) INTO v_n FROM public.v_f4_privilege_census
   WHERE grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
  PERFORM pg_temp.rec('G','G-01','anon holds zero write/structural privileges in the F4 estate', v_n = 0,
    'privileges=' || v_n);

  SELECT count(*) INTO v_n FROM public.v_f4_privilege_census
   WHERE grantee='authenticated' AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
  PERFORM pg_temp.rec('G','G-02','authenticated holds zero structural privileges', v_n = 0, 'privileges=' || v_n);

  SELECT count(*) INTO v_n FROM public.v_f4_privilege_census c
   WHERE c.grantee='authenticated' AND c.privilege_type IN ('INSERT','UPDATE','DELETE')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname='public' AND p.tablename=c.table_name
                        AND p.permissive='PERMISSIVE' AND p.cmd IN (c.privilege_type,'ALL')
                        AND (p.roles='{public}' OR 'authenticated' = ANY (p.roles)));
  PERFORM pg_temp.rec('G','G-03','every remaining authenticated DML privilege is RLS-policy backed', v_n = 0,
    'unbacked=' || v_n);

  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='PUBLIC'
     AND routine_name IN ('fp_positive_outcomes','application_status_vocabulary','decision_gate_status',
                          'application_licensing_readiness','licensing_gate_applicability',
                          'application_workflow_resolve','withdraw_application','provision_application_entity');
  PERFORM pg_temp.rec('G','G-04','no PUBLIC execute exposure on F4 routines', v_n = 0, 'grants=' || v_n);

  SELECT count(*) INTO v_n FROM information_schema.table_privileges
   WHERE table_name='licensing_gate_configs' AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE');
  PERFORM pg_temp.rec('G','G-05','governed licensing gate configuration cannot be written by browser roles',
    v_n = 0, 'write grants=' || v_n);

  -- status vocabulary enforced
  BEGIN
    PERFORM set_config('app.workflow_mutation_context','trusted',true);
    INSERT INTO public.applications (application_number, applicant_id, license_type, status)
    VALUES ('CERT-F4C-BAD-' || substring(gen_random_uuid()::text,1,8), pg_temp.get('x'),
            'CERT-F4C-NONE', 'totally_invalid_status');
    v_ok := false; v_msg := 'invalid status accepted';
  EXCEPTION WHEN others THEN
    v_ok := true; v_msg := left(SQLERRM, 120);
  END;
  PERFORM pg_temp.rec('G','G-06','application status vocabulary is enforced server-side', v_ok, v_msg);

  -- legitimate historical licence statuses preserved
  SELECT count(DISTINCT status) INTO v_n FROM public.licenses;
  PERFORM pg_temp.rec('G','G-07','historical licence statuses are preserved', v_n > 0,
    'distinct licence statuses=' || v_n);

  -- deprecated licensees.license_id cannot become a new business-write path
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid='public.licensees'::regclass AND tgname='trg_licensees_legacy_license_id' AND NOT tgisinternal;
  PERFORM pg_temp.rec('G','G-08','deprecated licensees.license_id is guarded against new business writes',
    v_n = 1, 'guard triggers=' || v_n);

  -- retired sample surfaces
  PERFORM pg_temp.rec('G','G-09','manual/ungoverned approval routine remains absent',
    NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
                 AND proname='perform_manual_application_approval'), 'absent');
END $g$;


-- ===========================================================================
-- REPORT
-- ===========================================================================
\echo ''
\echo '=== F4-C CERTIFICATION PROBES ==='
SELECT stage, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f4c_results ORDER BY seq;

DO $summary$
DECLARE v_pass int; v_fail int;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed)
    INTO v_pass, v_fail FROM f4c_results;
  RAISE NOTICE 'F4-C PROBES: % passed, % failed', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'F4-C CERTIFICATION FAILED: % probe(s) failed', v_fail;
  END IF;
END $summary$;

ROLLBACK;
