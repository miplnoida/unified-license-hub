-- EPR-01 — audit writer contract.
--
-- Twelve governed `returns_*` functions call
--   create_audit_log(text, uuid, text, jsonb)
-- and the overload was once missing at runtime, aborting every governed
-- Returns mutation. This file asserts the contract and its exposure controls.
BEGIN;
SELECT plan(6);

SELECT isnt(
  to_regprocedure('public.create_audit_log(text,uuid,text,jsonb)'), NULL,
  'the 4-argument create_audit_log overload exists');

SELECT isnt(
  to_regprocedure('public.create_audit_log(uuid,text,text,text,jsonb,jsonb,jsonb)'), NULL,
  'the canonical 7-argument create_audit_log writer exists');

SELECT is(
  (SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.create_audit_log(text,uuid,text,jsonb)')),
  true, 'the audit writer overload is SECURITY DEFINER');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p,
      unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
     WHERE p.oid = to_regprocedure('public.create_audit_log(text,uuid,text,jsonb)')
       AND c LIKE 'search_path=%'),
  'the audit writer overload pins search_path');

SELECT is(
  has_function_privilege('anon', to_regprocedure('public.create_audit_log(text,uuid,text,jsonb)'), 'EXECUTE'),
  false, 'anon cannot execute the audit writer overload');

SELECT is(
  has_function_privilege('public', to_regprocedure('public.create_audit_log(text,uuid,text,jsonb)'), 'EXECUTE'),
  false, 'PUBLIC cannot execute the audit writer overload');

SELECT * FROM finish();
ROLLBACK;
