-- Phase 2 / PRU-GRP-001 — group hierarchy resolution, consolidated metrics and
-- data-coverage states, proved on CANONICAL truth only (F8-W1B).
--
-- Canonical sources used by this test (no retired ratio store anywhere):
--   return_filings -> return_filing_versions -> return_metric_values
--   (source_kind='CALCULATED') keyed to regulatory_metrics.code, with the
--   period resolved through reporting_periods.period_label.
--
-- Fixtures (period 2025-Q1, metric TOTAL_ASSETS, unit XCD => display 'number' => sum):
--   Holding H  TOTAL_ASSETS = 1000 (v1 900 SUBMITTED restated by v2 1000 ACCEPTED)
--   Subsidiary S1 TOTAL_ASSETS = 400
--   Subsidiary S2 -> no canonical metric for the period
--   Subsidiary S3 -> consolidation_treatment 'excluded'
-- Expected consolidated TOTAL_ASSETS = 1000 + 400 = 1400 across 2 contributors.
-- Expected member_count (non-excluded) = 3 (H, S1, S2).
-- Expected data_state = PARTIAL_GROUP_DATA with S2 in excluded_members.
--
-- Personas come from the certification persona register (cert_certification_users);
-- no auth.users seeding and no privileged fixture setup is required.

BEGIN;
SELECT plan(25);

-- Persona constants (real certification users):
--   prudential_analyst  ef43e80a-e17e-4f26-aa91-bcf0d99e3d89  (read + manage groups)
--   conduct_analyst     87a7ada9-9ef8-49ac-a810-4eb04fecf1ac  (unrelated authenticated)

