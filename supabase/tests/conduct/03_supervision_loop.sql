BEGIN;
SELECT plan(14);

-- Table + columns
SELECT has_table('public','conduct_supervision_annotations','annotation table exists');
SELECT has_column('public','conduct_supervision_annotations','licensee_id','has licensee_id');
SELECT has_column('public','conduct_supervision_annotations','event_date','has event_date');
SELECT has_column('public','conduct_supervision_annotations','label','has label');

-- RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conduct_supervision_annotations'::regclass),
  true, 'RLS enabled on annotations');

-- Policies exist
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='conduct_supervision_annotations'),
  2, 'read + manage policies present');

-- Grants for the Data API
SELECT ok(
  has_table_privilege('authenticated','public.conduct_supervision_annotations','SELECT'),
  'authenticated can select annotations');
SELECT ok(
  has_table_privilege('service_role','public.conduct_supervision_annotations','INSERT'),
  'service_role can insert annotations');

-- RPCs exist
SELECT has_function('public','conduct_supervision_loop_summary','summary RPC exists');
SELECT has_function('public','conduct_supervision_loop_cases','drill-down RPC exists');
SELECT has_function('public','conduct_supervision_timeline','timeline RPC exists');
SELECT has_function('public','conduct_supervision_unresolved_risks','unresolved risks RPC exists');
SELECT has_function('public','conduct_supervision_learning','learning RPC exists');

-- RPCs are not executable by anon (authorisation gate is server-side)
SELECT ok(
  NOT has_function_privilege('anon',
    'public.conduct_supervision_loop_summary(uuid,date,date,uuid)','EXECUTE'),
  'anon cannot execute supervision loop summary');

SELECT * FROM finish();
ROLLBACK;
