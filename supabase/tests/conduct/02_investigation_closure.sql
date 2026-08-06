-- Formal Investigation — Closure & Discontinuation: structure, grants, RLS and RPC behaviour.
BEGIN;
SELECT plan(14);

SELECT has_table('public','conduct_investigation_closures','closure table exists');
SELECT has_table('public','conduct_closure_breaches','breaches table exists');
SELECT has_table('public','conduct_post_closure_monitoring','monitoring table exists');
SELECT has_table('public','conduct_monitoring_reviews','monitoring review table exists');
SELECT has_column('public','conduct_investigation_closures','determination_type','determination captured');
SELECT has_column('public','conduct_investigations','discontinuation_ground','discontinuation ground captured');

SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_investigation_closures'::regclass), true, 'RLS on closures');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_post_closure_monitoring'::regclass), true, 'RLS on monitoring');
SELECT ok(has_table_privilege('authenticated','public.conduct_investigation_closures','SELECT'), 'authenticated can select closures');
SELECT ok(has_table_privilege('service_role','public.conduct_post_closure_monitoring','INSERT'), 'service_role can insert monitoring');

SELECT has_function('public','conduct_closure_submit','submit RPC exists');
SELECT has_function('public','conduct_closure_approve','approve RPC exists');

-- Behaviour: discontinuation without a ground is rejected; a complete record submits.
DO $$
DECLARE inv uuid := gen_random_uuid(); cl uuid;
BEGIN
  INSERT INTO public.conduct_investigations(id, source_type, allegation, status)
    VALUES (inv, 'manual', 'Closure gate test allegation', 'analysis');
  INSERT INTO public.conduct_investigation_closures(
    investigation_id, version, determination_type, findings_summary, rationale)
  VALUES (inv, 1, 'discontinuation',
    'Findings show the complaint was withdrawn before any breach could be established.',
    'The matter cannot proceed because the complainant withdrew and no other evidence exists.')
  RETURNING id INTO cl;
  PERFORM set_config('test.closure_id', cl::text, true);
END $$;

SET LOCAL ROLE service_role;

SELECT throws_ok(
  format($$SELECT public.conduct_closure_submit(%L::uuid, NULL, NULL)$$, current_setting('test.closure_id')),
  '23514', NULL, 'discontinuation without a ground is rejected');

UPDATE public.conduct_investigation_closures
   SET discontinuation_ground='insufficient_evidence'
 WHERE id = current_setting('test.closure_id')::uuid;

SELECT lives_ok(
  format($$SELECT public.conduct_closure_submit(%L::uuid, NULL, NULL)$$, current_setting('test.closure_id')),
  'a complete discontinuation record submits for approval');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