DO $$
DECLARE
  v_actor uuid := 'ef43e80a-e17e-4f26-aa91-bcf0d99e3d89';
  v_metric uuid := '41bd9aef-04f8-4577-8522-125cd05efb15';  -- TOTAL_ASSETS
  v_sec uuid := '00000000-0000-0000-0000-0000000e2010';
  v_def uuid := '00000000-0000-0000-0000-0000000e2011';
  v_g1 uuid := '00000000-0000-0000-0000-0000000e2020';
  v_g2 uuid := '00000000-0000-0000-0000-0000000e2021';
  v_h uuid := '00000000-0000-0000-0000-0000000e2030';
  v_s1 uuid := '00000000-0000-0000-0000-0000000e2031';
  v_s2 uuid := '00000000-0000-0000-0000-0000000e2032';
  v_s3 uuid := '00000000-0000-0000-0000-0000000e2033';
  v_x uuid := '00000000-0000-0000-0000-0000000e2034';   -- other group entity
  v_hm uuid := '00000000-0000-0000-0000-0000000e2040';
  ent uuid; ob uuid; per uuid; fil uuid; ver uuid;
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P2 Group Sector') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.return_definitions (id, code, name, frequency, status, is_active)
  VALUES (v_def, 'P2GRP', 'P2 Group Return', 'QUARTERLY', 'ACTIVE', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.licensees (id, name, sector_id) VALUES
    (v_h, 'P2 Holding', v_sec), (v_s1, 'P2 Sub One', v_sec), (v_s2, 'P2 Sub Two', v_sec),
    (v_s3, 'P2 Sub Three Excluded', v_sec), (v_x, 'P2 Other Group Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  -- Canonical obligation + period + accepted filing for every entity that reports.
  FOREACH ent IN ARRAY ARRAY[v_h, v_s1, v_s3, v_x] LOOP
    INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
    VALUES (ent, v_def, 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;

    INSERT INTO public.reporting_periods
      (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
    VALUES (ob, '2025-Q1', DATE '2025-01-01', DATE '2025-03-31', DATE '2025-04-30', 'OPEN')
    RETURNING id INTO per;

    INSERT INTO public.return_filings
      (filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
       return_definition_id, status, current_version_number)
    VALUES ('P2GRP-' || left(ent::text, 8), ent, ob, per, v_def, 'ACCEPTED', 1)
    RETURNING id INTO fil;

    -- Holding is restated: v1 (900, superseded) then v2 (1000, accepted).
    IF ent = v_h THEN
      INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
      VALUES (fil, 1, 'SUBMITTED') RETURNING id INTO ver;
      INSERT INTO public.return_metric_values
        (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
         value_numeric, availability, source_kind, calculated_at)
      VALUES (ver, ent, v_metric, per, 900, 'AVAILABLE', 'CALCULATED', now() - interval '1 day');

      INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
      VALUES (fil, 2, 'ACCEPTED') RETURNING id INTO ver;
      INSERT INTO public.return_metric_values
        (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
         value_numeric, availability, source_kind, calculated_at)
      VALUES (ver, ent, v_metric, per, 1000, 'AVAILABLE', 'CALCULATED', now());
    ELSE
      INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
      VALUES (fil, 1, 'ACCEPTED') RETURNING id INTO ver;
      INSERT INTO public.return_metric_values
        (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
         value_numeric, availability, source_kind, calculated_at)
      VALUES (ver, ent, v_metric, per,
              CASE ent WHEN v_s1 THEN 400 WHEN v_s3 THEN 5000 ELSE 7777 END,
              'AVAILABLE', 'CALCULATED', now());
    END IF;
  END LOOP;

  INSERT INTO public.financial_groups (id, group_code, name, holding_entity_id, sector_id, created_by)
  VALUES (v_g1, 'P2GRP1', 'P2 Group One', v_h, v_sec, v_actor),
         (v_g2, 'P2GRP2', 'P2 Group Two', v_x, v_sec, v_actor)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.financial_group_members
    (id, group_id, licensee_id, parent_member_id, member_role, ownership_percentage, consolidation_treatment)
  VALUES (v_hm, v_g1, v_h, NULL, 'holding', 100, 'full')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.financial_group_members
    (group_id, licensee_id, parent_member_id, member_role, ownership_percentage, consolidation_treatment)
  VALUES (v_g1, v_s1, v_hm, 'subsidiary', 100, 'full'),
         (v_g1, v_s2, v_hm, 'subsidiary', 100, 'full'),
         (v_g1, v_s3, v_hm, 'subsidiary', 20, 'excluded'),
         (v_g2, v_x, NULL, 'holding', 100, 'full');

  INSERT INTO public.group_consolidation_methods
    (group_id, version, ratio_rules, eliminate_exposure_types, large_exposure_pct,
     total_assets_ratio_key, is_active)
  VALUES (v_g1, 1, '[{"ratio_key":"TOTAL_ASSETS","method":"sum","eliminate":false}]'::jsonb,
          ARRAY['loan','deposit']::text[], 25, 'TOTAL_ASSETS', true);
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"ef43e80a-e17e-4f26-aa91-bcf0d99e3d89","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Hierarchy resolution
-- ---------------------------------------------------------------------------
SELECT is((SELECT COUNT(*)::int FROM public.financial_group_members
            WHERE group_id = '00000000-0000-0000-0000-0000000e2020'), 4,
          'the group resolves its four recorded members');
SELECT is((SELECT COUNT(*)::int FROM public.financial_group_members
            WHERE group_id = '00000000-0000-0000-0000-0000000e2020'
              AND licensee_id = '00000000-0000-0000-0000-0000000e2030'), 1,
          'the parent/holding entity appears exactly once (no double counting)');
SELECT is((SELECT COUNT(*)::int FROM public.financial_group_members
            WHERE group_id = '00000000-0000-0000-0000-0000000e2020'
              AND licensee_id = '00000000-0000-0000-0000-0000000e2031'), 1,
          'a subsidiary appears exactly once');
SELECT is((SELECT parent_member_id FROM public.financial_group_members
            WHERE group_id = '00000000-0000-0000-0000-0000000e2020'
              AND licensee_id = '00000000-0000-0000-0000-0000000e2031'),
          '00000000-0000-0000-0000-0000000e2040'::uuid,
          'the subsidiary is parented to the holding member node');

-- Member metric resolution from the canonical store: latest accepted value per
-- member, excluded and foreign members out.
SELECT is((SELECT COUNT(*)::int FROM public.group_member_ratios(
             '00000000-0000-0000-0000-0000000e2020', '2025-Q1')
            WHERE ratio_key = 'TOTAL_ASSETS'), 2,
          'only the two non-excluded members with canonical data contribute');
SELECT is((SELECT value FROM public.group_member_ratios(
             '00000000-0000-0000-0000-0000000e2020', '2025-Q1')
            WHERE ratio_key = 'TOTAL_ASSETS'
              AND licensee_id = '00000000-0000-0000-0000-0000000e2030'), 1000::numeric,
          'the holding contributes its accepted restated 1000, not the superseded 900');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.group_member_ratios(
             '00000000-0000-0000-0000-0000000e2020', '2025-Q1')
            WHERE licensee_id = '00000000-0000-0000-0000-0000000e2033'),
          'an excluded member contributes nothing');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.group_member_ratios(
             '00000000-0000-0000-0000-0000000e2020', '2025-Q1')
            WHERE licensee_id = '00000000-0000-0000-0000-0000000e2034'),
          'another group''s entity does not leak into this group''s members');

-- ---------------------------------------------------------------------------
-- Consolidation
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _p2_grp AS
SELECT public.group_consolidated_recompute('00000000-0000-0000-0000-0000000e2020', '2025-Q1') AS res;

CREATE TEMP TABLE _p2_snap AS
SELECT * FROM public.group_consolidated_snapshots
 WHERE group_id = '00000000-0000-0000-0000-0000000e2020' AND period_key = '2025-Q1';

SELECT is((SELECT (r->>'method') FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'TOTAL_ASSETS'),
          'sum', 'the configured methodology (sum) is used, not an arbitrary average');
