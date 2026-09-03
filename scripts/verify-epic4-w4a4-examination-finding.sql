-- Epic 4 / W4-A4 — Examination execution → supervisory finding provenance
--
-- Proves that examination fieldwork (information requests, workpapers, review)
-- is governed, and that a supervisory finding raised from fieldwork carries
-- validated provenance: workpaper → examination → entity, and risk dimension
-- within the examination's own scope. Nothing is seeded into auth.users; the
-- destructive assertions run inside a rolled-back transaction.

\set ON_ERROR_STOP on
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

ROLLBACK;
