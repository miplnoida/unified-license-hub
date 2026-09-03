-- Epic 4 / W4-A4 — Examination execution → supervisory finding provenance
--
-- Proves that examination fieldwork (information requests, workpapers, review)
-- is governed, and that a supervisory finding raised from fieldwork carries
-- validated provenance: workpaper → examination → entity, and risk dimension
-- within the examination's own scope. Nothing is seeded into auth.users; the
-- destructive assertions run inside a rolled-back transaction.

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

-- certification personas (public.cert_certification_users) — never seeded here
\set EXAMINER '{"sub":"d1016d5f-cde5-46dd-a552-0f2f87abc193","role":"authenticated"}'
\set REVIEWER '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}'
\set OUTSIDER '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'

BEGIN;

-- 1. canonical execution fields exist on the canonical examination objects
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing FROM (
    SELECT c FROM unnest(ARRAY['reference','requested_from','priority','outstanding_items',
                               'assessment_dimension_id']) c
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='examination_data_requests'
                          AND column_name=c)
  ) t;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: examination_data_requests missing %', missing; END IF;

  SELECT string_agg(c, ', ') INTO missing FROM (
    SELECT c FROM unnest(ARRAY['assessment_id','assessment_dimension_id','objective',
      'population_description','population_size','sampling_method','sample_size',
      'exceptions_count','material_exceptions_count','analysis','control_assessment',
      'submitted_at','submitted_by','returned_at','returned_by']) c
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='examination_workpapers'
                          AND column_name=c)
  ) t;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: examination_workpapers missing %', missing; END IF;
  RAISE NOTICE 'PASS 1: canonical execution fields exist (no domain-specific tables added)';
END $$;

-- 2. no AML-specific parallel examination store was introduced
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema='public'
     AND (table_name LIKE 'aml_examination%' OR table_name LIKE 'aml_workpaper%'
          OR table_name LIKE 'aml_finding%' OR table_name LIKE 'aml_data_request%');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 2: % parallel AML examination table(s) exist', n; END IF;
  RAISE NOTICE 'PASS 2: AML/CFT fieldwork uses the canonical examination spine only';
END $$;

-- 3. governed operations exist, are SECURITY DEFINER with a pinned search_path
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosecdef,
           COALESCE(array_to_string(p.proconfig,','),'') cfg
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='public'
       AND p.proname IN ('examination_execution_require','examination_data_request_save',
         'examination_data_request_issue','examination_data_request_receive',
         'examination_workpaper_save','examination_workpaper_submit_review',
         'examination_workpaper_return','supervisory_finding_create')
  LOOP
    IF NOT r.prosecdef THEN RAISE EXCEPTION 'FAIL 3: % is not SECURITY DEFINER', r.proname; END IF;
    IF r.cfg NOT LIKE '%search_path%' THEN
      RAISE EXCEPTION 'FAIL 3: % has a mutable search_path', r.proname; END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 3: % is executable by anon', r.proname; END IF;
    IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 3: % is not executable by signed-in staff', r.proname; END IF;
    n := n + 1;
  END LOOP;
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL 3: expected 8 governed operations, found %', n; END IF;
  RAISE NOTICE 'PASS 3: 8 governed execution operations, definer-guarded, anon-denied';
END $$;

-- 4. finding creation refuses a finding with no authoritative origin
DO $$
DECLARE _entity uuid;
BEGIN
  SELECT id INTO _entity FROM public.licensees ORDER BY created_at LIMIT 1;
  BEGIN
    PERFORM public.supervisory_finding_create(jsonb_build_object(
      'domain_code','AML_CFT','entity_id',_entity,'title','No origin','observation','x'));
    RAISE EXCEPTION 'FAIL 4: a finding was created without an authoritative origin';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL 4%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%authoritative origin%' AND SQLERRM NOT LIKE '%not_authorized%' THEN
      RAISE EXCEPTION 'FAIL 4: unexpected rejection reason: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'PASS 4: a finding cannot be raised without an examination, assessment, dimension or workpaper';
END $$;

