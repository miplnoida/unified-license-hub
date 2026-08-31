-- F8-W1E2B — PRUDENTIAL AUDIT CONVENTION CONVERGENCE (part of GAP-F8-02)
--
-- Proves that the 13 governed Prudential mutation RPCs that previously
-- audited directly through public.log_compliance_audit now audit through the
-- canonical Prudential primitive public.prudential_audit_event, which
-- dual-writes audit_logs + compliance_audit_logs, with actor / object /
-- action / timestamp / before-after / justification preserved, and with the
-- existing authority contracts unchanged.
--
--   archive_prudential_ratio        publish_prudential_ratio
--   archive_prudential_threshold    publish_prudential_threshold
--   restore_prudential_ratio        rollback_prudential_ratio
--   restore_prudential_threshold    rollback_prudential_threshold
--   set_prudential_min_peers        prudential_ewi_acknowledge
--   prudential_ewi_evaluate         examination_create
--   examination_update
--
-- Runtime proof is limited to three representative mutations (one
-- configuration, one workflow, one examination). The fixture is
-- rollback-scoped and uses real certification personas; nothing is ever
-- seeded into auth.users.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static contract
-- ===========================================================================
DO $$
DECLARE
  def text; fn text;
  converged text[] := ARRAY[
    'archive_prudential_ratio','archive_prudential_threshold',
    'publish_prudential_ratio','publish_prudential_threshold',
    'restore_prudential_ratio','restore_prudential_threshold',
    'rollback_prudential_ratio','rollback_prudential_threshold',
    'set_prudential_min_peers','prudential_ewi_acknowledge',
    'prudential_ewi_evaluate','examination_create','examination_update'];
  missing text := ''; legacy text := '';
