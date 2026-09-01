-- Verification: an applicant whose licence application was withdrawn can start a
-- new application, while a genuinely open draft is still resumed.
-- Rollback-scoped: no committed data change.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-application-reapply-after-withdrawal.sql

BEGIN;

DO $$
DECLARE
  v_reg record;
  v_before record;
  v_new public.applications;
  v_resumed public.applications;
  v_count int;
BEGIN
  -- 0. Structural contract ---------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'registration_licensing_handoffs'
       AND indexdef ILIKE '%UNIQUE INDEX%btree (registration_id)'
  ) THEN
    RAISE EXCEPTION 'GATE 1 FAILED: registration_licensing_handoffs still allows only one licence attempt per registration';
  END IF;


  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.registration_licensing_handoffs'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (registration_id, application_id)'
  ) THEN
    RAISE EXCEPTION 'GATE 2 FAILED: missing UNIQUE (registration_id, application_id)';
  END IF;

  -- 1. Pick an approved registration whose linked application is withdrawn ---
  SELECT r.id AS registration_id, r.user_id, h.application_id
    INTO v_reg
    FROM public.registration_licensing_handoffs h
    JOIN public.registrations r ON r.id = h.registration_id
    JOIN public.applications a ON a.id = h.application_id
   WHERE lower(r.status) = 'approved'
     AND lower(a.status) = 'withdrawn'
   ORDER BY h.created_at DESC
   LIMIT 1;

  IF v_reg.registration_id IS NULL THEN
    RAISE NOTICE 'SKIPPED: no approved registration with a withdrawn application in this database';
    RETURN;
  END IF;

  SELECT id, status, application_number, data, updated_at
    INTO v_before FROM public.applications WHERE id = v_reg.application_id;

  -- 2. Act as that applicant ------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_reg.user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 3. A new attempt must be created, not the withdrawn one returned --------
  SELECT * INTO v_new FROM public.create_application_draft('Verification licence', '{}'::jsonb, NULL);

  IF v_new.id = v_reg.application_id THEN
    RAISE EXCEPTION 'GATE 3 FAILED: create_application_draft returned the withdrawn application %', v_reg.application_id;
  END IF;
  IF lower(v_new.status) <> 'draft' THEN
    RAISE EXCEPTION 'GATE 4 FAILED: new application status is % (expected draft)', v_new.status;
  END IF;

  -- 4. The new attempt is linked to the same registration -------------------
  SELECT count(*) INTO v_count FROM public.registration_licensing_handoffs
   WHERE registration_id = v_reg.registration_id AND application_id = v_new.id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'GATE 5 FAILED: new application is not linked to the registration handoff';
  END IF;

  -- 5. The withdrawn record is untouched ------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.applications a
     WHERE a.id = v_before.id
       AND (a.status, a.application_number, a.data, a.updated_at)
           IS DISTINCT FROM (v_before.status, v_before.application_number, v_before.data, v_before.updated_at)
  ) THEN
    RAISE EXCEPTION 'GATE 6 FAILED: the withdrawn application % was modified', v_before.id;
  END IF;

  -- 6. The open draft is resumed, never duplicated --------------------------
  SELECT * INTO v_resumed FROM public.create_application_draft('Verification licence', '{}'::jsonb, NULL);
  IF v_resumed.id <> v_new.id THEN
    RAISE EXCEPTION 'GATE 7 FAILED: a second draft % was created instead of resuming %', v_resumed.id, v_new.id;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE 'PASS: withdrawn application % remains closed; new attempt % created and linked; open draft resumed',
    v_before.id, v_new.id;
END $$;

ROLLBACK;