-- 5. provenance validation logic is present in the governed creator
DO $$
DECLARE src text;
BEGIN
  SELECT prosrc INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='supervisory_finding_create';
  IF src NOT LIKE '%workpaper belongs to a different examination%' THEN
    RAISE EXCEPTION 'FAIL 5: workpaper→examination provenance is not validated'; END IF;
  IF src NOT LIKE '%examination belongs to a different entity%' THEN
    RAISE EXCEPTION 'FAIL 5: examination→entity provenance is not validated'; END IF;
  IF src NOT LIKE '%not within the examination scope%' THEN
    RAISE EXCEPTION 'FAIL 5: risk dimension scope is not validated'; END IF;
  IF src NOT LIKE '%assessment belongs to a different entity%' THEN
    RAISE EXCEPTION 'FAIL 5: assessment→entity provenance is not validated'; END IF;
  IF src NOT LIKE '%examination_origin%' THEN
    RAISE EXCEPTION 'FAIL 5: the supervisory chain is not derived from the examination'; END IF;
  IF src NOT LIKE '%examination_execution_require%' THEN
    RAISE EXCEPTION 'FAIL 5: examination-sourced findings bypass examination authority'; END IF;
  RAISE NOTICE 'PASS 5: workpaper, examination, entity, dimension and assessment links are all validated';
END $$;

-- 6. every existing finding with a workpaper points at that workpaper's own examination
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.supervisory_finding f
    JOIN public.examination_workpapers w ON w.id = f.workpaper_id
   WHERE f.examination_id IS DISTINCT FROM w.examination_id;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 6: % finding(s) cite a workpaper from another examination', n; END IF;

  SELECT count(*) INTO n
    FROM public.supervisory_finding f
    JOIN public.examinations e ON e.id = f.examination_id
   WHERE e.entity_id IS DISTINCT FROM f.entity_id;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 6: % finding(s) cite an examination of another entity', n; END IF;
  RAISE NOTICE 'PASS 6: stored findings are consistent with their source examination and entity';
END $$;

-- 7. examination authority is domain-aware, not widened to a generic role
DO $$
DECLARE src text;
BEGIN
  SELECT prosrc INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='examination_execution_require';
  IF src NOT LIKE '%aml_supervision.examine%' OR src NOT LIKE '%market_conduct%'
     OR src NOT LIKE '%prudential_supervision.manage_examination%' THEN
    RAISE EXCEPTION 'FAIL 7: examination authority is not domain-aware'; END IF;
  IF src NOT LIKE '%supervisory_entity_scope_check%' THEN
    RAISE EXCEPTION 'FAIL 7: entity scope is not enforced on examination execution'; END IF;
  RAISE NOTICE 'PASS 7: examination execution is domain-aware and entity-scoped';
END $$;

-- 8. workpaper maker/checker separation still holds after the review additions
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='examination_workpapers' AND NOT t.tgisinternal
     AND pg_get_triggerdef(t.oid) LIKE '%examination_workpaper_guard%';
  IF n = 0 THEN RAISE EXCEPTION 'FAIL 8: the preparer/reviewer separation guard is missing'; END IF;

  SELECT count(*) INTO n FROM public.examination_workpapers
   WHERE reviewed_by IS NOT NULL AND reviewed_by = prepared_by;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 8: % workpaper(s) were reviewed by their preparer', n; END IF;
  RAISE NOTICE 'PASS 8: preparer and reviewer remain segregated';
END $$;

-- 9. evidence linkage remains a governed document-register link
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                  WHERE ns.nspname='public' AND p.proname='dms_link_record') THEN
    RAISE EXCEPTION 'FAIL 9: governed document linking is unavailable'; END IF;
  SELECT count(*) INTO n FROM public.document_relationships
   WHERE target_type IN ('examination_workpaper','examination_data_request')
     AND document_group_id NOT IN (SELECT id FROM public.document_groups);
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 9: % examination evidence link(s) are orphaned', n; END IF;
  RAISE NOTICE 'PASS 9: examination evidence points at registered documents only';
END $$;

