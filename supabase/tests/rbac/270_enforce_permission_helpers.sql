-- pgTAP: enforce_permission / enforce_scoped_permission helpers
BEGIN;
SELECT plan(4);

SELECT has_function(
  'public', 'enforce_permission', ARRAY['text','text'],
  'enforce_permission(text,text) exists'
);

SELECT has_function(
  'public', 'enforce_scoped_permission', ARRAY['text','text','uuid','uuid','uuid'],
  'enforce_scoped_permission(text,text,uuid,uuid,uuid) exists'
);

-- Unauthenticated call raises 42501
SELECT throws_ok(
  $$SELECT public.enforce_permission('application_management','close')$$,
  '42501',
  NULL,
  'enforce_permission raises 42501 when auth.uid() is null'
);

SELECT throws_ok(
  $$SELECT public.enforce_scoped_permission('license_management','edit')$$,
  '42501',
  NULL,
  'enforce_scoped_permission raises 42501 when auth.uid() is null'
);

SELECT * FROM finish();
ROLLBACK;
