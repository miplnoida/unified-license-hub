-- =====================================================================
-- EPIC 2 — CANONICAL ENTERPRISE SUPERVISORY SPINE : CERTIFICATION
-- =====================================================================
-- Proves Scenarios A-F of the Epic 2 specification plus the structural
-- invariants (physical provenance, entity_risk_state single writer,
-- legacy plan preservation, examination preservation, engagement vs stage).
--
-- Conventions:
--   * Runs entirely inside one transaction and ROLLBACKs — no certification
--     business data is left behind.
--   * Business authorisation is exercised with REAL certification personas
--     (SET LOCAL ROLE authenticated + request.jwt.claims), never service_role.
--   * Every gate RAISEs on failure, so ON_ERROR_STOP aborts the run.
--
-- Personas (public.cert_certification_users):
--   prudential_analyst    ef43e80a-e17e-4f26-aa91-bcf0d99e3d89  maker
--   prudential_supervisor 021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce  checker
--   conduct_analyst       87a7ada9-9ef8-49ac-a810-4eb04fecf1ac  conduct maker
--   conduct_supervisor    4510ad1c-039f-40f3-877c-9d82f310a8f2  conduct checker
--   registration_officer  411dd06d-648b-4f32-82cc-897902c0c0b6  unauthorised
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off

\set MAKER      '''ef43e80a-e17e-4f26-aa91-bcf0d99e3d89'''
\set CHECKER    '''021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'''
\set C_MAKER    '''87a7ada9-9ef8-49ac-a810-4eb04fecf1ac'''
\set C_CHECKER  '''4510ad1c-039f-40f3-877c-9d82f310a8f2'''
\set OUTSIDER   '''411dd06d-648b-4f32-82cc-897902c0c0b6'''

BEGIN;

CREATE TEMP TABLE epic2_ctx(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE epic2_before(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
GRANT ALL ON epic2_ctx TO authenticated;
GRANT ALL ON epic2_before TO authenticated;

INSERT INTO epic2_before(k, n) VALUES
  ('legacy_plans',        (SELECT count(*) FROM public.legacy_supervisory_plans)),
  ('legacy_actions',      (SELECT count(*) FROM public.legacy_supervisory_plan_actions)),
  ('examinations',        (SELECT count(*) FROM public.examinations)),
  ('exam_findings',       (SELECT count(*) FROM public.examination_findings)),
  ('exam_reports',        (SELECT count(*) FROM public.examination_reports)),
  ('exam_workpapers',     (SELECT count(*) FROM public.examination_workpapers)),
  ('exam_events',         (SELECT count(*) FROM public.examination_events)),
  ('exam_scoping',        (SELECT count(*) FROM public.examination_scoping)),
  ('exam_team',           (SELECT count(*) FROM public.examination_team_members)),
  ('exam_data_requests',  (SELECT count(*) FROM public.examination_data_requests)),
  ('inspections',         (SELECT count(*) FROM public.inspections)),
  ('prudential_assess',   (SELECT count(*) FROM public.prudential_assessments)),
  ('entity_risk_state',   (SELECT count(*) FROM public.entity_risk_state));

-- examination identity fingerprint (order-independent)
CREATE TEMP TABLE epic2_exam_before AS
  SELECT id, stage, reference, entity_id, created_at, origin_provenance FROM public.examinations;
GRANT SELECT ON epic2_exam_before TO authenticated;

INSERT INTO epic2_ctx(k, v) VALUES
  ('entity_a', '5855bf85-9fde-4cf8-a082-7ea904d46184'),  -- Coral Harbour Bank Limited
  ('entity_b', '52112b8b-0f01-4682-a5c7-fc316797dfd8'),  -- Windward Trust Bank Limited
  ('pru_domain_record', (SELECT id FROM public.prudential_assessments
                          WHERE entity_id = '5855bf85-9fde-4cf8-a082-7ea904d46184'
                          ORDER BY created_at LIMIT 1)),
  ('camels_methodology', (SELECT id FROM public.supervisory_methodology
                           WHERE domain_code = 'PRUDENTIAL' AND status = 'ACTIVE' LIMIT 1)),
  ('aml_methodology',    (SELECT id FROM public.supervisory_methodology
                           WHERE domain_code = 'AML_CFT' AND status = 'ACTIVE' LIMIT 1));

-- =====================================================================
-- GATE 1 — LEGACY PLAN POPULATION PRESERVED AND CONVERGED (3 plans / 12 actions)
-- =====================================================================
DO $$
DECLARE lp bigint; la bigint; mp bigint; ma bigint; bad int;
BEGIN
  SELECT count(*) INTO lp FROM public.legacy_supervisory_plans;
  SELECT count(*) INTO la FROM public.legacy_supervisory_plan_actions;
  IF lp <> (SELECT b.n FROM epic2_before b WHERE b. k='legacy_plans') OR lp <> 3 THEN
    RAISE EXCEPTION 'FAIL 1: legacy supervisory plans changed (expected 3, found %)', lp; END IF;
  IF la <> (SELECT b.n FROM epic2_before b WHERE b. k='legacy_actions') OR la <> 12 THEN
    RAISE EXCEPTION 'FAIL 1: legacy supervisory plan actions changed (expected 12, found %)', la; END IF;

  -- every legacy plan/action is represented exactly once in the canonical model
  SELECT count(*) INTO mp FROM public.supervisory_plan WHERE legacy_plan_id IS NOT NULL;
  SELECT count(*) INTO ma FROM public.supervisory_plan_item WHERE legacy_action_id IS NOT NULL;
  IF mp <> lp THEN RAISE EXCEPTION 'FAIL 1: % legacy plans mapped, expected %', mp, lp; END IF;
  IF ma <> la THEN RAISE EXCEPTION 'FAIL 1: % legacy actions mapped, expected %', ma, la; END IF;

  SELECT count(*) INTO bad FROM public.legacy_supervisory_plans lp2
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_plan sp WHERE sp.legacy_plan_id = lp2.id);
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 1: % legacy plans unmapped', bad; END IF;

  -- entity relationship intact, item parentage intact
  SELECT count(*) INTO bad FROM public.supervisory_plan sp
    JOIN public.legacy_supervisory_plans lp3 ON lp3.id = sp.legacy_plan_id
   WHERE sp.entity_ids[1] IS DISTINCT FROM lp3.entity_id;
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 1: % migrated plans lost their entity relationship', bad; END IF;

  SELECT count(*) INTO bad FROM public.supervisory_plan_item i
    JOIN public.legacy_supervisory_plan_actions a ON a.id = i.legacy_action_id
    JOIN public.supervisory_plan sp ON sp.id = i.plan_id
   WHERE sp.legacy_plan_id IS DISTINCT FROM a.plan_id;
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 1: % migrated items attached to the wrong plan', bad; END IF;

  -- historical timestamps preserved, provenance explicit and not invented
  SELECT count(*) INTO bad FROM public.supervisory_plan sp
    JOIN public.legacy_supervisory_plans lp4 ON lp4.id = sp.legacy_plan_id
   WHERE sp.created_at <> lp4.created_at
      OR sp.created_by IS DISTINCT FROM lp4.created_by
      OR sp.origin_provenance <> 'LEGACY_MIGRATED';
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 1: % migrated plans lost history or provenance marking', bad; END IF;

  SELECT count(*) INTO bad FROM public.supervisory_plan sp
   WHERE sp.origin_provenance = 'LEGACY_MIGRATED'
     AND (sp.attention_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.supervisory_plan_assessment pa WHERE pa.plan_id = sp.id));
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 1: % migrated plans were given invented attention/assessment provenance', bad; END IF;

  -- migration event recorded for each
  SELECT count(*) INTO bad FROM public.supervisory_plan sp
   WHERE sp.legacy_plan_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_plan_event e
                      WHERE e.plan_id = sp.id AND e.event_type = 'LEGACY_MIGRATED');
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 1: % migrated plans have no migration event', bad; END IF;

  RAISE NOTICE 'PASS 1: legacy 3 plans / 12 actions preserved, mapped 1:1 into the canonical model, no invented provenance';