-- 10. examination history records both fieldwork execution and finding origination
DO $$
DECLARE src text;
BEGIN
  SELECT string_agg(prosrc, E'\n') INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('examination_data_request_issue',
     'examination_data_request_receive','examination_workpaper_submit_review',
     'examination_workpaper_return','supervisory_finding_create');
  IF src NOT LIKE '%data_request_issued%' OR src NOT LIKE '%data_request_response_recorded%'
     OR src NOT LIKE '%workpaper_submitted_for_review%' OR src NOT LIKE '%workpaper_returned_for_revision%'
     OR src NOT LIKE '%supervisory_finding_created%' THEN
    RAISE EXCEPTION 'FAIL 10: examination history does not record the full fieldwork loop'; END IF;
  IF src NOT LIKE '%log_compliance_audit%' THEN
    RAISE EXCEPTION 'FAIL 10: fieldwork execution is not audited'; END IF;
  RAISE NOTICE 'PASS 10: fieldwork and finding origination are recorded on the examination and in the audit trail';
END $$;

-- =====================================================================
-- FUNCTIONAL GATES 11-14 — the governed fieldwork loop with real personas
-- =====================================================================
CREATE TEMP TABLE w4(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON w4 TO authenticated;

-- fixture: an approved AML/CFT assessment, two dimensions (one in examination
-- scope, one deliberately outside it) and an AML examination in fieldwork.
DO $$
DECLARE ent uuid := '5855bf85-9fde-4cf8-a082-7ea904d46184';
        aid uuid; d_in uuid; d_out uuid; ex uuid; ex2 uuid;
BEGIN
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, status, approved_at, approved_by)
  VALUES ('W4A4-ASMT-1', ent, 'AML_CFT', 'approved', now(), 'b597c405-e0c4-421b-9092-820a444f2429')
  RETURNING id INTO aid;

  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
  VALUES (aid, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS') RETURNING id INTO d_in;
  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
  VALUES (aid, 'GEOGRAPHIC_RISK', 'INHERENT_RISK') RETURNING id INTO d_out;

  INSERT INTO public.examinations(reference, entity_id, title, examination_type, stage,
      domain_code, origin_provenance, lead_examiner_id)
  VALUES ('W4A4-EXM-1', ent, 'Targeted AML/CFT examination', 'targeted_onsite', 'fieldwork',
      'AML_CFT', 'GOVERNED', 'd1016d5f-cde5-46dd-a552-0f2f87abc193')
  RETURNING id INTO ex;
  INSERT INTO public.examinations(reference, entity_id, title, examination_type, stage,
      domain_code, origin_provenance, lead_examiner_id)
  VALUES ('W4A4-EXM-2', ent, 'Unrelated AML/CFT examination', 'targeted_onsite', 'fieldwork',
      'AML_CFT', 'GOVERNED', 'd1016d5f-cde5-46dd-a552-0f2f87abc193')
  RETURNING id INTO ex2;

  INSERT INTO public.examination_origin(examination_id, assessment_id, assessment_dimension_id)
  VALUES (ex, aid, d_in);
  INSERT INTO public.examination_scope_dimension(examination_id, assessment_id, assessment_dimension_id, dimension_code)
  VALUES (ex, aid, d_in, 'TRANSACTION_MONITORING');

  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
      alternate_supervisor_user_id, status, assignment_reason)
  VALUES (ent, 'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'b597c405-e0c4-421b-9092-820a444f2429',
      'active', 'W4-A4 certification');

  INSERT INTO w4(k,v) VALUES ('ent',ent),('asmt',aid),('dim_in',d_in),('dim_out',d_out),
    ('ex',ex),('ex2',ex2);
END $$;

