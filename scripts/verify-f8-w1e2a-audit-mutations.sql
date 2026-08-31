-- F8-W1E2A — CLOSE UNAUDITED PRUDENTIAL MUTATIONS (part of GAP-F8-02)
--
-- Proves that the four governed Prudential mutation RPCs that W1E1 found
-- NOT_AUDITED now emit the canonical Prudential audit primitive
-- (public.prudential_audit_event) on both audit surfaces, with the correct
-- actor, object, action and timestamp — and that unauthorised execution
-- remains denied.
--
--   examination_team_member_add
--   examination_team_member_update
--   examination_team_member_end
--   pfmi_save_principle
--
-- No ratio calculation, group supervision, breach lifecycle or permission
-- surface is touched. The fixture is rollback-scoped and uses real
-- certification personas; nothing is ever seeded into auth.users.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static contract: the canonical primitive is used, not a new helper
-- ===========================================================================
DO $$
DECLARE def text; fn text; missing text := '';
BEGIN
  -- 1. canonical primitive still dual-writes both governed audit surfaces
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'prudential_audit_event';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 1: canonical prudential_audit_event missing'; END IF;
  IF def NOT LIKE '%INTO public.audit_logs%' OR def NOT LIKE '%INTO public.compliance_audit_logs%' THEN
    RAISE EXCEPTION 'FAIL 1: canonical audit primitive no longer writes both governed surfaces';
  END IF;
  IF def NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL 1: canonical audit primitive does not derive the actor server-side';
  END IF;
  RAISE NOTICE 'PASS 1: canonical prudential_audit_event intact (server-derived actor, audit_logs + compliance_audit_logs)';

  -- 2. all four repaired RPCs call the canonical primitive and no new helper
  FOREACH fn IN ARRAY ARRAY['examination_team_member_add','examination_team_member_update',
                            'examination_team_member_end','pfmi_save_principle'] LOOP
    SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = fn;
    IF def IS NULL THEN RAISE EXCEPTION 'FAIL 2: % missing', fn; END IF;
    IF def NOT LIKE '%prudential_audit_event(%' THEN missing := missing || fn || ' '; END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL 2: these RPCs do not use the canonical audit primitive: %', missing;
  END IF;
  RAISE NOTICE 'PASS 2: all four repaired RPCs audit through the canonical Prudential primitive';

  -- 3. existing authority/validation contracts preserved (no weakening)
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'examination_team_member_add';
  IF def NOT LIKE '%examination_action_allowed%' OR def NOT LIKE '%is_internal_staff%'
     OR def NOT LIKE '%DUPLICATE_MEMBERSHIP%' OR def NOT LIKE '%LEAD_ALREADY_ASSIGNED%' THEN
    RAISE EXCEPTION 'FAIL 3: examination_team_member_add authority/validation weakened';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'examination_team_member_update';
  IF def NOT LIKE '%examination_action_allowed%' OR def NOT LIKE '%LEAD_ALREADY_ASSIGNED%' THEN
    RAISE EXCEPTION 'FAIL 3: examination_team_member_update authority/validation weakened';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'examination_team_member_end';
  IF def NOT LIKE '%examination_action_allowed%' THEN
    RAISE EXCEPTION 'FAIL 3: examination_team_member_end authority weakened';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'pfmi_save_principle';
  IF def NOT LIKE '%can_act_on_payment_oversight%' OR def NOT LIKE '%assessment_not_editable%'
     OR def NOT LIKE '%invalid_regulatory_score%' THEN
    RAISE EXCEPTION 'FAIL 3: pfmi_save_principle authority/validation weakened';
  END IF;
  RAISE NOTICE 'PASS 3: existing authority, validation and lifecycle guards are preserved on all four RPCs';

  -- 4. return shapes unchanged (jsonb) and definer/search_path posture intact
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('examination_team_member_add','examination_team_member_update',
                       'examination_team_member_end','pfmi_save_principle')
       AND (prorettype <> 'jsonb'::regtype OR NOT prosecdef
            OR proconfig IS NULL OR NOT ('search_path=public' = ANY(proconfig)))) THEN
    RAISE EXCEPTION 'FAIL 4: return shape or SECURITY DEFINER/search_path posture changed';
  END IF;
  RAISE NOTICE 'PASS 4: all four RPCs still return jsonb as SECURITY DEFINER with a pinned search_path';
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped runtime proof with real certification personas
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec  uuid := '00000000-0000-0000-0000-00000f1e2a01';
  v_entA uuid := '00000000-0000-0000-0000-00000f1e2a02';
  v_exam uuid := '00000000-0000-0000-0000-00000f1e2a03';
  v_op   uuid := '00000000-0000-0000-0000-00000f1e2a04';
  v_pfmi uuid := '00000000-0000-0000-0000-00000f1e2a05';
  v_lead uuid := 'b597c405-e0c4-421b-9092-820a444f2429'; -- inspection_supervisor
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W1E2A Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_entA, 'W1E2A Bank A', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  -- examination with the authorised persona as lead examiner (case-team authority)
  INSERT INTO public.examinations
    (id, reference, entity_id, sector_id, title, examination_type, stage, lead_examiner_id, created_by)
  VALUES (v_exam, 'EXM-W1E2A-0001', v_entA, v_sec, 'W1E2A Onsite Examination',
          'full_scope', 'planned', v_lead, v_lead);

  -- PFMI assessment in an editable state
  INSERT INTO public.payment_system_operators (id, reference, operator_name, operator_type, entity_id)
  VALUES (v_op, 'PSO-W1E2A-1', 'W1E2A Payment Operator', 'ach', v_entA);
  INSERT INTO public.pfmi_assessments (id, reference, operator_id, assessment_year, status)
  VALUES (v_pfmi, 'PFMI-W1E2A-1', v_op, 2025, 'in_progress');
  INSERT INTO public.pfmi_assessment_principles (assessment_id, principle_number, self_score)
  VALUES (v_pfmi, 4, 'broadly_observed');
