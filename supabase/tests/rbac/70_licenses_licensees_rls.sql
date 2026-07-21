-- RBAC Slice 6 — Licenses & Licensees lifecycle lockdown
-- Verifies canonical helpers, policy layer, and permission catalog for 10 tables.

BEGIN;

SELECT plan(28);

-- Fixtures ------------------------------------------------------------
DO $$
DECLARE
  u_super   uuid := '00000000-0000-0000-0000-000000006001';
  u_view    uuid := '00000000-0000-0000-0000-000000006002'; -- license_management.view
  u_edit    uuid := '00000000-0000-0000-0000-000000006003'; -- license_management.edit
  u_holder  uuid := '00000000-0000-0000-0000-000000006004';
  u_lregul  uuid := '00000000-0000-0000-0000-000000006005'; -- lead_regulator (no permission)
  u_none    uuid := '00000000-0000-0000-0000-000000006006';
  u_licview uuid := '00000000-0000-0000-0000-000000006007'; -- licensee_management.view
  role_lv   uuid;
  role_le   uuid;
  role_liv  uuid;
  p_lv      uuid;
  p_le      uuid;
  p_liv     uuid;
  lic_id    uuid := '00000000-0000-0000-0000-0000000b6001';
  lce_id    uuid := '00000000-0000-0000-0000-0000000c6001';
BEGIN
  INSERT INTO public.user_roles(user_id, role) VALUES (u_super,'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.roles(name, description) VALUES
    ('rbac_s6_lic_view','Slice 6 license view'),
    ('rbac_s6_lic_edit','Slice 6 license edit'),
    ('rbac_s6_licee_view','Slice 6 licensee view')
    ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description;

  SELECT id INTO role_lv  FROM public.roles WHERE name='rbac_s6_lic_view';
  SELECT id INTO role_le  FROM public.roles WHERE name='rbac_s6_lic_edit';
  SELECT id INTO role_liv FROM public.roles WHERE name='rbac_s6_licee_view';

  SELECT id INTO p_lv  FROM public.permissions WHERE module='license_management'  AND name='view';
  SELECT id INTO p_le  FROM public.permissions WHERE module='license_management'  AND name='edit';
  SELECT id INTO p_liv FROM public.permissions WHERE module='licensee_management' AND name='view';

  INSERT INTO public.role_permissions(role_id, permission_id) VALUES
    (role_lv,  p_lv),
    (role_le,  p_le),
    (role_liv, p_liv)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.user_dynamic_roles(user_id, role_id) VALUES
    (u_view,    role_lv),
    (u_edit,    role_le),
    (u_licview, role_liv)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.licenses(id, holder_id, license_number, license_type, status)
    VALUES (lic_id, u_holder, 'RBAC-S6-LIC-1', 'test', 'active')
    ON CONFLICT (id) DO UPDATE SET holder_id=EXCLUDED.holder_id, status=EXCLUDED.status;

  INSERT INTO public.licensees(id, name, status, license_id, lead_regulator_id)
    VALUES (lce_id, 'RBAC S6 Licensee', 'active', lic_id, u_lregul)
    ON CONFLICT (id) DO UPDATE SET lead_regulator_id=EXCLUDED.lead_regulator_id, license_id=EXCLUDED.license_id;
END $$;

-- Permission catalog --------------------------------------------------
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='license_management'  AND name='view_all_entities'),
  'permission license_management.view_all_entities registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='license_management'  AND name='workflow_action'),
  'permission license_management.workflow_action registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='license_management'  AND name='manage_certificates'),
  'permission license_management.manage_certificates registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='license_management'  AND name='manage_conditions'),
  'permission license_management.manage_conditions registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='licensee_management' AND name='view_all_entities'),
  'permission licensee_management.view_all_entities registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='licensee_management' AND name='manage_products_channels'),
  'permission licensee_management.manage_products_channels registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='licensee_management' AND name='manage_pre_license'),
  'permission licensee_management.manage_pre_license registered');

-- Helpers exist -------------------------------------------------------
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_read_license'),
  'helper can_read_license exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_mutate_license'),
  'helper can_mutate_license exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_read_licensee'),
  'helper can_read_licensee exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_mutate_licensee'),
  'helper can_mutate_licensee exists');