SELECT is((SELECT (r->>'contributors')::int FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'TOTAL_ASSETS'), 2,
          'two members contributed to the consolidated total');
SELECT is((SELECT (r->>'gross_value')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'TOTAL_ASSETS'),
          1400::numeric, 'consolidated gross TOTAL_ASSETS = 1000 + 400 = 1400');
SELECT is((SELECT (r->>'value')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'TOTAL_ASSETS'),
          1400::numeric, 'no elimination configured for TOTAL_ASSETS, so value stays 1400');
SELECT is((SELECT (r->>'eliminated')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'TOTAL_ASSETS'),
          0::numeric, 'no intragroup amount is eliminated from TOTAL_ASSETS');
SELECT is((SELECT member_count FROM _p2_snap), 3,
          'member_count counts the three non-excluded members (H, S1, S2)');
SELECT is((SELECT methodology_version FROM _p2_snap), 1,
          'the snapshot records the methodology version used');
SELECT ok((SELECT (r->>'gross_value')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'TOTAL_ASSETS') < 5000,
          'the excluded member''s 5000 is not inside the consolidated figure');

-- ---------------------------------------------------------------------------
-- Data coverage / provenance
-- ---------------------------------------------------------------------------
SELECT is((SELECT data_state FROM _p2_snap), 'PARTIAL_GROUP_DATA',
          'a member with no canonical period data makes the snapshot PARTIAL_GROUP_DATA');
SELECT is((SELECT jsonb_array_length(excluded_members) FROM _p2_snap), 1,
          'exactly one member is reported as missing data');
SELECT is((SELECT excluded_members->0->>'licensee_id' FROM _p2_snap),
          '00000000-0000-0000-0000-0000000e2032',
          'the missing member (Sub Two) is visible in provenance');
SELECT is((SELECT excluded_members->0->>'reason' FROM _p2_snap),
          'no_return_data_for_period', 'the exclusion reason is disclosed');
SELECT is((public.group_data_coverage('00000000-0000-0000-0000-0000000e2020', '2025-Q1'))->>'members_with_data',
          '2', 'coverage reports two members with canonical data');

-- Complete the missing member canonically, recompute, expect COMPLETE + 1900.
DO $$
DECLARE
  v_metric uuid := '41bd9aef-04f8-4577-8522-125cd05efb15';
  ent uuid := '00000000-0000-0000-0000-0000000e2032';
  ob uuid; per uuid; fil uuid; ver uuid;
BEGIN
  INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
  VALUES (ent, '00000000-0000-0000-0000-0000000e2011', 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;
  INSERT INTO public.reporting_periods
    (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
  VALUES (ob, '2025-Q1', DATE '2025-01-01', DATE '2025-03-31', DATE '2025-04-30', 'OPEN')
  RETURNING id INTO per;
  INSERT INTO public.return_filings
    (filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
     return_definition_id, status, current_version_number)
  VALUES ('P2GRP-S2LATE', ent, ob, per, '00000000-0000-0000-0000-0000000e2011', 'ACCEPTED', 1)
  RETURNING id INTO fil;
  INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
  VALUES (fil, 1, 'ACCEPTED') RETURNING id INTO ver;
  INSERT INTO public.return_metric_values
    (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
     value_numeric, availability, source_kind, calculated_at)
  VALUES (ver, ent, v_metric, per, 500, 'AVAILABLE', 'CALCULATED', now());

  PERFORM public.group_consolidated_recompute('00000000-0000-0000-0000-0000000e2020', '2025-Q1');
END$$;

SELECT is((SELECT data_state FROM public.group_consolidated_snapshots
            WHERE group_id = '00000000-0000-0000-0000-0000000e2020' AND period_key = '2025-Q1'),
          'COMPLETE_GROUP_DATA', 'complete member data yields COMPLETE_GROUP_DATA');
SELECT is((SELECT (r->>'gross_value')::numeric
             FROM public.group_consolidated_snapshots s, jsonb_array_elements(s.ratios) r
            WHERE s.group_id = '00000000-0000-0000-0000-0000000e2020' AND s.period_key = '2025-Q1'
              AND r->>'ratio_key' = 'TOTAL_ASSETS'),
          1900::numeric, 'consolidated total becomes 1000 + 400 + 500 = 1900');

-- ---------------------------------------------------------------------------
-- Cross-group access (real certification personas)
-- ---------------------------------------------------------------------------
SELECT ok(public.can_read_financial_group('ef43e80a-e17e-4f26-aa91-bcf0d99e3d89',
            '00000000-0000-0000-0000-0000000e2020'),
          'an authorised prudential persona can read the group');
SELECT ok(NOT public.can_read_financial_group('87a7ada9-9ef8-49ac-a810-4eb04fecf1ac',
            '00000000-0000-0000-0000-0000000e2020'),
          'an unrelated authenticated persona cannot read the group even with the id in hand');

SELECT * FROM finish();
ROLLBACK;
