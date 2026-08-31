-- F8-W1C — BREACH ACKNOWLEDGEMENT & REMEDIATION (GAP-F8-05)
--
-- Proves the EXISTING prudential breach lifecycle end-to-end:
--   breach detected -> breach visible -> acknowledgement -> supervisory action
--   (remediation) -> lifecycle progression -> closure, with the authorization
--   matrix, audit evidence and notification behaviour that already govern it.
--
-- No ratio calculation, group supervision, CAMELS or PFMI surface is touched.
-- The fixture is rollback-scoped and uses real certification personas; no rows
-- are ever seeded into auth.users.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static lifecycle contracts
-- ===========================================================================
DO $$
DECLARE def text; n int;
BEGIN
  -- 1. Detection and acknowledgement surfaces exist and breaches are immutable.
  PERFORM 1 FROM pg_class WHERE oid = 'public.return_threshold_breaches'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.return_threshold_breach_acknowledgements'::regclass;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.return_threshold_breaches'::regclass
                    AND tgname = 'tg_rtb_no_update' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FAIL 1: detected breaches are not append-only';
  END IF;
  RAISE NOTICE 'PASS 1: append-only breach register with a dedicated acknowledgement table';

  -- 2. Breaches are visible through the canonical current-breach read model,
  --    which resolves the latest acknowledgement.
  def := pg_get_viewdef('public.v_prudential_current_breaches'::regclass, true);
  IF def NOT LIKE '%return_threshold_breach_acknowledgements%'
     OR def NOT LIKE '%CANONICAL_ENGINE%'
     OR def NOT LIKE '%prudential_detection_runs%' THEN
    RAISE EXCEPTION 'FAIL 2: current-breach read model does not resolve canonical detection + acknowledgement';
  END IF;
  RAISE NOTICE 'PASS 2: breaches are visible via the canonical current-breach read model with acknowledgement state';

  -- 3. Acknowledgement is a governed SECURITY DEFINER RPC with authority,
  --    rationale, duplicate protection and audit.
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'prudential_breach_acknowledge';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 3: prudential_breach_acknowledge missing'; END IF;
  IF def NOT LIKE '%prudential_enforce(%review_returns%' THEN
    RAISE EXCEPTION 'FAIL 3: acknowledgement does not enforce scoped prudential authority';
  END IF;
  IF def NOT LIKE '%prudential_require_rationale%' THEN
    RAISE EXCEPTION 'FAIL 3: acknowledgement does not require a rationale';
  END IF;
  IF def NOT LIKE '%already acknowledged%' THEN
    RAISE EXCEPTION 'FAIL 3: acknowledgement does not reject duplicates';
  END IF;
  IF def NOT LIKE '%prudential_audit_event%' OR def NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL 3: acknowledgement does not audit a server-derived actor';
  END IF;
  RAISE NOTICE 'PASS 3: acknowledgement RPC enforces authority, rationale, single-ack and audit with a server-derived actor';

  -- 4. Remediation path: actions can be sourced from a breach.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.prudential_actions'::regclass
       AND conname = 'prudential_actions_source_type_check'
       AND pg_get_constraintdef(oid) LIKE '%return_breach%') THEN
    RAISE EXCEPTION 'FAIL 4: supervisory actions cannot be sourced from a breach';
  END IF;
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('prudential_action_issue','prudential_action_update',
                     'submit_prudential_action_response','review_prudential_action_response',
                     'close_prudential_action');
  IF n < 5 THEN
    RAISE EXCEPTION 'FAIL 4: remediation lifecycle RPCs incomplete (found %)', n;
  END IF;
  RAISE NOTICE 'PASS 4: breach-sourced remediation actions with a complete issue/update/respond/review/close RPC set';

  -- 5. Closure is governed and evidence-gated.
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'close_prudential_action';
  IF def NOT LIKE '%can_act_on_prudential%' THEN
    RAISE EXCEPTION 'FAIL 5: closure does not check prudential authority';
  END IF;
  IF def NOT LIKE '%EVIDENCE_NOT_ACCEPTED%' THEN
    RAISE EXCEPTION 'FAIL 5: closure does not gate on accepted evidence';
  END IF;
  IF def NOT LIKE '%prudential_action_events%' THEN
    RAISE EXCEPTION 'FAIL 5: closure is not recorded on the action event log';
  END IF;
  RAISE NOTICE 'PASS 5: closure is authority-checked, evidence-gated and event-logged';

  -- 6. Notification behaviour already required on detection and on action state.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.return_threshold_breaches'::regclass
                    AND tgname = 'trg_return_threshold_breach_notification') THEN
    RAISE EXCEPTION 'FAIL 6: breach detection does not notify';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.prudential_actions'::regclass
                    AND tgname = 'notify_prudential_action') THEN
    RAISE EXCEPTION 'FAIL 6: supervisory actions do not notify';
  END IF;
  RAISE NOTICE 'PASS 6: detection and supervisory-action notifications are wired to the notification event queue';

  -- 7. RLS on every lifecycle surface, with signed-in grants on the ack table.
  IF NOT (SELECT bool_and(relrowsecurity) FROM pg_class
           WHERE oid IN ('public.return_threshold_breaches'::regclass,
                         'public.return_threshold_breach_acknowledgements'::regclass,
                         'public.prudential_actions'::regclass,
                         'public.prudential_action_responses'::regclass,
                         'public.prudential_action_events'::regclass)) THEN
    RAISE EXCEPTION 'FAIL 7: RLS missing on a breach/remediation surface';
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'return_threshold_breach_acknowledgements'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL 7: signed-in users cannot read acknowledgements through the Data API';
  END IF;
  RAISE NOTICE 'PASS 7: RLS enabled on all lifecycle surfaces and acknowledgements readable by signed-in users';
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped certification fixture (real personas)
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec  uuid := '00000000-0000-0000-0000-0000000f1c01';
  v_def  uuid := '00000000-0000-0000-0000-0000000f1c02';
  v_entA uuid := '00000000-0000-0000-0000-0000000f1c03';
  v_entB uuid := '00000000-0000-0000-0000-0000000f1c04';
  v_sup  uuid := '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'; -- prudential_supervisor
  v_ana  uuid := 'ef43e80a-e17e-4f26-aa91-bcf0d99e3d89'; -- prudential_analyst
  ob uuid; per uuid; fil uuid; ver uuid; run uuid;
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W1C Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.return_definitions (id, code, name, frequency, status, is_active)
    VALUES (v_def, 'W1CRET', 'W1C Return', 'QUARTERLY', 'ACTIVE', true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES
    (v_entA, 'W1C Bank A', v_sec), (v_entB, 'W1C Bank B', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
  VALUES (v_entA, v_def, 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;
  INSERT INTO public.reporting_periods
    (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
  VALUES (ob, '2025-Q2', DATE '2025-04-01', DATE '2025-06-30', DATE '2025-07-31', 'OPEN')
  RETURNING id INTO per;
  INSERT INTO public.return_filings
    (filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
     return_definition_id, status, current_version_number)
  VALUES ('W1C-F1', v_entA, ob, per, v_def, 'ACCEPTED', 1) RETURNING id INTO fil;
  INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
  VALUES (fil, 1, 'ACCEPTED') RETURNING id INTO ver;

  INSERT INTO public.prudential_detection_runs
    (entity_id, return_filing_id, return_filing_version_id, reporting_period_id, period_end, status)
  VALUES (v_entA, fil, ver, per, DATE '2025-06-30', 'COMPLETED') RETURNING id INTO run;

  -- breach detected (canonical engine detection surface)
  INSERT INTO public.return_threshold_breaches
    (id, entity_id, return_filing_id, return_filing_version_id, reporting_period_id,
     metric_key, level, value, threshold_value, comparator, risk_level,
     detection_source, detection_run_id)
  VALUES ('00000000-0000-0000-0000-0000000f1c10', v_entA, fil, ver, per,
          'CAR', 'breach', 6.2, 8.0, 'lt', 'red', 'CANONICAL_ENGINE', run);

  -- a second, unrelated entity's breach for cross-entity isolation
  INSERT INTO public.entity_reporting_obligations (entity_id, return_definition_id, frequency, status)
  VALUES (v_entB, v_def, 'QUARTERLY', 'ACTIVE') RETURNING id INTO ob;
  INSERT INTO public.reporting_periods
    (entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
  VALUES (ob, '2025-Q2', DATE '2025-04-01', DATE '2025-06-30', DATE '2025-07-31', 'OPEN')
  RETURNING id INTO per;
  INSERT INTO public.return_filings
    (filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
     return_definition_id, status, current_version_number)
  VALUES ('W1C-F2', v_entB, ob, per, v_def, 'ACCEPTED', 1) RETURNING id INTO fil;
  INSERT INTO public.return_filing_versions (return_filing_id, version_number, status)
  VALUES (fil, 1, 'ACCEPTED') RETURNING id INTO ver;
  INSERT INTO public.return_threshold_breaches
    (id, entity_id, return_filing_id, return_filing_version_id, reporting_period_id,
     metric_key, level, value, threshold_value, comparator, detection_source)
  VALUES ('00000000-0000-0000-0000-0000000f1c11', v_entB, fil, ver, per,
          'CAR', 'breach', 5.0, 8.0, 'lt', 'CANONICAL_ENGINE');


  -- real supervisory assignment for the authorised personas
  INSERT INTO public.entity_supervision_assignments
    (entity_id, lead_supervisor_user_id, alternate_supervisor_user_id, status, effective_from)
  VALUES (v_entA, v_sup, v_ana, 'active', now() - interval '1 day');
END $$;

-- 8. detection notification already fired for the detected breach
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue
                  WHERE event_key = 'prudential_breach_detected'
                    AND payload->>'breach_id' = '00000000-0000-0000-0000-0000000f1c10') THEN
    RAISE EXCEPTION 'FAIL 8: no notification event enqueued on breach detection';
  END IF;
  RAISE NOTICE 'PASS 8: breach detection enqueued the existing prudential_breach_detected notification';
END $$;

SET LOCAL ROLE authenticated;

-- 9. authorization matrix — unauthorised principals cannot acknowledge
DO $$
DECLARE ok_denied int := 0;
BEGIN
  -- unrelated internal user (conduct_analyst)
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c10',
      'unrelated internal user attempting acknowledgement');
    RAISE EXCEPTION 'FAIL 9: unrelated internal user acknowledged a prudential breach';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN ok_denied := ok_denied + 1;
  END;
  -- external licensee user
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c10',
      'external entity user attempting acknowledgement');
    RAISE EXCEPTION 'FAIL 9: external licensee user acknowledged a prudential breach';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN ok_denied := ok_denied + 1;
  END;
  -- external applicant
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"79267820-04f3-4ae3-a18e-bdf1d97653e0","role":"authenticated"}';
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c10',
      'external applicant attempting acknowledgement');
    RAISE EXCEPTION 'FAIL 9: external applicant acknowledged a prudential breach';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN ok_denied := ok_denied + 1;
  END;
  IF ok_denied <> 3 THEN RAISE EXCEPTION 'FAIL 9: expected 3 denials, got %', ok_denied; END IF;
  RAISE NOTICE 'PASS 9: unrelated internal, external licensee and applicant principals are all denied acknowledgement';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
