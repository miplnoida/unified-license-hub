-- Phase 2 — RLS persona matrix for prudential analytics, EWI, CAMELS,
-- group risk and Phase 2 configuration objects (F8-W1B canonical rewrite).
--
-- Personas are REAL certification users from public.cert_certification_users.
-- No auth.users seeding is performed (the test role has no privilege on
-- auth.users and must not be granted any), and no privileged fixture setup is
-- required. Prudential analytics are read from the canonical calculated store
-- public.return_metric_values — the retired return_calculated_ratios store and
-- the dropped record_return_ratio writer are not referenced anywhere.
--
--   V  prudential viewer            regulatory_analyst    6db439ba-4833-431a-b69d-997ceb001cb4
--   A  prudential analyst           prudential_analyst    ef43e80a-e17e-4f26-aa91-bcf0d99e3d89
--   S  prudential supervisor        prudential_supervisor 021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce
--   X  unrelated internal user      conduct_analyst       87a7ada9-9ef8-49ac-a810-4eb04fecf1ac
--   E1 external applicant           applicant_user        79267820-04f3-4ae3-a18e-bdf1d97653e0
--   E2 external licensee user       licensee_primary_user cf2c227e-52fd-46ff-b751-db30ecd20ec1
--   AD platform admin               super_admin           4248640c-3397-4cf6-a274-fa09bad4ba64
--   anonymous (role anon, no JWT)

BEGIN;
SELECT plan(35);

DO $$
DECLARE
  v_metric uuid := '41bd9aef-04f8-4577-8522-125cd05efb15';  -- TOTAL_ASSETS
  v_sec uuid := '00000000-0000-0000-0000-0000000f2010';
  v_def uuid := '00000000-0000-0000-0000-0000000f2011';
  v_ent uuid := '00000000-0000-0000-0000-0000000f2013';
  v_grp uuid := '00000000-0000-0000-0000-0000000f2015';
  v_rule uuid := '00000000-0000-0000-0000-0000000f2016';
  v_sup uuid := '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce';
  v_ana uuid := 'ef43e80a-e17e-4f26-aa91-bcf0d99e3d89';
  ob uuid; per uuid; fil uuid; ver uuid;
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P2 RLS Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_definitions (id, code, name, frequency, status, is_active)
    VALUES (v_def, 'P2RLS', 'P2 RLS Return', 'QUARTERLY', 'ACTIVE', true)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_ent, 'P2 RLS Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  -- Canonical filing chain + canonical CALCULATED metric value.
  INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
  VALUES (v_ent, v_def, 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;
  INSERT INTO public.reporting_periods
    (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
  VALUES (ob, '2025-Q1', DATE '2025-01-01', DATE '2025-03-31', DATE '2025-04-30', 'OPEN')
  RETURNING id INTO per;
  INSERT INTO public.return_filings
    (filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
     return_definition_id, status, current_version_number)
  VALUES ('P2RLS-F1', v_ent, ob, per, v_def, 'ACCEPTED', 1) RETURNING id INTO fil;
  INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
  VALUES (fil, 1, 'ACCEPTED') RETURNING id INTO ver;
  INSERT INTO public.return_metric_values
    (id, return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
     value_numeric, availability, source_kind, calculated_at)
  VALUES ('00000000-0000-0000-0000-0000000f2040', ver, v_ent, v_metric, per,
          12.5, 'AVAILABLE', 'CALCULATED', now());

  -- Real prudential assignments for the positive persona paths.
  INSERT INTO public.entity_supervision_assignments
    (entity_id, lead_supervisor_user_id, alternate_supervisor_user_id, status, effective_from)
  VALUES (v_ent, v_sup, v_ana, 'active', now() - interval '1 day');

  INSERT INTO public.prudential_ewi_rules (id, code, name, rule_type, params, severity, is_active)
    VALUES (v_rule, 'P2_RLS_RULE', 'RLS probe rule', 'repeated_breach',
            '{"lookback_periods":3,"min_breaches":2}'::jsonb, 'medium', true)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.prudential_ewi_alerts
    (id, entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, status, evidence)
  VALUES ('00000000-0000-0000-0000-0000000f2020', v_ent, v_rule, 'P2_RLS_RULE', 1,
          DATE '2025-03-31', 'TOTAL_ASSETS', 'medium', 'open', '{"breaches":2}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.prudential_assessments
    (id, entity_id, period_start, period_end, status, created_by)
  VALUES ('00000000-0000-0000-0000-0000000f2030', v_ent, DATE '2025-01-01', DATE '2025-03-31',
          'draft', v_sup)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.financial_groups (id, group_code, name, holding_entity_id, sector_id)
  VALUES (v_grp, 'P2RLSG', 'P2 RLS Group', v_ent, v_sec) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.financial_group_members (group_id, licensee_id, member_role, consolidation_treatment)
  VALUES (v_grp, v_ent, 'ultimate_holding', 'full');
END$$;

-- ---------------------------------------------------------------------------
-- 1. RLS is enabled on every prudential surface used below
-- ---------------------------------------------------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.return_metric_values'::regclass),
          'RLS is enabled on the canonical metric store return_metric_values');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prudential_ewi_alerts'::regclass),
          'RLS is enabled on prudential_ewi_alerts');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prudential_assessments'::regclass),
          'RLS is enabled on prudential_assessments');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.group_consolidated_snapshots'::regclass),
          'RLS is enabled on group_consolidated_snapshots');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prudential_ewi_rules'::regclass),
          'RLS is enabled on prudential_ewi_rules (configuration)');

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 2. Positive personas
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.return_metric_values
            WHERE id = '00000000-0000-0000-0000-0000000f2040'), 1,
          'S prudential supervisor can read canonical calculated analytics');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 1,
          'S prudential supervisor can read EWI alerts');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 1,
          'S prudential supervisor can read the assessment');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 1,
          'S prudential supervisor can read group structures');

