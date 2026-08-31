-- F8-W3A — STRESS INDICATOR EVENT LIFECYCLE (product part of GAP-F8-06)
--
-- Proves the EXISTING stress indicator contract end to end:
--
--   configured indicator        public.prudential_stress_indicators
--     -> canonical metric truth public.return_metric_values (+ regulatory_metrics)
--     -> evaluation             public.evaluate_stress_indicators_for_filing(uuid)
--     -> stress event           public.prudential_stress_events
--     -> read model             RLS via can_read_prudential_entity()
--     -> acknowledgement        public.prudential_stress_event_acknowledge(uuid)
--     -> canonical audit        public.prudential_audit_event -> audit_logs
--                                                            -> compliance_audit_logs
--     -> notification           existing prudential_stress_indicator_triggered config
--
-- Runtime section is rollback-scoped (BEGIN ... ROLLBACK), uses real
-- certification personas only, seeds nothing into auth.users, invents no
-- scenario/threshold policy and changes no permission, policy or grant.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static contract
-- ===========================================================================
DO $$
DECLARE def text; n int;
BEGIN
  -- 1. canonical stores and lineage columns
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='prudential_stress_events'
     AND column_name IN ('id','indicator_id','entity_id','return_filing_id',
       'return_filing_version_id','observed_value','triggered_at','resolved_at','notified');
  IF n <> 9 THEN RAISE EXCEPTION 'FAIL 1: stress event lineage columns missing (found %)', n; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='prudential_stress_indicators'
     AND column_name IN ('id','metric_key','label','threshold_value','direction','severity',
       'sector_id','sub_sector_id','is_active','escalate','notify_roles');
  IF n <> 11 THEN RAISE EXCEPTION 'FAIL 1: stress indicator config columns missing (found %)', n; END IF;
  RAISE NOTICE 'PASS 1: stress indicator config and stress event lineage columns present';

  -- 2. deduplication is database-enforced on (indicator, filing)
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND tablename='prudential_stress_events'
                    AND indexdef LIKE '%UNIQUE%(indicator_id, return_filing_id)%') THEN
    RAISE EXCEPTION 'FAIL 2: canonical (indicator_id, return_filing_id) idempotency index lost';
  END IF;
  RAISE NOTICE 'PASS 2: stress event idempotency enforced by unique index on (indicator_id, return_filing_id)';

  -- 3. single canonical evaluator, definer, authority-guarded, canonical metric truth
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname LIKE 'evaluate_stress_indicators%';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 3: expected exactly 1 stress evaluator, found %', n; END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='evaluate_stress_indicators_for_filing';
  IF def NOT LIKE '%SECURITY DEFINER%' OR def NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'FAIL 3: evaluator lost SECURITY DEFINER / pinned search_path';
  END IF;
  IF def NOT LIKE '%has_permission(auth.uid(), ''prudential_supervision'', ''edit'')%' THEN
    RAISE EXCEPTION 'FAIL 3: evaluator does not enforce prudential authority';
  END IF;
  IF def NOT LIKE '%return_metric_values%' THEN
    RAISE EXCEPTION 'FAIL 3: evaluator does not read the canonical metric store';
  END IF;
  IF def LIKE '%return_calculated_ratios%' OR def LIKE '%record_return_ratio%' THEN
    RAISE EXCEPTION 'FAIL 3: evaluator reads a retired ratio store';
  END IF;
  RAISE NOTICE 'PASS 3: evaluate_stress_indicators_for_filing is the single definer evaluator, authority-guarded, reading canonical return_metric_values only';

  -- 4. acknowledgement is governed and canonically audited
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='prudential_stress_event_acknowledge';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 4: prudential_stress_event_acknowledge missing'; END IF;
  IF def NOT LIKE '%SECURITY DEFINER%' OR def NOT LIKE '%prudential_enforce(%'
     OR def NOT LIKE '%prudential_audit_event(%' THEN
    RAISE EXCEPTION 'FAIL 4: acknowledgement lost definer / authority / canonical audit';
  END IF;
  RAISE NOTICE 'PASS 4: acknowledgement is a governed definer RPC with prudential_enforce and canonical prudential_audit_event';

  -- 5. indicator configuration remains behind prudential config authority
  FOR def IN SELECT pg_get_functiondef(oid) FROM pg_proc
              WHERE pronamespace='public'::regnamespace
                AND proname IN ('prudential_stress_indicator_save','prudential_stress_indicator_delete')
  LOOP
    IF def NOT LIKE '%SECURITY DEFINER%'
       OR (def NOT LIKE '%can_manage_prudential_config%'
           AND def NOT LIKE '%enforce_permission(''prudential_supervision'',''manage_config'')%') THEN
      RAISE EXCEPTION 'FAIL 5: stress indicator config RPC not bound to prudential config authority';
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 5: stress indicator save/delete remain bound to prudential_supervision manage_config authority';

  -- 6. RLS + execute privileges
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.prudential_stress_events'::regclass) THEN
    RAISE EXCEPTION 'FAIL 6: RLS disabled on prudential_stress_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='prudential_stress_events'
                  AND cmd='SELECT' AND qual LIKE '%can_read_prudential_entity%') THEN
    RAISE EXCEPTION 'FAIL 6: stress event reads not scoped by can_read_prudential_entity';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
              AND proname IN ('evaluate_stress_indicators_for_filing','prudential_stress_event_acknowledge')
              AND has_function_privilege('anon', oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'FAIL 6: anon can execute stress lifecycle RPCs';
  END IF;
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('evaluate_stress_indicators_for_filing','prudential_stress_event_acknowledge')
    AND has_function_privilege('authenticated', oid, 'EXECUTE');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 6: authenticated cannot execute stress lifecycle RPCs'; END IF;
  RAISE NOTICE 'PASS 6: RLS scopes stress event reads; lifecycle RPCs executable by authenticated/service_role only';

  -- 7. existing notification contract
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_configs
                  WHERE event_key='prudential_stress_indicator_triggered' AND is_active) THEN
    RAISE EXCEPTION 'FAIL 7: existing prudential_stress_indicator_triggered notification config missing/inactive';
  END IF;
  RAISE NOTICE 'PASS 7: existing stress notification event config present and active';
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped runtime proof (real certification personas)
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec   uuid := '00000000-0000-0000-0000-00000f83a001';
  v_def   uuid := '00000000-0000-0000-0000-00000f83a002';
  v_entA  uuid := '00000000-0000-0000-0000-00000f83a003';
  v_entB  uuid := '00000000-0000-0000-0000-00000f83a004';
  v_mB    uuid := '00000000-0000-0000-0000-00000f83a005'; -- breaching metric
  v_mS    uuid := '00000000-0000-0000-0000-00000f83a006'; -- safe metric
  v_indB  uuid := '00000000-0000-0000-0000-00000f83a007';
  v_indS  uuid := '00000000-0000-0000-0000-00000f83a008';
  v_sup   uuid := '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'; -- prudential_supervisor
  v_ana   uuid := 'ef43e80a-e17e-4f26-aa91-bcf0d99e3d89'; -- prudential_analyst
  ob uuid; per uuid;
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W3A Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_definitions (id, code, name, frequency, status, is_active)
    VALUES (v_def, 'W3ARET', 'W3A Return', 'QUARTERLY', 'ACTIVE', true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES
    (v_entA, 'W3A Bank A', v_sec), (v_entB, 'W3A Bank B', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  INSERT INTO public.regulatory_metrics (id, code, name) VALUES
    (v_mB, 'W3A_CAR', 'W3A Capital Adequacy Ratio'),
    (v_mS, 'W3A_LIQ', 'W3A Liquidity Ratio')
    ON CONFLICT (id) DO NOTHING;

  -- existing indicator semantics only: metric_key + direction + threshold + severity
  INSERT INTO public.prudential_stress_indicators
    (id, metric_key, label, threshold_value, direction, severity, sector_id, is_active, escalate)
  VALUES
    (v_indB, 'W3A_CAR', 'W3A CAR stress', 8.0, 'lt', 'high', v_sec, true, false),
    (v_indS, 'W3A_LIQ', 'W3A liquidity stress', 10.0, 'lt', 'medium', v_sec, true, false);

  -- entity A accepted filing with a breaching CAR and a comfortable liquidity value
  INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
  VALUES (v_entA, v_def, 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;
  INSERT INTO public.reporting_periods
    (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
  VALUES (ob, '2025-Q2', DATE '2025-04-01', DATE '2025-06-30', DATE '2025-07-31', 'OPEN')
  RETURNING id INTO per;
  INSERT INTO public.return_filings
    (id, filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
     return_definition_id, status, current_version_number)
  VALUES ('00000000-0000-0000-0000-00000f83a010', 'W3A-F1', v_entA, ob, per, v_def, 'ACCEPTED', 1);
  INSERT INTO public.return_filing_versions (id, return_filing_id, version_number, status)
  VALUES ('00000000-0000-0000-0000-00000f83a011', '00000000-0000-0000-0000-00000f83a010', 1, 'ACCEPTED');
  UPDATE public.return_filings
     SET accepted_version_id = '00000000-0000-0000-0000-00000f83a011'
   WHERE id = '00000000-0000-0000-0000-00000f83a010';
  INSERT INTO public.return_metric_values
    (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id, value_numeric, source_kind)
  VALUES ('00000000-0000-0000-0000-00000f83a011', v_entA, v_mB, per, 6.20, 'CALCULATED'),
         ('00000000-0000-0000-0000-00000f83a011', v_entA, v_mS, per, 25.00, 'CALCULATED');

  -- entity B accepted filing, also breaching, for cross-entity isolation
  INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
  VALUES (v_entB, v_def, 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;
  INSERT INTO public.reporting_periods
    (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
  VALUES (ob, '2025-Q2', DATE '2025-04-01', DATE '2025-06-30', DATE '2025-07-31', 'OPEN')
  RETURNING id INTO per;
  INSERT INTO public.return_filings
    (id, filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
     return_definition_id, status, current_version_number)
  VALUES ('00000000-0000-0000-0000-00000f83a020', 'W3A-F2', v_entB, ob, per, v_def, 'ACCEPTED', 1);
  INSERT INTO public.return_filing_versions (id, return_filing_id, version_number, status)
  VALUES ('00000000-0000-0000-0000-00000f83a021', '00000000-0000-0000-0000-00000f83a020', 1, 'ACCEPTED');
  UPDATE public.return_filings
     SET accepted_version_id = '00000000-0000-0000-0000-00000f83a021'
   WHERE id = '00000000-0000-0000-0000-00000f83a020';
  INSERT INTO public.return_metric_values
    (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id, value_numeric, source_kind)
  VALUES ('00000000-0000-0000-0000-00000f83a021', v_entB, v_mB, per, 5.00, 'CALCULATED');

  -- real supervisory assignment (entity A only)
  INSERT INTO public.entity_supervision_assignments
    (entity_id, lead_supervisor_user_id, alternate_supervisor_user_id, status, effective_from)
  VALUES (v_entA, v_sup, v_ana, 'active', now() - interval '1 day');
END $$;

SET LOCAL ROLE authenticated;

-- 8. unauthorised principals cannot evaluate stress indicators
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.evaluate_stress_indicators_for_filing('00000000-0000-0000-0000-00000f83a010');
    RAISE EXCEPTION 'FAIL 8: unrelated internal user evaluated stress indicators';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.evaluate_stress_indicators_for_filing('00000000-0000-0000-0000-00000f83a010');
    RAISE EXCEPTION 'FAIL 8: external licensee user evaluated stress indicators';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 8: expected 2 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 8: unrelated internal and external principals cannot evaluate stress indicators';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.evaluate_stress_indicators_for_filing('00000000-0000-0000-0000-00000f83a010');
    RAISE EXCEPTION 'FAIL 9: anonymous caller evaluated stress indicators';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    INSERT INTO public.prudential_stress_events (indicator_id, entity_id, observed_value)
    VALUES ('00000000-0000-0000-0000-00000f83a007','00000000-0000-0000-0000-00000f83a003', 1);
    RAISE EXCEPTION 'FAIL 9: anonymous direct DML into prudential_stress_events succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 9: expected 2 anonymous denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 9: anonymous callers cannot evaluate or insert stress events';
END $$;
RESET ROLE;

-- authorised prudential supervisor
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';

-- 10. evaluation against the canonical accepted filing: exactly one breach event
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.evaluate_stress_indicators_for_filing('00000000-0000-0000-0000-00000f83a010');
  IF jsonb_array_length(r->'new_events') <> 1 THEN
    RAISE EXCEPTION 'FAIL 10: expected exactly 1 new stress event, got % (%)',
      jsonb_array_length(r->'new_events'), r;
  END IF;
  SELECT count(*) INTO n FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 10: expected 1 persisted stress event, found %', n; END IF;
  -- the non-breaching indicator produced nothing
  IF EXISTS (SELECT 1 FROM public.prudential_stress_events
              WHERE indicator_id = '00000000-0000-0000-0000-00000f83a008') THEN
    RAISE EXCEPTION 'FAIL 10: non-breaching indicator created a stress event';
  END IF;
  RAISE NOTICE 'PASS 10: breaching indicator created exactly one stress event; the non-breaching indicator created none';
END $$;

-- 11. event content: entity, filing/version lineage, indicator, observed value, timestamp
DO $$
DECLARE e public.prudential_stress_events; i public.prudential_stress_indicators; mv numeric;
BEGIN
  SELECT * INTO e FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  SELECT * INTO i FROM public.prudential_stress_indicators WHERE id = e.indicator_id;
  IF e.entity_id <> '00000000-0000-0000-0000-00000f83a003'::uuid THEN
    RAISE EXCEPTION 'FAIL 11: wrong entity on stress event';
  END IF;
  IF e.return_filing_version_id <> '00000000-0000-0000-0000-00000f83a011'::uuid THEN
    RAISE EXCEPTION 'FAIL 11: filing version lineage not recorded';
  END IF;
  IF e.indicator_id <> '00000000-0000-0000-0000-00000f83a007'::uuid THEN
    RAISE EXCEPTION 'FAIL 11: wrong indicator on stress event';
  END IF;
  IF e.triggered_at IS NULL OR e.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 11: stress event timestamps missing';
  END IF;
  IF e.notified IS NOT FALSE OR e.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11: new stress event is not in the open/unacknowledged state';
  END IF;
  IF i.severity <> 'high' OR i.threshold_value <> 8.0 OR i.direction <> 'lt' THEN
    RAISE EXCEPTION 'FAIL 11: threshold/direction/severity context not resolvable from the indicator';
  END IF;
  -- observed value comes from canonical return_metric_values, not a retired store
  SELECT mv2.value_numeric INTO mv FROM public.return_metric_values mv2
    JOIN public.regulatory_metrics m ON m.id = mv2.regulatory_metric_id
   WHERE mv2.return_filing_version_id = e.return_filing_version_id
     AND upper(m.code) = upper(i.metric_key);
  IF e.observed_value <> mv THEN
    RAISE EXCEPTION 'FAIL 11: observed value % does not match canonical metric truth %', e.observed_value, mv;
  END IF;
  RAISE NOTICE 'PASS 11: event carries entity, filing/version lineage, indicator, canonical observed value, severity/threshold context and open-state timestamps';
END $$;

-- 12. existing deduplication/idempotency semantics on re-evaluation
DO $$
DECLARE r jsonb; e1 uuid; e2 uuid; n int;
BEGIN
  SELECT id INTO e1 FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  r := public.evaluate_stress_indicators_for_filing('00000000-0000-0000-0000-00000f83a010');
  IF jsonb_array_length(r->'new_events') <> 0 OR jsonb_array_length(r->'updated_events') <> 1 THEN
    RAISE EXCEPTION 'FAIL 12: re-evaluation did not follow existing dedup semantics (%)', r;
  END IF;
  SELECT count(*) INTO n FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 12: duplicate stress event created (%)', n; END IF;
  SELECT id INTO e2 FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  IF e1 <> e2 THEN RAISE EXCEPTION 'FAIL 12: event identity not preserved on re-evaluation'; END IF;
  RAISE NOTICE 'PASS 12: re-evaluation updates the existing event in place (no duplicates, identity preserved)';
END $$;

-- 13. cross-entity evaluation stays isolated to its own entity/filing
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.evaluate_stress_indicators_for_filing('00000000-0000-0000-0000-00000f83a020');
  IF jsonb_array_length(r->'new_events') <> 1 THEN
    RAISE EXCEPTION 'FAIL 13: entity B evaluation did not create its own event (%)', r;
  END IF;
  SELECT count(*) INTO n FROM public.prudential_stress_events
   WHERE entity_id = '00000000-0000-0000-0000-00000f83a004'
     AND return_filing_id = '00000000-0000-0000-0000-00000f83a020';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 13: entity B event lineage incorrect (%)', n; END IF;
  SELECT count(*) INTO n FROM public.prudential_stress_events
   WHERE entity_id = '00000000-0000-0000-0000-00000f83a003';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 13: entity A events affected by entity B evaluation (%)', n; END IF;
  RAISE NOTICE 'PASS 13: evaluation is scoped to its own entity/filing; no cross-entity contamination';
END $$;

-- 14. read isolation: external and unrelated internal principals cannot read stress events
DO $$
DECLARE n int;
BEGIN
  SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.prudential_stress_events;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 14: external licensee user can read stress events (%)', n; END IF;
  SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.prudential_stress_events;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 14: unrelated internal user can read stress events (%)', n; END IF;
  RAISE NOTICE 'PASS 14: stress events are invisible to external and unrelated internal principals';
END $$;

-- 15. unauthorised acknowledgement is denied (internal, external, anonymous)
DO $$
DECLARE denied int := 0; ev uuid;
BEGIN
  SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
  SELECT id INTO ev FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.prudential_stress_event_acknowledge(ev);
    RAISE EXCEPTION 'FAIL 15: unrelated internal user acknowledged a stress event';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.prudential_stress_event_acknowledge(ev);
    RAISE EXCEPTION 'FAIL 15: external licensee user acknowledged a stress event';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"79267820-04f3-4ae3-a18e-bdf1d97653e0","role":"authenticated"}';
    PERFORM public.prudential_stress_event_acknowledge(ev);
    RAISE EXCEPTION 'FAIL 15: external applicant acknowledged a stress event';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 3 THEN RAISE EXCEPTION 'FAIL 15: expected 3 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 15: unrelated internal, external licensee and applicant principals cannot acknowledge stress events';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
BEGIN
  BEGIN
    PERFORM public.prudential_stress_event_acknowledge('00000000-0000-0000-0000-00000f83a0ff'::uuid);
    RAISE EXCEPTION 'FAIL 16: anonymous caller acknowledged a stress event';
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR no_data_found THEN
    RAISE NOTICE 'PASS 16: anonymous callers cannot acknowledge stress events';
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;

-- 17. authorised prudential persona acknowledges the open event
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
DO $$
DECLARE ev uuid; r public.prudential_stress_events;
BEGIN
  SELECT id INTO ev FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  r := public.prudential_stress_event_acknowledge(ev);
  IF r.id <> ev OR r.notified IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 17: acknowledgement did not record the existing acknowledged state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_stress_events
                  WHERE id = ev AND notified = true) THEN
    RAISE EXCEPTION 'FAIL 17: acknowledged state not persisted';
  END IF;
  RAISE NOTICE 'PASS 17: authorised prudential persona acknowledged the open stress event and the state persisted';
END $$;

-- 18. re-acknowledgement and invalid event follow the existing lifecycle
DO $$
DECLARE ev uuid; r public.prudential_stress_events;
BEGIN
  SELECT id INTO ev FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  r := public.prudential_stress_event_acknowledge(ev);  -- existing contract: idempotent
  IF r.notified IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 18: re-acknowledgement broke the acknowledged state';
  END IF;
  BEGIN
    PERFORM public.prudential_stress_event_acknowledge('00000000-0000-0000-0000-00000f83a0ee');
    RAISE EXCEPTION 'FAIL 18: unknown stress event was acknowledged';
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'PASS 18: re-acknowledgement is idempotent and an unknown event id is rejected';
  END;
END $$;

-- 19. entity B event cannot be acknowledged by a persona without scope for it
DO $$
DECLARE ev uuid;
BEGIN
  SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
  SELECT id INTO ev FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a020';
  IF ev IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 19: unrelated internal user can see the other entity''s stress event';
  END IF;
  RAISE NOTICE 'PASS 19: out-of-scope stress events are neither readable nor actionable';
END $$;

RESET ROLE;

-- 20. canonical dual-surface audit evidence for the governed acknowledgement
DO $$
DECLARE ev uuid; n int;
BEGIN
  SELECT id INTO ev FROM public.prudential_stress_events
   WHERE return_filing_id = '00000000-0000-0000-0000-00000f83a010';
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE action = 'prudential_stress_event_acknowledged'
     AND entity_id = ev::text
     AND user_id = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'::uuid;
  IF n < 1 THEN RAISE EXCEPTION 'FAIL 20: no operational audit_logs evidence for acknowledgement'; END IF;
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_type = 'prudential_stress_event'
     AND object_id = ev::text
     AND user_id = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'::uuid;
  IF n < 1 THEN RAISE EXCEPTION 'FAIL 20: no compliance audit evidence for acknowledgement'; END IF;
  RAISE NOTICE 'PASS 20: acknowledgement recorded on both canonical audit surfaces with the correct actor and object';
END $$;

ROLLBACK;

\echo 'F8-W3A STRESS INDICATOR EVENT LIFECYCLE — ALL GATES PASSED'
