-- pgTAP: Slice 8 - Approval Workflow & Collaborative Review RBAC
BEGIN;
SELECT plan(24);

-- Personas
SELECT lives_ok($$
  INSERT INTO auth.users (id, email) VALUES
    ('11111111-0000-0000-0000-000000000001','super@test'),
    ('11111111-0000-0000-0000-000000000002','viewer@test'),
    ('11111111-0000-0000-0000-000000000003','config@test'),
    ('11111111-0000-0000-0000-000000000004','actor@test'),
    ('11111111-0000-0000-0000-000000000005','ext@test'),
    ('11111111-0000-0000-0000-000000000006','applicant@test')
  ON CONFLICT DO NOTHING;
$$, 'seed personas');

-- Helper stubs — assume role/permission wiring set up in shared fixtures.
-- 1. can_read_approval_config gating
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-0000-0000-0000-000000000002',true);
SELECT ok( public.can_read_approval_config('11111111-0000-0000-0000-000000000002') IS NOT NULL,
  'read helper returns boolean for viewer');

-- 2. mutation helper false for non-manage user
SELECT ok( NOT public.can_mutate_approval_config('11111111-0000-0000-0000-000000000002'),
  'viewer cannot mutate config');

-- 3. actor helper false for non-authorised user
SELECT ok( NOT public.can_act_on_approval('11111111-0000-0000-0000-000000000005'),
  'external cannot act on approval');

-- 4. can_read_workflow_instance allows applicant on own application
SELECT lives_ok($$
  INSERT INTO public.applications(id, applicant_id, license_type)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000006','ZZ Test Licence Type')
  ON CONFLICT DO NOTHING;
$$, 'seed application for applicant');

SELECT ok(
  public.can_read_workflow_instance('11111111-0000-0000-0000-000000000006',
    'aaaaaaaa-0000-0000-0000-000000000001'),
  'applicant can read their own workflow instance');

SELECT ok(
  NOT public.can_read_workflow_instance('11111111-0000-0000-0000-000000000005',
    'aaaaaaaa-0000-0000-0000-000000000001'),
  'external not owning the application cannot read workflow instance');

-- 5. Policy presence assertions
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_workflows'), 2,
  'approval_workflows has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_workflow_versions'), 2,
  'approval_workflow_versions has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_workflow_types'), 2,
  'approval_workflow_types has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_steps'), 2,
  'approval_steps has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_step_actions'), 2,
  'approval_step_actions has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_actions'), 4,
  'approval_actions has SELECT/INSERT/UPDATE/DELETE policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='delegation_rules'), 2,
  'delegation_rules has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='workflow_instances'), 2,
  'workflow_instances has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='workflow_templates'), 2,
  'workflow_templates has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_action_notifications'), 2,
  'approval_action_notifications has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='approval_step_entry_notifications'), 2,
  'approval_step_entry_notifications has exactly read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='review_comments'), 4,
  'review_comments has select/insert/update/delete policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='review_suggestions'), 4,
  'review_suggestions has select/insert/update/delete policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='review_step_permissions'), 2,
  'review_step_permissions has read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='review_role_display_settings'), 2,
  'review_role_display_settings has read+write policies');

SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND tablename='review_narrative_fields'), 2,
  'review_narrative_fields has read+write policies');

-- 6. Assert legacy `has_role()` calls are gone from these tables
SELECT is( (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('approval_workflows','approval_workflow_versions','approval_workflow_types',
                        'approval_steps','approval_step_actions','approval_actions',
                        'approval_action_notifications','approval_step_entry_notifications',
                        'delegation_rules','workflow_instances','workflow_templates')
      AND (qual ILIKE '%has_role(%' OR with_check ILIKE '%has_role(%')), 0,
  'no legacy has_role() clauses remain on approval workflow tables');

-- 7. Assert new permission actions exist
SELECT is( (SELECT count(*)::int
   FROM public.permission_modules pm
   JOIN public.permission_actions pa ON pa.module_id=pm.id
   WHERE pm.key='workflow_management'
     AND pa.key IN ('delete','workflow_action','manage_config','view_all')), 4,
  'four new workflow_management permissions registered');

SELECT * FROM finish();
ROLLBACK;