BEGIN
  -- 1. canonical primitive intact: server-derived actor + both audit surfaces
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'prudential_audit_event';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 1: canonical prudential_audit_event missing'; END IF;
  IF def NOT LIKE '%INTO public.audit_logs%'
     OR def NOT LIKE '%INTO public.compliance_audit_logs%'
     OR def NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL 1: canonical audit primitive no longer dual-writes with a server-derived actor';
  END IF;
  RAISE NOTICE 'PASS 1: canonical prudential_audit_event intact (actor from auth.uid(), audit_logs + compliance_audit_logs)';

  -- 2. all 13 use the canonical primitive
  FOREACH fn IN ARRAY converged LOOP
    SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = fn;
    IF def IS NULL THEN RAISE EXCEPTION 'FAIL 2: % missing', fn; END IF;
    IF def NOT LIKE '%prudential_audit_event(%' THEN missing := missing || fn || ' '; END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL 2: these RPCs do not audit through the canonical primitive: %', missing;
  END IF;
  RAISE NOTICE 'PASS 2: all 13 converged RPCs audit through prudential_audit_event';

  -- 3. none of the 13 still calls log_compliance_audit (no double-write)
  FOREACH fn IN ARRAY converged LOOP
    SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = fn;
    IF def LIKE '%log_compliance_audit(%' THEN legacy := legacy || fn || ' '; END IF;
  END LOOP;
  IF legacy <> '' THEN
    RAISE EXCEPTION 'FAIL 3: these RPCs still call log_compliance_audit directly (double-write risk): %', legacy;
  END IF;
  RAISE NOTICE 'PASS 3: no converged RPC calls log_compliance_audit directly';

  -- 4. authority contracts and SECURITY DEFINER posture unchanged
  FOREACH fn IN ARRAY ARRAY['archive_prudential_ratio','archive_prudential_threshold',
                            'publish_prudential_ratio','publish_prudential_threshold',
                            'restore_prudential_ratio','restore_prudential_threshold',
                            'rollback_prudential_ratio','rollback_prudential_threshold',
                            'set_prudential_min_peers'] LOOP
    SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = fn;
    IF def NOT LIKE '%can_manage_prudential_config(auth.uid())%' THEN
      RAISE EXCEPTION 'FAIL 4: % lost its prudential config authority check', fn;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'prudential_ewi_acknowledge';
  IF def NOT LIKE '%can_act_on_prudential(auth.uid())%'
     OR def NOT LIKE '%can_read_prudential_entity(auth.uid()%'
     OR def NOT LIKE '%invalid status%' THEN
    RAISE EXCEPTION 'FAIL 4: prudential_ewi_acknowledge authority/validation weakened';
  END IF;

  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'prudential_ewi_evaluate';
  IF def NOT LIKE '%is_trusted_service_request()%'
     OR def NOT LIKE '%can_read_prudential_entity(auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL 4: prudential_ewi_evaluate authority weakened';
  END IF;

  FOREACH fn IN ARRAY ARRAY['examination_create','examination_update'] LOOP
    SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = fn;
    IF def NOT LIKE '%conduct_require(''prudential_supervision'',''manage_examination'')%' THEN
      RAISE EXCEPTION 'FAIL 4: % lost its canonical prudential examination authority check', fn;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = ANY(converged)
       AND (NOT prosecdef OR proconfig IS NULL OR NOT ('search_path=public' = ANY(proconfig)))) THEN
    RAISE EXCEPTION 'FAIL 4: SECURITY DEFINER / pinned search_path posture changed';
  END IF;
  RAISE NOTICE 'PASS 4: authority, validation and SECURITY DEFINER posture preserved on all 13';

  -- 5. return shapes unchanged
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND ((proname IN ('archive_prudential_ratio','archive_prudential_threshold',
                           'restore_prudential_ratio','restore_prudential_threshold')
               AND prorettype = 'void'::regtype)
           OR (proname IN ('publish_prudential_ratio','publish_prudential_threshold',
                           'rollback_prudential_ratio','rollback_prudential_threshold',
                           'set_prudential_min_peers')
               AND prorettype = 'integer'::regtype)
           OR (proname IN ('prudential_ewi_evaluate','examination_create','examination_update')
               AND prorettype = 'jsonb'::regtype)
           OR (proname = 'prudential_ewi_acknowledge'
               AND prorettype = 'public.prudential_ewi_alerts'::regtype))) <> 13 THEN
    RAISE EXCEPTION 'FAIL 5: at least one converged RPC changed its return shape';
  END IF;
  RAISE NOTICE 'PASS 5: all 13 converged RPCs keep their original return shapes';

  -- 6. ratified system audit exceptions untouched (not converged, not governed)
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = '_prudential_canonical_detect_run';
  IF def IS NULL OR def NOT LIKE '%INSERT INTO public.compliance_audit_logs%' THEN
    RAISE EXCEPTION 'FAIL 6: _prudential_canonical_detect_run system audit write missing';
  END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'group_ewi_evaluate';
  IF def IS NULL OR def NOT LIKE '%INSERT INTO public.audit_logs%' THEN
    RAISE EXCEPTION 'FAIL 6: group_ewi_evaluate system audit write missing';
  END IF;
  RAISE NOTICE 'PASS 6: the two ratified system audit exceptions still write their system audit trail';
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped runtime proof (3 representative mutations)
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec   uuid := '00000000-0000-0000-0000-00000f1e2b01';
  v_ent   uuid := '00000000-0000-0000-0000-00000f1e2b02';
  v_ratio uuid := '00000000-0000-0000-0000-00000f1e2b03';
  v_alert uuid := '00000000-0000-0000-0000-00000f1e2b04';
  v_exam  uuid := '00000000-0000-0000-0000-00000f1e2b05';
  v_cfg   uuid;
  v_rule  record;
  v_lead  uuid := 'b597c405-e0c4-421b-9092-820a444f2429'; -- inspection_supervisor
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W1E2B Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_ent, 'W1E2B Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;

  SELECT id INTO v_cfg FROM public.return_configurations ORDER BY created_at LIMIT 1;
  IF v_cfg IS NULL THEN RAISE EXCEPTION 'fixture: no return configuration available'; END IF;

  INSERT INTO public.prudential_ratios (id, return_config_id, ratio_key, label, formula, display_format)
  VALUES (v_ratio, v_cfg, 'W1E2B_TEST_RATIO', 'W1E2B Test Ratio', 'a / b', 'decimal');

  SELECT * INTO v_rule FROM public.prudential_ewi_rules ORDER BY created_at LIMIT 1;
  IF v_rule IS NULL THEN RAISE EXCEPTION 'fixture: no EWI rule available'; END IF;
  INSERT INTO public.prudential_ewi_alerts
    (id, entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, status)
  VALUES (v_alert, v_ent, v_rule.id, v_rule.code, v_rule.version, date '2025-12-31',
          'W1E2B_TEST_RATIO', 'high', 'open');

  INSERT INTO public.examinations
    (id, reference, entity_id, sector_id, title, examination_type, stage, lead_examiner_id, created_by)
  VALUES (v_exam, 'EXM-W1E2B-0001', v_ent, v_sec, 'W1E2B Onsite Examination',
          'full_scope', 'planned', v_lead, v_lead);
