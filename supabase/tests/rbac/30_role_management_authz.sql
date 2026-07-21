-- pgTAP: Role Management authorization guards (Slice 1)
--
-- Verifies:
--   1. `permission_dependent_actions` is the authoritative dependency source
--      and `permission_has_dependency` reads from it.
--   2. Mutations on `roles`, `role_permissions`, `permission_modules`,
--      `permission_actions`, and `user_dynamic_roles` are rejected when the
--      current JWT has no role_management permission.
--   3. `reset_system_role_permissions` requires the `reset` action.

BEGIN;
SELECT plan(8);

-- 1. Table exists and is populated.
SELECT ok(
  (SELECT count(*) FROM public.permission_dependent_actions) >= 20,
  'permission_dependent_actions is seeded with the canonical list'
);

-- 2. permission_has_dependency reflects the table.
INSERT INTO public.permission_dependent_actions (action)
VALUES ('_pgtap_temp_action')
ON CONFLICT DO NOTHING;

SELECT ok(
  (SELECT public.permission_has_dependency('_pgtap_temp_action')),
  'permission_has_dependency reads from the table (temp row detected)'
);

DELETE FROM public.permission_dependent_actions WHERE action = '_pgtap_temp_action';

SELECT ok(
  NOT (SELECT public.permission_has_dependency('_pgtap_temp_action')),
  'permission_has_dependency reflects deletions'
);

-- 3. Anonymous mutation attempts must be rejected by trigger guards.
--    We simulate an anonymous JWT context and expect 42501.
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000dead"}';

SELECT throws_ok(
  $$INSERT INTO public.roles (name, description, system_role, role_type, dashboard_tier)
    VALUES ('_pgtap_unauth_role', 'unauth', 'analyst', 'internal', 'operational')$$,
  '42501',
  NULL,
  'INSERT on roles without role_management.create is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  NULL,
  'INSERT on role_permissions without assign_permissions is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.permission_modules (module_key, module_label)
    VALUES ('_pgtap_mod', '_pgtap')$$,
  '42501',
  NULL,
  'INSERT on permission_modules without manage_catalog is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.user_dynamic_roles (user_id, role_id)
    VALUES (gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  NULL,
  'INSERT on user_dynamic_roles without assign_role is rejected'
);

SELECT throws_ok(
  $$SELECT public.reset_system_role_permissions('Analyst')$$,
  '42501',
  NULL,
  'reset_system_role_permissions requires role_management.reset'
);

RESET role;

SELECT * FROM finish();
ROLLBACK;