END $$;

-- =====================================================================
-- GATE 2 — EXAMINATION PRESERVATION (14/14, ids, children, stages)
-- =====================================================================
DO $$
DECLARE n bigint; bad int;
BEGIN
  SELECT count(*) INTO n FROM public.examinations;
  IF n <> 14 OR n <> (SELECT b.n FROM epic2_before b WHERE b. k='examinations') THEN
    RAISE EXCEPTION 'FAIL 2: examination count is % (expected 14)', n; END IF;

  SELECT count(*) INTO bad FROM (
    SELECT id FROM epic2_exam_before EXCEPT SELECT id FROM public.examinations) x;
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 2: % examination ids disappeared', bad; END IF;

  SELECT count(*) INTO bad FROM public.examinations e
    JOIN epic2_exam_before b ON b.id = e.id
   WHERE e.stage IS DISTINCT FROM b.stage
      OR e.reference IS DISTINCT FROM b.reference
      OR e.entity_id IS DISTINCT FROM b.entity_id
      OR e.created_at IS DISTINCT FROM b.created_at;
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 2: % historical examinations were rewritten', bad; END IF;

  -- deterministic classification, no invented plan/assessment provenance
  SELECT count(*) INTO bad FROM public.examinations WHERE domain_code IS NULL;
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 2: % examinations have no domain classification', bad; END IF;
  SELECT count(*) INTO bad FROM public.examinations WHERE domain_code <> 'PRUDENTIAL';
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 2: % examinations classified outside the deterministic PRUDENTIAL backfill', bad; END IF;
  SELECT count(*) INTO bad FROM public.examinations
   WHERE origin_provenance = 'LEGACY_UNKNOWN'
     AND (plan_id IS NOT NULL OR intervention_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.examination_origin o WHERE o.examination_id = examinations.id));
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 2: % historical examinations were given invented provenance', bad; END IF;
  SELECT count(*) INTO n FROM public.examinations WHERE origin_provenance = 'LEGACY_UNKNOWN';
  IF n <> 14 THEN RAISE EXCEPTION 'FAIL 2: LEGACY_UNKNOWN not explicit on all 14 historical rows (found %)', n; END IF;

  -- children untouched
  IF (SELECT count(*) FROM public.examination_findings)   <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_findings')
  OR (SELECT count(*) FROM public.examination_reports)    <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_reports')
  OR (SELECT count(*) FROM public.examination_workpapers) <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_workpapers')
  OR (SELECT count(*) FROM public.examination_events)     <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_events')
  OR (SELECT count(*) FROM public.examination_scoping)    <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_scoping')
  OR (SELECT count(*) FROM public.examination_team_members) <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_team')
  OR (SELECT count(*) FROM public.examination_data_requests) <> (SELECT b.n FROM epic2_before b WHERE b. k='exam_data_requests') THEN
    RAISE EXCEPTION 'FAIL 2: examination child record counts changed'; END IF;

  SELECT count(*) INTO bad FROM public.examination_findings f
   WHERE NOT EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = f.examination_id);
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL 2: % orphaned examination findings', bad; END IF;

  RAISE NOTICE 'PASS 2: 14/14 examinations preserved with ids, stages, children and explicit LEGACY_UNKNOWN provenance';
END $$;

