-- pgTAP: Batch 3 Phase D — record_export_intent + escalate_application gated
BEGIN;
SELECT plan(6);

SELECT has_function('public','record_export_intent',ARRAY['text','text','jsonb'],
  'record_export_intent(text,text,jsonb) exists');
SELECT has_function('public','escalate_application',ARRAY['uuid','text'],
  'escalate_application(uuid,text) exists');

SELECT throws_ok(
  $$SELECT public.record_export_intent('application_management','export','{}'::jsonb)$$,
  '42501', NULL,
  'record_export_intent raises 42501 for unauthenticated caller'
);

SELECT throws_ok(
  $$SELECT public.record_export_intent('application_management','delete','{}'::jsonb)$$,
  '22023', NULL,
  'record_export_intent rejects non export/download actions with invalid_parameter_value'
);

SELECT throws_ok(
  $$SELECT public.escalate_application('00000000-0000-0000-0000-000000000000'::uuid, 'x')$$,
  '42501', NULL,
  'escalate_application raises 42501 for unauthenticated caller'
);

-- Ensure EXECUTE was revoked from PUBLIC and granted to authenticated
SELECT ok(
  has_function_privilege('authenticated','public.record_export_intent(text,text,jsonb)','EXECUTE'),
  'authenticated can EXECUTE record_export_intent'
);

SELECT * FROM finish();
ROLLBACK;
