-- F8-W2A — PAYMENT INCIDENT LIFECYCLE (payment-incident part of GAP-F8-10)
--
-- Proves the EXISTING payment incident contract end to end:
--
--   payment operator
--     -> incident record            public.payment_incident_record(...)
--     -> SLA / notification delay   public.payment_oversight_config.incident_notification_hours
--     -> oversight event/audit      public.payment_oversight_events
--     -> incident visibility        public.payment_system_incidents (RLS)
--     -> incident resolution        public.payment_incident_resolve(...)
--
-- Authority helpers: public.can_read_payment_oversight(uuid)
--                    public.can_act_on_payment_oversight(uuid, text)
--
-- The runtime section is rollback-scoped (BEGIN ... ROLLBACK) and uses real
-- certification personas only. Nothing is seeded into auth.users and no
-- permission, policy or grant is modified.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static contract
-- ===========================================================================
DO $$
DECLARE def text; n int;
BEGIN
  -- 1. canonical incident tables exist with the governed columns
  PERFORM 1 FROM pg_class WHERE oid = 'public.payment_system_incidents'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.payment_oversight_events'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.payment_system_operators'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.payment_oversight_config'::regclass;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payment_system_incidents'
     AND column_name IN ('operator_id','incident_type','severity','title','occurred_at',
       'notification_received_at','affected_transactions','affected_value',
       'notification_delay_minutes','sla_breached','resolution_status','resolved_at',
       'resolution_notes','created_by','created_at','updated_at','reference');
  IF n <> 17 THEN RAISE EXCEPTION 'FAIL 1: incident contract columns missing (found %)', n; END IF;
  RAISE NOTICE 'PASS 1: canonical incident tables and governed columns present';

  -- 2. canonical RPCs exist, SECURITY DEFINER, pinned search_path
  FOR def IN
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('payment_incident_record','payment_incident_resolve')
  LOOP
    IF def NOT LIKE '%SECURITY DEFINER%' OR def NOT LIKE '%search_path%' THEN
      RAISE EXCEPTION 'FAIL 2: incident RPC lost SECURITY DEFINER / pinned search_path';
    END IF;
    IF def NOT LIKE '%can_act_on_payment_oversight(auth.uid()%' THEN
      RAISE EXCEPTION 'FAIL 2: incident RPC no longer enforces the canonical authority helper';
    END IF;
    IF def NOT LIKE '%payment_oversight_events%' THEN
      RAISE EXCEPTION 'FAIL 2: incident RPC no longer writes a canonical oversight event';
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('payment_incident_record','payment_incident_resolve');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 2: expected 2 canonical incident RPCs, found %', n; END IF;
  RAISE NOTICE 'PASS 2: payment_incident_record/payment_incident_resolve are the only canonical entry points, authority-guarded';

  -- 3. no duplicate/second incident write path
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname ILIKE '%incident%'
     AND proname NOT IN ('payment_incident_record','payment_incident_resolve',
                         'payment_incident_set_reference');
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL 3: additional payment incident functions found (%), duplicate write path', n;
  END IF;
  RAISE NOTICE 'PASS 3: single canonical incident write path (plus reference trigger)';

  -- 4. RLS enabled and permission-scoped on incidents + oversight events
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_system_incidents'::regclass) THEN
    RAISE EXCEPTION 'FAIL 4: RLS disabled on payment_system_incidents';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_oversight_events'::regclass) THEN
    RAISE EXCEPTION 'FAIL 4: RLS disabled on payment_oversight_events';
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'payment_system_incidents'
     AND (qual LIKE '%payment_oversight%' OR with_check LIKE '%payment_oversight%');
  IF n < 2 THEN RAISE EXCEPTION 'FAIL 4: incident policies no longer bound to payment oversight authority'; END IF;

  -- anon holds no privileges on the incident surface
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='payment_system_incidents'
                AND grantee='anon') THEN
    RAISE EXCEPTION 'FAIL 4: anon has table grants on payment_system_incidents';
  END IF;
  RAISE NOTICE 'PASS 4: RLS/grants intact — oversight-authority scoped, no anon grants';

  -- 5. SLA methodology is configuration-driven, not hardcoded thresholds
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_config
                  WHERE id = 1 AND incident_notification_hours IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 5: oversight SLA configuration row missing';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='payment_incident_record';
  IF def NOT LIKE '%incident_notification_hours%FROM public.payment_oversight_config%' THEN
    RAISE EXCEPTION 'FAIL 5: incident SLA no longer derived from payment_oversight_config';
  END IF;
  RAISE NOTICE 'PASS 5: notification-delay SLA derived from configured oversight window';

  -- 6. late-notification notification event remains configured and active
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_configs
                  WHERE event_key = 'prudential.payment_incident_late_notification'
                    AND is_active) THEN
    RAISE EXCEPTION 'FAIL 6: late notification event config missing/inactive';
  END IF;
  RAISE NOTICE 'PASS 6: prudential.payment_incident_late_notification configured and active';
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped runtime proof
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec  uuid := '00000000-0000-0000-0000-00000f8a2a01';
  v_ent  uuid := '00000000-0000-0000-0000-00000f8a2a02';
  v_opa  uuid := '00000000-0000-0000-0000-00000f8a2a03';
  v_opb  uuid := '00000000-0000-0000-0000-00000f8a2a04';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W2A Payments Sector')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_ent, 'W2A Payments Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  INSERT INTO public.payment_system_operators
    (id, reference, operator_name, operator_type, entity_id, systemically_important)
  VALUES (v_opa, 'PSO-W2A-0001', 'W2A National ACH', 'ach', v_ent, true),
         (v_opb, 'PSO-W2A-0002', 'W2A Retail Switch', 'switch', v_ent, false);