-- =====================================================================
-- GATE 3 — PROVENANCE IS PHYSICALLY CONSTRAINED (FK evidence)
-- =====================================================================
DO $$
DECLARE missing text := '';
  edges text[][] := ARRAY[
    -- table, column, referenced table
    ARRAY['supervisory_assessment','methodology_id','supervisory_methodology'],
    ARRAY['supervisory_assessment','supersedes_id','supervisory_assessment'],
    ARRAY['supervisory_assessment_dimension','assessment_id','supervisory_assessment'],
    ARRAY['supervisory_assessment_event','assessment_id','supervisory_assessment'],
    ARRAY['prudential_assessments','supervisory_assessment_id','supervisory_assessment'],
    ARRAY['aml_assessments','supervisory_assessment_id','supervisory_assessment'],
    ARRAY['supervisory_attention_origin','attention_id','supervisory_attention'],
    ARRAY['supervisory_attention_origin','assessment_id','supervisory_assessment'],
    ARRAY['supervisory_attention_origin','examination_id','examinations'],
    ARRAY['supervisory_plan','attention_id','supervisory_attention'],
    ARRAY['supervisory_plan','legacy_plan_id','legacy_supervisory_plans'],
    ARRAY['supervisory_plan_assessment','plan_id','supervisory_plan'],
    ARRAY['supervisory_plan_assessment','assessment_id','supervisory_assessment'],
    ARRAY['supervisory_plan_item','plan_id','supervisory_plan'],
    ARRAY['supervisory_plan_item','legacy_action_id','legacy_supervisory_plan_actions'],
    ARRAY['supervisory_intervention','plan_id','supervisory_plan'],
    ARRAY['supervisory_intervention','attention_id','supervisory_attention'],
    ARRAY['supervisory_intervention','examination_id','examinations'],
    ARRAY['examinations','plan_id','supervisory_plan'],
    ARRAY['examinations','intervention_id','supervisory_intervention'],
    ARRAY['examinations','methodology_id','supervisory_methodology'],
    ARRAY['examination_origin','examination_id','examinations'],
    ARRAY['examination_origin','assessment_id','supervisory_assessment'],
    ARRAY['entity_risk_state','driving_assessment_id','supervisory_assessment']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(edges,1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
        JOIN pg_class t   ON t.oid = c.conrelid
        JOIN pg_class rt  ON rt.oid = c.confrelid
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f'
         AND t.relname  = edges[i][1]
         AND rt.relname = edges[i][3]
         AND a.attname  = edges[i][2]) THEN
      missing := missing || format('%s.%s -> %s; ', edges[i][1], edges[i][2], edges[i][3]);
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL 3: provenance edges are not FK-backed: %', missing; END IF;
  RAISE NOTICE 'PASS 3: all 24 canonical provenance edges are FK-backed';
END $$;

-- intervention -> canonical activity: FK per activity kind (no free-text UUID authority)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE c.contype='f' AND t.relname='supervisory_intervention'
     AND pg_get_constraintdef(c.oid) ~ '(examination_id|thematic_review_id|investigation_id)';
  IF n < 3 THEN
    RAISE EXCEPTION 'FAIL 3b: intervention -> canonical activity is not FK-backed'; END IF;
  -- the legacy weak pattern may survive only as display metadata
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid
     WHERE t.relname='supervisory_intervention' AND a.attname='canonical_record_id'
       AND a.attnotnull) THEN
    RAISE EXCEPTION 'FAIL 3b: canonical_record_id is still a mandatory (authoritative) provenance mechanism'; END IF;
  RAISE NOTICE 'PASS 3b: intervention -> canonical activity uses FK columns; canonical_record_id is optional display metadata only';
END $$;

-- invalid ids must be physically rejected
DO $$
DECLARE bogus uuid := '00000000-0000-4000-8000-00000000dead'; ok boolean;
BEGIN
  ok := false;
  BEGIN
    INSERT INTO public.supervisory_plan_assessment(plan_id, assessment_id)
    VALUES ((SELECT id FROM public.supervisory_plan LIMIT 1), bogus);
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3c: plan -> assessment accepted a nonexistent assessment'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.examination_origin(examination_id, assessment_id, origin_role)
    VALUES ((SELECT id FROM public.examinations LIMIT 1), bogus, 'DRIVING_ASSESSMENT');
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3c: examination origin accepted a nonexistent assessment'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.supervisory_attention_origin(attention_id, origin_kind, external_reference)
    VALUES (bogus, 'OTHER_GOVERNED_SOURCE', 'EPIC2-FK-NEGATIVE');
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3c: attention origin accepted a nonexistent attention item'; END IF;

  ok := false;
  BEGIN
    UPDATE public.examinations SET plan_id = bogus
     WHERE id = (SELECT id FROM public.examinations LIMIT 1);
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3c: examination accepted a nonexistent plan'; END IF;

  RAISE NOTICE 'PASS 3c: the database rejects invalid provenance ids on every canonical edge';
END $$;

-- =====================================================================
-- GATE 4 — entity_risk_state SINGLE WRITER
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating, effective_from)
    VALUES ((SELECT v FROM epic2_ctx WHERE k='entity_a'), 'PRUDENTIAL', 'high', now());
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4: direct insert into entity_risk_state was permitted'; END IF;

  ok := false;
  BEGIN
    UPDATE public.entity_risk_state SET residual_rating = 'low';
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok AND EXISTS (SELECT 1 FROM public.entity_risk_state) THEN
    RAISE EXCEPTION 'FAIL 4: direct update of entity_risk_state was permitted'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='entity_risk_state_guard_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FAIL 4: entity_risk_state guard trigger missing'; END IF;

  -- the ONLY function that may set the writer flag is the approved assessment transition
  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace='public'::regnamespace
       AND pg_get_functiondef(p.oid) LIKE '%app.supervisory_risk_state_writer%'
       AND p.proname NOT IN ('supervisory_assessment_transition','entity_risk_state_guard')) THEN
    RAISE EXCEPTION 'FAIL 4: a second writer of authoritative risk state exists'; END IF;
  RAISE NOTICE 'PASS 4: entity_risk_state has exactly one governed writer (approved supervisory assessment transition)';
END $$;

