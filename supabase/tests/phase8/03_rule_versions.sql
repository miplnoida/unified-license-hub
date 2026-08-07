-- Phase 8 / MCS-SUR-003 — configurable surveillance rules with immutable versions.
--
-- Asserts: the rule record carries code/metric/threshold/operator/lookback and a
-- current_version; every insert and every meaningful edit writes an immutable
-- version snapshot and bumps the version; cosmetic edits do not bump; historical
-- snapshots keep the old threshold; the version table is read-only for clients;
-- and rule configuration is not editable by an ordinary conduct reviewer.

BEGIN;
SELECT plan(21);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT has_column('public','conduct_monitoring_rules','code','rule code exists');
SELECT has_column('public','conduct_monitoring_rules','metric','rule metric exists');
SELECT has_column('public','conduct_monitoring_rules','source_dataset','rule source dataset exists');
SELECT has_column('public','conduct_monitoring_rules','threshold_value','rule threshold exists');
SELECT has_column('public','conduct_monitoring_rules','comparison_operator','rule operator exists');
SELECT has_column('public','conduct_monitoring_rules','lookback_days','rule lookback exists');
SELECT has_column('public','conduct_monitoring_rules','current_version','rule current version exists');
SELECT has_table('public','conduct_monitoring_rule_versions','rule version table exists');
SELECT col_not_null('public','conduct_monitoring_rule_versions','snapshot','version snapshot is NOT NULL');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_indexes WHERE schemaname='public'
   AND tablename='conduct_monitoring_rule_versions'
   AND indexdef ILIKE '%UNIQUE%(rule_id, version)%'
), 'one snapshot per rule version');
SELECT ok((SELECT relrowsecurity FROM pg_class
            WHERE oid='public.conduct_monitoring_rule_versions'::regclass),
          'RLS enabled on rule versions');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_policies WHERE tablename='conduct_monitoring_rule_versions'
   AND cmd IN ('UPDATE','DELETE','ALL')
), 'clients have no UPDATE/DELETE policy on rule versions');

-- ---------------------------------------------------------------------------
-- Version behaviour
-- ---------------------------------------------------------------------------
INSERT INTO public.conduct_monitoring_rules
  (id, name, code, metric, source_dataset, threshold_value, comparison_operator,
   lookback_days, definition, active)
VALUES ('00000000-0000-0000-0000-0000000f8200','P8 Version Rule','P8_VER','complaint_count',
        'complaints', 10, '>', 30,
        '{"metric":"complaint_count","threshold":10,"lookback_days":30}'::jsonb, true);

SELECT is((SELECT current_version FROM public.conduct_monitoring_rules
            WHERE id='00000000-0000-0000-0000-0000000f8200'), 1,
          'a new rule starts at version 1');
SELECT is((SELECT count(*)::int FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200'), 1,
          'creating a rule snapshots version 1');
SELECT is((SELECT (snapshot->>'threshold_value')::numeric
             FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200' AND version=1),
          10::numeric, 'version 1 snapshot records the original threshold');

-- Cosmetic change: no new version.
UPDATE public.conduct_monitoring_rules SET description='clarified wording'
 WHERE id='00000000-0000-0000-0000-0000000f8200';
SELECT is((SELECT current_version FROM public.conduct_monitoring_rules
            WHERE id='00000000-0000-0000-0000-0000000f8200'), 1,
          'a cosmetic edit does not bump the version');
SELECT is((SELECT count(*)::int FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200'), 1,
          'a cosmetic edit does not write a snapshot');

-- Meaningful change: version bumps and snapshots.
UPDATE public.conduct_monitoring_rules SET threshold_value=6, lookback_days=14
 WHERE id='00000000-0000-0000-0000-0000000f8200';
SELECT is((SELECT current_version FROM public.conduct_monitoring_rules
            WHERE id='00000000-0000-0000-0000-0000000f8200'), 2,
          'a threshold change bumps the rule version');
SELECT is((SELECT (snapshot->>'threshold_value')::numeric
             FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200' AND version=2),
          6::numeric, 'version 2 snapshot records the new threshold');
SELECT is((SELECT (snapshot->>'threshold_value')::numeric
             FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200' AND version=1),
          10::numeric, 'version 1 snapshot is unchanged by the later edit');
SELECT is((SELECT (snapshot->>'lookback_days')::int
             FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200' AND version=1),
          30, 'version 1 keeps the lookback it was evaluated with');

-- Deactivation is a meaningful change too.
UPDATE public.conduct_monitoring_rules SET active=false
 WHERE id='00000000-0000-0000-0000-0000000f8200';
SELECT is((SELECT current_version FROM public.conduct_monitoring_rules
            WHERE id='00000000-0000-0000-0000-0000000f8200'), 3,
          'deactivating a rule bumps the version');
SELECT is((SELECT (snapshot->>'active')::boolean
             FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8200' AND version=3),
          false, 'version 3 snapshot records the inactive state');

-- ---------------------------------------------------------------------------
-- Client cannot rewrite history or reconfigure rules without permission
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f8210','p8-rules-reviewer@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.roles (id, name, system_role, status)
VALUES ('00000000-0000-0000-0000-0000000f8211','P8 Rules Reviewer','analyst','active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f8211', p.id FROM public.permissions p
 WHERE p.module='market_conduct' AND p.name IN ('view','run_conduct_analytics')
ON CONFLICT DO NOTHING;
INSERT INTO public.user_dynamic_roles (user_id, role_id)
VALUES ('00000000-0000-0000-0000-0000000f8210','00000000-0000-0000-0000-0000000f8211')
ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8210","role":"authenticated"}';

SELECT throws_ok(
  $$UPDATE public.conduct_monitoring_rule_versions SET snapshot='{}'::jsonb
     WHERE rule_id='00000000-0000-0000-0000-0000000f8200'$$,
  NULL, NULL, 'a rule version snapshot cannot be rewritten by a client');
SELECT throws_ok(
  $$DELETE FROM public.conduct_monitoring_rule_versions
     WHERE rule_id='00000000-0000-0000-0000-0000000f8200'$$,
  NULL, NULL, 'a rule version snapshot cannot be deleted by a client');
SELECT throws_ok(
  $$UPDATE public.conduct_monitoring_rules SET threshold_value=1
     WHERE id='00000000-0000-0000-0000-0000000f8200'$$,
  NULL, NULL, 'a reviewer without manage_monitoring_rules cannot reconfigure a rule');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