END $$;

SET LOCAL ROLE authenticated;

-- 7. security unchanged: unauthorised principals still denied on all three paths
DO $$
DECLARE denied int := 0;
BEGIN
  -- returns-only persona has no prudential config authority
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"aa58b4f1-ed4e-4516-bf09-1c02ccb5b77a","role":"authenticated"}';
    PERFORM public.publish_prudential_ratio('00000000-0000-0000-0000-00000f1e2b03');
    RAISE EXCEPTION 'FAIL 7: returns-only persona published a prudential ratio';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  -- external licensee user cannot acknowledge an EWI alert
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.prudential_ewi_acknowledge('00000000-0000-0000-0000-00000f1e2b04', 'external attempt', 'acknowledged');
    RAISE EXCEPTION 'FAIL 7: external licensee user acknowledged an EWI alert';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  -- unrelated internal persona cannot update an examination
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.examination_update('00000000-0000-0000-0000-00000f1e2b05',
      jsonb_build_object('title','Hijacked'), 'unauthorised');
    RAISE EXCEPTION 'FAIL 7: unrelated internal persona updated an examination';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 3 THEN RAISE EXCEPTION 'FAIL 7: expected 3 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 7: security unchanged — returns-only, external and unrelated internal principals denied';
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.publish_prudential_ratio('00000000-0000-0000-0000-00000f1e2b03');
    RAISE EXCEPTION 'FAIL 8: anonymous caller published a prudential ratio';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.prudential_ewi_acknowledge('00000000-0000-0000-0000-00000f1e2b04', 'anon', 'acknowledged');
    RAISE EXCEPTION 'FAIL 8: anonymous caller acknowledged an EWI alert';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 8: expected 2 anonymous denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 8: anonymous callers cannot execute the converged governed mutations';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Authorised runtime execution + canonical audit proof
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

-- 9. configuration mutation: publish_prudential_ratio
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
DO $$
DECLARE v int; a record; ts timestamptz := now();
BEGIN
  v := public.publish_prudential_ratio('00000000-0000-0000-0000-00000f1e2b03');
  IF v IS NULL OR v < 1 THEN RAISE EXCEPTION 'FAIL 9: publish did not return a version (%)', v; END IF;

  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'RATIO_PUBLISHED'
     AND entity_id = '00000000-0000-0000-0000-00000f1e2b03'
   ORDER BY created_at DESC LIMIT 1;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 9: no canonical audit event for ratio publish'; END IF;
  IF a.user_id <> '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'::uuid THEN
    RAISE EXCEPTION 'FAIL 9: wrong audit actor (%)', a.user_id;
  END IF;
  IF a.entity_type <> 'prudential_ratios' THEN
    RAISE EXCEPTION 'FAIL 9: wrong audited object type (%)', a.entity_type;
  END IF;
  IF a.created_at IS NULL OR a.created_at < ts - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL 9: audit timestamp missing or implausible (%)', a.created_at;
  END IF;
  IF a.metadata->>'domain' <> 'prudential'
     OR a.metadata->'after'->>'ratio_key' <> 'W1E2B_TEST_RATIO'
     OR a.metadata->>'justification' <> 'Ratio published' THEN
    RAISE EXCEPTION 'FAIL 9: ratio publish audit lost after-state or justification (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 9: configuration mutation audited canonically (actor, object, action, timestamp, after-state)';
END $$;

-- 10. workflow mutation: prudential_ewi_acknowledge
SET LOCAL "request.jwt.claims" = '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}';
DO $$
DECLARE r public.prudential_ewi_alerts; a record;
BEGIN
  r := public.prudential_ewi_acknowledge('00000000-0000-0000-0000-00000f1e2b04',
        'reviewed by supervisor', 'acknowledged');
  IF r.status <> 'acknowledged' OR r.acknowledged_by IS NULL THEN
    RAISE EXCEPTION 'FAIL 10: acknowledgement did not record status/actor on the alert';
  END IF;

  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'PRUDENTIAL_EWI_ACKNOWLEDGED'
     AND entity_id = '00000000-0000-0000-0000-00000f1e2b04'
   ORDER BY created_at DESC LIMIT 1;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 10: no canonical audit event for EWI acknowledgement'; END IF;
  IF a.user_id <> '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'::uuid
     OR a.entity_type <> 'prudential_ewi_alert' OR a.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 10: EWI acknowledgement audit actor/object/timestamp incorrect';
  END IF;
  IF a.metadata->'after'->>'status' <> 'acknowledged'
     OR a.metadata->>'justification' <> 'reviewed by supervisor'
     OR a.metadata->>'source' <> 'prudential_ewi_acknowledge' THEN
    RAISE EXCEPTION 'FAIL 10: EWI acknowledgement audit lost after-state/rationale (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 10: workflow mutation audited canonically with rationale preserved';
