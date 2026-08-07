-- Phase 2 — RLS persona matrix for prudential analytics, EWI, CAMELS,
-- group risk and Phase 2 configuration objects.
--
-- Personas:
--   P1 applicant (external portal user)
--   P2 regulated entity user (licensee_primary, mapped to entity A)
--   P3 prudential supervisor (supervisor)
--   P4 team lead / licensing officer
--   P5 reviewer/approver (analyst with prudential read)
--   P6 admin (super_admin)
--   P7 unauthorised internal user (no roles)

BEGIN;
SELECT plan(31);

-- ---------------------------------------------------------------------------
-- Personas and fixtures
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f2001', 'p2-rls-applicant@test'),
  ('00000000-0000-0000-0000-0000000f2002', 'p2-rls-entity@test'),
  ('00000000-0000-0000-0000-0000000f2003', 'p2-rls-supervisor@test'),
  ('00000000-0000-0000-0000-0000000f2004', 'p2-rls-lead@test'),
  ('00000000-0000-0000-0000-0000000f2005', 'p2-rls-analyst@test'),
  ('00000000-0000-0000-0000-0000000f2006', 'p2-rls-admin@test'),
  ('00000000-0000-0000-0000-0000000f2007', 'p2-rls-nobody@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000f2001', 'applicant'),
  ('00000000-0000-0000-0000-0000000f2002', 'licensee_primary'),
  ('00000000-0000-0000-0000-0000000f2003', 'supervisor'),
  ('00000000-0000-0000-0000-0000000f2004', 'licensing_officer'),
  ('00000000-0000-0000-0000-0000000f2005', 'analyst'),
  ('00000000-0000-0000-0000-0000000f2006', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_sec uuid := '00000000-0000-0000-0000-0000000f2010';
  v_type uuid := '00000000-0000-0000-0000-0000000f2011';
  v_cfg uuid := '00000000-0000-0000-0000-0000000f2012';
  v_ent uuid := '00000000-0000-0000-0000-0000000f2013';
  v_ret uuid := '00000000-0000-0000-0000-0000000f2014';
  v_grp uuid := '00000000-0000-0000-0000-0000000f2015';
  v_rule uuid := '00000000-0000-0000-0000-0000000f2016';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P2 RLS Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_types (id, name, code) VALUES (v_type, 'P2 RLS Return', 'P2RLS')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_configs (id, name, return_type_id, sector_id)
    VALUES (v_cfg, 'P2 RLS Config', v_type, v_sec) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_ent, 'P2 RLS Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;
  INSERT INTO public.returns_filed
    (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status)
  VALUES (v_ret, v_cfg, v_ent, v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
    ON CONFLICT (id) DO NOTHING;
  PERFORM public.record_return_ratio(v_ret, 'car', 'CAR', 12.5, 'percent', NULL, NULL, 1, 'f');

  INSERT INTO public.prudential_ewi_rules (id, code, name, rule_type, params, severity, is_active)
    VALUES (v_rule, 'P2_RLS_RULE', 'RLS probe rule', 'repeated_breach',
            '{"lookback_periods":3,"min_breaches":2}'::jsonb, 'medium', true)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.prudential_ewi_alerts
    (id, entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, status, evidence)
  VALUES ('00000000-0000-0000-0000-0000000f2020', v_ent, v_rule, 'P2_RLS_RULE', 1,
          DATE '2025-03-31', 'car', 'medium', 'open', '{"breaches":2}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.prudential_assessments
    (id, entity_id, period_start, period_end, status, created_by)
  VALUES ('00000000-0000-0000-0000-0000000f2030', v_ent, DATE '2025-01-01', DATE '2025-03-31',
          'draft', '00000000-0000-0000-0000-0000000f2003')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.financial_groups (id, group_code, name, holding_entity_id, sector_id)
  VALUES (v_grp, 'P2RLSG', 'P2 RLS Group', v_ent, v_sec) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.financial_group_members (group_id, licensee_id, member_role, consolidation_treatment)
  VALUES (v_grp, v_ent, 'holding', 'full');
END$$;

-- ---------------------------------------------------------------------------
-- 1. Analytics (calculated ratios / thresholds) — RLS enforced as a table user
-- ---------------------------------------------------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.return_calculated_ratios'::regclass),
          'RLS is enabled on return_calculated_ratios');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prudential_ewi_alerts'::regclass),
          'RLS is enabled on prudential_ewi_alerts');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prudential_assessments'::regclass),
          'RLS is enabled on prudential_assessments');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.group_consolidated_snapshots'::regclass),
          'RLS is enabled on group_consolidated_snapshots');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prudential_ewi_rules'::regclass),
          'RLS is enabled on prudential_ewi_rules (configuration)');