-- =====================================================================
-- GATE 5 — ENGAGEMENT TYPE vs LIFECYCLE STAGE SEMANTICS
-- =====================================================================
DO $$
DECLARE d text; ok boolean;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname='examinations_engagement_type_chk';
  IF d IS NULL OR d NOT LIKE '%OFFSITE_REVIEW%' THEN
    RAISE EXCEPTION 'FAIL 5: OFFSITE_REVIEW is not a permitted engagement type'; END IF;
  FOR d IN SELECT unnest(ARRAY['FULL_SCOPE_ONSITE','TARGETED_ONSITE','OFFSITE_REVIEW','FOLLOW_UP_REVIEW','JOINT_EXAMINATION']) LOOP
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='examinations_engagement_type_chk') NOT LIKE '%'||d||'%' THEN
      RAISE EXCEPTION 'FAIL 5: engagement type % not supported', d; END IF;
  END LOOP;

  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname='examinations_stage_not_engagement_chk';
  IF d IS NULL OR d NOT LIKE '%OFFSITE_REVIEW%' THEN
    RAISE EXCEPTION 'FAIL 5: nothing prevents OFFSITE_REVIEW being used as a lifecycle stage'; END IF;

  ok := false;
  BEGIN
    UPDATE public.examinations SET stage = 'OFFSITE_REVIEW'
     WHERE id = (SELECT id FROM public.examinations LIMIT 1);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5: an engagement type was accepted as a lifecycle stage'; END IF;

  -- one stage machine only: a single transition function governs every engagement type
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
       AND proname ~ 'examination.*transition.*stage|transition_examination') <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: examination stage transitions are not governed by exactly one engine'; END IF;
  RAISE NOTICE 'PASS 5: OFFSITE_REVIEW is an engagement type, stages are distinct, and one stage engine serves all engagement types';
END $$;

-- =====================================================================
-- GATE 6 — LEGACY / PARALLEL PATHS ARE CLOSED  (Scenario F)
-- =====================================================================
DO $$
DECLARE ok boolean; v text; n int;
BEGIN
  -- legacy inspections blocked
  ok := false;
  BEGIN
    INSERT INTO public.inspections(entity_id) VALUES ((SELECT v FROM epic2_ctx WHERE k='entity_a'));
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: a new legacy inspections row was accepted'; END IF;

  -- the retired RPC refuses
  IF (SELECT pg_get_functiondef(oid) FROM pg_proc
       WHERE proname='inspection_create' AND pronamespace='public'::regnamespace) NOT LIKE '%legacy_path_retired%' THEN
    RAISE EXCEPTION 'FAIL 6: inspection_create is not retired'; END IF;

  -- legacy planning tables accept no new work
  ok := false;
  BEGIN
    INSERT INTO public.legacy_supervisory_plans(entity_id, created_from, status)
    VALUES ((SELECT v FROM epic2_ctx WHERE k='entity_a'), 'test', 'draft');
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: a new legacy supervisory plan was accepted'; END IF;

  -- compatibility views are read-only for every role
  FOREACH v IN ARRAY ARRAY['supervisory_plans','supervisory_plan_actions','conduct_attention_items',
                           'conduct_interventions','conduct_supervisory_plans'] LOOP
    ok := false;
    BEGIN
      EXECUTE format('INSERT INTO public.%I (id) VALUES (gen_random_uuid())', v);
    EXCEPTION WHEN insufficient_privilege THEN ok := true;
              WHEN others THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: compatibility view % is still writable', v; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
                    WHERE c.relname=v AND tg.tgname LIKE '%readonly%' AND NOT tg.tgisinternal) THEN
      RAISE EXCEPTION 'FAIL 6: compatibility view % has no read-only guard', v; END IF;
  END LOOP;

  -- and still readable (dual-read compatibility preserved)
  SELECT count(*) INTO n FROM public.supervisory_plans;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 6: legacy plan compatibility read broke (%)', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_plan_actions;
  IF n <> 12 THEN RAISE EXCEPTION 'FAIL 6: legacy action compatibility read broke (%)', n; END IF;

  -- LEGACY_UNKNOWN cannot be used as a bypass for new work
  ok := false;
  BEGIN
    INSERT INTO public.examinations(reference, entity_id, title, origin_provenance)
    VALUES ('EX-BYPASS-TEST', (SELECT v FROM epic2_ctx WHERE k='entity_a'), 'bypass', 'LEGACY_UNKNOWN');
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: a new examination was allowed to claim LEGACY_UNKNOWN provenance'; END IF;

  -- the surviving legacy-named plan RPCs must delegate to the canonical spine
  FOREACH v IN ARRAY ARRAY['supervisory_plan_create','supervisory_plan_decision',
                           'supervisory_plan_action_create','supervisory_plan_action_transition'] LOOP
    IF (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = v AND pronamespace='public'::regnamespace) ~ 'INSERT INTO public.(legacy_)?supervisory_plans?(_actions)?\M' THEN
      RAISE EXCEPTION 'FAIL 6: % still writes the legacy planning tables', v; END IF;
    IF (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = v AND pronamespace='public'::regnamespace)
       NOT LIKE '%supervisory_plan_open%' AND
       (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = v AND pronamespace='public'::regnamespace)
       NOT LIKE '%supervisory_plan_lifecycle%' AND
       (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = v AND pronamespace='public'::regnamespace)
       NOT LIKE '%supervisory_plan_item_save%' THEN
      RAISE EXCEPTION 'FAIL 6: % does not delegate to a governed canonical operation', v; END IF;
  END LOOP;

  RAISE NOTICE 'PASS 6: legacy inspections, legacy planning tables, compatibility views and LEGACY_UNKNOWN bypass are all closed';
END $$;

-- =====================================================================
-- SCENARIO A — PRUDENTIAL END-TO-END (real personas)
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"ef43e80a-e17e-4f26-aa91-bcf0d99e3d89","role":"authenticated"}';

DO $$
DECLARE r jsonb; aid uuid; att uuid;
BEGIN
  r := public.supervisory_assessment_create(
        (SELECT v FROM epic2_ctx WHERE k='entity_a'), 'PRUDENTIAL', 'PERIODIC',
        current_date - 90, current_date, (SELECT v FROM epic2_ctx WHERE k='camels_methodology'),
        'PERIODIC', NULL, 'Epic 2 certification: prudential periodic assessment.');
  aid := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('pru_assessment', aid);

  PERFORM public.supervisory_assessment_link_domain_record(aid, 'prudential_assessments',
    (SELECT v FROM epic2_ctx WHERE k='pru_domain_record'));
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'CAPITAL_ADEQUACY', 'CAMELS',
    'high', 'moderate', 'high', 0.25, 3.5, 'Capital buffer compressed over the period.');
  PERFORM public.supervisory_assessment_transition(aid, 'submitted', 'Submitted for supervisory review.');