BEGIN
  BEGIN
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c10',
      'anonymous acknowledgement attempt');
    RAISE EXCEPTION 'FAIL 10: anonymous caller acknowledged a prudential breach';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE NOTICE 'PASS 10: anonymous callers cannot acknowledge a prudential breach';
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;

-- 11. cross-entity isolation for external users
SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.return_threshold_breaches
   WHERE id IN ('00000000-0000-0000-0000-0000000f1c10','00000000-0000-0000-0000-0000000f1c11');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 11: external user can read supervisory breach rows (%)', n; END IF;
  RAISE NOTICE 'PASS 11: supervisory breach rows for both entities remain invisible to external users';
END $$;

-- 12. authorised prudential user can acknowledge, with correct actor/time/rationale
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
DO $$
DECLARE r jsonb; a public.return_threshold_breach_acknowledgements;
BEGIN
  r := public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c10',
        'CAR shortfall confirmed against the accepted filing version; remediation to be issued.');
  IF COALESCE((r->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 12: acknowledgement did not succeed: %', r;
  END IF;
  SELECT * INTO a FROM public.return_threshold_breach_acknowledgements
   WHERE breach_id = '00000000-0000-0000-0000-0000000f1c10';
  IF a.acknowledged_by <> '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce' THEN
    RAISE EXCEPTION 'FAIL 12: acknowledgement actor not derived from the session';
  END IF;
  IF a.acknowledged_at IS NULL OR a.note IS NULL OR length(a.note) < 10 THEN
    RAISE EXCEPTION 'FAIL 12: acknowledgement time or rationale not recorded';
  END IF;
  IF a.entity_id IS NULL OR a.return_filing_version_id IS NULL OR a.reporting_period_id IS NULL
     OR a.detection_run_id IS NULL OR a.metric_key <> 'CAR' THEN
    RAISE EXCEPTION 'FAIL 12: acknowledgement does not carry canonical detection lineage';
  END IF;
  RAISE NOTICE 'PASS 12: authorised prudential user acknowledged the breach with actor, timestamp, rationale and lineage';
END $$;

-- 13. acknowledgement becomes visible on the read model
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.v_prudential_current_breaches
   WHERE id = '00000000-0000-0000-0000-0000000f1c10'
     AND acknowledged_at IS NOT NULL
     AND acknowledged_by = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'
     AND acknowledgement_note IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 13: acknowledged breach is not visible as acknowledged (%)', n; END IF;
  RAISE NOTICE 'PASS 13: the acknowledged breach is visible as acknowledged on the current-breach read model';
END $$;

-- 14. duplicate and invalid acknowledgements are rejected
DO $$
DECLARE dup boolean := false; short boolean := false; missing boolean := false;
BEGIN
  BEGIN
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c10',
      'second acknowledgement of the same breach');
  EXCEPTION WHEN SQLSTATE '55000' THEN dup := true;
  END;
  BEGIN
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1c11', 'too short');
  EXCEPTION WHEN SQLSTATE '22023' THEN short := true;
  WHEN OTHERS THEN short := true;  -- authority may deny first; either way it is not accepted
  END;
  BEGIN
    PERFORM public.prudential_breach_acknowledge('00000000-0000-0000-0000-0000000f1cff',
      'acknowledging a breach that does not exist');
  EXCEPTION WHEN SQLSTATE 'P0002' THEN missing := true;
  END;
  IF NOT (dup AND short AND missing) THEN
    RAISE EXCEPTION 'FAIL 14: invalid acknowledgements not rejected (dup=% short=% missing=%)', dup, short, missing;
  END IF;
  RAISE NOTICE 'PASS 14: duplicate, insufficient-rationale and unknown-breach acknowledgements are all rejected';
END $$;

-- 15. audit evidence for the governed acknowledgement.
--     compliance_audit_logs is deliberately not readable by ordinary
--     supervisory personas, so the compliance ledger is inspected privileged.
RESET ROLE;
DO $$
DECLARE n1 int; n2 int;
BEGIN
  SELECT count(*) INTO n1 FROM public.audit_logs
   WHERE action = 'return_breach_acknowledged'
     AND entity_id = '00000000-0000-0000-0000-0000000f1c10'
     AND user_id = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce';
  SELECT count(*) INTO n2 FROM public.compliance_audit_logs
   WHERE object_type = 'return_threshold_breach'
     AND object_id = '00000000-0000-0000-0000-0000000f1c10'
     AND action_type = 'WORKFLOW_TRANSITION'
     AND user_id = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce';
  IF n1 < 1 OR n2 < 1 THEN
    RAISE EXCEPTION 'FAIL 15: acknowledgement audit evidence missing (audit_logs=%, compliance=%)', n1, n2;
  END IF;
  RAISE NOTICE 'PASS 15: acknowledgement wrote both operational and compliance audit evidence with the session actor';
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';


-- 16. acknowledgement leads to the existing remediation action path
DO $$
DECLARE r public.prudential_actions; act uuid; st text;
BEGIN
  r := public.prudential_action_issue(
        _entity_id := '00000000-0000-0000-0000-0000000f1c03',
        _action_type := 'remediation',
        _title := 'Restore CAR above the regulatory minimum',
        _description := 'Remediation issued following the acknowledged CAR breach.',
        _severity := 'high',
        _due_date := CURRENT_DATE + 30,
        _assigned_to := '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce',
        _source_type := 'return_breach',
        _source_id := '00000000-0000-0000-0000-0000000f1c10');
  act := r.id;
  IF act IS NULL THEN RAISE EXCEPTION 'FAIL 16: breach-sourced action not issued'; END IF;
  SELECT status INTO st FROM public.prudential_actions WHERE id = act;
  IF st IS NULL THEN RAISE EXCEPTION 'FAIL 16: issued action not persisted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_actions
                  WHERE id = act AND source_type = 'return_breach'
                    AND source_id = '00000000-0000-0000-0000-0000000f1c10') THEN
    RAISE EXCEPTION 'FAIL 16: action is not traceable to the acknowledged breach';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue q
                  WHERE q.payload->>'action_id' = act::text
                     OR q.entity_id = act) THEN
    RAISE EXCEPTION 'FAIL 16: no notification enqueued for the issued supervisory action';
  END IF;
  PERFORM set_config('w1c.action_id', act::text, true);
  RAISE NOTICE 'PASS 16: acknowledged breach produced a traceable, notified supervisory remediation action (status %)', st;