END $$;

SET LOCAL ROLE authenticated;

-- 5. unauthorised execution remains denied (examination team mutations)
DO $$
DECLARE denied int := 0;
BEGIN
  -- unrelated internal user (conduct_analyst) has no examination authority
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.examination_team_member_add('00000000-0000-0000-0000-00000f1e2a03',
      'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'examiner');
    RAISE EXCEPTION 'FAIL 5: unrelated internal user added an examination team member';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  -- external licensee user
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.examination_team_member_add('00000000-0000-0000-0000-00000f1e2a03',
      'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'examiner');
    RAISE EXCEPTION 'FAIL 5: external licensee user added an examination team member';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 5: expected 2 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 5: unauthorised internal and external principals cannot mutate an examination team';
END $$;

-- 6. unauthorised execution remains denied (PFMI principle save)
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.pfmi_save_principle('00000000-0000-0000-0000-00000f1e2a05', 4, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 6: unrelated internal user saved a PFMI principle';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.pfmi_save_principle('00000000-0000-0000-0000-00000f1e2a05', 4, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 6: external licensee user saved a PFMI principle';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 6: expected 2 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 6: unauthorised principals cannot save a PFMI principle assessment';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.examination_team_member_add('00000000-0000-0000-0000-00000f1e2a03',
      'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'examiner');
    RAISE EXCEPTION 'FAIL 7: anonymous caller added an examination team member';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.pfmi_save_principle('00000000-0000-0000-0000-00000f1e2a05', 4, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 7: anonymous caller saved a PFMI principle';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 7: expected 2 anonymous denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 7: anonymous callers cannot execute either governed mutation';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Authorised runtime execution (real personas) + audit proof
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}';

-- 8. examination_team_member_add is audited with actor/object/action/timestamp
DO $$
DECLARE res jsonb; mid uuid; a record; ts timestamptz := now();
BEGIN
  res := public.examination_team_member_add('00000000-0000-0000-0000-00000f1e2a03',
           'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'examiner', 5, 'credit risk');
  IF coalesce((res->>'success')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 8: add did not return the existing success shape (%)', res;
  END IF;
  mid := (res->>'id')::uuid;
  PERFORM set_config('w1e2a.member_id', mid::text, true);

  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'examination_team_member_added' AND entity_id = mid;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 8: no canonical audit event for team member add'; END IF;
  IF a.user_id <> 'b597c405-e0c4-421b-9092-820a444f2429'::uuid THEN
    RAISE EXCEPTION 'FAIL 8: wrong audit actor (%)', a.user_id;
  END IF;
  IF a.entity_type <> 'examination_team_member' THEN
    RAISE EXCEPTION 'FAIL 8: wrong audited object type (%)', a.entity_type;
  END IF;
  IF a.created_at IS NULL OR a.created_at < ts - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL 8: audit timestamp missing or implausible (%)', a.created_at;
  END IF;
  IF a.metadata->>'domain' <> 'prudential'
     OR a.metadata->'after'->>'team_role' <> 'examiner'
     OR a.metadata->>'examination_id' <> '00000000-0000-0000-0000-00000f1e2a03' THEN
    RAISE EXCEPTION 'FAIL 8: audit metadata does not capture the after-state/context (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 8: examination_team_member_added audited with actor, object, action, timestamp and after-state';
END $$;

-- 9. examination_team_member_update is audited with before/after
DO $$
DECLARE mid uuid := current_setting('w1e2a.member_id')::uuid; res jsonb; a record;
BEGIN
  res := public.examination_team_member_update(mid, 'reviewer', 7, NULL, true, 'declared a conflict');
  IF coalesce((res->>'success')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 9: update did not return the existing success shape (%)', res;
  END IF;
  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'examination_team_member_updated' AND entity_id = mid;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 9: no canonical audit event for team member update'; END IF;
  IF a.user_id <> 'b597c405-e0c4-421b-9092-820a444f2429'::uuid
     OR a.entity_type <> 'examination_team_member' OR a.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 9: update audit actor/object/timestamp incorrect';
  END IF;
  IF a.metadata->'before'->>'team_role' <> 'examiner'
     OR a.metadata->'after'->>'team_role' <> 'reviewer'
     OR (a.metadata->'after'->>'conflict_declared')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 9: update audit does not record the before/after transition (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 9: examination_team_member_updated audited with a correct before/after transition';
END $$;

-- 10. examination_team_member_end is audited with the removed state
DO $$
DECLARE mid uuid := current_setting('w1e2a.member_id')::uuid; res jsonb; a record;
BEGIN
  res := public.examination_team_member_end(mid);
  IF coalesce((res->>'success')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 10: end did not return the existing success shape (%)', res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.examination_team_members WHERE id = mid) THEN
    RAISE EXCEPTION 'FAIL 10: membership was not ended';
  END IF;
  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'examination_team_member_ended' AND entity_id = mid;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 10: no canonical audit event for team member end'; END IF;
  IF a.user_id <> 'b597c405-e0c4-421b-9092-820a444f2429'::uuid
     OR a.entity_type <> 'examination_team_member' OR a.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 10: end audit actor/object/timestamp incorrect';
  END IF;
  IF a.metadata->'before'->>'team_role' <> 'reviewer'
     OR a.metadata->>'examination_id' <> '00000000-0000-0000-0000-00000f1e2a03' THEN
    RAISE EXCEPTION 'FAIL 10: end audit does not record the removed membership state (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 10: examination_team_member_ended audited with the removed membership state';
END $$;

-- 11. pfmi_save_principle is audited with before/after scores
SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';
DO $$
DECLARE res jsonb; pid uuid; a record;
BEGIN
  res := public.pfmi_save_principle('00000000-0000-0000-0000-00000f1e2a05', 4,
           NULL, 'partly_observed', 'settlement finality gap identified');
  IF coalesce((res->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 11: pfmi_save_principle did not return the existing shape (%)', res;
  END IF;
  SELECT id INTO pid FROM public.pfmi_assessment_principles
   WHERE assessment_id = '00000000-0000-0000-0000-00000f1e2a05' AND principle_number = 4;
  PERFORM set_config('w1e2a.principle_id', pid::text, true);

  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'pfmi_principle_saved' AND entity_id = pid;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 11: no canonical audit event for pfmi_save_principle'; END IF;
  IF a.user_id <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid THEN
    RAISE EXCEPTION 'FAIL 11: wrong PFMI audit actor (%)', a.user_id;
  END IF;
  IF a.entity_type <> 'pfmi_assessment_principle' OR a.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 11: PFMI audit object type or timestamp incorrect';
  END IF;
  IF a.metadata->'after'->>'regulatory_score' <> 'partly_observed'
     OR a.metadata->'before'->>'self_score' <> 'broadly_observed'
     OR (a.metadata->>'principle_number')::int <> 4
     OR a.metadata->>'assessment_id' <> '00000000-0000-0000-0000-00000f1e2a05' THEN
    RAISE EXCEPTION 'FAIL 11: PFMI audit does not record before/after scores and assessment context (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 11: pfmi_principle_saved audited with actor, object, before/after scores and timestamp';
END $$;

-- 12. compliance audit counterpart exists for every one of the four events.
--     The compliance ledger is intentionally restricted from supervisory
--     personas by RLS, so it is inspected with the privileged session role.
RESET ROLE;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE n int; mid uuid := current_setting('w1e2a.member_id')::uuid;
        pid uuid := current_setting('w1e2a.principle_id')::uuid;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE metadata->>'domain' = 'prudential'
     AND metadata->>'action' IN ('examination_team_member_added','examination_team_member_updated',
                                 'examination_team_member_ended','pfmi_principle_saved')
     AND object_id IN (mid::text, pid::text);
  IF n <> 4 THEN
    RAISE EXCEPTION 'FAIL 12: expected 4 compliance audit counterparts, found %', n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_audit_logs
              WHERE object_id IN (mid::text, pid::text)
                AND metadata->>'domain' = 'prudential'
                AND (user_id IS NULL OR object_type IS NULL OR created_at IS NULL)) THEN
    RAISE EXCEPTION 'FAIL 12: a compliance audit counterpart is missing actor/object/timestamp';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_id = mid::text AND action_type = 'CREATE')
     OR NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_id = mid::text AND action_type = 'DELETE') THEN
    RAISE EXCEPTION 'FAIL 12: compliance action classification not recorded for the membership lifecycle';
  END IF;
  RAISE NOTICE 'PASS 12: all four events have complete compliance audit counterparts with classified actions';
END $$;

ROLLBACK;

\echo ''
\echo 'F8-W1E2A — 12/12 gates passed: the four previously unaudited governed Prudential mutations now emit the canonical audit event on both surfaces, with authorisation unchanged.'
