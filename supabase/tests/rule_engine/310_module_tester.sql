-- pgTAP: Rule Engine — specialised module tester contract (ADM-RE-003)
--
-- Proves the module tester RPC exists, is server-side gated, is read-only for
-- the caller's data, and that the shared comparison engine is correct.

BEGIN;
SELECT plan(26);

-- ---------------------------------------------------------------------------
-- Surface
-- ---------------------------------------------------------------------------
SELECT has_function('public', 'rule_module_test', ARRAY['text','uuid','jsonb'],
  'rule_module_test(text,uuid,jsonb) exists');
SELECT has_function('public', 'rule_test_compare', ARRAY['jsonb','text','jsonb'],
  'rule_test_compare(jsonb,text,jsonb) exists');
SELECT has_table('public', 'module_rule_tests', 'module_rule_tests table exists');

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rule_module_test' LIMIT 1),
  true, 'rule_module_test is SECURITY DEFINER');

SELECT ok(
  (SELECT p.proconfig::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rule_module_test' LIMIT 1) ILIKE '%search_path%',
  'rule_module_test pins search_path');

SELECT ok(has_function_privilege('authenticated', 'public.rule_module_test(text,uuid,jsonb)', 'EXECUTE'),
  'authenticated may EXECUTE rule_module_test');
SELECT ok(NOT has_function_privilege('anon', 'public.rule_module_test(text,uuid,jsonb)', 'EXECUTE'),
  'anon may NOT EXECUTE rule_module_test');

-- ---------------------------------------------------------------------------
-- Server-side gating: unauthenticated callers are refused before any work
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.rule_module_test('prudential', '00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb)$$,
  '42501', NULL, 'rule_module_test refuses unauthenticated caller (42501)');

SELECT throws_ok(
  $$SELECT public.rule_module_test('not_a_family', '00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb)$$,
  '42501', NULL, 'gate runs before family validation — no information leak');

-- ---------------------------------------------------------------------------
-- Test history is RLS protected and never writable directly by clients
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.module_rule_tests'::regclass),
  'module_rule_tests has row level security enabled');

SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'module_rule_tests'
      AND cmd IN ('INSERT','UPDATE','DELETE')) = 0,
  'module_rule_tests has no client insert/update/delete policy — writes only via the definer RPC');

SELECT ok(
  NOT has_table_privilege('anon', 'public.module_rule_tests', 'SELECT'),
  'anon cannot read module test history');

-- ---------------------------------------------------------------------------
-- Comparison engine truth table (drives every condition row the tester shows)
-- ---------------------------------------------------------------------------
SELECT ok(NOT public.rule_test_compare('0.06'::jsonb, '>=', '0.09'::jsonb),
  'numeric >= fails when actual is below expected');
SELECT ok(public.rule_test_compare('0.12'::jsonb, '>=', '0.09'::jsonb),
  'numeric >= passes when actual meets expected');
SELECT ok(public.rule_test_compare('0.09'::jsonb, '>=', '0.09'::jsonb),
  'numeric >= is inclusive at the boundary');
SELECT ok(NOT public.rule_test_compare('0.9'::jsonb, '<=', '0.8'::jsonb),
  'numeric <= fails above expected');
SELECT ok(public.rule_test_compare('120'::jsonb, '>', '60'::jsonb),
  'numeric > passes');
SELECT ok(NOT public.rule_test_compare('60'::jsonb, '>', '60'::jsonb),
  'numeric > is exclusive at the boundary');
SELECT ok(public.rule_test_compare('"HIGH"'::jsonb, 'in', '["low","high"]'::jsonb),
  'in is case-insensitive on list membership');
SELECT ok(NOT public.rule_test_compare('"HIGH"'::jsonb, 'in', '["low","medium"]'::jsonb),
  'in fails when the value is absent');
SELECT ok(public.rule_test_compare('"ops@bank.com"'::jsonb, 'contains', '"bank.com"'::jsonb),
  'contains matches a substring');
SELECT ok(public.rule_test_compare('"x"'::jsonb, 'is_present', NULL),
  'is_present passes for a non-empty value');
SELECT ok(NOT public.rule_test_compare('""'::jsonb, 'is_present', NULL),
  'is_present fails for an empty string');
SELECT ok(public.rule_test_compare(NULL, 'is_empty', NULL),
  'is_empty passes for a missing metric');
SELECT ok(NOT public.rule_test_compare(NULL, '>=', '60'::jsonb),
  'a missing metric never satisfies a numeric comparison');
SELECT ok(public.rule_test_compare('"a"'::jsonb, '=', '"A"'::jsonb),
  'equality on text is case-insensitive');
SELECT ok(NOT public.rule_test_compare('"a"'::jsonb, '!=', '"A"'::jsonb),
  'inequality on text is case-insensitive');

SELECT * FROM finish();
ROLLBACK;