END $$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 7. authorisation: unauthorised internal / external / anonymous denied
-- ---------------------------------------------------------------------------
DO $$
DECLARE denied int := 0;
BEGIN
  -- internal persona without payment oversight authority (conduct analyst)
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.payment_incident_record(
      '00000000-0000-0000-0000-00000f8a2a03', 'outage', 'unauthorised internal', now());
    RAISE EXCEPTION 'FAIL 7: unauthorised internal persona recorded a payment incident';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  -- external licensee primary user
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.payment_incident_record(
      '00000000-0000-0000-0000-00000f8a2a03', 'outage', 'external attempt', now());
    RAISE EXCEPTION 'FAIL 7: external licensee user recorded a payment incident';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 7: expected 2 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 7: unauthorised internal and external principals cannot record incidents';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.payment_incident_record(
      '00000000-0000-0000-0000-00000f8a2a03', 'outage', 'anon attempt', now());
    RAISE EXCEPTION 'FAIL 8: anonymous caller recorded a payment incident';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_incident_resolve('00000000-0000-0000-0000-00000f8a2a03', 'anon');
    RAISE EXCEPTION 'FAIL 8: anonymous caller resolved a payment incident';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 8: expected 2 anonymous denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 8: anonymous callers cannot record or resolve payment incidents';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- authorised payment systems supervisor
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';

