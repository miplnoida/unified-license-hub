-- Phase 2 / PRU-ANA-001 — Early Warning Indicator engine behaviour
--
-- Exercises prudential_ewi_evaluate / prudential_ewi_acknowledge against
-- controlled fixtures: one entity with two breach periods (rule fires), one
-- entity with clean data (rule must stay silent).

BEGIN;
SELECT plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures: a super_admin actor (authorised) and a plain user (unauthorised)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000c2001', 'p2-ewi-super@test'),
  ('00000000-0000-0000-0000-0000000c2002', 'p2-ewi-none@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000c2001', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_sec uuid := '00000000-0000-0000-0000-0000000c2010';
  v_type uuid := '00000000-0000-0000-0000-0000000c2011';
  v_cfg uuid := '00000000-0000-0000-0000-0000000c2012';
  v_bad uuid := '00000000-0000-0000-0000-0000000c2013';  -- breaching entity
  v_ok  uuid := '00000000-0000-0000-0000-0000000c2014';  -- clean entity
  v_r1 uuid := '00000000-0000-0000-0000-0000000c2020';
  v_r2 uuid := '00000000-0000-0000-0000-0000000c2021';
  v_r3 uuid := '00000000-0000-0000-0000-0000000c2022';
  v_rok uuid := '00000000-0000-0000-0000-0000000c2023';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P2 EWI Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_types (id, name, code) VALUES (v_type, 'P2 EWI Return', 'P2EWI')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_configs (id, name, return_type_id, sector_id)
    VALUES (v_cfg, 'P2 EWI Config', v_type, v_sec) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES
    (v_bad, 'P2 EWI Breaching Bank', v_sec), (v_ok, 'P2 EWI Clean Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  -- Breaching entity: three consecutive submitted returns, two carrying a
  -- 'breach' level threshold breach on the same metric (car).
  INSERT INTO public.returns_filed
    (id, return_configuration_id, entity_id, sector_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status) VALUES
    (v_r1, v_cfg, v_bad, v_sec, 2024, 'Q3', DATE '2024-07-01', DATE '2024-09-30', 'SUB'),
    (v_r2, v_cfg, v_bad, v_sec, 2024, 'Q4', DATE '2024-10-01', DATE '2024-12-31', 'SUB'),
    (v_r3, v_cfg, v_bad, v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB'),
    (v_rok, v_cfg, v_ok, v_sec, 2025, 'Q1', DATE '2025-01-01', DATE '2025-03-31', 'SUB')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.return_threshold_breaches
    (return_id, metric_key, level, risk_level, value, threshold_value, comparator, threshold_version)
  VALUES
    (v_r2, 'car', 'breach', 'red', 6, 8, '>=', 1),
    (v_r3, 'car', 'breach', 'red', 5, 8, '>=', 1);

  -- Only the repeated_breach rule is active for this sector.
  INSERT INTO public.prudential_ewi_rules (id, code, name, rule_type, params, severity, sector_id, is_active)
  VALUES ('00000000-0000-0000-0000-0000000c2030', 'P2_REPEAT_BREACH', 'Repeated breach',
          'repeated_breach', jsonb_build_object('lookback_periods', 3, 'min_breaches', 2),
          'high', v_sec, true)
  ON CONFLICT (id) DO NOTHING;
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000c2001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Triggering behaviour
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _p2_ewi_run AS
SELECT public.prudential_ewi_evaluate('00000000-0000-0000-0000-0000000c2013'::uuid,
                                      DATE '2025-03-31') AS res;

SELECT is((SELECT (res->>'alerts_written')::int FROM _p2_ewi_run), 1,
          'two breaches inside the 3-period lookback fire exactly one alert');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 1,
          'exactly one alert row is persisted for the breaching entity');
SELECT is((SELECT severity FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 'high',
          'alert severity is inherited from the rule (high)');
SELECT is((SELECT metric_key FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 'car',
          'alert retains the source metric key');
SELECT is((SELECT period_end FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), DATE '2025-03-31',
          'alert retains the evaluated source period');
SELECT is((SELECT rule_code FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 'P2_REPEAT_BREACH',
          'alert retains the rule code that produced it');
SELECT is((SELECT (evidence->>'breaches')::int FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 2,
          'alert evidence records the two contributing breaches');
SELECT ok((SELECT jsonb_array_length(evidence->'detail') FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013') = 2,
          'alert evidence links both source returns');
SELECT is((SELECT status FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 'open',
          'a new alert starts open');

-- Clean entity: no breaches -> no alert.
SELECT is((public.prudential_ewi_evaluate('00000000-0000-0000-0000-0000000c2014'::uuid,
             DATE '2025-03-31'))->>'alerts_written', '0',
          'an entity with no breaches produces no alerts');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2014'), 0,
          'no alert row is persisted for the clean entity');

-- ---------------------------------------------------------------------------
-- Deduplication and genuinely new periods
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.prudential_ewi_evaluate('00000000-0000-0000-0000-0000000c2013'::uuid, DATE '2025-03-31')$$,
  're-evaluating the same period succeeds');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 1,
          're-evaluation refreshes rather than duplicating the active alert');
SELECT ok((SELECT COUNT(*)::int FROM pg_constraint
            WHERE conrelid = 'public.prudential_ewi_alerts'::regclass
              AND contype = 'u'
              AND pg_get_constraintdef(oid) LIKE '%entity_id, rule_id, period_end, metric_key%') = 1,
          'the dedup uniqueness constraint (entity, rule, period, metric) is still in place');

SELECT lives_ok(
  $$SELECT public.prudential_ewi_evaluate('00000000-0000-0000-0000-0000000c2013'::uuid, DATE '2024-12-31')$$,
  'evaluating an earlier materially different period succeeds');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_ewi_alerts
            WHERE entity_id = '00000000-0000-0000-0000-0000000c2013'), 2,
          'a materially new period produces its own alert');

-- ---------------------------------------------------------------------------
-- Acknowledgement
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _p2_ewi_ack AS
SELECT id FROM public.prudential_ewi_alerts
 WHERE entity_id = '00000000-0000-0000-0000-0000000c2013' AND period_end = DATE '2025-03-31';

SELECT lives_ok(
  format($$SELECT public.prudential_ewi_acknowledge(%L::uuid, 'reviewed by supervisor', 'acknowledged')$$,
         (SELECT id FROM _p2_ewi_ack)),
  'an authorised prudential actor can acknowledge the alert');
SELECT is((SELECT status FROM public.prudential_ewi_alerts WHERE id = (SELECT id FROM _p2_ewi_ack)),
          'acknowledged', 'acknowledgement persists the status');
SELECT is((SELECT acknowledged_by FROM public.prudential_ewi_alerts WHERE id = (SELECT id FROM _p2_ewi_ack)),
          '00000000-0000-0000-0000-0000000c2001'::uuid,
          'acknowledgement records the session actor, not a client supplied id');
SELECT isnt((SELECT acknowledged_at FROM public.prudential_ewi_alerts WHERE id = (SELECT id FROM _p2_ewi_ack)),
          NULL, 'acknowledgement records a timestamp');
SELECT is((SELECT (evidence->>'breaches')::int FROM public.prudential_ewi_alerts
            WHERE id = (SELECT id FROM _p2_ewi_ack)), 2,
          'the original trigger evidence survives acknowledgement');

-- Unauthorised actor cannot acknowledge.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000c2002","role":"authenticated"}';
SELECT throws_ok(
  format($$SELECT public.prudential_ewi_acknowledge(%L::uuid, 'not mine', 'dismissed')$$,
         (SELECT id FROM _p2_ewi_ack)),
  NULL, NULL, 'an unauthorised user cannot acknowledge an alert');

SELECT * FROM finish();
ROLLBACK;