END $$;

SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';

DO $$
DECLARE aid uuid := (SELECT v FROM epic2_ctx WHERE k='pru_assessment');
  r jsonb; att uuid; plan uuid; iv uuid; ex uuid;
BEGIN
  PERFORM public.supervisory_assessment_transition(aid, 'approved',
    'Approved: residual risk confirmed as high following review of the capital dimension.', 'high',
    current_date + 180);

  r := public.supervisory_attention_open('Capital adequacy deterioration', 'PRUDENTIAL',
        'Approved prudential assessment records a high residual capital risk requiring supervisory attention.',
        'SUPERVISORY_ASSESSMENT', ARRAY[(SELECT v FROM epic2_ctx WHERE k='entity_a')], aid);
  att := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('pru_attention', att);
  PERFORM public.supervisory_attention_confirm_priority(att, 'HIGH',
    'Human confirmation: capital trajectory warrants a targeted onsite engagement this cycle.');

  r := public.supervisory_plan_open('Coral Harbour capital supervision plan', 'PRUDENTIAL',
        'Confirmed high-priority capital adequacy attention arising from the approved prudential assessment.',
        'Restore capital headroom through targeted supervisory engagement.', att, ARRAY[aid]);
  plan := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('pru_plan', plan);
  PERFORM public.supervisory_plan_lifecycle(plan, 'SUBMITTED', 'Submitted for supervisory approval.');
  PERFORM public.supervisory_plan_lifecycle(plan, 'APPROVED', 'Approved by the prudential supervisor.');
  PERFORM public.supervisory_plan_lifecycle(plan, 'ACTIVE', 'Activated for the current supervisory cycle.');

  r := public.supervisory_intervention_open(plan, 'TARGETED_EXAMINATION',
        'Targeted capital examination', 'Plan-authorised targeted examination of capital management.',
        'PRUDENTIAL', (SELECT v FROM epic2_ctx WHERE k='entity_a'), att);
  iv := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('pru_intervention', iv);
  PERFORM public.supervisory_intervention_decide(iv, 'APPROVE',
    'Approved: proceed with the targeted capital examination.');

  r := public.supervisory_examination_open(iv, 'Targeted capital examination', 'TARGETED_ONSITE',
        'PRUDENTIAL', (SELECT v FROM epic2_ctx WHERE k='entity_a'), ARRAY[aid]);
  ex := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('pru_examination', ex);
END $$;

RESET ROLE;

DO $$
DECLARE ex uuid := (SELECT v FROM epic2_ctx WHERE k='pru_examination');
        aid uuid := (SELECT v FROM epic2_ctx WHERE k='pru_assessment');
        pl uuid := (SELECT v FROM epic2_ctx WHERE k='pru_plan');
        iv uuid := (SELECT v FROM epic2_ctx WHERE k='pru_intervention');
        att uuid := (SELECT v FROM epic2_ctx WHERE k='pru_attention');
        t jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examinations e
                  WHERE e.id=ex AND e.plan_id=pl AND e.intervention_id=iv
                    AND e.domain_code='PRUDENTIAL' AND e.engagement_type='TARGETED_ONSITE'
                    AND e.origin_provenance='GOVERNED') THEN
    RAISE EXCEPTION 'FAIL A: examination is not physically bound to its plan/intervention'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_origin WHERE examination_id=ex AND assessment_id=aid) THEN
    RAISE EXCEPTION 'FAIL A: examination does not trace back to the originating assessment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_plan_assessment WHERE plan_id=pl AND assessment_id=aid) THEN
    RAISE EXCEPTION 'FAIL A: plan is not physically linked to the originating assessment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_attention_origin WHERE attention_id=att AND assessment_id=aid) THEN
    RAISE EXCEPTION 'FAIL A: attention is not physically linked to the assessment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_attention WHERE id=att AND confirmed_priority='HIGH'
                   AND confirmed_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL A: human priority confirmation not recorded'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_assessments
                  WHERE id=(SELECT v FROM epic2_ctx WHERE k='pru_domain_record')
                    AND supervisory_assessment_id=aid) THEN
    RAISE EXCEPTION 'FAIL A: domain assessment not linked to the canonical envelope'; END IF;
  -- authoritative risk state written only by the approved transition
  IF NOT EXISTS (SELECT 1 FROM public.entity_risk_state
                  WHERE entity_id=(SELECT v FROM epic2_ctx WHERE k='entity_a')
                    AND domain_code='PRUDENTIAL' AND driving_assessment_id=aid
                    AND residual_rating='high') THEN
    RAISE EXCEPTION 'FAIL A: approved assessment did not become the authoritative risk state'; END IF;
  t := public.supervisory_trace('examination', ex);
  IF t IS NULL OR t->'assessments' IS NULL THEN
    RAISE EXCEPTION 'FAIL A: trace read model does not resolve the examination chain'; END IF;
  RAISE NOTICE 'PASS A: prudential assessment -> attention -> priority -> plan -> intervention -> examination -> trace';
END $$;

-- =====================================================================
-- SCENARIO B — AML/CFT BACKBONE (controlled fixture, rolled back)
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';

DO $$
DECLARE r jsonb; aid uuid; att uuid; pl uuid; iv uuid; ex uuid; dom uuid;
BEGIN
  r := public.supervisory_assessment_create(
        (SELECT v FROM epic2_ctx WHERE k='entity_a'), 'AML_CFT', 'RISK_BASED',
        current_date - 365, current_date, (SELECT v FROM epic2_ctx WHERE k='aml_methodology'),
        'PERIODIC', NULL, 'Epic 2 certification fixture: AML/CFT risk-based assessment.');
  aid := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('aml_assessment', aid);

  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'CUSTOMER_RISK', 'INHERENT_RISK',
    'high', NULL, 'high', 0.2, 4, 'Significant non-resident customer base.');
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS',
    NULL, 'weak', 'high', 0.2, 4, 'Monitoring thresholds untuned since implementation.');

  -- domain extension row (AML) linked through the FK-backed envelope
  INSERT INTO public.aml_assessments(entity_id, supervisory_assessment_id)
  VALUES ((SELECT v FROM epic2_ctx WHERE k='entity_a'), aid)
  RETURNING id INTO dom;
  INSERT INTO epic2_ctx(k,v) VALUES ('aml_domain_record', dom);

  PERFORM public.supervisory_assessment_transition(aid, 'submitted', 'Submitted for AML review.');