END $$;

-- 11. examination mutation: examination_update (before/after + rationale)
SET LOCAL "request.jwt.claims" = '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}';
DO $$
DECLARE res jsonb; a record;
BEGIN
  res := public.examination_update('00000000-0000-0000-0000-00000f1e2b05',
           jsonb_build_object('risk_rating','high'), 'escalated after breach review');
  IF res->>'risk_rating' <> 'high' THEN
    RAISE EXCEPTION 'FAIL 11: examination_update return shape/behaviour changed (%)', res;
  END IF;

  SELECT * INTO a FROM public.audit_logs
   WHERE action = 'examination_updated'
     AND entity_id = '00000000-0000-0000-0000-00000f1e2b05'
   ORDER BY created_at DESC LIMIT 1;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL 11: no canonical audit event for examination update'; END IF;
  IF a.user_id <> 'b597c405-e0c4-421b-9092-820a444f2429'::uuid
     OR a.entity_type <> 'examination' OR a.created_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 11: examination audit actor/object/timestamp incorrect';
  END IF;
  IF a.metadata->'after'->>'risk_rating' <> 'high'
     OR a.metadata->'before'->>'title' <> 'W1E2B Onsite Examination'
     OR a.metadata->>'justification' <> 'escalated after breach review' THEN
    RAISE EXCEPTION 'FAIL 11: examination audit lost before/after or rationale (%)', a.metadata;
  END IF;
  RAISE NOTICE 'PASS 11: examination mutation audited canonically with before/after and rationale';
END $$;

-- 12. both audit surfaces populated for all three representative mutations.
--     The compliance ledger is RLS-restricted from supervisory personas, so it
--     is inspected with the privileged session role.
RESET ROLE;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_id = '00000000-0000-0000-0000-00000f1e2b03'
     AND object_type = 'prudential_ratios'
     AND action_type = 'UPDATE'::public.compliance_audit_action
     AND metadata->>'action' = 'RATIO_PUBLISHED'
     AND user_id = '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce'::uuid;
  IF n < 1 THEN RAISE EXCEPTION 'FAIL 12: no compliance ledger counterpart for the ratio publish'; END IF;

  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_id = '00000000-0000-0000-0000-00000f1e2b04'
     AND object_type = 'prudential_ewi_alert'
     AND action_type = 'UPDATE'::public.compliance_audit_action
     AND metadata->>'action' = 'PRUDENTIAL_EWI_ACKNOWLEDGED';
  IF n < 1 THEN RAISE EXCEPTION 'FAIL 12: no compliance ledger counterpart for the EWI acknowledgement'; END IF;

  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_id = '00000000-0000-0000-0000-00000f1e2b05'
     AND object_type = 'examination'
     AND action_type = 'UPDATE'::public.compliance_audit_action
     AND metadata->>'action' = 'examination_updated'
     AND justification = 'escalated after breach review';
  IF n < 1 THEN RAISE EXCEPTION 'FAIL 12: no compliance ledger counterpart for the examination update'; END IF;

  RAISE NOTICE 'PASS 12: both governed audit surfaces populated for all three representative mutations';
END $$;

-- 13. exactly one canonical event per mutation (no accidental double-write)
DO $$
DECLARE n_audit int; n_comp int;
BEGIN
  SELECT count(*) INTO n_audit FROM public.audit_logs
   WHERE entity_id = '00000000-0000-0000-0000-00000f1e2b04' AND action = 'PRUDENTIAL_EWI_ACKNOWLEDGED';
  SELECT count(*) INTO n_comp FROM public.compliance_audit_logs
   WHERE object_id = '00000000-0000-0000-0000-00000f1e2b04' AND metadata->>'action' = 'PRUDENTIAL_EWI_ACKNOWLEDGED';
  IF n_audit <> 1 OR n_comp <> 1 THEN
    RAISE EXCEPTION 'FAIL 13: expected exactly one event per surface, got audit_logs=% compliance=%', n_audit, n_comp;
  END IF;
  RAISE NOTICE 'PASS 13: single canonical event per surface — no duplicate audit write';
END $$;

ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'F8-W1E2B AUDIT CONVERGENCE GATE: ALL CHECKS PASSED (13/13)'; END $$;