SET LOCAL "request.jwt.claims" = '{"sub":"4248640c-3397-4cf6-a274-fa09bad4ba64","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 1,
          'AD admin can read EWI alerts');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 1,
          'AD admin can read group structures');

SET LOCAL "request.jwt.claims" = '{"sub":"ef43e80a-e17e-4f26-aa91-bcf0d99e3d89","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 1,
          'A prudential analyst can read the assessment awaiting review');
SELECT is((SELECT COUNT(*)::int FROM public.return_metric_values
            WHERE id = '00000000-0000-0000-0000-0000000f2040'), 1,
          'A prudential analyst can read canonical calculated analytics');

-- ---------------------------------------------------------------------------
-- 3. Negative personas
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"79267820-04f3-4ae3-a18e-bdf1d97653e0","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 0,
          'E1 applicant cannot read EWI alerts by id');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 0,
          'E1 applicant cannot read supervisory assessments by id');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 0,
          'E1 applicant cannot read group risk by id');
SELECT is((SELECT COUNT(*)::int FROM public.group_consolidated_snapshots), 0,
          'E1 applicant sees no consolidated group snapshots at all');

SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 0,
          'E2 entity user cannot inspect supervisory CAMELS assessments');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 0,
          'E2 entity user cannot inspect EWI alerts about it');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 0,
          'E2 entity user cannot inspect the group record');

SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE id = '00000000-0000-0000-0000-0000000f2020'), 0,
          'X unrelated internal user cannot read EWI alerts');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000f2030'), 0,
          'X unrelated internal user cannot read assessments');
SELECT is((SELECT COUNT(*)::int FROM public.return_metric_values
            WHERE id = '00000000-0000-0000-0000-0000000f2040'), 0,
          'X unrelated internal user cannot read prudential analytics');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 0,
          'X unrelated internal user cannot read group structures');

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
SELECT is((SELECT COUNT(*)::int FROM public.return_metric_values
            WHERE id = '00000000-0000-0000-0000-0000000f2040'), 0,
          'anonymous callers see no canonical prudential analytics');
