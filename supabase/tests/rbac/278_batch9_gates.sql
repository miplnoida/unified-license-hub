-- Batch 9: report_management configure/edit/export, notification_management.create, delegation.create
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111178', 'no-role-b9@example.com')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111178","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.enforce_action('report_management','configure','{}'::jsonb) $$,
  '42501', NULL, 'report_management.configure blocked for unprivileged user'
);
SELECT throws_ok(
  $$ SELECT public.enforce_action('report_management','edit','{}'::jsonb) $$,
  '42501', NULL, 'report_management.edit blocked for unprivileged user'
);
SELECT throws_ok(
  $$ SELECT public.record_export_intent('report_management','export','{}'::jsonb) $$,
  '42501', NULL, 'report_management.export blocked for unprivileged user'
);
SELECT throws_ok(
  $$ SELECT public.enforce_action('notification_management','create','{}'::jsonb) $$,
  '42501', NULL, 'notification_management.create blocked for unprivileged user'
);
SELECT throws_ok(
  $$ SELECT public.enforce_action('delegation','create','{}'::jsonb) $$,
  '42501', NULL, 'delegation.create blocked for unprivileged user'
);

SELECT * FROM finish();
ROLLBACK;
