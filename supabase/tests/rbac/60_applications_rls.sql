-- RBAC Slice 5 — Applications & RFI table lockdown
-- Verifies canonical helpers and the new policy layer for 8 tables.

BEGIN;

SELECT plan(22);

-- Fixtures ------------------------------------------------------------
DO $$
DECLARE
  u_super uuid := '00000000-0000-0000-0000-000000005001';
  u_view  uuid := '00000000-0000-0000-0000-000000005002'; -- application_management.view
  u_edit  uuid := '00000000-0000-0000-0000-000000005003'; -- application_management.edit
  u_appl  uuid := '00000000-0000-0000-0000-000000005004'; -- applicant
  u_none  uuid := '00000000-0000-0000-0000-000000005005';
  role_v  uuid;
  role_e  uuid;
  p_view  uuid;
  p_edit  uuid;
  app_id  uuid := '00000000-0000-0000-0000-0000000a5001';
  app_locked uuid := '00000000-0000-0000-0000-0000000a5002';
BEGIN
  INSERT INTO public.user_roles(user_id, role) VALUES (u_super,'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.roles(name, description) VALUES ('rbac_s5_view','Slice 5 view')
    ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description
    RETURNING id INTO role_v;
  INSERT INTO public.roles(name, description) VALUES ('rbac_s5_edit','Slice 5 edit')
    ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description
    RETURNING id INTO role_e;

  SELECT id INTO p_view FROM public.permissions WHERE module='application_management' AND name='view';
  SELECT id INTO p_edit FROM public.permissions WHERE module='application_management' AND name='edit';

  INSERT INTO public.role_permissions(role_id, permission_id) VALUES (role_v, p_view) ON CONFLICT DO NOTHING;
  INSERT INTO public.role_permissions(role_id, permission_id) VALUES (role_e, p_edit) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_dynamic_roles(user_id, role_id) VALUES (u_view, role_v) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_dynamic_roles(user_id, role_id) VALUES (u_edit, role_e) ON CONFLICT DO NOTHING;

  INSERT INTO public.applications(id, applicant_id, status)
    VALUES (app_id, u_appl, 'draft')
    ON CONFLICT (id) DO UPDATE SET applicant_id=EXCLUDED.applicant_id, status=EXCLUDED.status;
  INSERT INTO public.applications(id, applicant_id, status)
    VALUES (app_locked, u_appl, 'approved')
    ON CONFLICT (id) DO UPDATE SET applicant_id=EXCLUDED.applicant_id, status=EXCLUDED.status;
END $$;

-- Permission catalog
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='application_management' AND name='view_all_entities'),
  'permission application_management.view_all_entities registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='application_management' AND name='workflow_action'),
  'permission application_management.workflow_action registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='application_management' AND name='delete'),
  'permission application_management.delete registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='application_management' AND name='manage_config'),
  'permission application_management.manage_config registered');

-- Helpers exist
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_read_application'),
  'helper can_read_application exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_mutate_application'),
  'helper can_mutate_application exists');

-- can_read_application behavior
SELECT ok(public.can_read_application('00000000-0000-0000-0000-000000005001'::uuid,
                                      '00000000-0000-0000-0000-0000000a5001'::uuid),
  'super_admin reads any application');
SELECT ok(public.can_read_application('00000000-0000-0000-0000-000000005002'::uuid,
                                      '00000000-0000-0000-0000-0000000a5001'::uuid),
  'application_management.view (internal) reads any application');
SELECT ok(public.can_read_application('00000000-0000-0000-0000-000000005004'::uuid,
                                      '00000000-0000-0000-0000-0000000a5001'::uuid),
  'applicant reads own application');
SELECT ok(NOT public.can_read_application('00000000-0000-0000-0000-000000005005'::uuid,
                                          '00000000-0000-0000-0000-0000000a5001'::uuid),
  'unassociated user denied on any application');
SELECT ok(NOT public.can_read_application(NULL, '00000000-0000-0000-0000-0000000a5001'::uuid),
  'null uid → false');
SELECT ok(NOT public.can_read_application('00000000-0000-0000-0000-000000005001'::uuid, NULL),
  'null application_id → false');

-- can_mutate_application behavior
SELECT ok(public.can_mutate_application('00000000-0000-0000-0000-000000005001'::uuid,
                                        '00000000-0000-0000-0000-0000000a5002'::uuid),
  'super_admin mutates approved application');
SELECT ok(public.can_mutate_application('00000000-0000-0000-0000-000000005003'::uuid,
                                        '00000000-0000-0000-0000-0000000a5002'::uuid),
  'application_management.edit user can mutate approved application');
SELECT ok(public.can_mutate_application('00000000-0000-0000-0000-000000005004'::uuid,
                                        '00000000-0000-0000-0000-0000000a5001'::uuid),
  'applicant can mutate own draft');
SELECT ok(NOT public.can_mutate_application('00000000-0000-0000-0000-000000005004'::uuid,
                                            '00000000-0000-0000-0000-0000000a5002'::uuid),
  'applicant CANNOT mutate own approved (locked) application');
SELECT ok(NOT public.can_mutate_application('00000000-0000-0000-0000-000000005002'::uuid,
                                            '00000000-0000-0000-0000-0000000a5001'::uuid),
  'view-only user cannot mutate applications');

-- Policy presence
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='applications' AND policyname='applications_read'),
  'policy applications_read exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='application_rfi_responses' AND policyname='application_rfi_responses_write'),
  'policy application_rfi_responses_write exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='license_action_form_configs' AND policyname='license_action_form_configs_write'),
  'policy license_action_form_configs_write exists');

-- Legacy has_role removed on children (parent `applications` retains 1 clause
-- referencing the app_role enum for applicant/pre_licensee guardrail on insert;
-- that is the intended external-role gate, not a legacy admin bypass).
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('application_ai_assessments','application_form_versions',
                        'application_rfis','application_rfi_items','application_rfi_responses',
                        'application_rfi_auto_rules','license_action_form_configs')
      AND (qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%')),
  0,
  'no legacy has_role() clauses on Slice 5 child tables');

-- Anon grants revoked
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon'
      AND table_name IN ('applications','application_ai_assessments','application_form_versions',
                         'application_rfis','application_rfi_items','application_rfi_responses',
                         'application_rfi_auto_rules','license_action_form_configs')),
  0,
  'anon has no grants on any Slice 5 table');

SELECT * FROM finish();
ROLLBACK;
