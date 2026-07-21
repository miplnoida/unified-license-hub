-- RBAC Phase 1 — canonical authorization helpers
-- pgTAP suite for public.has_permission / is_super_admin / has_any_permission
-- / user_has_entity_assignment / is_assignment_only_regulator / can_view_entity_returns.
--
-- Runs against an ephemeral supabase db instance via `supabase db test`.

BEGIN;

SELECT plan(24);

-- ---------------------------------------------------------------------------
-- Seed fixtures. We create four synthetic users:
--   u_super:   super_admin, no dynamic role
--   u_perm:    dynamic role with returns_management.view permission
--   u_assign:  no dynamic role, mapped as lead_regulator on one licensee
--   u_none:    no role, no assignment
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_super uuid  := '00000000-0000-0000-0000-00000000a001';
  v_perm  uuid  := '00000000-0000-0000-0000-00000000a002';
  v_assig uuid  := '00000000-0000-0000-0000-00000000a003';
  v_none  uuid  := '00000000-0000-0000-0000-00000000a004';
  v_lic1  uuid  := '00000000-0000-0000-0000-0000000b0001';
  v_lic2  uuid  := '00000000-0000-0000-0000-0000000b0002';
  v_role  uuid;
  v_perm_id uuid;
BEGIN
  -- roles: super_admin via has_role
  INSERT INTO public.user_roles (user_id, role)
    VALUES (v_super, 'super_admin')
    ON CONFLICT DO NOTHING;

  -- dynamic role + permission for u_perm
  INSERT INTO public.roles (name, description)
    VALUES ('rbac_test_analyst', 'RBAC test analyst')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_role;

  INSERT INTO public.permissions (module, name)
    VALUES ('returns_management', 'view')
    ON CONFLICT (module, name) DO UPDATE SET module = EXCLUDED.module
    RETURNING id INTO v_perm_id;

  INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (v_role, v_perm_id) ON CONFLICT DO NOTHING;

  INSERT INTO public.user_dynamic_roles (user_id, role_id)
    VALUES (v_perm, v_role) ON CONFLICT DO NOTHING;

  -- licensees + assignment for u_assign only
  INSERT INTO public.licensees (id, name, lead_regulator_id)
    VALUES (v_lic1, 'RBAC Test Bank A', v_assig)
    ON CONFLICT (id) DO UPDATE SET lead_regulator_id = EXCLUDED.lead_regulator_id;

  INSERT INTO public.licensees (id, name)
    VALUES (v_lic2, 'RBAC Test Bank B')
    ON CONFLICT (id) DO NOTHING;
END$$;

-- ---------------------------------------------------------------------------
-- is_super_admin
-- ---------------------------------------------------------------------------
SELECT ok(public.is_super_admin('00000000-0000-0000-0000-00000000a001'::uuid), 'is_super_admin: super user recognised');
SELECT ok(NOT public.is_super_admin('00000000-0000-0000-0000-00000000a002'::uuid), 'is_super_admin: permissioned user is not super');
SELECT ok(NOT public.is_super_admin('00000000-0000-0000-0000-00000000a003'::uuid), 'is_super_admin: assignment-only user is not super');
SELECT ok(NOT public.is_super_admin('00000000-0000-0000-0000-00000000a004'::uuid), 'is_super_admin: unassociated user is not super');
SELECT ok(NOT public.is_super_admin(NULL),                                        'is_super_admin: null uuid returns false');

-- ---------------------------------------------------------------------------
-- has_permission
-- ---------------------------------------------------------------------------
SELECT ok(public.has_permission('00000000-0000-0000-0000-00000000a001'::uuid, 'returns_management', 'view'),
          'has_permission: super_admin bypass');
SELECT ok(public.has_permission('00000000-0000-0000-0000-00000000a002'::uuid, 'returns_management', 'view'),
          'has_permission: dynamic-role grant recognised');
SELECT ok(NOT public.has_permission('00000000-0000-0000-0000-00000000a002'::uuid, 'returns_management', 'delete'),
          'has_permission: missing action denied');
