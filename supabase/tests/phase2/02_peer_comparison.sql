-- Phase 2 / PRU-ANA-001 — peer comparison behaviour (peer_ratio_snapshot)
--
-- Fixtures are fully controlled: sector A category A1 holds six banks with the
-- hand-chosen car values 10, 11, 12, 13, 14, 20 (subject entity = 20).
-- Sector B holds three banks with car 99 which must never leak into sector A.
-- Percentile for the subject = peers strictly below / peer_count
--                            = 5 / 6 = 83.33.

BEGIN;
SELECT plan(24);

DO $$
DECLARE
  v_sec_a uuid := '00000000-0000-0000-0000-0000000b2001';
  v_sec_b uuid := '00000000-0000-0000-0000-0000000b2002';
  v_cat_a uuid;
  v_type  uuid := '00000000-0000-0000-0000-0000000b2003';
  v_cfg   uuid := '00000000-0000-0000-0000-0000000b2004';
  v_lic   uuid;
  v_ret   uuid;
  vals    numeric[] := ARRAY[10,11,12,13,14,20];
  i int;
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec_a, 'P2 Peer Sector A'), (v_sec_b, 'P2 Peer Sector B')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_types (id, name, code) VALUES (v_type, 'P2 Peer Return', 'P2PEER')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_configs (id, name, return_type_id, sector_id)
    VALUES (v_cfg, 'P2 Peer Config', v_type, v_sec_a) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.sub_sectors (id, name, sector_id)
    VALUES ('00000000-0000-0000-0000-0000000b2005', 'P2 Peer Sub A', v_sec_a)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.categories (id, name, sector_id, sub_sector_id)
    VALUES ('00000000-0000-0000-0000-0000000b2006', 'P2 Peer Category A', v_sec_a,
            '00000000-0000-0000-0000-0000000b2005')
    ON CONFLICT (id) DO NOTHING;
  v_cat_a := '00000000-0000-0000-0000-0000000b2006';

  -- Sector A / category A: six entities, subject entity is the last (car 20).
  FOR i IN 1..6 LOOP
    v_lic := ('00000000-0000-0000-0000-0000000b21' || lpad(i::text, 2, '0'))::uuid;
    v_ret := ('00000000-0000-0000-0000-0000000b22' || lpad(i::text, 2, '0'))::uuid;
    INSERT INTO public.licensees (id, name, sector_id, category_id)
      VALUES (v_lic, 'P2 Peer Bank A' || i, v_sec_a, v_cat_a)
      ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id, category_id = EXCLUDED.category_id;
    INSERT INTO public.returns_filed
      (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
       period_start_date, period_end_date, workflow_status)
    VALUES (v_ret, v_cfg, v_lic, v_sec_a, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
      ON CONFLICT (id) DO NOTHING;
    PERFORM public.record_return_ratio(v_ret, 'car', 'CAR', vals[i], 'percent', NULL, NULL, 1, 'f');
  END LOOP;

  -- Sector B: three entities with an extreme value that must not leak.
  FOR i IN 1..3 LOOP
    v_lic := ('00000000-0000-0000-0000-0000000b23' || lpad(i::text, 2, '0'))::uuid;
    v_ret := ('00000000-0000-0000-0000-0000000b24' || lpad(i::text, 2, '0'))::uuid;
    INSERT INTO public.licensees (id, name, sector_id)
      VALUES (v_lic, 'P2 Peer Bank B' || i, v_sec_b)
      ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;
    INSERT INTO public.returns_filed
      (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
       period_start_date, period_end_date, workflow_status)
    VALUES (v_ret, v_cfg, v_lic, v_sec_b, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
      ON CONFLICT (id) DO NOTHING;
    PERFORM public.record_return_ratio(v_ret, 'car', 'CAR', 99, 'percent', NULL, NULL, 1, 'f');
  END LOOP;

  -- An entity in sector A with NO car value for the period: must not be counted.
  INSERT INTO public.licensees (id, name, sector_id, category_id)
    VALUES ('00000000-0000-0000-0000-0000000b2501', 'P2 Peer Bank A Silent', v_sec_a, v_cat_a)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;
  INSERT INTO public.returns_filed
    (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status)
  VALUES ('00000000-0000-0000-0000-0000000b2601', v_cfg, '00000000-0000-0000-0000-0000000b2501',
          v_sec_a, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
    ON CONFLICT (id) DO NOTHING;

  -- A duplicate (restated) car row for the subject entity: must not double count.
  PERFORM public.record_return_ratio('00000000-0000-0000-0000-0000000b2206'::uuid,
                                     'car', 'CAR', 20, 'percent', NULL, NULL, 2, 'f');
END$$;

CREATE TEMP TABLE _p2_peer AS
SELECT public.peer_ratio_snapshot(DATE '2025-03-31', 'car',
         '00000000-0000-0000-0000-0000000b2001'::uuid,
         '00000000-0000-0000-0000-0000000b2106'::uuid, 5) AS snap;

CREATE TEMP TABLE _p2_peer_b AS
SELECT public.peer_ratio_snapshot(DATE '2025-03-31', 'car',
         '00000000-0000-0000-0000-0000000b2002'::uuid, NULL, 5) AS snap;

CREATE TEMP TABLE _p2_peer_high AS
SELECT public.peer_ratio_snapshot(DATE '2025-03-31', 'car',
         '00000000-0000-0000-0000-0000000b2001'::uuid,
         '00000000-0000-0000-0000-0000000b2106'::uuid, 25) AS snap;

-- ---------------------------------------------------------------------------
-- Grouping, counting and leakage
-- ---------------------------------------------------------------------------
SELECT is((SELECT snap->>'state' FROM _p2_peer), 'OK',
          'six peers in sector A produce a real comparison state');
SELECT is((SELECT (snap->>'peer_count')::int FROM _p2_peer), 6,
          'peer_count is exactly the six sector A entities that reported car');
SELECT is((SELECT (snap->>'count')::int FROM _p2_peer), 6,
          'legacy count field matches peer_count');
SELECT is((SELECT snap->'peer_group'->>'sector_id' FROM _p2_peer),
          '00000000-0000-0000-0000-0000000b2001',
          'peer group is scoped to the subject entity sector');
SELECT isnt((SELECT snap->'peer_group'->>'category_id' FROM _p2_peer), NULL,
          'peer group records the category dimension used for grouping');
SELECT is((SELECT (snap->>'max')::numeric FROM _p2_peer), 20::numeric,
          'sector B value 99 does not leak into the sector A maximum');
SELECT is((SELECT (snap->>'min')::numeric FROM _p2_peer), 10::numeric,
          'sector A minimum is the hand-seeded 10');
SELECT ok((SELECT (snap->>'peer_count')::int FROM _p2_peer) = 6,
          'the silent sector A entity with no car value is not counted as a peer');

-- ---------------------------------------------------------------------------
-- Mathematics: median/average/percentile of 10,11,12,13,14,20
--   median = (12+13)/2 = 12.5 ; average = 80/6 = 13.3333 ; p25 = 11.25
--   subject 20 -> 5 of 6 strictly below -> 83.33
-- ---------------------------------------------------------------------------
SELECT is((SELECT (snap->>'median')::numeric FROM _p2_peer), 12.5::numeric,
          'median of 10,11,12,13,14,20 is (12+13)/2 = 12.5');
SELECT is((SELECT round((snap->>'average')::numeric, 4) FROM _p2_peer), 13.3333::numeric,
          'average of 10,11,12,13,14,20 is 80/6 = 13.3333');
SELECT is((SELECT (snap->>'p25')::numeric FROM _p2_peer), 11.25::numeric,
          'p25 of 10,11,12,13,14,20 is 11.25');
SELECT is((SELECT (snap->>'entity_value')::numeric FROM _p2_peer), 20::numeric,
          'subject entity value is its own latest restated car value 20');
SELECT is((SELECT (snap->>'percentile')::numeric FROM _p2_peer), 83.33::numeric,
          'percentile of the subject is 5 below / 6 peers = 83.33');

-- Duplicate/restated rows must not inflate the population.
SELECT is((SELECT COUNT(*)::int FROM public.return_calculated_ratios
            WHERE return_id = '00000000-0000-0000-0000-0000000b2206' AND ratio_key = 'car'), 2,
          'the subject entity genuinely has two car evidence rows for the period');
SELECT is((SELECT (snap->>'peer_count')::int FROM _p2_peer), 6,
          'the subject entity is still counted exactly once despite two evidence rows');

-- ---------------------------------------------------------------------------
-- Insufficient peer population
-- ---------------------------------------------------------------------------
SELECT is((SELECT snap->>'state' FROM _p2_peer_b), 'INSUFFICIENT_PEER_DATA',
          'three peers in sector B falls below the five-peer minimum');
SELECT is((SELECT (snap->>'peer_count')::int FROM _p2_peer_b), 3,
          'insufficient result still reports the real peer_count');
SELECT is((SELECT (snap->>'min_peers')::int FROM _p2_peer_b), 5,
          'insufficient result reports the minimum peer requirement');
SELECT ok((SELECT snap FROM _p2_peer_b) ? 'peer_group',
          'insufficient result still discloses the attempted peer group');
SELECT ok(NOT ((SELECT snap FROM _p2_peer_b) ? 'percentile'),
          'no percentile is published when the peer population is insufficient');
SELECT is((SELECT snap->>'state' FROM _p2_peer_high), 'INSUFFICIENT_PEER_DATA',
          'raising the minimum to 25 makes the six-peer sector insufficient');
SELECT is((SELECT (snap->>'min_peers')::int FROM _p2_peer_high), 25,
          'the caller supplied minimum is honoured');

-- Wrong period / unknown ratio must not silently reuse another period.
SELECT is((SELECT (public.peer_ratio_snapshot(DATE '2024-03-31', 'car',
             '00000000-0000-0000-0000-0000000b2001'::uuid, NULL, 5))->>'peer_count')::int, 0,
          'a period with no data reports zero peers rather than another period''s data');
SELECT is((public.peer_ratio_snapshot(DATE '2025-03-31', 'no_such_ratio',
             '00000000-0000-0000-0000-0000000b2001'::uuid, NULL, 5))->>'state',
          'INSUFFICIENT_PEER_DATA',
          'an unknown ratio key reports insufficient peer data');

SELECT * FROM finish();
ROLLBACK;
