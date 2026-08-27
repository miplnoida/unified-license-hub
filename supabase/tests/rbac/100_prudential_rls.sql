-- pgTAP: Slice 9 - Prudential Supervision RBAC
BEGIN;
SELECT plan(20);

-- Helpers exist
SELECT has_function('public','can_read_prudential_entity', ARRAY['uuid','uuid']);
SELECT has_function('public','can_manage_prudential_config', ARRAY['uuid']);
SELECT has_function('public','can_act_on_prudential', ARRAY['uuid']);

-- Helpers behave for unknown user (no permissions, not super_admin)
SELECT ok( NOT public.can_manage_prudential_config('99999999-0000-0000-0000-000000000001'),
  'anon-like user cannot manage prudential config');
SELECT ok( NOT public.can_act_on_prudential('99999999-0000-0000-0000-000000000001'),
  'anon-like user cannot act on prudential');
SELECT ok( NOT public.can_read_prudential_entity('99999999-0000-0000-0000-000000000001', NULL),
  'anon-like user cannot read prudential entity');

-- Permissions registered
SELECT ok( EXISTS (SELECT 1 FROM public.permissions
  WHERE module='prudential_supervision' AND name='manage_config'),
  'manage_config permission registered');
SELECT ok( EXISTS (SELECT 1 FROM public.permissions
  WHERE module='prudential_supervision' AND name='view_all_entities'),
  'view_all_entities permission registered');
SELECT ok( EXISTS (SELECT 1 FROM public.permissions
  WHERE module='prudential_supervision' AND name='workflow_action'),
  'workflow_action permission registered');
SELECT ok( EXISTS (SELECT 1 FROM public.permissions
  WHERE module='prudential_supervision' AND name='delete'),
  'delete permission registered');

-- Policy presence
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_ratios'), 2,
  'prudential_ratios has read + write policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_thresholds'), 2,
  'prudential_thresholds has read + write policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_stress_indicators'), 2,
  'prudential_stress_indicators has read + write policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_assessments'), 4,
  'prudential_assessments has 4 (r/i/u/d) policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_actions'), 4,
  'prudential_actions has 4 (r/i/u/d) policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_escalations'), 4,
  'prudential_escalations has 4 (r/i/u/d) policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_stress_events'), 2,
  'prudential_stress_events has read + write policies');
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='prudential_data_feed_logs'), 1,
  'prudential_data_feed_logs has read-only policy (writes = service_role)');

-- RLS enabled
SELECT ok( (SELECT relrowsecurity FROM pg_class WHERE relname='prudential_assessments'),
  'RLS enabled on prudential_assessments');
SELECT ok( (SELECT relrowsecurity FROM pg_class WHERE relname='prudential_data_feed_logs'),
  'RLS enabled on prudential_data_feed_logs');

-- Anon revoked, authenticated + service_role granted
SELECT ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='prudential_assessments' AND grantee='anon'),
  'anon has no grants on prudential_assessments');
-- MC-12: prudential assessments are an authoritative regulatory store. Browser
-- roles hold no direct DML; every mutation goes through governed SECURITY
-- DEFINER operations (see docs/rbac/a1-certification.md).
SELECT ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='prudential_assessments'
      AND grantee IN ('authenticated','anon')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')),
  'browser roles hold no direct DML on prudential_assessments');

ROLLBACK;
