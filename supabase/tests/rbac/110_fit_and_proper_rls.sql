-- pgTAP: Slice 10 - Fit & Proper RBAC
BEGIN;
SELECT plan(22);

-- Helpers
SELECT has_function('public','can_manage_fp_config', ARRAY['uuid']);
SELECT has_function('public','can_act_on_fp', ARRAY['uuid']);
SELECT has_function('public','can_read_fp_licensee', ARRAY['uuid','uuid']);
SELECT has_function('public','can_read_fp_individual', ARRAY['uuid','uuid']);
SELECT has_function('public','can_read_fp_assessment', ARRAY['uuid','uuid']);

-- Unknown user has no rights
SELECT ok( NOT public.can_manage_fp_config('99999999-0000-0000-0000-000000000010'),
  'unknown user cannot manage F&P config');
SELECT ok( NOT public.can_act_on_fp('99999999-0000-0000-0000-000000000010'),
  'unknown user cannot act on F&P');
SELECT ok( NOT public.can_read_fp_licensee('99999999-0000-0000-0000-000000000010', NULL),
  'unknown user cannot read F&P licensee');

-- Permissions registered
SELECT ok( EXISTS (SELECT 1 FROM public.permissions WHERE module='fit_and_proper' AND name='manage_config'),
  'fit_and_proper.manage_config registered');
SELECT ok( EXISTS (SELECT 1 FROM public.permissions WHERE module='fit_and_proper' AND name='view_all_entities'),
  'fit_and_proper.view_all_entities registered');
SELECT ok( EXISTS (SELECT 1 FROM public.permissions WHERE module='fit_and_proper' AND name='workflow_action'),
  'fit_and_proper.workflow_action registered');
SELECT ok( EXISTS (SELECT 1 FROM public.permissions WHERE module='fit_and_proper' AND name='delete'),
  'fit_and_proper.delete registered');

-- Policy counts per table
SELECT is( (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='fp_screening_configs'), 2, 'fp_screening_configs r+w');
SELECT is( (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='fp_committees'), 2, 'fp_committees r+w');
SELECT is( (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='fp_individuals'), 4, 'fp_individuals r/i/u/d');
SELECT is( (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='fp_individual_roles'), 4, 'fp_individual_roles r/i/u/d');
SELECT is( (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='fp_assessments'), 4, 'fp_assessments r/i/u/d');
SELECT is( (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='fp_committee_votes'), 3, 'fp_committee_votes r/i/u');

-- No legacy has_role in new policies
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'fp_%'
      AND (qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%')),
  0, 'no legacy has_role in fp_* policies');

-- RLS enabled
SELECT ok( (SELECT relrowsecurity FROM pg_class WHERE relname='fp_assessments'), 'RLS on fp_assessments');
SELECT ok( (SELECT relrowsecurity FROM pg_class WHERE relname='fp_individuals'), 'RLS on fp_individuals');

-- Grants hardened
SELECT ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='fp_assessments' AND grantee='anon'),
  'anon has no grants on fp_assessments');
-- MC-12: fit-and-proper assessments carry sensitive personal data and are an
-- authoritative store. Browser roles hold no direct DML; mutations flow through
-- governed SECURITY DEFINER operations only.
SELECT ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='fp_assessments'
      AND grantee IN ('authenticated','anon')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')),
  'browser roles hold no direct DML on fp_assessments');

ROLLBACK;