-- can_read_license behavior ------------------------------------------
SELECT ok(public.can_read_license('00000000-0000-0000-0000-000000006001'::uuid,
                                   '00000000-0000-0000-0000-0000000b6001'::uuid),
  'super_admin reads any license');
SELECT ok(public.can_read_license('00000000-0000-0000-0000-000000006002'::uuid,
                                   '00000000-0000-0000-0000-0000000b6001'::uuid),
  'license_management.view (internal) reads any license');
SELECT ok(public.can_read_license('00000000-0000-0000-0000-000000006004'::uuid,
                                   '00000000-0000-0000-0000-0000000b6001'::uuid),
  'holder reads own license');
SELECT ok(NOT public.can_read_license('00000000-0000-0000-0000-000000006006'::uuid,
                                       '00000000-0000-0000-0000-0000000b6001'::uuid),
  'unassociated user denied on license');
SELECT ok(NOT public.can_read_license(NULL, '00000000-0000-0000-0000-0000000b6001'::uuid),
  'null uid → false (license)');
SELECT ok(NOT public.can_read_license('00000000-0000-0000-0000-000000006001'::uuid, NULL),
  'null license_id → false');

-- can_mutate_license behavior ----------------------------------------
SELECT ok(public.can_mutate_license('00000000-0000-0000-0000-000000006001'::uuid,
                                     '00000000-0000-0000-0000-0000000b6001'::uuid),
  'super_admin mutates license');
SELECT ok(public.can_mutate_license('00000000-0000-0000-0000-000000006003'::uuid,
                                     '00000000-0000-0000-0000-0000000b6001'::uuid),
  'license_management.edit user mutates license');
SELECT ok(NOT public.can_mutate_license('00000000-0000-0000-0000-000000006002'::uuid,
                                         '00000000-0000-0000-0000-0000000b6001'::uuid),
  'view-only cannot mutate license');
SELECT ok(NOT public.can_mutate_license('00000000-0000-0000-0000-000000006004'::uuid,
                                         '00000000-0000-0000-0000-0000000b6001'::uuid),
  'holder cannot mutate license');

-- can_read_licensee behavior -----------------------------------------
SELECT ok(public.can_read_licensee('00000000-0000-0000-0000-000000006001'::uuid,
                                    '00000000-0000-0000-0000-0000000c6001'::uuid),
  'super_admin reads any licensee');
SELECT ok(public.can_read_licensee('00000000-0000-0000-0000-000000006007'::uuid,
                                    '00000000-0000-0000-0000-0000000c6001'::uuid),
  'licensee_management.view (internal) reads any licensee');
SELECT ok(public.can_read_licensee('00000000-0000-0000-0000-000000006005'::uuid,
                                    '00000000-0000-0000-0000-0000000c6001'::uuid),
  'assigned lead_regulator reads mapped licensee (no permission needed)');
SELECT ok(NOT public.can_read_licensee('00000000-0000-0000-0000-000000006006'::uuid,
                                        '00000000-0000-0000-0000-0000000c6001'::uuid),
  'unassociated user denied on licensee');

-- can_mutate_licensee behavior ---------------------------------------
SELECT ok(NOT public.can_mutate_licensee('00000000-0000-0000-0000-000000006007'::uuid,
                                          '00000000-0000-0000-0000-0000000c6001'::uuid),
  'view-only cannot mutate licensee');
SELECT ok(NOT public.can_mutate_licensee('00000000-0000-0000-0000-000000006005'::uuid,
                                          '00000000-0000-0000-0000-0000000c6001'::uuid),
  'assigned regulator cannot mutate licensee (read-only assignment)');

-- Legacy has_role removed on all 10 tables ---------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('licenses','licensees','license_actions','license_renewals',
                        'license_conditions','license_certificates','license_certificate_signatures',
                        'licensee_products','licensee_channels','pre_license_users')
      AND (qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%')),
  0,
  'no legacy has_role() clauses on any Slice 6 table');

-- Anon grants revoked -------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon'
      AND table_name IN ('licenses','licensees','license_actions','license_renewals',
                         'license_conditions','license_certificates','license_certificate_signatures',
                         'licensee_products','licensee_channels','pre_license_users')),
  0,
  'anon has no grants on any Slice 6 table');

SELECT * FROM finish();
ROLLBACK;
