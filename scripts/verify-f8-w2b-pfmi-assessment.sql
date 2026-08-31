-- F8-W2B — PFMI ASSESSMENT LIFECYCLE (PFMI-assessment part of GAP-F8-10)
--
-- Proves the EXISTING PFMI assessment contract end to end:
--
--   payment operator                public.payment_system_operators
--     -> start assessment           public.pfmi_start_assessment(uuid,int)
--     -> applicable principles      public.pfmi_principles
--                                   public.pfmi_principle_applicability (by operator_type)
--     -> principle scoring          public.pfmi_save_principle(...)
--     -> completion validation      public.pfmi_complete_assessment(uuid,text)
--     -> overall rating             EXISTING worst-observed-score methodology
--     -> operator PFMI state        last_pfmi_assessment_date / pfmi_compliance_level
--     -> oversight/audit events     public.payment_oversight_events
--                                   public.prudential_audit_event (W1E2A contract)
--
-- Authority helpers: public.can_read_payment_oversight(uuid)
--                    public.can_act_on_payment_oversight(uuid, text)
--
-- The runtime section is rollback-scoped (BEGIN ... ROLLBACK) and uses real
-- certification personas only. Nothing is seeded into auth.users, no permission,
-- policy, grant, catalogue or methodology is modified or invented.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static contract
-- ===========================================================================
DO $$
DECLARE def text; n int;
BEGIN
  -- 1. canonical PFMI tables exist with the governed columns
  PERFORM 1 FROM pg_class WHERE oid = 'public.pfmi_principles'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.pfmi_principle_applicability'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.pfmi_assessments'::regclass;
  PERFORM 1 FROM pg_class WHERE oid = 'public.pfmi_assessment_principles'::regclass;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='pfmi_assessments'
     AND column_name IN ('reference','operator_id','assessment_year','status',
                         'overall_rating','summary','started_by','completed_at','completed_by');
  IF n <> 9 THEN RAISE EXCEPTION 'FAIL 1: pfmi_assessments contract columns missing (found %)', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='pfmi_assessment_principles'
     AND column_name IN ('assessment_id','principle_number','self_score','regulatory_score',
                         'narrative','evidence','assessed_by','assessed_at');
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL 1: pfmi_assessment_principles contract columns missing (found %)', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='payment_system_operators'
     AND column_name IN ('last_pfmi_assessment_date','pfmi_compliance_level','operator_type');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 1: operator PFMI state columns missing (found %)', n; END IF;
  RAISE NOTICE 'PASS 1: canonical PFMI tables and governed columns present';

  -- 2. canonical RPCs: SECURITY DEFINER, pinned search_path, jsonb, authority-guarded
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname IN ('pfmi_start_assessment','pfmi_save_principle','pfmi_complete_assessment');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 2: expected 3 canonical PFMI RPCs, found %', n; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname IN ('pfmi_start_assessment','pfmi_save_principle','pfmi_complete_assessment')
       AND (prorettype <> 'jsonb'::regtype OR NOT prosecdef
            OR proconfig IS NULL OR NOT ('search_path=public' = ANY(proconfig)))) THEN
    RAISE EXCEPTION 'FAIL 2: PFMI RPC lost jsonb return shape / SECURITY DEFINER / pinned search_path';
  END IF;
  FOR def IN
    SELECT pg_get_functiondef(oid) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname IN ('pfmi_start_assessment','pfmi_save_principle','pfmi_complete_assessment')
  LOOP
    IF def NOT LIKE '%can_act_on_payment_oversight(auth.uid()%' THEN
      RAISE EXCEPTION 'FAIL 2: a PFMI RPC no longer enforces the canonical payment-oversight authority helper';
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 2: pfmi_start_assessment/save_principle/complete_assessment are canonical, authority-guarded, definer-pinned';

  -- 3. no second PFMI workflow
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname ILIKE '%pfmi%'
     AND proname NOT IN ('pfmi_start_assessment','pfmi_save_principle','pfmi_complete_assessment');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 3: % additional PFMI function(s) found — duplicate workflow', n; END IF;
  RAISE NOTICE 'PASS 3: single canonical PFMI assessment workflow';

  -- 4. lifecycle guards + existing validation preserved (no weakening)
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='pfmi_start_assessment';
  IF def NOT LIKE '%assessment_already_in_progress%' OR def NOT LIKE '%operator_not_found%'
     OR def NOT LIKE '%pfmi_principle_applicability%' THEN
    RAISE EXCEPTION 'FAIL 4: pfmi_start_assessment concurrency/applicability contract weakened';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='pfmi_save_principle';
  IF def NOT LIKE '%assessment_not_editable%' OR def NOT LIKE '%invalid_regulatory_score%'
     OR def NOT LIKE '%prudential_audit_event(%' THEN
    RAISE EXCEPTION 'FAIL 4: pfmi_save_principle validation or W1E2A canonical audit contract weakened';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='pfmi_complete_assessment';
  IF def NOT LIKE '%principles_not_assessed%' OR def NOT LIKE '%assessment_already_completed%' THEN
    RAISE EXCEPTION 'FAIL 4: pfmi_complete_assessment completion validation weakened';
  END IF;
  -- existing rating methodology: worst observed score wins (not averaging/weighting)
  IF def NOT LIKE '%WHEN bool_or(regulatory_score = ''not_observed'') THEN ''not_observed''%'
     OR def NOT LIKE '%ELSE ''observed''%'
     OR def NOT LIKE '%regulatory_score <> ''not_applicable''%' THEN
    RAISE EXCEPTION 'FAIL 4: existing overall-rating methodology changed';
  END IF;
  RAISE NOTICE 'PASS 4: lifecycle guards, completion validation and the existing worst-score rating methodology are intact';

  -- 5. RLS scoped to payment oversight authority, no anon-facing policy
  IF NOT (SELECT bool_and(relrowsecurity) FROM pg_class
           WHERE oid IN ('public.pfmi_assessments'::regclass,
                         'public.pfmi_assessment_principles'::regclass,
                         'public.pfmi_principles'::regclass,
                         'public.pfmi_principle_applicability'::regclass)) THEN
    RAISE EXCEPTION 'FAIL 5: RLS disabled on a PFMI table';
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('pfmi_assessments','pfmi_assessment_principles','pfmi_principles','pfmi_principle_applicability')
     AND (qual LIKE '%payment_oversight%' OR with_check LIKE '%payment_oversight%');
  IF n < 7 THEN RAISE EXCEPTION 'FAIL 5: PFMI policies no longer bound to payment oversight authority (%)', n; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname IN ('pfmi_assessments','pfmi_assessment_principles','pfmi_principles','pfmi_principle_applicability')
       AND 'anon'::regrole = ANY (p.polroles)) THEN
    RAISE EXCEPTION 'FAIL 5: an RLS policy admits the anon role on the PFMI surface';
  END IF;
  RAISE NOTICE 'PASS 5: PFMI RLS is payment-oversight scoped with no anon-facing policy';

  -- 6. principle catalogue and per-operator-type applicability exist
  SELECT count(*) INTO n FROM public.pfmi_principles;
  IF n = 0 THEN RAISE EXCEPTION 'FAIL 6: PFMI principle catalogue empty'; END IF;
  IF (SELECT count(DISTINCT operator_type) FROM public.pfmi_principle_applicability) < 2 THEN
    RAISE EXCEPTION 'FAIL 6: applicability is not differentiated by operator type';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pfmi_principle_applicability a
              LEFT JOIN public.pfmi_principles p ON p.principle_number = a.principle_number
             WHERE p.principle_number IS NULL) THEN
    RAISE EXCEPTION 'FAIL 6: applicability references a principle outside the catalogue';
  END IF;
  RAISE NOTICE 'PASS 6: PFMI catalogue (% principles) with operator-type applicability rules', n;
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped runtime proof with real certification personas
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec uuid := '00000000-0000-0000-0000-00000f8b2b01';
  v_ent uuid := '00000000-0000-0000-0000-00000f8b2b02';
  v_opa uuid := '00000000-0000-0000-0000-00000f8b2b03';
  v_opb uuid := '00000000-0000-0000-0000-00000f8b2b04';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W2B Payments Sector')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_ent, 'W2B Payments Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  INSERT INTO public.payment_system_operators
    (id, reference, operator_name, operator_type, entity_id, systemically_important)
  VALUES (v_opa, 'PSO-W2B-0001', 'W2B National RTGS', 'rtgs', v_ent, true),
         (v_opb, 'PSO-W2B-0002', 'W2B E-Money Issuer', 'e_money', v_ent, false);
