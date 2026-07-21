-- pgTAP: Slice 11 — Enforcement & Inspection RBAC
BEGIN;
SELECT plan(24);

-- Helpers exist with pinned search_path
SELECT has_function('public','can_read_enforcement', ARRAY['uuid','uuid']);
SELECT has_function('public','can_act_on_enforcement', ARRAY['uuid','text']);
SELECT has_function('public','can_read_inspection', ARRAY['uuid','uuid']);
SELECT has_function('public','can_act_on_inspection', ARRAY['uuid','text']);

-- Unknown user has no rights
SELECT ok(NOT public.can_read_enforcement('99999999-0000-0000-0000-000000000010', NULL),
  'unknown user cannot read enforcement');
SELECT ok(NOT public.can_act_on_enforcement('99999999-0000-0000-0000-000000000010','create'),
  'unknown user cannot create enforcement');
SELECT ok(NOT public.can_read_inspection('99999999-0000-0000-0000-000000000010', NULL),
  'unknown user cannot read inspection');
SELECT ok(NOT public.can_act_on_inspection('99999999-0000-0000-0000-000000000010','edit'),
  'unknown user cannot edit inspection');

-- Permissions registered
SELECT ok(EXISTS (SELECT 1 FROM public.permissions WHERE module='enforcement_management' AND name='view'),
  'enforcement_management.view registered');
SELECT ok(EXISTS (SELECT 1 FROM public.permissions WHERE module='enforcement_management' AND name='workflow_action'),
  'enforcement_management.workflow_action registered');
SELECT ok(EXISTS (SELECT 1 FROM public.permissions WHERE module='inspection_management' AND name='view'),
  'inspection_management.view registered');
SELECT ok(EXISTS (SELECT 1 FROM public.permissions WHERE module='inspection_management' AND name='delete'),
  'inspection_management.delete registered');

-- Policy counts
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='enforcement_actions'), 4,
  'enforcement_actions has 4 policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='enforcement_case_events'), 4,
  'enforcement_case_events has 4 policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='inspections'), 4,
  'inspections has 4 policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='inspection_findings'), 4,
  'inspection_findings has 4 policies');

-- No legacy has_role in new policies
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('enforcement_actions','enforcement_case_events','inspections','inspection_findings')
      AND (qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%')),
  0, 'no legacy has_role in slice 11 policies');

-- RLS enabled
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='enforcement_actions'), 'RLS on enforcement_actions');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='inspections'), 'RLS on inspections');

-- anon has no grants
SELECT ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='enforcement_actions' AND grantee='anon'),
  'anon has no grants on enforcement_actions');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='inspections' AND grantee='anon'),
  'anon has no grants on inspections');

-- Slice 13: assignment-alone must NOT grant read on enforcement/inspection.
-- Seed a licensee + assignment for a synthetic user with zero permissions.
INSERT INTO public.licensees (id, licensee_name, lead_regulator_id)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  'Slice13 Test Licensee',
  '55555555-5555-5555-5555-555555555555'
)
ON CONFLICT (id) DO UPDATE
SET lead_regulator_id = EXCLUDED.lead_regulator_id;

SELECT ok(
  public.user_has_entity_assignment(
    '55555555-5555-5555-5555-555555555555'::uuid,
    '77777777-7777-7777-7777-777777777777'::uuid),
  'seed: user is assigned to entity');

SELECT ok(
  NOT public.can_read_enforcement(
    '55555555-5555-5555-5555-555555555555'::uuid,
    '77777777-7777-7777-7777-777777777777'::uuid),
  'Slice 13: assignment alone does NOT grant enforcement read');

SELECT ok(
  NOT public.can_read_inspection(
    '55555555-5555-5555-5555-555555555555'::uuid,
    '77777777-7777-7777-7777-777777777777'::uuid),
  'Slice 13: assignment alone does NOT grant inspection read');

SELECT ok(
  NOT public.can_act_on_enforcement(
    '55555555-5555-5555-5555-555555555555'::uuid, 'edit'),
  'Slice 13: assignment alone does NOT grant enforcement edit');

ROLLBACK;

