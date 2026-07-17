-- Verifies canonical intake path (public.create_complaint) exists and rejects empty subject.
BEGIN;
SELECT plan(3);

SELECT has_function('public', 'create_complaint', ARRAY['jsonb'],
  'create_complaint(jsonb) exists');

SELECT throws_ok(
  $$ SELECT public.create_complaint('{}'::jsonb) $$,
  NULL,
  NULL,
  'create_complaint rejects empty payload'
);

SELECT ok(
  (SELECT count(*) FROM public.complaint_intake_rules) >= 0,
  'complaint_intake_rules table is queryable'
);

SELECT * FROM finish();
ROLLBACK;
