-- pgTAP: Batch 4 — reject_return gated + audit
BEGIN;
SELECT plan(4);

SELECT has_function('public','reject_return',ARRAY['uuid','text'],
  'reject_return(uuid,text) exists');

SELECT throws_ok(
  $$SELECT public.reject_return('00000000-0000-0000-0000-000000000000'::uuid, 'x')$$,
  '42501', NULL,
  'reject_return raises 42501 for unauthenticated caller'
);

SELECT throws_ok(
  $$SELECT public.reject_return(NULL::uuid, 'x')$$,
  '42501', NULL,
  'reject_return short-circuits on unauthenticated even with NULL return id'
);

SELECT ok(
  has_function_privilege('authenticated','public.reject_return(uuid,text)','EXECUTE'),
  'authenticated can EXECUTE reject_return'
);

SELECT * FROM finish();
ROLLBACK;
