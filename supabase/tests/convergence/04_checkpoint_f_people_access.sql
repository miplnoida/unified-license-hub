-- ============================================================
-- CHECKPOINT F — People & Access + My Work read models
-- plus the PERMANENT governed-table privilege guardrail.
--
-- Guardrail intent (from the C–E finding that new public tables were receiving
-- broad DML by default): any governed convergence table must FAIL certification
-- if anon or authenticated holds direct INSERT/UPDATE/DELETE. Authoritative
-- writes go only through governed RPCs.
-- ============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(20);

-- ---------- Guardrail: governed tables reject direct DML ----------
CREATE TEMP TABLE governed_tables(name text) ON COMMIT DROP;
INSERT INTO governed_tables(name) VALUES
  ('regulator_operating_scopes'),
  ('decision_authority_rules'),
  ('decision_authority_observations'),
  ('work_allocation_policies'),
  ('regulatory_service_tasks'),
  ('service_providers'),
  ('service_provider_members'),
  ('provider_engagements'),
  ('provider_work_packages'),
  ('provider_work_package_events');

SELECT is(
  (SELECT count(*)::int FROM governed_tables g
     WHERE has_table_privilege('anon', 'public.' || g.name, 'INSERT')
        OR has_table_privilege('anon', 'public.' || g.name, 'UPDATE')
        OR has_table_privilege('anon', 'public.' || g.name, 'DELETE')),
  0,
  'GUARDRAIL: anon holds no direct INSERT/UPDATE/DELETE on any governed convergence table');

SELECT is(
  (SELECT count(*)::int FROM governed_tables g
     WHERE has_table_privilege('authenticated', 'public.' || g.name, 'INSERT')
        OR has_table_privilege('authenticated', 'public.' || g.name, 'UPDATE')
        OR has_table_privilege('authenticated', 'public.' || g.name, 'DELETE')),
  0,
  'GUARDRAIL: authenticated holds no direct INSERT/UPDATE/DELETE on any governed convergence table');

SELECT is(
  (SELECT count(*)::int FROM governed_tables g
     WHERE NOT relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || g.name)::regclass),
  0,
  'GUARDRAIL: every governed convergence table has RLS enabled');

SELECT is(
  (SELECT count(*)::int FROM governed_tables g
     WHERE NOT has_table_privilege('service_role', 'public.' || g.name, 'INSERT')),
  0,
  'GUARDRAIL: service_role retains write access for governed RPC / worker paths');

-- Approved governed RPC path remains available.
SELECT ok(has_function_privilege('authenticated', 'public.provider_work_package_transition(uuid,text,text,jsonb)', 'EXECUTE'),
          'GUARDRAIL: approved governed RPC (provider work package transition) is executable by signed-in users');

-- ---------- F read models exist, are read-only and are correctly exposed ----------
SELECT has_function('public', 'people_access_internal_profile', ARRAY['uuid'],
                    'people_access_internal_profile read model exists');
SELECT has_function('public', 'people_access_entity_overview', ARRAY['uuid'],
                    'people_access_entity_overview read model exists');
SELECT has_function('public', 'people_access_provider_overview', ARRAY['uuid'],
                    'people_access_provider_overview read model exists');
SELECT has_function('public', 'my_work_queue', ARRAY['integer'],
                    'my_work_queue read model exists');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('people_access_internal_profile','people_access_entity_overview',
                        'people_access_provider_overview','my_work_queue')
      AND p.provolatile <> 's'),
  0,
  'all Checkpoint F read models are STABLE (no write path)');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('people_access_internal_profile','people_access_entity_overview',
                        'people_access_provider_overview','my_work_queue')
      AND p.proconfig IS DISTINCT FROM ARRAY['search_path=public']),
  0,
  'all Checkpoint F read models pin search_path');

SELECT ok(NOT has_function_privilege('anon', 'public.people_access_internal_profile(uuid)', 'EXECUTE'),
          'anon cannot read the internal people read model');
SELECT ok(NOT has_function_privilege('anon', 'public.people_access_entity_overview(uuid)', 'EXECUTE'),
          'anon cannot read the entity access read model');
SELECT ok(NOT has_function_privilege('anon', 'public.people_access_provider_overview(uuid)', 'EXECUTE'),
          'anon cannot read the provider access read model');
SELECT ok(NOT has_function_privilege('anon', 'public.my_work_queue(integer)', 'EXECUTE'),
          'anon cannot read My Work');
SELECT ok(has_function_privilege('authenticated', 'public.my_work_queue(integer)', 'EXECUTE'),
          'signed-in users can read their own My Work');

-- ---------- No duplicated work / permission store was introduced ----------
SELECT is(
  (SELECT count(*)::int FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('my_work_items','people_access_cache','convergence_work_items',
                         'people_access_permissions')),
  0,
  'Checkpoint F introduced no generic work table and no second permission store');

-- ---------- Unauthenticated callers are refused, not leaked ----------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{}';

SELECT is((public.my_work_queue(5))->>'code', 'UNAUTHORIZED',
          'My Work refuses a caller with no identity');
SELECT is((public.people_access_internal_profile(gen_random_uuid()))->>'code', 'UNAUTHORIZED',
          'internal profile refuses a caller with no identity');
SELECT is((public.people_access_entity_overview(gen_random_uuid()))->>'code', 'UNAUTHORIZED',
          'entity access refuses a caller with no identity');
SELECT is((public.people_access_provider_overview(gen_random_uuid()))->>'code', 'UNAUTHORIZED',
          'provider access refuses a caller with no identity');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