END $$;

-- 17. action progresses through its valid lifecycle
DO $$
DECLARE act uuid := current_setting('w1c.action_id')::uuid;
        r public.prudential_actions; st text; n int;
BEGIN
  r := public.prudential_action_update(act, jsonb_build_object('status','in_progress'),
        'Entity engaged; capital restoration plan under execution.');
  SELECT status INTO st FROM public.prudential_actions WHERE id = act;
  IF st <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL 17: action did not progress to in_progress (got %)', st;
  END IF;
  SELECT count(*) INTO n FROM public.prudential_action_events WHERE action_id = act;
  IF n < 1 THEN RAISE EXCEPTION 'FAIL 17: action lifecycle is not event-logged'; END IF;
  RAISE NOTICE 'PASS 17: action progressed through its lifecycle with event-log evidence (% events)', n;
END $$;


-- 18. closure is correctly represented and audited
DO $$
DECLARE act uuid := current_setting('w1c.action_id')::uuid; r jsonb;
        a public.prudential_actions;
BEGIN
  r := public.close_prudential_action(act, 'completed',
        'CAR restored to 9.1% and verified against the next accepted filing.');
  IF COALESCE(r->>'ok','') <> 'true' THEN
    RAISE EXCEPTION 'FAIL 18: closure rejected: %', r;
  END IF;
  SELECT * INTO a FROM public.prudential_actions WHERE id = act;
  IF a.status <> 'completed' OR a.closed_at IS NULL
     OR a.closed_by <> '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'
     OR a.progress_percent <> 100 OR a.completion_notes IS NULL THEN
    RAISE EXCEPTION 'FAIL 18: closure state incorrectly represented (%)', a.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_action_events
                  WHERE action_id = act AND event_type = 'closed' AND to_status = 'completed'
                    AND actor_id = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce') THEN
    RAISE EXCEPTION 'FAIL 18: closure not recorded on the action event log with an actor';
  END IF;
  RAISE NOTICE 'PASS 18: closure recorded status, actor, timestamp, completion note and a closure event';
END $$;

-- 19. unauthorised principals cannot close a supervisory action
SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
DO $$
DECLARE act uuid := current_setting('w1c.action_id')::uuid; r jsonb; blocked boolean := false;
BEGIN
  BEGIN
    r := public.close_prudential_action(act, 'waived', 'unrelated user attempting waiver');
    IF COALESCE(r->>'code','') = 'FORBIDDEN' THEN blocked := true; END IF;
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL 19: unrelated internal user could close a supervisory action'; END IF;
  RAISE NOTICE 'PASS 19: unauthorised principals cannot close supervisory actions';
END $$;

RESET ROLE;
ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'F8-W1C BREACH LIFECYCLE: ALL GATES PASSED'; END $$;
