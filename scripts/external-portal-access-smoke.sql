-- External Portal Access RLS smoke tests.
-- Usage: run against a non-production database with psql after migrations.
-- The script creates temporary fixture users/entities, switches request.jwt.claim.sub,
-- and raises an exception if any critical access rule fails.

BEGIN;

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_applicant uuid := gen_random_uuid();
  v_other_applicant uuid := gen_random_uuid();
  v_primary uuid := gen_random_uuid();
  v_secondary uuid := gen_random_uuid();
  v_entity uuid;
  v_other_entity uuid;
  v_app uuid;
  v_other_app uuid;
  v_license uuid;
  v_config uuid;
  v_return_type uuid;
  v_return uuid;
  v_complaint uuid;
  v_count int;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, user_type, entity_name, role)
  VALUES
    (v_admin, 'EPA Admin', 'epa-admin@example.test', 'employee', '', 'admin'),
    (v_applicant, 'EPA Applicant', 'epa-applicant@example.test', 'primary', '', 'pre_licensee'),
    (v_other_applicant, 'EPA Other', 'epa-other@example.test', 'primary', '', 'pre_licensee'),
    (v_primary, 'EPA Primary', 'epa-primary@example.test', 'primary', '', 'licensee_primary'),
    (v_secondary, 'EPA Secondary', 'epa-secondary@example.test', 'secondary', '', 'licensee_secondary');

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_admin, 'admin'),
    (v_applicant, 'pre_licensee'),
    (v_other_applicant, 'pre_licensee'),
    (v_primary, 'licensee_primary'),
    (v_secondary, 'licensee_secondary');

  INSERT INTO public.licensees (name) VALUES ('EPA Entity') RETURNING id INTO v_entity;
  INSERT INTO public.licensees (name) VALUES ('EPA Other Entity') RETURNING id INTO v_other_entity;
  UPDATE public.profiles SET licensee_id = v_entity WHERE id IN (v_primary, v_secondary);

  INSERT INTO public.applications (applicant_id, license_type, status, data)
  VALUES (v_applicant, 'EPA Test', 'draft', '{}'::jsonb) RETURNING id INTO v_app;
  INSERT INTO public.applications (applicant_id, license_type, status, data)
  VALUES (v_other_applicant, 'EPA Other Test', 'draft', '{}'::jsonb) RETURNING id INTO v_other_app;

  INSERT INTO public.licenses (application_id, holder_id, license_type)
  VALUES (v_app, v_primary, 'EPA License') RETURNING id INTO v_license;
  UPDATE public.licensees SET license_id = v_license WHERE id = v_entity;

  INSERT INTO public.return_types (name, code) VALUES ('EPA Smoke', 'EPA') RETURNING id INTO v_return_type;
  INSERT INTO public.return_configs (name, return_type_id) VALUES ('EPA Smoke Config', v_return_type) RETURNING id INTO v_config;

  PERFORM public.seed_external_portal_defaults(v_applicant, NULL, 'pre_licensee', v_admin);
  PERFORM public.seed_external_portal_defaults(v_primary, v_entity, 'licensee_primary', v_admin);
  INSERT INTO public.external_portal_access (user_id, entity_id, portal_area, can_submit_complaints, can_view_status, status, created_by)
  VALUES (v_secondary, v_entity, 'complaints', true, true, 'active', v_admin);

  INSERT INTO public.complaints (complainant_id, subject, description)
  VALUES (v_secondary, 'EPA Complaint', 'Smoke') RETURNING id INTO v_complaint;

  PERFORM set_config('request.jwt.claim.sub', v_applicant::text, true);
  SELECT count(*) INTO v_count FROM public.workflow_instances;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Applicant can select workflow_instances'; END IF;
  SELECT count(*) INTO v_count FROM public.applications WHERE id = v_other_app;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Applicant can select another applicant application'; END IF;
  SELECT count(*) INTO v_count FROM public.audit_logs;
  IF v_count <> 0 THEN RAISE EXCEPTION 'External user can read audit_logs'; END IF;
  SELECT count(*) INTO v_count FROM public.compliance_audit_logs;
  IF v_count <> 0 THEN RAISE EXCEPTION 'External user can read compliance_audit_logs'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_secondary::text, true);
  SELECT count(*) INTO v_count FROM public.returns_filed;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Secondary without returns access can select returns'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_primary::text, true);
  INSERT INTO public.returns_filed (entity_id, return_configuration_id, return_year, return_period, period_start_date, period_end_date, created_by, updated_by)
  VALUES (v_entity, v_config, 2099, 'Annual', '2099-01-01', '2099-12-31', v_primary, v_primary)
  RETURNING id INTO v_return;
  IF v_return IS NULL THEN RAISE EXCEPTION 'Primary with returns access cannot submit own return'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_secondary::text, true);
  SELECT count(*) INTO v_count FROM public.complaints WHERE id = v_complaint;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Complaint submitter cannot view own complaint'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT count(*) INTO v_count FROM public.external_portal_access;
  IF v_count = 0 THEN RAISE EXCEPTION 'Admin cannot manage/view external_portal_access'; END IF;
END $$;

ROLLBACK;