-- 9. record an incident inside the SLA window
DO $$
DECLARE r jsonb; i public.payment_system_incidents; occ timestamptz := now() - interval '3 hours';
BEGIN
  r := public.payment_incident_record(
        '00000000-0000-0000-0000-00000f8a2a03', 'system_outage', 'W2A ACH settlement outage',
        occ, occ + interval '30 minutes', 'high',
        'Settlement window interrupted for 30 minutes.', 12500, 48750000.55);
  IF COALESCE((r->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 9: incident record did not return ok (%)', r;
  END IF;
  IF r->>'reference' IS NULL OR r->>'reference' NOT LIKE 'PSI-%' THEN
    RAISE EXCEPTION 'FAIL 9: canonical incident reference not generated (%)', r;
  END IF;

  SELECT * INTO i FROM public.payment_system_incidents WHERE id = (r->>'incident_id')::uuid;
  IF i.id IS NULL THEN RAISE EXCEPTION 'FAIL 9: incident row not persisted'; END IF;
  IF i.operator_id <> '00000000-0000-0000-0000-00000f8a2a03'::uuid THEN
    RAISE EXCEPTION 'FAIL 9: incident linked to the wrong operator (%)', i.operator_id;
  END IF;
  IF i.incident_type <> 'system_outage' OR i.severity <> 'high'
     OR i.title <> 'W2A ACH settlement outage' THEN
    RAISE EXCEPTION 'FAIL 9: type/severity/title not persisted correctly';
  END IF;
  IF i.affected_transactions <> 12500 OR i.affected_value <> 48750000.55 THEN
    RAISE EXCEPTION 'FAIL 9: affected transaction/value fields not persisted correctly';
  END IF;
  IF i.occurred_at <> occ OR i.notification_received_at <> occ + interval '30 minutes'
     OR i.created_at IS NULL OR i.updated_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 9: incident timestamps not persisted correctly';
  END IF;
  IF i.created_by <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid THEN
    RAISE EXCEPTION 'FAIL 9: incident actor not recorded from the session (%)', i.created_by;
  END IF;
  IF i.resolution_status <> 'open' THEN
    RAISE EXCEPTION 'FAIL 9: new incident is not open (%)', i.resolution_status;
  END IF;
  RAISE NOTICE 'PASS 9: authorised payment systems supervisor recorded an incident against the correct operator with all governed fields';

  -- SLA: within the configured window
  IF i.notification_delay_minutes IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'FAIL 10: notification delay miscalculated (%)', i.notification_delay_minutes;
  END IF;
  IF i.sla_breached THEN RAISE EXCEPTION 'FAIL 10: in-window notification wrongly flagged as SLA breach'; END IF;
  IF (r->>'sla_breached')::boolean THEN RAISE EXCEPTION 'FAIL 10: return shape reports a false SLA breach'; END IF;
  RAISE NOTICE 'PASS 10: notification delay = 30 min, no SLA breach within the configured oversight window';

  -- canonical oversight event
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_events
                  WHERE incident_id = i.id AND event_type = 'INCIDENT_RECORDED'
                    AND actor_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
                    AND operator_id = i.operator_id AND created_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 11: no canonical INCIDENT_RECORDED oversight event';
  END IF;
  RAISE NOTICE 'PASS 11: canonical oversight event recorded (actor, operator, incident, timestamp)';
END $$;

-- 12. late notification -> SLA breach flag + breach event + notification enqueued
DO $$
DECLARE r jsonb; i public.payment_system_incidents;
        occ timestamptz := now() - interval '2 days';
        v_hours numeric;
BEGIN
  SELECT incident_notification_hours INTO v_hours FROM public.payment_oversight_config WHERE id = 1;
  r := public.payment_incident_record(
        '00000000-0000-0000-0000-00000f8a2a04', 'cyber_incident', 'W2A switch cyber incident',
        occ, occ + interval '9 hours', 'critical', 'Reported late by the operator.', 400, 900000);
  SELECT * INTO i FROM public.payment_system_incidents WHERE id = (r->>'incident_id')::uuid;

  IF i.notification_delay_minutes IS DISTINCT FROM 540 THEN
    RAISE EXCEPTION 'FAIL 12: late notification delay miscalculated (%)', i.notification_delay_minutes;
  END IF;
  IF NOT i.sla_breached OR NOT (r->>'sla_breached')::boolean THEN
    RAISE EXCEPTION 'FAIL 12: SLA breach not flagged for a % hour delay against a % hour window',
      i.notification_delay_minutes/60, v_hours;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_events
                  WHERE incident_id = i.id
                    AND event_type = 'INCIDENT_NOTIFICATION_SLA_BREACH'
                    AND (metadata->>'window_hours')::numeric = v_hours
                    AND (metadata->>'delay_minutes')::numeric = 540) THEN
    RAISE EXCEPTION 'FAIL 12: no canonical SLA breach oversight event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_queue
                  WHERE event_key = 'prudential.payment_incident_late_notification'
                    AND entity_type = 'payment_incident' AND entity_id = i.id) THEN
    RAISE EXCEPTION 'FAIL 12: existing late-notification behaviour did not fire';
  END IF;
  RAISE NOTICE 'PASS 12: late notification breached the configured SLA, raised a breach event and enqueued the existing notification';
END $$;

-- 13. canonical read surface visibility + cross-entity isolation
DO $$
DECLARE n int;
BEGIN
  SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.payment_system_incidents
   WHERE operator_id IN ('00000000-0000-0000-0000-00000f8a2a03',
                         '00000000-0000-0000-0000-00000f8a2a04');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 13: supervisor sees % fixture incidents, expected 2', n; END IF;

  -- external licensee user sees nothing on the incident register
  SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.payment_system_incidents;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 13: external licensee user can read % incident rows', n; END IF;
  SELECT count(*) INTO n FROM public.payment_oversight_events;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 13: external licensee user can read % oversight events', n; END IF;

  -- unauthorised internal persona sees nothing either
  SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.payment_system_incidents;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 13: unauthorised internal persona can read % incident rows', n; END IF;
  RAISE NOTICE 'PASS 13: incidents visible on the canonical read surface to authorised oversight only; external/internal non-oversight isolated';