SET LOCAL ROLE authenticated;

-- Supervisor persona can see supervisory analytics.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2003","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.return_calculated_ratios
            WHERE return_id = '00000000-0000-0000-0000-0000000f2014'), 1,
          'P3 prudential supervisor can read calculated ratio analytics');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 1,
          'P3 prudential supervisor can read EWI alerts');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 1,
          'P3 prudential supervisor can read the assessment');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 1,
          'P3 prudential supervisor can read group risk structures');

-- Admin persona.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2006","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 1,
          'P6 admin can read EWI alerts');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 1,
          'P6 admin can read group risk structures');

-- Reviewer/analyst persona.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2005","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 1,
          'P5 reviewer can read the assessment awaiting review');

-- External applicant persona: direct-ID access must not bypass scope.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2001","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 0,
          'P1 applicant cannot read EWI alerts by id');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 0,
          'P1 applicant cannot read supervisory assessments by id');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 0,
          'P1 applicant cannot read group risk by id');
SELECT is((SELECT COUNT(*)::int FROM public.group_consolidated_snapshots), 0,
          'P1 applicant sees no consolidated group snapshots at all');

-- Regulated entity user (not mapped to the entity): supervisory analytics stay hidden.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2002","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 0,
          'P2 entity user cannot inspect supervisory CAMELS assessments');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 0,
          'P2 entity user cannot inspect EWI alerts about it');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 0,
          'P2 entity user cannot inspect the group risk record');

-- Unauthorised internal user (authenticated, no roles).
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2007","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 0,
          'P7 unauthorised internal user cannot read EWI alerts');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 0,
          'P7 unauthorised internal user cannot read assessments');
SELECT is((SELECT COUNT(*)::int FROM public.return_calculated_ratios
            WHERE return_id = '00000000-0000-0000-0000-0000000f2014'), 0,
          'P7 unauthorised internal user cannot read prudential analytics');

-- ---------------------------------------------------------------------------
-- 2. Write paths: EWI acknowledgement actor cannot be spoofed
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.prudential_ewi_acknowledge('00000000-0000-0000-0000-0000000f2020'::uuid,
      'not allowed', 'acknowledged')$$,
  NULL, NULL, 'P7 unauthorised internal user cannot acknowledge an EWI alert');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2002","role":"authenticated"}';
SELECT throws_ok(
  $$UPDATE public.prudential_ewi_alerts
      SET status = 'acknowledged',
          acknowledged_by = '00000000-0000-0000-0000-0000000f2003'
    WHERE id = '00000000-0000-0000-0000-0000000f2020'$$,
  NULL, NULL, 'P2 entity user cannot spoof an acknowledgement actor by direct update');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2003","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.prudential_ewi_acknowledge('00000000-0000-0000-0000-0000000f2020'::uuid,
      'reviewed', 'acknowledged')$$,
  'P3 prudential supervisor can acknowledge an EWI alert');

-- ---------------------------------------------------------------------------
-- 3. CAMELS write scope
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.prudential_assessment_component_ratings
      (assessment_id, component_code, rating, narrative)
    VALUES ('00000000-0000-0000-0000-0000000f2030', 'C', '2', 'supervisor rating')$$,
  'P3 prudential supervisor can rate components on an assigned assessment');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2001","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.prudential_assessment_component_ratings
      (assessment_id, component_code, rating) VALUES
      ('00000000-0000-0000-0000-0000000f2030', 'A', '1')$$,
  '42501', NULL, 'P1 applicant cannot write CAMELS component ratings');
SELECT throws_ok(
  $$INSERT INTO public.prudential_assessments (entity_id, status)
    VALUES ('00000000-0000-0000-0000-0000000f2013', 'draft')$$,
  '42501', NULL, 'P1 applicant cannot create a supervisory assessment');

-- ---------------------------------------------------------------------------
-- 4. Configuration objects are admin-only
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2003","role":"authenticated"}';
SELECT throws_ok(
  $$UPDATE public.prudential_ewi_rules SET severity = 'low'
     WHERE id = '00000000-0000-0000-0000-0000000f2016'$$,
  NULL, NULL, 'an ordinary supervisor cannot mutate EWI rule configuration');
SELECT throws_ok(
  $$INSERT INTO public.prudential_assessment_components (code, label, weight, sort_order)
    VALUES ('ZZ', 'Rogue component', 1, 99)$$,
  '42501', NULL, 'an ordinary supervisor cannot add assessment components');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f2006","role":"authenticated"}';
SELECT lives_ok(
  $$UPDATE public.prudential_ewi_rules SET severity = 'low'
     WHERE id = '00000000-0000-0000-0000-0000000f2016'$$,
  'an admin can maintain EWI rule configuration');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
