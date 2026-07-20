-- Regulator-assignment / return-access rules for public.can_view_entity_returns.
--
-- Personas:
--   super_admin          : super_admin role, no explicit perms needed.
--   view_all_bypass      : has returns_management.view_all_entities.
--   mapped_with_view     : assigned as regulator + has returns_management.view.
--   mapped_no_view       : assigned as regulator, no base view permission.
--   unmapped_internal    : has returns_management.view, no entity mapping.
--
-- Return statuses exercised: submitted (status='submitted') and draft ('draft').
BEGIN;
SELECT plan(14);

-- ---------- Fixtures ----------
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111','ra_super@test.local','x',now(),'authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','ra_viewall@test.local','x',now(),'authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','ra_mapped_view@test.local','x',now(),'authenticated','authenticated'),
  ('44444444-4444-4444-4444-444444444444','ra_mapped_noview@test.local','x',now(),'authenticated','authenticated'),
  ('55555555-5555-5555-5555-555555555555','ra_unmapped@test.local','x',now(),'authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111','super_admin'),
  ('22222222-2222-2222-2222-222222222222','admin'),
  ('33333333-3333-3333-3333-333333333333','admin'),
  ('44444444-4444-4444-4444-444444444444','admin'),
  ('55555555-5555-5555-5555-555555555555','admin')
ON CONFLICT DO NOTHING;

-- Grant the base view + view_all_entities perms via roles/permissions if the
-- test row model uses them. We call user_has_permission indirectly through the
-- helper, so wire the perms through a dedicated test role if one doesn't exist.
DO $$
DECLARE
  v_role_id uuid;
  v_role_viewall uuid;
  v_perm_view uuid;
  v_perm_viewall uuid;
BEGIN
  -- Reuse or create a "ra_test_view" role with only returns_management.view.
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'ra_test_view' LIMIT 1;
  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (id, name, description)
    VALUES (gen_random_uuid(), 'ra_test_view', 'test role: returns_management.view only')
    RETURNING id INTO v_role_id;
  END IF;

  SELECT id INTO v_role_viewall FROM public.roles WHERE name = 'ra_test_viewall' LIMIT 1;
  IF v_role_viewall IS NULL THEN
    INSERT INTO public.roles (id, name, description)
    VALUES (gen_random_uuid(), 'ra_test_viewall', 'test role: returns_management.view_all_entities')
    RETURNING id INTO v_role_viewall;
  END IF;

  SELECT id INTO v_perm_view FROM public.permissions
    WHERE module = 'returns_management' AND action = 'view' LIMIT 1;
  SELECT id INTO v_perm_viewall FROM public.permissions
    WHERE module = 'returns_management' AND action = 'view_all_entities' LIMIT 1;

  IF v_perm_view IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_id, v_perm_view)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_viewall, v_perm_view)
      ON CONFLICT DO NOTHING;
  END IF;
  IF v_perm_viewall IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_viewall, v_perm_viewall)
      ON CONFLICT DO NOTHING;
  END IF;

  -- Map users to roles via user_dynamic_roles.
  INSERT INTO public.user_dynamic_roles (user_id, role_id) VALUES
    ('22222222-2222-2222-2222-222222222222', v_role_viewall),
    ('33333333-3333-3333-3333-333333333333', v_role_id),
    ('55555555-5555-5555-5555-555555555555', v_role_id)
    -- mapped_no_view (444...) intentionally gets no role
  ON CONFLICT DO NOTHING;
END $$;

-- Licensee + regulator assignments.
INSERT INTO public.licensees (id, name, status, lead_regulator_id, regulator_officer_id, alternate_regulator_id)
VALUES (
  '99999999-9999-9999-9999-999999999999',
  'RA Test Entity',
  'active',
  '33333333-3333-3333-3333-333333333333', -- mapped_with_view = lead
  '44444444-4444-4444-4444-444444444444', -- mapped_no_view = regulator
  NULL
) ON CONFLICT (id) DO UPDATE
  SET lead_regulator_id = EXCLUDED.lead_regulator_id,
      regulator_officer_id = EXCLUDED.regulator_officer_id,
      alternate_regulator_id = EXCLUDED.alternate_regulator_id;

-- ---------- Assertions ----------

-- 1. Super admin: submitted -> true
SELECT ok(
  public.can_view_entity_returns(
    '11111111-1111-1111-1111-111111111111'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'SUB','submitted'),
  'super_admin sees submitted returns'
);

-- 2. Super admin: draft -> true
SELECT ok(
  public.can_view_entity_returns(
    '11111111-1111-1111-1111-111111111111'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'WIP','draft'),
  'super_admin sees drafts'
);

-- 3. view_all_entities bypass: submitted -> true
SELECT ok(
  public.can_view_entity_returns(
    '22222222-2222-2222-2222-222222222222'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'SUB','submitted'),
  'view_all_entities grantee sees submitted returns'
);

-- 4. Mapped user WITH base view perm + submitted -> true
SELECT ok(
  public.can_view_entity_returns(
    '33333333-3333-3333-3333-333333333333'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'SUB','submitted'),
  'assigned regulator with base view perm sees submitted returns'
);

-- 5. Mapped user + draft -> true (assignment grants access to all statuses)
SELECT ok(
  public.can_view_entity_returns(
    '33333333-3333-3333-3333-333333333333'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'WIP','draft'),
  'assigned regulator can see draft returns for mapped entity'
);

-- 6. Mapped user WITHOUT base view perm + submitted -> false (gap being closed)
SELECT ok(
  NOT public.can_view_entity_returns(
    '44444444-4444-4444-4444-444444444444'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'SUB','submitted'),
  'assigned regulator without base view perm is denied'
);

-- 7. Unmapped internal user with base view perm -> false
SELECT ok(
  NOT public.can_view_entity_returns(
    '55555555-5555-5555-5555-555555555555'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'SUB','submitted'),
  'unmapped internal user is denied'
);

-- 8. NULL user id -> false
SELECT ok(
  NOT public.can_view_entity_returns(
    NULL,
    '99999999-9999-9999-9999-999999999999'::uuid,
    'SUB','submitted'),
  'null user id returns false'
);

-- 9. NULL licensee id -> false
SELECT ok(
  NOT public.can_view_entity_returns(
    '33333333-3333-3333-3333-333333333333'::uuid,
    NULL,
    'SUB','submitted'),
  'null licensee id returns false'
);

-- 10. 2-arg overload: mapped w/ view perm -> true
SELECT ok(
  public.can_view_entity_returns(
    '33333333-3333-3333-3333-333333333333'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid),
  '2-arg overload allows mapped user with base view perm'
);

-- 11. 2-arg overload: mapped w/o view perm -> false
SELECT ok(
  NOT public.can_view_entity_returns(
    '44444444-4444-4444-4444-444444444444'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid),
  '2-arg overload denies mapped user without base view perm'
);

-- 12. 2-arg overload: view_all bypass -> true
SELECT ok(
  public.can_view_entity_returns(
    '22222222-2222-2222-2222-222222222222'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid),
  '2-arg overload allows view_all_entities grantee'
);

-- 13. Signatures still exist (regression against accidental drop)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='can_view_entity_returns'
          AND pg_get_function_identity_arguments(oid)='_user_id uuid, _licensee_id uuid, _workflow_status text, _status text'),
  '4-arg can_view_entity_returns exists'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='can_view_entity_returns'
          AND pg_get_function_identity_arguments(oid)='_user_id uuid, _licensee_id uuid'),
  '2-arg can_view_entity_returns exists'
);

SELECT * FROM finish();
ROLLBACK;
