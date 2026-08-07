BEGIN;
SELECT plan(16);

-- AI insights model ---------------------------------------------------------
SELECT has_table('public','ai_insights','ai insights table exists');
SELECT has_table('public','ai_insight_actions','ai insight decision log exists');
SELECT has_function('public','ai_insight_review','ai insight review RPC exists');
SELECT has_column('public','ai_insights','provider_state','provider state is explicit');
SELECT has_column('public','ai_insights','confidence','confidence recorded');
SELECT has_column('public','ai_insights','explanation','explanation recorded');
SELECT has_column('public','ai_insights','source_records','source records recorded');
SELECT has_column('public','ai_insights','citations','citations recorded');
SELECT has_column('public','ai_insights','review_status','human review status recorded');
SELECT has_column('public','ai_insight_actions','justification','decisions carry justification');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_insights'::regclass),
  'RLS enabled on ai_insights');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_insight_actions'::regclass),
  'RLS enabled on ai_insight_actions');
SELECT ok(
  (SELECT count(*) FROM pg_policies WHERE tablename='ai_insights') > 0,
  'ai_insights has policies');
SELECT ok(
  NOT has_table_privilege('authenticated','public.ai_insight_actions','UPDATE')
  AND NOT has_table_privilege('authenticated','public.ai_insight_actions','DELETE'),
  'AI decision log is append-only for clients');
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE proname='ai_insight_review'),
  'ai_insight_review is SECURITY DEFINER');

-- Executive aggregation ------------------------------------------------------
SELECT ok(
  (SELECT NOT prosecdef FROM pg_proc WHERE proname='executive_conduct_summary'),
  'executive summary runs with caller privileges so RLS still applies');

SELECT * FROM finish();
ROLLBACK;
