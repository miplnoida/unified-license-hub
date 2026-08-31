-- =====================================================================
-- Demo data-integrity gate: temporal coherence (DI-05)
--
-- Read-only. Fails loudly if any demonstration record violates the
-- chronology rules that a regulator would notice on screen:
--   G1  appointment cannot end before it starts
--   G2  appointment start must match its recorded appointment date
--       (i.e. it must not be stamped with the seed run time)
--   G3  supervisory action cannot be raised after its own due date
--   G4  supervisory action cannot be closed/reviewed before it was raised
--   G5  supervisory action cannot precede the breach that caused it
--   G6  breach acknowledgement cannot precede detection
--
-- Usage: psql -f scripts/verify-demo-temporal-integrity.sql
-- =====================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_fail text[] := ARRAY[]::text[];
  v_n bigint;
BEGIN
  -- G1
  SELECT count(*) INTO v_n
    FROM public.entity_appointments
   WHERE effective_to IS NOT NULL AND effective_from > effective_to;
  IF v_n > 0 THEN v_fail := v_fail || format('G1 appointment ends before it starts: %s row(s)', v_n); END IF;

  -- G2
  SELECT count(*) INTO v_n
    FROM public.entity_appointments
   WHERE appointment_date IS NOT NULL
     AND effective_from IS NOT NULL
     AND effective_from::date <> appointment_date;
  IF v_n > 0 THEN v_fail := v_fail || format('G2 appointment start <> appointment date: %s row(s)', v_n); END IF;

  -- G3
  SELECT count(*) INTO v_n
    FROM public.prudential_actions
   WHERE due_date IS NOT NULL AND created_at::date > due_date;
  IF v_n > 0 THEN v_fail := v_fail || format('G3 action raised after its due date: %s row(s)', v_n); END IF;

  -- G4
  SELECT count(*) INTO v_n
    FROM public.prudential_actions
   WHERE COALESCE(closed_at, reviewed_at) IS NOT NULL
     AND COALESCE(closed_at, reviewed_at) < created_at;
  IF v_n > 0 THEN v_fail := v_fail || format('G4 action closed/reviewed before it was raised: %s row(s)', v_n); END IF;

  -- G5
  SELECT count(*) INTO v_n
    FROM public.prudential_actions a
    JOIN public.return_threshold_breaches b ON b.id = a.source_id
   WHERE a.source_type = 'return_breach'
     AND a.created_at < b.detected_at;
  IF v_n > 0 THEN v_fail := v_fail || format('G5 action predates its source breach: %s row(s)', v_n); END IF;

  -- G6
  SELECT count(*) INTO v_n
    FROM public.return_threshold_breach_acknowledgements ack
    JOIN public.return_threshold_breaches b ON b.id = ack.breach_id
   WHERE ack.acknowledged_at < b.detected_at;
  IF v_n > 0 THEN v_fail := v_fail || format('G6 breach acknowledged before detection: %s row(s)', v_n); END IF;

  IF array_length(v_fail, 1) > 0 THEN
    RAISE EXCEPTION E'DEMO TEMPORAL INTEGRITY FAILED:\n  %', array_to_string(v_fail, E'\n  ');
  END IF;

  RAISE NOTICE 'DEMO TEMPORAL INTEGRITY PASSED (G1-G6)';
END $$;