END $$;

SET LOCAL "request.jwt.claims" = '{"sub":"43fe7d54-e67e-4422-b032-f4f2ec767a28","role":"authenticated"}';

DO $$
DECLARE aid uuid := (SELECT v FROM epic2_ctx WHERE k='aml_assessment'); r jsonb; att uuid; pl uuid; iv uuid; ex uuid;
BEGIN
  PERFORM public.supervisory_assessment_transition(aid, 'approved',
    'Approved: AML/CFT residual risk confirmed high on customer and monitoring dimensions.', 'high');

  r := public.supervisory_attention_open('AML/CFT transaction monitoring weakness', 'AML_CFT',
        'Approved AML/CFT assessment records weak transaction monitoring against high inherent customer risk.',
        'AML_RISK', ARRAY[(SELECT v FROM epic2_ctx WHERE k='entity_a')], aid);
  att := (r->>'id')::uuid;
  PERFORM public.supervisory_attention_confirm_priority(att, 'IMMEDIATE',
    'Human confirmation: monitoring weakness requires an immediate AML engagement.');

  r := public.supervisory_plan_open('AML/CFT supervisory plan', 'AML_CFT',
        'Confirmed immediate AML/CFT attention arising from the approved risk-based assessment.',
        'Remediate transaction monitoring and EDD coverage.', att, ARRAY[aid]);
  pl := (r->>'id')::uuid;
  PERFORM public.supervisory_plan_lifecycle(pl, 'SUBMITTED', 'Submitted for AML supervisory approval.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'APPROVED', 'Approved by the AML supervisor.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'ACTIVE', 'Activated for the AML cycle.');

  r := public.supervisory_intervention_open(pl, 'ONSITE_EXAMINATION', 'AML/CFT onsite examination',
        'Plan-authorised AML/CFT onsite examination of monitoring and EDD.', 'AML_CFT',
        (SELECT v FROM epic2_ctx WHERE k='entity_a'), att);
  iv := (r->>'id')::uuid;
  PERFORM public.supervisory_intervention_decide(iv, 'APPROVE', 'Approved: proceed with the AML onsite examination.');

  r := public.supervisory_examination_open(iv, 'AML/CFT onsite examination', 'FULL_SCOPE_ONSITE',
        'AML_CFT', (SELECT v FROM epic2_ctx WHERE k='entity_a'), ARRAY[aid]);
  ex := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('aml_examination', ex);
END $$;

RESET ROLE;

DO $$
DECLARE ex uuid := (SELECT v FROM epic2_ctx WHERE k='aml_examination');
        aid uuid := (SELECT v FROM epic2_ctx WHERE k='aml_assessment');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examinations WHERE id=ex AND domain_code='AML_CFT'
                   AND plan_id IS NOT NULL AND intervention_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL B: AML examination lacks domain or plan/intervention provenance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_origin WHERE examination_id=ex AND assessment_id=aid) THEN
    RAISE EXCEPTION 'FAIL B: AML examination does not trace to the AML assessment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.aml_assessments
                  WHERE id=(SELECT v FROM epic2_ctx WHERE k='aml_domain_record') AND supervisory_assessment_id=aid) THEN
    RAISE EXCEPTION 'FAIL B: AML domain extension not linked to the canonical envelope'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_dimension WHERE assessment_id=aid
       AND dimension_group IN ('INHERENT_RISK','CONTROL_EFFECTIVENESS')) < 2 THEN
    RAISE EXCEPTION 'FAIL B: AML inherent/control dimensions not recorded through the methodology model'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entity_risk_state
                  WHERE entity_id=(SELECT v FROM epic2_ctx WHERE k='entity_a') AND domain_code='AML_CFT') THEN
    RAISE EXCEPTION 'FAIL B: AML risk state not established by the approved assessment'; END IF;
  RAISE NOTICE 'PASS B: AML/CFT assessment -> extension -> attention -> priority -> plan -> intervention -> AML_CFT examination -> trace';
END $$;

-- =====================================================================
-- SCENARIO C — MARKET CONDUCT (old workflow still functional)
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';

DO $$
DECLARE r jsonb; att uuid;
BEGIN
  r := public.supervisory_attention_open('Conduct complaint cluster', 'MARKET_CONDUCT',
        'Recurring mis-selling signals identified through conduct surveillance for this entity.',
        'CONDUCT_SIGNAL', ARRAY[(SELECT v FROM epic2_ctx WHERE k='entity_a')]);
  att := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('mc_attention', att);
END $$;

SET LOCAL "request.jwt.claims" = '{"sub":"4510ad1c-039f-40f3-877c-9d82f310a8f2","role":"authenticated"}';

DO $$
DECLARE att uuid := (SELECT v FROM epic2_ctx WHERE k='mc_attention'); r jsonb; pl uuid; iv uuid; ex uuid;
BEGIN
  PERFORM public.supervisory_attention_confirm_priority(att, 'HIGH',
    'Human confirmation: cluster indicates a systemic sales-practice concern.');
  r := public.supervisory_plan_open('Conduct sales practice review plan', 'MARKET_CONDUCT',
        'Confirmed high-priority conduct attention arising from a recurring mis-selling signal cluster.',
        'Assess sales practices and remediate customer harm.', att);
  pl := (r->>'id')::uuid;
  PERFORM public.supervisory_plan_lifecycle(pl, 'SUBMITTED', 'Submitted for conduct supervisory approval.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'APPROVED', 'Approved by the conduct supervisor.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'ACTIVE', 'Activated for the conduct cycle.');
  r := public.supervisory_intervention_open(pl, 'THEMATIC_REVIEW', 'Sales practice thematic review',
        'Plan-authorised thematic review of sales practices following the confirmed conduct attention.',
        'MARKET_CONDUCT', (SELECT v FROM epic2_ctx WHERE k='entity_a'), att);
  iv := (r->>'id')::uuid;
  PERFORM public.supervisory_intervention_decide(iv, 'APPROVE', 'Approved: proceed with the thematic review.');
  r := public.supervisory_examination_open(iv, 'Sales practice offsite review', 'OFFSITE_REVIEW',
        'MARKET_CONDUCT', (SELECT v FROM epic2_ctx WHERE k='entity_a'));
  ex := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('mc_examination', ex);
  INSERT INTO epic2_ctx(k,v) VALUES ('mc_intervention', iv);
  INSERT INTO epic2_ctx(k,v) VALUES ('mc_plan', pl);