-- 11. information requests are governed: draft -> issued -> partially/fully received
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE dr uuid; st text; ref text; ok boolean := false;
BEGIN
  dr := public.examination_data_request_save(jsonb_build_object(
        'examination_id', (SELECT v FROM w4 WHERE k='ex'),
        'title','Alert decision population',
        'description','All monitoring alerts raised in the review period with decision records.',
        'requested_from','Money Laundering Reporting Officer',
        'priority','HIGH',
        'assessment_dimension_id', (SELECT v FROM w4 WHERE k='dim_in')));
  INSERT INTO w4(k,v) VALUES ('dr', dr);
  SELECT status, reference INTO st, ref FROM public.examination_data_requests WHERE id = dr;
  IF st <> 'draft' THEN RAISE EXCEPTION 'FAIL 11: new request is not a draft (%)', st; END IF;
  IF ref IS NULL OR ref NOT LIKE '%-RFI-%' THEN
    RAISE EXCEPTION 'FAIL 11: request reference was not generated (%)', ref; END IF;

  BEGIN
    PERFORM public.examination_data_request_receive(dr, 'Provided', NULL, true);
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%request_not_issued%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 11: a response was recorded against an unissued request'; END IF;

  PERFORM public.examination_data_request_issue(dr);
  PERFORM public.examination_data_request_receive(dr, 'Partial population provided.',
    'Alert decisions for March are outstanding.', false);
  SELECT status INTO st FROM public.examination_data_requests WHERE id = dr;
  IF st <> 'partially_received' THEN
    RAISE EXCEPTION 'FAIL 11: partial response did not set partially_received (%)', st; END IF;
  PERFORM public.examination_data_request_receive(dr, 'Full population provided.', NULL, true);
  SELECT status INTO st FROM public.examination_data_requests WHERE id = dr;
  IF st <> 'received' THEN RAISE EXCEPTION 'FAIL 11: full response did not set received (%)', st; END IF;

  ok := false;
  BEGIN
    PERFORM public.examination_data_request_save(jsonb_build_object(
      'examination_id', (SELECT v FROM w4 WHERE k='ex'), 'title','Out of scope request',
      'assessment_dimension_id', (SELECT v FROM w4 WHERE k='dim_out')));
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%scope_dimension_not_in_examination%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 11: a request was tied to a dimension outside examination scope'; END IF;
  RAISE NOTICE 'PASS 11: information requests follow the governed issue/response lifecycle within scope';
END $$;

-- 12. workpapers require a conclusion for review and lock after review
DO $$
DECLARE wp uuid; st text; ok boolean := false;
BEGIN
  wp := public.examination_workpaper_save(jsonb_build_object(
        'examination_id', (SELECT v FROM w4 WHERE k='ex'),
        'area','Transaction monitoring',
        'objective','Assess whether alerts are investigated and decisions documented.',
        'population_description','All alerts in the review period',
        'population_size','240','sampling_method','RISK_BASED','sample_size','20',
        'exceptions_count','9','material_exceptions_count','4',
        'analysis','Nine sampled alerts had no documented decision.',
        'assessment_dimension_id', (SELECT v FROM w4 WHERE k='dim_in')));
  INSERT INTO w4(k,v) VALUES ('wp', wp);
  SELECT status INTO st FROM public.examination_workpapers WHERE id = wp;
  IF st <> 'draft' THEN RAISE EXCEPTION 'FAIL 12: new workpaper is not a draft (%)', st; END IF;

  BEGIN PERFORM public.examination_workpaper_submit_review(wp);
  EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%conclusion_required%');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 12: a workpaper without a conclusion was submitted for review'; END IF;

  PERFORM public.examination_workpaper_save(jsonb_build_object('id', wp,
    'conclusion','Monitoring is not effective: decisions are undocumented.',
    'control_assessment','INEFFECTIVE'));
  PERFORM public.examination_workpaper_submit_review(wp);
  SELECT status INTO st FROM public.examination_workpapers WHERE id = wp;
  IF st <> 'in_review' THEN RAISE EXCEPTION 'FAIL 12: submission did not set in_review (%)', st; END IF;
  RAISE NOTICE 'PASS 12: workpapers require a documented conclusion before independent review';
END $$;

-- 13. an independent reviewer returns work for revision; the examiner cannot review it
DO $$
DECLARE wp uuid := (SELECT v FROM w4 WHERE k='wp'); st text; ok boolean := false;
BEGIN
  BEGIN PERFORM public.examination_workpaper_return(wp, NULL);
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 13: work was returned without review notes'; END IF;
END $$;

SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$
DECLARE wp uuid := (SELECT v FROM w4 WHERE k='wp'); st text;
BEGIN
  PERFORM public.examination_workpaper_return(wp, 'Extend the sample before concluding.');
  SELECT status INTO st FROM public.examination_workpapers WHERE id = wp;
  IF st <> 'returned' THEN RAISE EXCEPTION 'FAIL 13: returned work is not in the returned state (%)', st; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_workpapers
                  WHERE id = wp AND returned_by IS NOT NULL AND returned_at IS NOT NULL
                    AND review_notes IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 13: return provenance was not recorded'; END IF;
  RAISE NOTICE 'PASS 13: review outcomes are recorded with reviewer provenance and reopen the work';
END $$;

SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE wp uuid := (SELECT v FROM w4 WHERE k='wp'); st text;
BEGIN
  PERFORM public.examination_workpaper_save(jsonb_build_object('id', wp,
    'sample_size','40', 'analysis','Extended sample: 15 of 40 alerts had no documented decision.'));
  PERFORM public.examination_workpaper_submit_review(wp);
  SELECT status INTO st FROM public.examination_workpapers WHERE id = wp;
  IF st <> 'in_review' THEN
    RAISE EXCEPTION 'FAIL 13: revised work could not be resubmitted for review (%)', st; END IF;
  RAISE NOTICE 'PASS 13b: returned work can be revised by the preparer and resubmitted';
END $$;

-- 14. findings can only be raised from this examination's own validated fieldwork
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE wp uuid := (SELECT v FROM w4 WHERE k='wp'); fid uuid; ok boolean;
        f public.supervisory_finding;
BEGIN
  ok := false;
  BEGIN
    PERFORM public.supervisory_finding_create(jsonb_build_object(
      'entity_id', (SELECT v FROM w4 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
      'title','Finding from an unrelated examination',
      'examination_id', (SELECT v FROM w4 WHERE k='ex2'), 'workpaper_id', wp));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 14: a workpaper from another examination was accepted as origin'; END IF;

  ok := false;
  BEGIN
    PERFORM public.supervisory_finding_create(jsonb_build_object(
      'entity_id', (SELECT v FROM w4 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
      'title','Finding on an out-of-scope dimension',
      'examination_id', (SELECT v FROM w4 WHERE k='ex'), 'workpaper_id', wp,
      'assessment_dimension_id', (SELECT v FROM w4 WHERE k='dim_out')));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 14: a finding was raised on a dimension outside examination scope'; END IF;

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM w4 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Alert decisions are not documented',
    'observation','Nine of twenty sampled alerts had no documented decision.',
    'required_action','Document all alert decisions and clear the backlog.',
    'examination_id', (SELECT v FROM w4 WHERE k='ex'), 'workpaper_id', wp,
    'assessment_id', (SELECT v FROM w4 WHERE k='asmt'),
    'assessment_dimension_id', (SELECT v FROM w4 WHERE k='dim_in')));
  SELECT * INTO f FROM public.supervisory_finding WHERE id = fid;
  IF f.entity_id <> (SELECT v FROM w4 WHERE k='ent') OR f.domain_code <> 'AML_CFT'
     OR f.examination_id <> (SELECT v FROM w4 WHERE k='ex') OR f.workpaper_id <> wp
     OR f.assessment_dimension_id <> (SELECT v FROM w4 WHERE k='dim_in') THEN
    RAISE EXCEPTION 'FAIL 14: stored finding provenance does not match its fieldwork origin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_events
                  WHERE examination_id = (SELECT v FROM w4 WHERE k='ex')
                    AND event_type = 'supervisory_finding_created') THEN
    RAISE EXCEPTION 'FAIL 14: finding origination was not recorded on the examination'; END IF;
  RAISE NOTICE 'PASS 14: findings originate only from this examination''s validated, in-scope fieldwork';
END $$;

-- 15. an officer without AML supervision authority cannot execute fieldwork
SET LOCAL "request.jwt.claims" = :'OUTSIDER';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.examination_workpaper_save(jsonb_build_object(
      'examination_id', (SELECT v FROM w4 WHERE k='ex'), 'area','Unauthorised'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 15: an unauthorised officer executed examination fieldwork'; END IF;
  RAISE NOTICE 'PASS 15: examination execution is denied without AML/CFT supervision authority';
END $$;

RESET ROLE;
ROLLBACK;
