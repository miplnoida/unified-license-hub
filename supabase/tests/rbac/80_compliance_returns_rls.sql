-- RBAC Slice 7 — Compliance Returns lifecycle lockdown
-- Verifies canonical helpers, policy layer, and permission catalog.

BEGIN;

SELECT plan(20);

-- Fixtures ------------------------------------------------------------
DO $$
DECLARE
  u_super   uuid := '00000000-0000-0000-0000-000000007001';
  u_view    uuid := '00000000-0000-0000-0000-000000007002'; -- compliance_management.view
  u_edit    uuid := '00000000-0000-0000-0000-000000007003'; -- compliance_management.edit
  u_sub     uuid := '00000000-0000-0000-0000-000000007004'; -- submitter
  u_none    uuid := '00000000-0000-0000-0000-000000007005';
  u_audit   uuid := '00000000-0000-0000-0000-000000007006'; -- compliance_management.view_audit_logs
  role_v    uuid;
  role_e    uuid;
  role_a    uuid;
  p_v       uuid;
  p_e       uuid;
  p_a       uuid;
  r_draft   uuid := '00000000-0000-0000-0000-0000000d7001';
  r_approved uuid := '00000000-0000-0000-0000-0000000d7002';
BEGIN
  INSERT INTO public.user_roles(user_id, role) VALUES (u_super,'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.roles(name, description) VALUES
    ('rbac_s7_view','Slice 7 compliance view'),
    ('rbac_s7_edit','Slice 7 compliance edit'),
    ('rbac_s7_audit','Slice 7 compliance audit')
    ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description;

  SELECT id INTO role_v FROM public.roles WHERE name='rbac_s7_view';
  SELECT id INTO role_e FROM public.roles WHERE name='rbac_s7_edit';
  SELECT id INTO role_a FROM public.roles WHERE name='rbac_s7_audit';

  SELECT id INTO p_v FROM public.permissions WHERE module='compliance_management' AND name='view';
  SELECT id INTO p_e FROM public.permissions WHERE module='compliance_management' AND name='edit';
  SELECT id INTO p_a FROM public.permissions WHERE module='compliance_management' AND name='view_audit_logs';

  INSERT INTO public.role_permissions(role_id, permission_id) VALUES
    (role_v, p_v),(role_e, p_e),(role_a, p_a)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.user_dynamic_roles(user_id, role_id) VALUES
    (u_view, role_v),(u_edit, role_e),(u_audit, role_a)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.compliance_returns(id, submitter_id, status, period_start, period_end, due_date)
    VALUES (r_draft, u_sub, 'draft', '2026-01-01','2026-03-31','2026-04-30')
    ON CONFLICT (id) DO UPDATE SET submitter_id=EXCLUDED.submitter_id, status=EXCLUDED.status;
  INSERT INTO public.compliance_returns(id, submitter_id, status, period_start, period_end, due_date)
    VALUES (r_approved, u_sub, 'approved', '2026-01-01','2026-03-31','2026-04-30')
    ON CONFLICT (id) DO UPDATE SET submitter_id=EXCLUDED.submitter_id, status=EXCLUDED.status;
END $$;

-- Permission catalog --------------------------------------------------
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='compliance_management' AND name='view_all_entities'),
  'permission compliance_management.view_all_entities registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='compliance_management' AND name='workflow_action'),
  'permission compliance_management.workflow_action registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='compliance_management' AND name='delete'),
  'permission compliance_management.delete registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='compliance_management' AND name='view_audit_logs'),
  'permission compliance_management.view_audit_logs registered');
SELECT ok(EXISTS(SELECT 1 FROM public.permissions WHERE module='compliance_management' AND name='respond'),
  'permission compliance_management.respond registered');

-- Helpers exist -------------------------------------------------------
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_read_compliance_return'),
  'helper can_read_compliance_return exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='can_mutate_compliance_return'),
  'helper can_mutate_compliance_return exists');

-- can_read_compliance_return behavior --------------------------------
SELECT ok(public.can_read_compliance_return('00000000-0000-0000-0000-000000007001'::uuid,
                                             '00000000-0000-0000-0000-0000000d7001'::uuid),
  'super_admin reads any return');
SELECT ok(public.can_read_compliance_return('00000000-0000-0000-0000-000000007002'::uuid,
                                             '00000000-0000-0000-0000-0000000d7001'::uuid),
  'compliance_management.view (internal) reads any return');
SELECT ok(public.can_read_compliance_return('00000000-0000-0000-0000-000000007004'::uuid,
                                             '00000000-0000-0000-0000-0000000d7001'::uuid),
  'submitter reads own return');
SELECT ok(NOT public.can_read_compliance_return('00000000-0000-0000-0000-000000007005'::uuid,
                                                 '00000000-0000-0000-0000-0000000d7001'::uuid),
  'unassociated user denied on return');
SELECT ok(NOT public.can_read_compliance_return(NULL, '00000000-0000-0000-0000-0000000d7001'::uuid),
  'null uid → false');
SELECT ok(NOT public.can_read_compliance_return('00000000-0000-0000-0000-000000007001'::uuid, NULL),
  'null return_id → false');

-- can_mutate_compliance_return behavior ------------------------------
SELECT ok(public.can_mutate_compliance_return('00000000-0000-0000-0000-000000007001'::uuid,
                                               '00000000-0000-0000-0000-0000000d7002'::uuid),
  'super_admin mutates approved return');
SELECT ok(public.can_mutate_compliance_return('00000000-0000-0000-0000-000000007003'::uuid,
                                               '00000000-0000-0000-0000-0000000d7002'::uuid),
  'compliance_management.edit user mutates approved return');
SELECT ok(public.can_mutate_compliance_return('00000000-0000-0000-0000-000000007004'::uuid,
                                               '00000000-0000-0000-0000-0000000d7001'::uuid),
  'submitter mutates own draft return');
SELECT ok(NOT public.can_mutate_compliance_return('00000000-0000-0000-0000-000000007004'::uuid,
                                                   '00000000-0000-0000-0000-0000000d7002'::uuid),
  'submitter CANNOT mutate approved (locked) return');
SELECT ok(NOT public.can_mutate_compliance_return('00000000-0000-0000-0000-000000007002'::uuid,
                                                   '00000000-0000-0000-0000-0000000d7001'::uuid),
  'view-only cannot mutate return');

-- Legacy has_role removed --------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('compliance_returns','compliance_audit_logs')
      AND (qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%')),
  0,
  'no legacy has_role() clauses on Slice 7 tables');

-- Anon grants revoked -------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon'
      AND table_name IN ('compliance_returns','compliance_audit_logs')),
  0,
  'anon has no grants on any Slice 7 table');

-- Audit logs have no authenticated write policy (service_role only) --
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='compliance_audit_logs'
      AND cmd <> 'SELECT'),
  0,
  'compliance_audit_logs has no authenticated write policy (service_role only)');

SELECT * FROM finish();
ROLLBACK;