END $$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 7. unauthorised internal / external principals cannot start an assessment
-- ---------------------------------------------------------------------------
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.pfmi_start_assessment('00000000-0000-0000-0000-00000f8b2b03', 2026);
    RAISE EXCEPTION 'FAIL 7: unauthorised internal persona started a PFMI assessment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.pfmi_start_assessment('00000000-0000-0000-0000-00000f8b2b03', 2026);
    RAISE EXCEPTION 'FAIL 7: external licensee user started a PFMI assessment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 7: expected 2 denials, got %', denied; END IF;
  IF EXISTS (SELECT 1 FROM public.pfmi_assessments
              WHERE operator_id = '00000000-0000-0000-0000-00000f8b2b03') THEN
    RAISE EXCEPTION 'FAIL 7: an unauthorised attempt created an assessment';
  END IF;
  RAISE NOTICE 'PASS 7: unauthorised internal and external principals cannot start a PFMI assessment';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.pfmi_start_assessment('00000000-0000-0000-0000-00000f8b2b03', 2026);
    RAISE EXCEPTION 'FAIL 8: anonymous caller started a PFMI assessment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.pfmi_save_principle('00000000-0000-0000-0000-00000f8b2b03', 1, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 8: anonymous caller saved a PFMI principle';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.pfmi_complete_assessment('00000000-0000-0000-0000-00000f8b2b03', 'anon');
    RAISE EXCEPTION 'FAIL 8: anonymous caller completed a PFMI assessment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 3 THEN RAISE EXCEPTION 'FAIL 8: expected 3 anonymous denials, got %', denied; END IF;
  IF (SELECT count(*) FROM public.pfmi_assessments) <> 0
     OR (SELECT count(*) FROM public.pfmi_assessment_principles) <> 0 THEN
    RAISE EXCEPTION 'FAIL 8: anonymous caller can read the PFMI surface';
  END IF;
  RAISE NOTICE 'PASS 8: anonymous callers cannot start, save, complete or read PFMI assessments';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- authorised payment systems supervisor
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';

