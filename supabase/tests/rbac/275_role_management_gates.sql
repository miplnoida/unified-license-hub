-- Batch 6: role_management server-side gates
-- Verifies that unauthorized callers cannot invoke the atomic role RPCs
-- through the enforce_action universal gate.
BEGIN;
SELECT plan(4);

-- Fresh unprivileged user
INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111175', 'no-role@example.com')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111175","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.enforce_action('role_management','delete','{}'::jsonb) $$,
  '42501',
  NULL,
  'role_management.delete blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.enforce_action('role_management','reset','{}'::jsonb) $$,
  '42501',
  NULL,
  'role_management.reset blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.enforce_action('role_management','assign_permissions','{}'::jsonb) $$,
  '42501',
  NULL,
  'role_management.assign_permissions blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.enforce_action('role_management','manage_catalog','{}'::jsonb) $$,
  '42501',
  NULL,
  'role_management.manage_catalog blocked for unprivileged user'
);

SELECT * FROM finish();
ROLLBACK;
