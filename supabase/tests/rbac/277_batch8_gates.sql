-- Batch 8: user_management.delete, master_data_management.import, settings.export gates
BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111177', 'no-role-b8@example.com')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111177","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.enforce_action('user_management','delete','{}'::jsonb) $$,
  '42501', NULL,
  'user_management.delete blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.enforce_action('master_data_management','import','{}'::jsonb) $$,
  '42501', NULL,
  'master_data_management.import blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.record_export_intent('settings','export','{}'::jsonb) $$,
  '42501', NULL,
  'settings.export blocked for unprivileged user'
);

SELECT * FROM finish();
ROLLBACK;
