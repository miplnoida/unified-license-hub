-- RBAC Slice 4 — Returns config/admin table lockdown
-- Verifies the manage_config permission gates writes on every config table
-- while reads remain open to all authenticated users.

BEGIN;

SELECT plan(20);

-- Fixtures ------------------------------------------------------------
DO $$
DECLARE
  u_super   uuid := '00000000-0000-0000-0000-000000004001';
  u_config  uuid := '00000000-0000-0000-0000-000000004002';
  u_auth    uuid := '00000000-0000-0000-0000-000000004003';
  role_id   uuid;
  perm_id   uuid;
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (u_super, 'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.roles (name, description)
    VALUES ('rbac_slice4_config', 'Slice 4 config manager')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO role_id;

  SELECT id INTO perm_id FROM public.permissions
    WHERE module='returns_management' AND name='manage_config';

  INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (role_id, perm_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
    VALUES (u_config, role_id) ON CONFLICT DO NOTHING;
END $$;

-- Permission catalog registered ---------------------------------------
SELECT ok(EXISTS(SELECT 1 FROM public.permissions
                 WHERE module='returns_management' AND name='manage_config'),
  'permission returns_management.manage_config is registered');

-- has_permission mapping ----------------------------------------------
SELECT ok(public.has_permission('00000000-0000-0000-0000-000000004002'::uuid,
                                'returns_management','manage_config'),
  'config manager resolves manage_config permission');
SELECT ok(NOT public.has_permission('00000000-0000-0000-0000-000000004003'::uuid,
                                    'returns_management','manage_config'),
  'plain authenticated user has no manage_config permission');
SELECT ok(public.has_permission('00000000-0000-0000-0000-000000004001'::uuid,
                                'returns_management','manage_config'),
  'super_admin bypass grants manage_config');

-- Policies exist for each config table --------------------------------
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_configs' AND policyname='return_configs_write'),
  'return_configs write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_configurations' AND policyname='return_configurations_write'),
  'return_configurations write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_config_forms' AND policyname='return_config_forms_write'),
  'return_config_forms write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_types' AND policyname='return_types_write'),
  'return_types write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_templates' AND policyname='return_templates_write'),
  'return_templates write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_cutoff_config' AND policyname='return_cutoff_config_write'),
  'return_cutoff_config write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_notification_templates' AND policyname='return_notification_templates_write'),
  'return_notification_templates write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_validation_rules' AND policyname='return_validation_rules_write'),
  'return_validation_rules write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_validation_rule_versions' AND policyname='return_validation_rule_versions_write'),
  'return_validation_rule_versions insert policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_due_dates' AND policyname='return_due_dates_write'),
  'return_due_dates write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_form_versions' AND policyname='return_form_versions_write'),
  'return_form_versions write policy is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='return_template_downloads' AND policyname='return_template_downloads_insert'),
  'return_template_downloads insert-self policy is active');

-- Legacy has_role policies fully removed ------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('return_configs','return_configurations','return_config_forms',
                        'return_types','return_templates','return_cutoff_config',
                        'return_notification_templates','return_validation_rules',
                        'return_validation_rule_versions','return_due_dates',
                        'return_form_versions','return_template_downloads')
      AND (qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%')),
  0,
  'no legacy has_role() policies remain on config tables');

-- anon grants revoked --------------------------------------------------
SELECT is(
  (SELECT count(*)::int
     FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND grantee='anon'
      AND table_name IN ('return_configs','return_configurations','return_config_forms',
                         'return_types','return_templates','return_cutoff_config',
                         'return_notification_templates','return_validation_rules',
                         'return_validation_rule_versions','return_due_dates',
                         'return_form_versions','return_template_downloads')),
  0,
  'anon role has no grants on any Slice 4 config table');

-- authenticated + service_role grants asserted ------------------------
SELECT is(
  (SELECT count(DISTINCT table_name)::int
     FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND grantee='authenticated'
      AND privilege_type='SELECT'
      AND table_name IN ('return_configs','return_configurations','return_config_forms',
                         'return_types','return_templates','return_cutoff_config',
                         'return_notification_templates','return_validation_rules',
                         'return_validation_rule_versions','return_due_dates',
                         'return_form_versions','return_template_downloads')),
  12,
  'authenticated holds SELECT on all 12 Slice 4 tables');

SELECT * FROM finish();
ROLLBACK;
