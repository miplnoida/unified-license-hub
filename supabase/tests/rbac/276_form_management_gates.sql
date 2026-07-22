-- Batch 7: form_management server-side gates
-- Verifies that unauthorized callers cannot exercise publish/delete/import
-- through the enforce_action universal gate.
BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111176', 'no-role-fm@example.com')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111176","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.enforce_action('form_management','publish','{}'::jsonb) $$,
  '42501',
  NULL,
  'form_management.publish blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.enforce_action('form_management','delete','{}'::jsonb) $$,
  '42501',
  NULL,
  'form_management.delete blocked for unprivileged user'
);

SELECT throws_ok(
  $$ SELECT public.enforce_action('form_management','import','{}'::jsonb) $$,
  '42501',
  NULL,
  'form_management.import blocked for unprivileged user'
);

SELECT * FROM finish();
ROLLBACK;