SELECT is((SELECT COUNT(*)::int FROM public.financial_groups
            WHERE id = '00000000-0000-0000-0000-0000000f2015'), 0,
          'anonymous callers see no financial groups');
SELECT is((SELECT COUNT(*)::int FROM public.group_consolidated_snapshots), 0,
          'anonymous callers see no consolidated group snapshots');
RESET ROLE;
SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 4. Write paths: EWI acknowledgement actor cannot be spoofed
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.prudential_ewi_acknowledge('00000000-0000-0000-0000-0000000f2020'::uuid,
      'not allowed', 'acknowledged')$$,
  NULL, NULL, 'X unrelated internal user cannot acknowledge an EWI alert');

SET LOCAL "request.jwt.claims" = '{"sub":"6db439ba-4833-431a-b69d-997ceb001cb4","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.prudential_ewi_acknowledge('00000000-0000-0000-0000-0000000f2020'::uuid,
      'viewer attempt', 'acknowledged')$$,
  NULL, NULL, 'V read-only prudential viewer cannot acknowledge an EWI alert');

SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
SELECT throws_ok(
  $$UPDATE public.prudential_ewi_alerts
      SET status = 'acknowledged',
          acknowledged_by = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'
    WHERE id = '00000000-0000-0000-0000-0000000f2020'$$,
  NULL, NULL, 'E2 entity user cannot spoof an acknowledgement actor by direct update');

SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.prudential_ewi_acknowledge('00000000-0000-0000-0000-0000000f2020'::uuid,
      'reviewed', 'acknowledged')$$,
  'S prudential supervisor can acknowledge an EWI alert');

-- ---------------------------------------------------------------------------
-- 5. CAMELS write scope
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.prudential_assessment_component_ratings
      (assessment_id, component_code, rating, narrative)
    VALUES ('00000000-0000-0000-0000-0000000f2030', 'C', '2', 'supervisor rating')$$,
  'S prudential supervisor can rate components on an assigned assessment');

SET LOCAL "request.jwt.claims" = '{"sub":"79267820-04f3-4ae3-a18e-bdf1d97653e0","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.prudential_assessment_component_ratings
      (assessment_id, component_code, rating) VALUES
      ('00000000-0000-0000-0000-0000000f2030', 'A', '1')$$,
  '42501', NULL, 'E1 applicant cannot write CAMELS component ratings');
SELECT throws_ok(
  $$INSERT INTO public.prudential_assessments (entity_id, status)
    VALUES ('00000000-0000-0000-0000-0000000f2013', 'draft')$$,
  '42501', NULL, 'E1 applicant cannot create a supervisory assessment');

-- ---------------------------------------------------------------------------
-- 6. Configuration objects are admin-only
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
SELECT throws_ok(
  $$UPDATE public.prudential_ewi_rules SET severity = 'low'
     WHERE id = '00000000-0000-0000-0000-0000000f2016'$$,
  NULL, NULL, 'an ordinary supervisor cannot mutate EWI rule configuration');
SELECT throws_ok(
  $$INSERT INTO public.prudential_assessment_components (code, label, weight, sort_order)
    VALUES ('ZZ', 'Rogue component', 1, 99)$$,
  '42501', NULL, 'an ordinary supervisor cannot add assessment components');

SET LOCAL "request.jwt.claims" = '{"sub":"4248640c-3397-4cf6-a274-fa09bad4ba64","role":"authenticated"}';
SELECT lives_ok(
  $$UPDATE public.prudential_ewi_rules SET severity = 'low'
     WHERE id = '00000000-0000-0000-0000-0000000f2016'$$,
  'an admin can maintain EWI rule configuration');

-- ---------------------------------------------------------------------------
-- 7. The retired ratio store is not part of any persona path
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'record_return_ratio'), 0,
          'the retired ratio writer record_return_ratio does not exist');
SELECT is((SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('group_member_ratios','group_data_coverage')
              AND pg_get_functiondef(p.oid) LIKE '%return_calculated_ratios%'), 0,
          'group supervision routines no longer read the retired ratio store');

SELECT * FROM finish();
ROLLBACK;