END $$;

RESET ROLE;

DO $$
DECLARE ex uuid := (SELECT v FROM epic2_ctx WHERE k='mc_examination');
        iv uuid := (SELECT v FROM epic2_ctx WHERE k='mc_intervention');
        pl uuid := (SELECT v FROM epic2_ctx WHERE k='mc_plan'); n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examinations WHERE id=ex AND domain_code='MARKET_CONDUCT'
                   AND engagement_type='OFFSITE_REVIEW' AND intervention_id=iv AND plan_id=pl) THEN
    RAISE EXCEPTION 'FAIL C: conduct offsite review is not bound to its plan/intervention'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_intervention WHERE id=iv AND examination_id=ex) THEN
    RAISE EXCEPTION 'FAIL C: intervention -> canonical activity link is not physical'; END IF;
  -- the pre-existing conduct surface still reads through the compatibility views
  SELECT count(*) INTO n FROM public.conduct_attention_items WHERE id=(SELECT v FROM epic2_ctx WHERE k='mc_attention');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL C: conduct compatibility read broke'; END IF;
  SELECT count(*) INTO n FROM public.conduct_supervisory_plans WHERE id=pl;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL C: conduct plan compatibility read broke'; END IF;
  SELECT count(*) INTO n FROM public.conduct_interventions WHERE id=iv;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL C: conduct intervention compatibility read broke'; END IF;
  IF (SELECT count(*) FROM public.supervisory_intervention_type) < 15 THEN
    RAISE EXCEPTION 'FAIL C: enterprise intervention catalogue incomplete'; END IF;
  RAISE NOTICE 'PASS C: conduct signal -> attention -> plan -> intervention -> canonical activity, legacy conduct reads intact';
END $$;

-- =====================================================================
-- SCENARIO D — CROSS-DOMAIN JOINT EXAMINATION
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';

DO $$
DECLARE r jsonb; att uuid; pl uuid; iv uuid; ex uuid;
  pru uuid := (SELECT v FROM epic2_ctx WHERE k='pru_assessment');
  aml uuid := (SELECT v FROM epic2_ctx WHERE k='aml_assessment');
BEGIN
  r := public.supervisory_attention_open('Cross-domain deterioration', 'CROSS_DOMAIN',
        'Approved prudential and AML/CFT assessments both record high residual risk for the same entity.',
        'SUPERVISORY_ASSESSMENT', ARRAY[(SELECT v FROM epic2_ctx WHERE k='entity_a')], pru);
  att := (r->>'id')::uuid;
  PERFORM public.supervisory_attention_confirm_priority(att, 'IMMEDIATE',
    'Human confirmation: combined prudential and AML deterioration justifies a joint engagement.');
  r := public.supervisory_plan_open('Joint supervisory plan', 'CROSS_DOMAIN',
        'Confirmed cross-domain attention arising from two approved assessments for the same entity.',
        'Run a single joint engagement covering capital and AML control weaknesses.',
        att, ARRAY[pru, aml]);
  pl := (r->>'id')::uuid;
  PERFORM public.supervisory_plan_lifecycle(pl, 'SUBMITTED', 'Submitted for joint approval.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'APPROVED', 'Approved as a joint engagement.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'ACTIVE', 'Activated as a joint engagement.');
  r := public.supervisory_intervention_open(pl, 'FULL_SCOPE_EXAMINATION', 'Joint prudential/AML examination',
        'Plan-authorised joint examination covering both domains under one engagement.', 'CROSS_DOMAIN',
        (SELECT v FROM epic2_ctx WHERE k='entity_a'), att);
  iv := (r->>'id')::uuid;
  PERFORM public.supervisory_intervention_decide(iv, 'APPROVE', 'Approved: single joint examination.');
  r := public.supervisory_examination_open(iv, 'Joint prudential/AML examination', 'JOINT_EXAMINATION',
        'CROSS_DOMAIN', (SELECT v FROM epic2_ctx WHERE k='entity_a'), ARRAY[pru, aml]);
  ex := (r->>'id')::uuid;
  INSERT INTO epic2_ctx(k,v) VALUES ('joint_examination', ex);
  INSERT INTO epic2_ctx(k,v) VALUES ('joint_plan', pl);
END $$;

RESET ROLE;

DO $$
DECLARE ex uuid := (SELECT v FROM epic2_ctx WHERE k='joint_examination');
        pl uuid := (SELECT v FROM epic2_ctx WHERE k='joint_plan'); n int;
BEGIN
  SELECT count(*) INTO n FROM public.examination_origin WHERE examination_id=ex
    AND assessment_id IN ((SELECT v FROM epic2_ctx WHERE k='pru_assessment'),
                          (SELECT v FROM epic2_ctx WHERE k='aml_assessment'));
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL D: joint examination shows % originating assessments, expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_plan_assessment WHERE plan_id=pl;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL D: joint plan is not linked to both assessments (%)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examinations WHERE id=ex AND engagement_type='JOINT_EXAMINATION'
                   AND domain_code='CROSS_DOMAIN') THEN
    RAISE EXCEPTION 'FAIL D: joint engagement type/domain not recorded'; END IF;
  IF (public.supervisory_trace('examination', ex)->'assessments') IS NULL THEN
    RAISE EXCEPTION 'FAIL D: cross-domain trace does not resolve'; END IF;
  RAISE NOTICE 'PASS D: two approved assessments drive ONE joint examination through physical authoritative links';