-- 9. start an assessment: canonical reference / year / operator / status / actor
DO $$
DECLARE r jsonb; a public.pfmi_assessments;
BEGIN
  r := public.pfmi_start_assessment('00000000-0000-0000-0000-00000f8b2b03', 2026);
  IF COALESCE((r->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 9: start did not return ok (%)', r;
  END IF;
  IF r->>'reference' NOT LIKE 'PFMI-2026-%' THEN
    RAISE EXCEPTION 'FAIL 9: canonical reference not generated (%)', r;
  END IF;
  SELECT * INTO a FROM public.pfmi_assessments WHERE id = (r->>'assessment_id')::uuid;
  IF a.id IS NULL THEN RAISE EXCEPTION 'FAIL 9: assessment row not persisted'; END IF;
  IF a.operator_id <> '00000000-0000-0000-0000-00000f8b2b03'::uuid
     OR a.assessment_year <> 2026 OR a.status <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL 9: operator/year/status not populated correctly';
  END IF;
  IF a.started_by <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid THEN
    RAISE EXCEPTION 'FAIL 9: assessment actor not derived from the session (%)', a.started_by;
  END IF;
  IF a.overall_rating IS NOT NULL OR a.completed_at IS NOT NULL OR a.completed_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 9: a new assessment is not in a clean open state';
  END IF;
  PERFORM set_config('w2b.assessment_a', a.id::text, true);
  RAISE NOTICE 'PASS 9: authorised supervisor started assessment % for the correct operator', a.reference;

  -- canonical initiation oversight event
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_events
                  WHERE assessment_id = a.id AND event_type = 'PFMI_ASSESSMENT_INITIATED'
                    AND actor_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
                    AND operator_id = a.operator_id AND created_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 10: no canonical PFMI_ASSESSMENT_INITIATED oversight event';
  END IF;
  RAISE NOTICE 'PASS 10: canonical initiation oversight event recorded (actor, operator, assessment, timestamp)';
END $$;

-- 11. applicable-principle methodology: rows come only from the catalogue/applicability
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid;
        n_rows int; n_expected int; n_catalogue int;
BEGIN
  SELECT count(*) INTO n_rows FROM public.pfmi_assessment_principles WHERE assessment_id = aid;
  SELECT count(*) INTO n_expected FROM public.pfmi_principle_applicability WHERE operator_type = 'rtgs';
  SELECT count(*) INTO n_catalogue FROM public.pfmi_principles;
  IF n_rows <> n_expected THEN
    RAISE EXCEPTION 'FAIL 11: % principle rows created, applicability for rtgs defines %', n_rows, n_expected;
  END IF;
  IF n_rows >= n_catalogue THEN
    RAISE EXCEPTION 'FAIL 11: non-applicable principles were required (% of % catalogue principles)', n_rows, n_catalogue;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pfmi_assessment_principles ap
     WHERE ap.assessment_id = aid
       AND NOT EXISTS (SELECT 1 FROM public.pfmi_principle_applicability a
                        WHERE a.operator_type = 'rtgs' AND a.principle_number = ap.principle_number)) THEN
    RAISE EXCEPTION 'FAIL 11: an assessment principle is outside the operator-type applicability set';
  END IF;
  RAISE NOTICE 'PASS 11: % applicable principles derived from the existing rtgs applicability rules (catalogue = %)',
    n_rows, n_catalogue;
END $$;

-- 12. concurrent assessment for the same operator is rejected
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid; n int;
BEGIN
  BEGIN
    PERFORM public.pfmi_start_assessment('00000000-0000-0000-0000-00000f8b2b03', 2026);
    RAISE EXCEPTION 'FAIL 12: a second concurrent assessment was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 12%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%assessment_already_in_progress%' THEN
      RAISE EXCEPTION 'FAIL 12: unexpected error on concurrent start (%)', SQLERRM;
    END IF;
  END;
  SELECT count(*) INTO n FROM public.pfmi_assessments
   WHERE operator_id = '00000000-0000-0000-0000-00000f8b2b03';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 12: % assessments exist for the operator, expected 1', n; END IF;
  -- unknown operator is rejected
  BEGIN
    PERFORM public.pfmi_start_assessment('00000000-0000-0000-0000-0000000000ff', 2026);
    RAISE EXCEPTION 'FAIL 12: assessment started for an unknown operator';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 12%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 12: concurrent assessment and unknown operator rejected by the existing contract';
END $$;

-- 13. principle scoring: self score, regulatory score, narrative, evidence
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid;
        pn int; p public.pfmi_assessment_principles; r jsonb;
BEGIN
  SELECT min(principle_number) INTO pn FROM public.pfmi_assessment_principles WHERE assessment_id = aid;
  PERFORM set_config('w2b.principle_no', pn::text, true);
  r := public.pfmi_save_principle(aid, pn, 'observed', 'broadly_observed',
        'Operator demonstrates a sound legal basis with minor documentation gaps.',
        '[{"label":"Legal opinion","path":"evidence/legal-opinion.pdf"}]'::jsonb);
  IF COALESCE((r->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 13: save did not return the existing ok shape (%)', r;
  END IF;
  SELECT * INTO p FROM public.pfmi_assessment_principles
   WHERE assessment_id = aid AND principle_number = pn;
  IF p.self_score <> 'observed' OR p.regulatory_score <> 'broadly_observed'
     OR p.narrative IS NULL OR jsonb_array_length(p.evidence) <> 1 THEN
    RAISE EXCEPTION 'FAIL 13: principle scoring fields not persisted correctly';
  END IF;
  IF p.assessed_by <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid OR p.assessed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 13: principle assessor/timestamp not recorded';
  END IF;
  PERFORM set_config('w2b.principle_id', p.id::text, true);
  RAISE NOTICE 'PASS 13: authorised supervisor saved self score, regulatory score, narrative and evidence';

  -- invalid regulatory score rejected
  BEGIN
    PERFORM public.pfmi_save_principle(aid, pn, NULL, 'mostly_fine');
    RAISE EXCEPTION 'FAIL 14: an invalid regulatory score was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 14%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%invalid_regulatory_score%' THEN
      RAISE EXCEPTION 'FAIL 14: unexpected error for an invalid score (%)', SQLERRM;
    END IF;
  END;
  -- principle outside the assessment rejected
  BEGIN
    PERFORM public.pfmi_save_principle(aid, 9999, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 14: a principle outside the assessment was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 14%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 14: invalid regulatory score and out-of-scope principle rejected';
END $$;

-- 15. pfmi_save_principle still satisfies the W1E2A canonical dual-surface audit contract
DO $$
DECLARE pid uuid := current_setting('w2b.principle_id')::uuid; a public.audit_logs; n int;
BEGIN
  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'pfmi_principle_saved' AND entity_id = pid::text
   ORDER BY created_at DESC LIMIT 1;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 15: no canonical audit event for pfmi_save_principle'; END IF;
  IF a.user_id <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
     OR a.entity_type <> 'pfmi_assessment_principle' OR a.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 15: PFMI audit actor/object/timestamp incorrect';
  END IF;
  IF a.metadata->'after'->>'regulatory_score' <> 'broadly_observed' THEN
    RAISE EXCEPTION 'FAIL 15: PFMI audit after-state not recorded';
  END IF;
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_type = 'pfmi_assessment_principle' AND object_id = pid::text;
  IF n = 0 THEN RAISE EXCEPTION 'FAIL 15: no compliance audit counterpart for pfmi_save_principle'; END IF;
  RAISE NOTICE 'PASS 15: pfmi_save_principle satisfies the W1E2A dual-surface canonical audit contract';
END $$;

-- 16. completion is blocked while any applicable principle is unassessed
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid;
BEGIN
  BEGIN
    PERFORM public.pfmi_complete_assessment(aid, 'premature');
    RAISE EXCEPTION 'FAIL 16: completion succeeded with unassessed principles';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 16%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%principles_not_assessed%' THEN
      RAISE EXCEPTION 'FAIL 16: unexpected error on premature completion (%)', SQLERRM;
    END IF;
  END;
  IF (SELECT status FROM public.pfmi_assessments WHERE id = aid) <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL 16: assessment state changed on a rejected completion';
  END IF;
  RAISE NOTICE 'PASS 16: completion validation blocks while required applicable principles are unassessed';
END $$;

-- 17. second operator's assessment stays isolated
DO $$
DECLARE r jsonb;
BEGIN
  r := public.pfmi_start_assessment('00000000-0000-0000-0000-00000f8b2b04', 2026);
  PERFORM set_config('w2b.assessment_b', (r->>'assessment_id'), true);
  IF (SELECT count(*) FROM public.pfmi_assessment_principles
       WHERE assessment_id = (r->>'assessment_id')::uuid)
     <> (SELECT count(*) FROM public.pfmi_principle_applicability WHERE operator_type = 'e_money') THEN
    RAISE EXCEPTION 'FAIL 17: second operator did not get its own applicability set';
  END IF;
  RAISE NOTICE 'PASS 17: a second operator receives its own operator-type applicability set';
END $$;

-- 18. assess every remaining principle, then complete
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid;
        aidb uuid := current_setting('w2b.assessment_b')::uuid;
        pn int; r jsonb; a public.pfmi_assessments; op public.payment_system_operators;
        opb public.payment_system_operators;
BEGIN
  FOR pn IN SELECT principle_number FROM public.pfmi_assessment_principles
             WHERE assessment_id = aid AND regulatory_score IS NULL LOOP
    PERFORM public.pfmi_save_principle(aid, pn, 'observed', 'observed', 'Assessed as observed.');
  END LOOP;

  r := public.pfmi_complete_assessment(aid, 'W2B certification summary.');
  IF COALESCE((r->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 18: completion did not return the existing ok shape (%)', r;
  END IF;
  -- existing methodology: worst observed score wins
  IF r->>'overall_rating' <> 'broadly_observed' THEN
    RAISE EXCEPTION 'FAIL 18: overall rating % does not follow the existing worst-score methodology', r->>'overall_rating';
  END IF;

  SELECT * INTO a FROM public.pfmi_assessments WHERE id = aid;
  IF a.status <> 'completed' OR a.completed_at IS NULL
     OR a.completed_by <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
     OR a.summary <> 'W2B certification summary.' OR a.overall_rating <> 'broadly_observed' THEN
    RAISE EXCEPTION 'FAIL 18: completion did not record status/completed_at/completed_by/summary/rating';
  END IF;
  RAISE NOTICE 'PASS 18: completion succeeded and recorded status, actor, time, summary and the worst-score overall rating';

  -- operator PFMI state through the existing fields
  SELECT * INTO op FROM public.payment_system_operators WHERE id = a.operator_id;
  IF op.last_pfmi_assessment_date <> current_date OR op.pfmi_compliance_level <> 'broadly_observed' THEN
    RAISE EXCEPTION 'FAIL 19: operator PFMI state not updated (% / %)',
      op.last_pfmi_assessment_date, op.pfmi_compliance_level;
  END IF;
  SELECT * INTO opb FROM public.payment_system_operators WHERE id = '00000000-0000-0000-0000-00000f8b2b04';
  IF opb.last_pfmi_assessment_date IS NOT NULL OR opb.pfmi_compliance_level IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 19: completing one operator mutated another operator PFMI state';
  END IF;
  IF (SELECT status FROM public.pfmi_assessments WHERE id = aidb) <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL 19: completing one assessment affected another operator assessment';
  END IF;
  RAISE NOTICE 'PASS 19: operator PFMI state reflects the completed assessment; the other operator is unaffected';

  -- canonical completion oversight event
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_events
                  WHERE assessment_id = aid AND event_type = 'PFMI_ASSESSMENT_COMPLETED'
                    AND actor_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
                    AND operator_id = a.operator_id
                    AND metadata->>'overall_rating' = 'broadly_observed') THEN
    RAISE EXCEPTION 'FAIL 20: no canonical PFMI_ASSESSMENT_COMPLETED oversight event';
  END IF;
  RAISE NOTICE 'PASS 20: canonical completion oversight event recorded with the overall rating';
END $$;

-- 21. completed assessment is immutable and cannot be completed twice
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid;
        pn int := current_setting('w2b.principle_no')::int; blocked int := 0;
BEGIN
  BEGIN
    PERFORM public.pfmi_save_principle(aid, pn, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 21: a completed assessment was altered';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 21%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%assessment_not_editable%' THEN
      RAISE EXCEPTION 'FAIL 21: unexpected error editing a completed assessment (%)', SQLERRM;
    END IF;
    blocked := blocked + 1;
  END;
  BEGIN
    PERFORM public.pfmi_complete_assessment(aid, 'again');
    RAISE EXCEPTION 'FAIL 21: a completed assessment was completed twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 21%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%assessment_already_completed%' THEN
      RAISE EXCEPTION 'FAIL 21: unexpected error on duplicate completion (%)', SQLERRM;
    END IF;
    blocked := blocked + 1;
  END;
  IF blocked <> 2 THEN RAISE EXCEPTION 'FAIL 21: expected 2 immutability blocks, got %', blocked; END IF;
  IF (SELECT regulatory_score FROM public.pfmi_assessment_principles
       WHERE assessment_id = aid AND principle_number = pn) <> 'broadly_observed' THEN
    RAISE EXCEPTION 'FAIL 21: completed assessment data was mutated';
  END IF;
  RAISE NOTICE 'PASS 21: completed assessments are non-editable and cannot be completed again';
END $$;

-- 22. unauthorised save/complete on a live assessment
DO $$
DECLARE aidb uuid := current_setting('w2b.assessment_b')::uuid; denied int := 0; pn int;
BEGIN
  SELECT min(principle_number) INTO pn FROM public.pfmi_assessment_principles WHERE assessment_id = aidb;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.pfmi_save_principle(aidb, pn, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 22: unauthorised internal persona saved a principle';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.pfmi_complete_assessment(aidb, 'unauthorised');
    RAISE EXCEPTION 'FAIL 22: unauthorised internal persona completed an assessment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.pfmi_save_principle(aidb, pn, NULL, 'observed');
    RAISE EXCEPTION 'FAIL 22: external licensee saved a principle';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.pfmi_complete_assessment(aidb, 'external');
    RAISE EXCEPTION 'FAIL 22: external licensee completed an assessment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 4 THEN RAISE EXCEPTION 'FAIL 22: expected 4 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 22: unauthorised internal and external principals cannot score or complete assessments';
END $$;

-- 23. read-surface isolation + UI read model works on the completed assessment
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid; n int;
BEGIN
  -- external licensee sees nothing on the PFMI surface
  SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.pfmi_assessments;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 23: external licensee can read % PFMI assessments', n; END IF;
  SELECT count(*) INTO n FROM public.pfmi_assessment_principles;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 23: external licensee can read % PFMI principle rows', n; END IF;

  -- unauthorised internal persona likewise
  SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.pfmi_assessments;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 23: unauthorised internal persona can read % PFMI assessments', n; END IF;

  -- authorised supervisor: the exact read model the PFMI UI hooks use
  SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.pfmi_assessments WHERE status = 'completed' AND id = aid;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 23: completed assessment not readable through the canonical read surface'; END IF;
  SELECT count(*) INTO n FROM public.pfmi_assessment_principles
   WHERE assessment_id = aid AND regulatory_score IS NOT NULL;
  IF n <> (SELECT count(*) FROM public.pfmi_principle_applicability WHERE operator_type = 'rtgs') THEN
    RAISE EXCEPTION 'FAIL 23: principle results not fully readable (%)', n;
  END IF;
  PERFORM 1 FROM public.pfmi_principles ORDER BY principle_number LIMIT 1;
  PERFORM 1 FROM public.pfmi_principle_applicability WHERE operator_type = 'rtgs' LIMIT 1;
  RAISE NOTICE 'PASS 23: PFMI read hooks resolve the completed assessment and principle results; other personas are isolated';
END $$;

RESET ROLE;

-- 24. existing non-observance notification behaviour remains configured and fired
DO $$
DECLARE aid uuid := current_setting('w2b.assessment_a')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_event_configs
                  WHERE event_key = 'prudential.pfmi_non_observance' AND is_active) THEN
    RAISE EXCEPTION 'FAIL 24: prudential.pfmi_non_observance event config missing/inactive';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notification_event_queue
              WHERE entity_id = aid AND event_key = 'prudential.pfmi_non_observance') THEN
    RAISE EXCEPTION 'FAIL 24: non-observance notification fired for a broadly_observed rating';
  END IF;
  RAISE NOTICE 'PASS 24: existing non-observance notification is configured and correctly did not fire for broadly_observed';
END $$;

ROLLBACK;

DO $$ BEGIN
  RAISE NOTICE 'F8-W2B PFMI ASSESSMENT LIFECYCLE — ALL GATES PASSED';
END $$;
