-- Certification V2 — Wave 1 fixture harness contract
--
-- Guards:
--   1. Registry tables exist with RLS enabled and no anon access.
--   2. Governed harness functions exist, are SECURITY DEFINER, pin search_path,
--      and are not executable by PUBLIC/anon.
--   3. The object-type catalogue is populated and has a deterministic order.
--   4. Unknown object types are rejected.

BEGIN;
SELECT plan(18);

-- 1. Registry tables ---------------------------------------------------------
SELECT has_table('public','cert_fixture_runs','cert_fixture_runs exists');
SELECT has_table('public','cert_fixture_objects','cert_fixture_objects exists');
SELECT has_table('public','cert_fixture_object_types','cert_fixture_object_types exists');

WITH t(tbl) AS (
  VALUES ('cert_fixture_runs'),('cert_fixture_objects'),('cert_fixture_object_types')
)
SELECT is(
  (SELECT c.relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = tbl),
  true,
  'RLS enabled on ' || tbl)
FROM t;

WITH t(tbl) AS (
  VALUES ('public.cert_fixture_runs'),('public.cert_fixture_objects'),('public.cert_fixture_object_types')
)
SELECT is(has_table_privilege('anon', tbl, 'SELECT'), false,
          'anon cannot read ' || tbl)
FROM t;

-- 2. Governed functions ------------------------------------------------------
SELECT has_function('public','cert_v2_begin_run', ARRAY['text','text'],
  'cert_v2_begin_run(text,text) exists');
SELECT has_function('public','cert_v2_register_object',
  ARRAY['uuid','text','text','uuid','text','text','jsonb'],
  'cert_v2_register_object(...) exists');
SELECT has_function('public','cert_v2_reset', ARRAY['text'], 'cert_v2_reset(text) exists');
SELECT has_function('public','cert_v2_verify', ARRAY['text'], 'cert_v2_verify(text) exists');
SELECT has_function('public','cert_v2_report', ARRAY['text'], 'cert_v2_report(text) exists');

-- every harness function is SECURITY DEFINER with a pinned search_path
SELECT is(
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'cert_v2_%'
      AND (NOT p.prosecdef
        OR NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                        WHERE c LIKE 'search_path=%'))),
  0,
  'all cert_v2_* functions are SECURITY DEFINER and pin search_path');

WITH sigs(sig) AS (
  VALUES ('public.cert_v2_begin_run(text,text)'),
         ('public.cert_v2_register_object(uuid,text,text,uuid,text,text,jsonb)'),
         ('public.cert_v2_reset(text)'),
         ('public.cert_v2_verify(text)'),
         ('public.cert_v2_report(text)')
)
SELECT is(has_function_privilege('anon', sig, 'EXECUTE'), false,
          'anon cannot EXECUTE ' || sig)
FROM sigs;

-- 3. Object-type catalogue ---------------------------------------------------
SELECT ok((SELECT count(*) FROM public.cert_fixture_object_types) >= 20,
  'object-type catalogue is seeded');

SELECT is(
  (SELECT count(*)::int FROM public.cert_fixture_object_types t
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables it
                       WHERE it.table_schema='public' AND it.table_name = t.table_name)),
  0,
  'every catalogued object type maps to an existing public table');

SELECT is(
  (SELECT count(*)::int FROM (
     SELECT delete_order FROM public.cert_fixture_object_types
      GROUP BY delete_order HAVING count(*) > 1) d),
  0,
  'delete_order is unambiguous across object types');

-- audit history is not a registrable object type
SELECT is(
  (SELECT count(*)::int FROM public.cert_fixture_object_types
    WHERE table_name IN ('audit_logs','compliance_audit_logs','notification_dispatch_log')),
  0,
  'audit and delivery history cannot be registered as purgeable fixtures');

-- 4. Unknown object types are rejected --------------------------------------
SELECT throws_ok(
  $$ SELECT public.cert_v2_register_object(gen_random_uuid(),'S1','__not_a_type__',gen_random_uuid()) $$,
  NULL, NULL,
  'unknown object type is rejected');

SELECT * FROM finish();
ROLLBACK;
