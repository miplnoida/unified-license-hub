-- Phase 2 / PRU-GRP-001 — group hierarchy resolution, consolidated metrics and
-- data-coverage states.
--
-- Fixtures (period 2025-Q1, ratio total_assets, display_format 'number' => sum):
--   Holding H  total_assets = 1000  (two evidence rows: 900 restated to 1000)
--   Subsidiary S1 total_assets = 400
--   Subsidiary S2 -> no return data for the period
--   Subsidiary S3 -> consolidation_treatment 'excluded'
-- Expected consolidated total_assets = 1000 + 400 = 1400 across 2 contributors.
-- Expected member_count (non-excluded) = 3 (H, S1, S2).
-- Expected data_state = PARTIAL_GROUP_DATA with S2 in excluded_members.

BEGIN;
SELECT plan(24);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000e2001', 'p2-grp-super@test'),
  ('00000000-0000-0000-0000-0000000e2002', 'p2-grp-outsider@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000e2001', 'super_admin') ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_sec uuid := '00000000-0000-0000-0000-0000000e2010';
  v_type uuid := '00000000-0000-0000-0000-0000000e2011';
  v_cfg uuid := '00000000-0000-0000-0000-0000000e2012';
  v_g1 uuid := '00000000-0000-0000-0000-0000000e2020';
  v_g2 uuid := '00000000-0000-0000-0000-0000000e2021';
  v_h uuid := '00000000-0000-0000-0000-0000000e2030';
  v_s1 uuid := '00000000-0000-0000-0000-0000000e2031';
  v_s2 uuid := '00000000-0000-0000-0000-0000000e2032';
  v_s3 uuid := '00000000-0000-0000-0000-0000000e2033';
  v_x uuid := '00000000-0000-0000-0000-0000000e2034';   -- other group entity
  v_hm uuid := '00000000-0000-0000-0000-0000000e2040';
  v_rh1 uuid := '00000000-0000-0000-0000-0000000e2050';
  v_rh2 uuid := '00000000-0000-0000-0000-0000000e2051';
  v_rs1 uuid := '00000000-0000-0000-0000-0000000e2052';
  v_rs3 uuid := '00000000-0000-0000-0000-0000000e2053';
  v_rx uuid := '00000000-0000-0000-0000-0000000e2054';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P2 Group Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_types (id, name, code) VALUES (v_type, 'P2 Group Return', 'P2GRP')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_configs (id, name, return_type_id, sector_id)
    VALUES (v_cfg, 'P2 Group Config', v_type, v_sec) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.licensees (id, name, sector_id) VALUES
    (v_h, 'P2 Holding', v_sec), (v_s1, 'P2 Sub One', v_sec), (v_s2, 'P2 Sub Two', v_sec),
    (v_s3, 'P2 Sub Three Excluded', v_sec), (v_x, 'P2 Other Group Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  INSERT INTO public.financial_groups (id, group_code, name, holding_entity_id, sector_id, created_by)
  VALUES (v_g1, 'P2GRP1', 'P2 Group One', v_h, v_sec, '00000000-0000-0000-0000-0000000e2001'),
         (v_g2, 'P2GRP2', 'P2 Group Two', v_x, v_sec, '00000000-0000-0000-0000-0000000e2001')
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
  VALUES (v_g1, 1, '[{"ratio_key":"total_assets","method":"sum","eliminate":false}]'::jsonb,
          ARRAY['loan','deposit']::text[], 25, 'total_assets', true);

  INSERT INTO public.returns_filed
    (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status) VALUES
    (v_rh1, v_cfg, v_h,  v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB'),
    (v_rs1, v_cfg, v_s1, v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB'),
    (v_rs3, v_cfg, v_s3, v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB'),
    (v_rx,  v_cfg, v_x,  v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
    ON CONFLICT (id) DO NOTHING;

  -- Holding: an initial 900 restated to 1000 (only the latest must be consolidated).
  PERFORM public.record_return_ratio(v_rh1, 'total_assets', 'Total assets', 900, 'number', NULL, NULL, 1, 'f');
  PERFORM public.record_return_ratio(v_rh1, 'total_assets', 'Total assets', 1000, 'number', NULL, NULL, 2, 'f');
  PERFORM public.record_return_ratio(v_rs1, 'total_assets', 'Total assets', 400, 'number', NULL, NULL, 1, 'f');
  -- Excluded member reports a large value that must never be consolidated.
  PERFORM public.record_return_ratio(v_rs3, 'total_assets', 'Total assets', 5000, 'number', NULL, NULL, 1, 'f');
  -- Other group: must never leak into group one.
  PERFORM public.record_return_ratio(v_rx, 'total_assets', 'Total assets', 7777, 'number', NULL, NULL, 1, 'f');
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000e2001","role":"authenticated"}';

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

-- Member ratio resolution: latest row per member, excluded and foreign members out.
SELECT is((SELECT COUNT(*)::int FROM public.group_member_ratios(
             '00000000-0000-0000-0000-0000000e2020', '2025-Q1')
            WHERE ratio_key = 'total_assets'), 2,
          'only the two non-excluded members with data contribute ratios');
SELECT is((SELECT value FROM public.group_member_ratios(
             '00000000-0000-0000-0000-0000000e2020', '2025-Q1')
            WHERE ratio_key = 'total_assets'
              AND licensee_id = '00000000-0000-0000-0000-0000000e2030'), 1000::numeric,
          'the holding contributes its latest restated 1000, not the superseded 900');
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
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'total_assets'),
          'sum', 'the configured methodology (sum) is used, not an arbitrary average');
SELECT is((SELECT (r->>'contributors')::int FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'total_assets'), 2,
          'two members contributed to the consolidated total');
SELECT is((SELECT (r->>'gross_value')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'total_assets'),
          1400::numeric, 'consolidated gross total_assets = 1000 + 400 = 1400');
SELECT is((SELECT (r->>'value')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'total_assets'),
          1400::numeric, 'no elimination configured for total_assets, so value stays 1400');
SELECT is((SELECT (r->>'eliminated')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'total_assets'),
          0::numeric, 'no intragroup amount is eliminated from total_assets');
SELECT is((SELECT member_count FROM _p2_snap), 3,
          'member_count counts the three non-excluded members (H, S1, S2)');
SELECT is((SELECT methodology_version FROM _p2_snap), 1,
          'the snapshot records the methodology version used');
SELECT ok((SELECT (r->>'gross_value')::numeric FROM _p2_snap s,
             jsonb_array_elements(s.ratios) r WHERE r->>'ratio_key' = 'total_assets') < 5000,
          'the excluded member''s 5000 is not inside the consolidated figure');

-- ---------------------------------------------------------------------------
-- Data coverage / provenance
-- ---------------------------------------------------------------------------
SELECT is((SELECT data_state FROM _p2_snap), 'PARTIAL_GROUP_DATA',
          'a member with no period data makes the snapshot PARTIAL_GROUP_DATA');
SELECT is((SELECT jsonb_array_length(excluded_members) FROM _p2_snap), 1,
          'exactly one member is reported as missing data');
SELECT is((SELECT excluded_members->0->>'licensee_id' FROM _p2_snap),
          '00000000-0000-0000-0000-0000000e2032',
          'the missing member (Sub Two) is visible in provenance');
SELECT is((SELECT excluded_members->0->>'reason' FROM _p2_snap),
          'no_return_data_for_period', 'the exclusion reason is disclosed');
SELECT is((public.group_data_coverage('00000000-0000-0000-0000-0000000e2020', '2025-Q1'))->>'members_with_data',
          '2', 'coverage reports two members with data');

-- Complete the missing member, recompute, expect a complete state and 1900 total.
DO $$
DECLARE v_r uuid := '00000000-0000-0000-0000-0000000e2055';
BEGIN
  INSERT INTO public.returns_filed
    (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status)
  VALUES (v_r, '00000000-0000-0000-0000-0000000e2012', '00000000-0000-0000-0000-0000000e2032',
          '00000000-0000-0000-0000-0000000e2010', 2025, 'Q1',
          DATE '2025-01-01', DATE '2025-03-31', 'SUB')
    ON CONFLICT (id) DO NOTHING;
  PERFORM public.record_return_ratio(v_r, 'total_assets', 'Total assets', 500, 'number', NULL, NULL, 1, 'f');
  PERFORM public.group_consolidated_recompute('00000000-0000-0000-0000-0000000e2020', '2025-Q1');
END$$;

SELECT is((SELECT data_state FROM public.group_consolidated_snapshots
            WHERE group_id = '00000000-0000-0000-0000-0000000e2020' AND period_key = '2025-Q1'),
          'COMPLETE_GROUP_DATA', 'complete member data yields COMPLETE_GROUP_DATA');
SELECT is((SELECT (r->>'gross_value')::numeric
             FROM public.group_consolidated_snapshots s, jsonb_array_elements(s.ratios) r
            WHERE s.group_id = '00000000-0000-0000-0000-0000000e2020' AND s.period_key = '2025-Q1'
              AND r->>'ratio_key' = 'total_assets'),
          1900::numeric, 'consolidated total becomes 1000 + 400 + 500 = 1900');

-- ---------------------------------------------------------------------------
-- Cross-group access
-- ---------------------------------------------------------------------------
SELECT ok(public.can_read_financial_group('00000000-0000-0000-0000-0000000e2001',
            '00000000-0000-0000-0000-0000000e2020'),
          'an authorised supervisory actor can read the group');
SELECT ok(NOT public.can_read_financial_group('00000000-0000-0000-0000-0000000e2002',
            '00000000-0000-0000-0000-0000000e2020'),
          'an unrelated user cannot read the group even with the group id in hand');

SELECT * FROM finish();
ROLLBACK;