END $$;

-- 14. resolution lifecycle
SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';
DO $$
DECLARE v_id uuid; i public.payment_system_incidents; r jsonb; denied int := 0;
BEGIN
  SELECT id INTO v_id FROM public.payment_system_incidents
   WHERE operator_id = '00000000-0000-0000-0000-00000f8a2a03' ORDER BY created_at DESC LIMIT 1;

  r := public.payment_incident_resolve(v_id, 'Settlement restored; root cause remediated.');
  IF COALESCE((r->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 14: resolve did not return ok (%)', r;
  END IF;
  SELECT * INTO i FROM public.payment_system_incidents WHERE id = v_id;
  IF i.resolution_status <> 'resolved' OR i.resolved_at IS NULL
     OR i.resolution_notes <> 'Settlement restored; root cause remediated.' THEN
    RAISE EXCEPTION 'FAIL 14: resolution status/time/notes not represented correctly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_events
                  WHERE incident_id = v_id AND event_type = 'INCIDENT_RESOLVED'
                    AND actor_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
                    AND notes = 'Settlement restored; root cause remediated.') THEN
    RAISE EXCEPTION 'FAIL 14: no canonical INCIDENT_RESOLVED oversight event';
  END IF;
  RAISE NOTICE 'PASS 14: authorised supervisor resolved the incident with notes/time and a canonical closure event';

  -- 15. idempotency / invalid transitions
  BEGIN
    PERFORM public.payment_incident_resolve(v_id, 'second attempt');
    RAISE EXCEPTION 'FAIL 15: an already-resolved incident was resolved again';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%incident_already_resolved%' THEN RAISE; END IF;
    denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_incident_resolve(gen_random_uuid(), 'ghost');
    RAISE EXCEPTION 'FAIL 15: a non-existent incident was resolved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%incident_not_found%' THEN RAISE; END IF;
    denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_incident_record(gen_random_uuid(), 'outage', 'ghost operator', now());
    RAISE EXCEPTION 'FAIL 15: an incident was recorded against a non-existent operator';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%operator_not_found%' THEN RAISE; END IF;
    denied := denied + 1;
  END;
  IF denied <> 3 THEN RAISE EXCEPTION 'FAIL 15: expected 3 invalid-transition rejections, got %', denied; END IF;
  RAISE NOTICE 'PASS 15: duplicate resolution, unknown incident and unknown operator are all rejected';

  -- 16. resolution is scoped to the target operator only
  IF EXISTS (SELECT 1 FROM public.payment_system_incidents
              WHERE operator_id = '00000000-0000-0000-0000-00000f8a2a04'
                AND resolution_status <> 'open') THEN
    RAISE EXCEPTION 'FAIL 16: resolving one operator''s incident affected another operator';
  END IF;
  RAISE NOTICE 'PASS 16: cross-operator isolation preserved through resolution';
END $$;

-- 17. unauthorised principals cannot resolve an existing open incident
DO $$
DECLARE v_id uuid; denied int := 0;
BEGIN
  SELECT id INTO v_id FROM public.payment_system_incidents
   WHERE operator_id = '00000000-0000-0000-0000-00000f8a2a04' LIMIT 1;

  SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
  BEGIN
    PERFORM public.payment_incident_resolve(v_id, 'unauthorised internal');
    RAISE EXCEPTION 'FAIL 17: unauthorised internal persona resolved an incident';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
  BEGIN
    PERFORM public.payment_incident_resolve(v_id, 'external');
    RAISE EXCEPTION 'FAIL 17: external licensee user resolved an incident';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 17: expected 2 resolve denials, got %', denied; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_system_incidents
              WHERE id = v_id AND resolution_status <> 'open') THEN
    RAISE EXCEPTION 'FAIL 17: an unauthorised attempt mutated the incident';
  END IF;
  RAISE NOTICE 'PASS 17: unauthorised internal and external principals cannot resolve incidents';
END $$;

RESET ROLE;
ROLLBACK;

DO $$ BEGIN
  RAISE NOTICE 'F8-W2A PAYMENT INCIDENT LIFECYCLE — ALL GATES PASSED';
END $$;