END $$;

-- =====================================================================
-- SCENARIO E — SECURITY / GOVERNANCE NEGATIVES (real personas, no service_role)
-- =====================================================================
SET LOCAL ROLE authenticated;

-- E1 unauthorised persona cannot create an assessment
SET LOCAL "request.jwt.claims" = '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_create((SELECT v FROM epic2_ctx WHERE k='entity_a'),
      'PRUDENTIAL', 'PERIODIC');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E1: unauthorised persona created a supervisory assessment'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_attention_confirm_priority((SELECT v FROM epic2_ctx WHERE k='pru_attention'),
      'MONITOR', 'Unauthorised downgrade attempt.');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E1: unauthorised persona confirmed a supervisory priority'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_plan_lifecycle((SELECT v FROM epic2_ctx WHERE k='pru_plan'), 'CANCELLED',
      'Unauthorised cancellation attempt.');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E1: unauthorised persona changed a plan lifecycle'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_examination_open((SELECT v FROM epic2_ctx WHERE k='pru_intervention'),
      'Unauthorised examination', 'TARGETED_ONSITE');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E1: unauthorised persona opened an examination'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating, effective_from)
    VALUES ((SELECT v FROM epic2_ctx WHERE k='entity_b'), 'PRUDENTIAL', 'low', now());
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E1: unauthorised persona wrote authoritative risk state'; END IF;

  RAISE NOTICE 'PASS E1: unauthorised persona denied on assessment create, priority confirmation, plan approval, examination and risk state';
END $$;

-- E2 maker-checker: the preparer/submitter cannot approve
SET LOCAL "request.jwt.claims" = '{"sub":"ef43e80a-e17e-4f26-aa91-bcf0d99e3d89","role":"authenticated"}';
DO $$
DECLARE ok boolean := false; r jsonb; aid uuid;
BEGIN
  r := public.supervisory_assessment_create((SELECT v FROM epic2_ctx WHERE k='entity_a'),
        'PRUDENTIAL', 'EVENT_DRIVEN', NULL, NULL, NULL, 'EVENT',
        NULL, 'Maker-checker negative test fixture.');
  aid := (r->>'id')::uuid;
  PERFORM public.supervisory_assessment_transition(aid, 'submitted', 'Submitted by the preparer.');
  BEGIN
    PERFORM public.supervisory_assessment_transition(aid, 'approved',
      'Self-approval attempt by the officer who prepared and submitted the assessment.');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E2: maker approved their own assessment'; END IF;
  RAISE NOTICE 'PASS E2: maker-checker denies self-approval of a supervisory assessment';
END $$;

-- E3 cross-entity scope, AML confidentiality and arbitrary activity linkage
SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
DO $$
DECLARE ok boolean := false; n int;
BEGIN
  -- arbitrary intervention -> nonexistent activity must be rejected
  BEGIN
    PERFORM public.supervisory_intervention_link_activity(
      (SELECT v FROM epic2_ctx WHERE k='mc_intervention'), 'examination',
      '00000000-0000-4000-8000-00000000beef');
  EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL E3: intervention was linked to a nonexistent canonical activity'; END IF;

  -- confidential AML material is not readable by a persona without AML authority
  SELECT count(*) INTO n FROM public.supervisory_assessment
   WHERE id = (SELECT v FROM epic2_ctx WHERE k='aml_assessment');
  IF n > 0 AND NOT public.has_permission(auth.uid(),'aml_supervision','view')
     AND NOT public.is_super_admin(auth.uid())
     AND (SELECT confidentiality FROM public.supervisory_assessment
           WHERE id=(SELECT v FROM epic2_ctx WHERE k='aml_assessment')) <> 'STANDARD' THEN
    RAISE EXCEPTION 'FAIL E3: confidential AML assessment readable without AML authority';
  END IF;
  RAISE NOTICE 'PASS E3: arbitrary activity linkage rejected; AML confidentiality boundary holds';
END $$;

RESET ROLE;

-- cross-entity scope denial is structurally enforced by supervisory_entity_scope_check
DO $$
BEGIN
  IF (SELECT pg_get_functiondef(oid) FROM pg_proc
       WHERE proname='supervisory_entity_scope_check' AND pronamespace='public'::regnamespace)
     NOT LIKE '%not_authorized: entity outside your supervisory scope%' THEN
    RAISE EXCEPTION 'FAIL E4: entity scope enforcement removed'; END IF;
  IF (SELECT count(*) FROM pg_proc p
       WHERE p.pronamespace='public'::regnamespace
         AND p.proname IN ('supervisory_assessment_create','supervisory_assessment_transition',
             'supervisory_attention_open','supervisory_plan_open','supervisory_intervention_open',
             'supervisory_examination_open')
         AND pg_get_functiondef(p.oid) LIKE '%supervisory_entity_scope_check%') < 6 THEN
    RAISE EXCEPTION 'FAIL E4: a governed spine operation skips the entity scope check'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
                  WHERE ns.nspname='public' AND c.relname='supervisory_assessment' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'FAIL E4: RLS not enabled on supervisory_assessment'; END IF;
  RAISE NOTICE 'PASS E4: every governed spine operation enforces entity scope; RLS enabled on the canonical stores';
END $$;

-- =====================================================================
-- FINAL — counts after (inside the rolled-back transaction)
-- =====================================================================
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.examinations;
  IF n <> 14 + 4 THEN
    RAISE EXCEPTION 'FAIL FINAL: expected 14 historical + 4 certification examinations, found %', n; END IF;
  SELECT count(*) INTO n FROM public.legacy_supervisory_plans;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL FINAL: legacy plan count drifted (%)', n; END IF;
  SELECT count(*) INTO n FROM public.inspections;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL FINAL: an inspections row was created (%)', n; END IF;
  RAISE NOTICE 'PASS FINAL: certification fixtures are transaction-scoped; historical populations unchanged';
END $$;

DO $$ BEGIN RAISE NOTICE 'EPIC 2 CANONICAL SUPERVISORY SPINE: ALL DB GATES PASSED'; END $$;

ROLLBACK;