SELECT ok(NOT public.has_permission('00000000-0000-0000-0000-00000000a003'::uuid, 'returns_management', 'view'),
          'has_permission: assignment-only user has no permission');
SELECT ok(NOT public.has_permission('00000000-0000-0000-0000-00000000a004'::uuid, 'returns_management', 'view'),
          'has_permission: unassociated user denied');
SELECT ok(NOT public.has_permission(NULL, 'returns_management', 'view'), 'has_permission: null uid denied');
SELECT ok(NOT public.has_permission('00000000-0000-0000-0000-00000000a002'::uuid, NULL, 'view'),
          'has_permission: null module denied');

-- ---------------------------------------------------------------------------
-- has_any_permission
-- ---------------------------------------------------------------------------
SELECT ok(public.has_any_permission('00000000-0000-0000-0000-00000000a002'::uuid,
                                    ARRAY['returns_management.view','returns_management.delete']),
          'has_any_permission: matches on first found key');
SELECT ok(NOT public.has_any_permission('00000000-0000-0000-0000-00000000a003'::uuid,
                                        ARRAY['returns_management.view','returns_management.delete']),
          'has_any_permission: none match for assignment-only user');
SELECT ok(public.has_any_permission('00000000-0000-0000-0000-00000000a001'::uuid,
                                    ARRAY['x.y']),
          'has_any_permission: super_admin bypass regardless of keys');

-- ---------------------------------------------------------------------------
-- user_has_entity_assignment
-- ---------------------------------------------------------------------------
SELECT ok(public.user_has_entity_assignment('00000000-0000-0000-0000-00000000a003'::uuid,
                                            '00000000-0000-0000-0000-0000000b0001'::uuid),
          'user_has_entity_assignment: mapped user on mapped licensee');
SELECT ok(NOT public.user_has_entity_assignment('00000000-0000-0000-0000-00000000a003'::uuid,
                                                '00000000-0000-0000-0000-0000000b0002'::uuid),
          'user_has_entity_assignment: mapped user on other licensee denied');
SELECT ok(NOT public.user_has_entity_assignment('00000000-0000-0000-0000-00000000a002'::uuid,
                                                '00000000-0000-0000-0000-0000000b0001'::uuid),
          'user_has_entity_assignment: permissioned but unmapped user denied');
SELECT ok(NOT public.user_has_entity_assignment(NULL, '00000000-0000-0000-0000-0000000b0001'::uuid),
          'user_has_entity_assignment: null user denied');

-- ---------------------------------------------------------------------------
-- is_assignment_only_regulator
-- ---------------------------------------------------------------------------
SELECT ok(public.is_assignment_only_regulator('00000000-0000-0000-0000-00000000a003'::uuid),
          'is_assignment_only_regulator: mapped user w/o dynamic role is assignment-only');
SELECT ok(NOT public.is_assignment_only_regulator('00000000-0000-0000-0000-00000000a002'::uuid),
          'is_assignment_only_regulator: dynamic-role user is not assignment-only');
SELECT ok(NOT public.is_assignment_only_regulator('00000000-0000-0000-0000-00000000a001'::uuid),
          'is_assignment_only_regulator: super_admin is not assignment-only');
SELECT ok(NOT public.is_assignment_only_regulator('00000000-0000-0000-0000-00000000a004'::uuid),
          'is_assignment_only_regulator: unassociated user is not assignment-only');

-- ---------------------------------------------------------------------------
-- can_view_entity_returns composition
-- ---------------------------------------------------------------------------
SELECT ok(public.can_view_entity_returns('00000000-0000-0000-0000-00000000a003'::uuid,
                                         '00000000-0000-0000-0000-0000000b0001'::uuid),
          'can_view_entity_returns: assignment grants view on mapped entity');
SELECT ok(NOT public.can_view_entity_returns('00000000-0000-0000-0000-00000000a003'::uuid,
                                             '00000000-0000-0000-0000-0000000b0002'::uuid),
          'can_view_entity_returns: assignment denies view on other entity');

SELECT * FROM finish();
ROLLBACK;
