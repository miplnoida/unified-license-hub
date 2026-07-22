-- pgTAP: Batch 3 Phase C — application_management RPCs are gated
BEGIN;
SELECT plan(6);

SELECT has_function('public','close_application',ARRAY['uuid','text'],
  'close_application(uuid,text) exists');
SELECT has_function('public','configure_application_form',ARRAY['uuid','jsonb'],
  'configure_application_form(uuid,jsonb) exists');
SELECT has_function('public','import_applications_bulk',ARRAY['jsonb'],
  'import_applications_bulk(jsonb) exists');

-- With no auth.uid(), each RPC must raise permission_denied (42501)
SELECT throws_ok(
  $$SELECT public.close_application('00000000-0000-0000-0000-000000000000'::uuid, 'x')$$,
  '42501', NULL,
  'close_application raises 42501 for unauthenticated caller'
);

SELECT throws_ok(
  $$SELECT public.configure_application_form('00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb)$$,
  '42501', NULL,
  'configure_application_form raises 42501 for unauthenticated caller'
);

SELECT throws_ok(
  $$SELECT public.import_applications_bulk('{"items":[]}'::jsonb)$$,
  '42501', NULL,
  'import_applications_bulk raises 42501 for unauthenticated caller'
);

SELECT * FROM finish();
ROLLBACK;
