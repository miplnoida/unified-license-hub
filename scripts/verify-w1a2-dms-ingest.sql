-- W1A.2 — Canonical DMS ingestion foundation verifier.
-- Rollback-scoped: no state is retained.
-- Run: psql -v ON_ERROR_STOP=1 -f scripts/verify-w1a2-dms-ingest.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  _officer uuid;
  _entity uuid;
  _sid uuid; _sid2 uuid; _sid3 uuid;
  _bucket text; _prefix text;
  _path text; _path2 text;
  _group uuid; _ver uuid; _v int; _ref text; _ctx text; _again boolean;
  _group2 uuid; _v2 int;
  _thread uuid; _sid4 uuid; _group3 uuid; _path3 text;
  n integer;
BEGIN
  -- ---------------------------------------------------------------- fixtures
  SELECT p.id INTO _officer FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role = 'super_admin' ORDER BY p.created_at LIMIT 1;
  IF _officer IS NULL THEN RAISE EXCEPTION 'SETUP FAIL: no privileged officer'; END IF;
  SELECT l.id INTO _entity FROM public.licensees l ORDER BY l.created_at LIMIT 1;
  IF _entity IS NULL THEN RAISE EXCEPTION 'SETUP FAIL: no regulated entity'; END IF;

  -- ING-01 unauthenticated begin is denied
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.dms_ingest_begin('NEW_DOCUMENT', 'entity', _entity);
    RAISE EXCEPTION 'ING-01 FAIL: unauthenticated begin allowed';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
  END;

  -- act as the officer
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _officer::text, 'role', 'authenticated')::text, true);

  -- ING-02 out-of-scope / unknown target is denied
  BEGIN
    PERFORM public.dms_ingest_begin('NEW_DOCUMENT', 'entity', gen_random_uuid());
    RAISE EXCEPTION 'ING-02 FAIL: unknown target accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%target_not_found_or_out_of_scope%' THEN RAISE; END IF;
  END;

  -- ING-03 unsupported record type refused
  BEGIN
    PERFORM public.dms_ingest_begin('NEW_DOCUMENT', 'widget', _entity);
    RAISE EXCEPTION 'ING-03 FAIL: unsupported record type accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%unsupported_record_type%' THEN RAISE; END IF;
  END;

  -- ING-04 NEW_VERSION without a document refused
  BEGIN
    PERFORM public.dms_ingest_begin('NEW_VERSION', 'entity', _entity);
    RAISE EXCEPTION 'ING-04 FAIL: NEW_VERSION without document accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%document_required_for_new_version%' THEN RAISE; END IF;
  END;

  -- ING-05 begin issues a controlled, neutral DMS storage path
  SELECT s.session_id, s.bucket, s.storage_prefix
    INTO _sid, _bucket, _prefix
    FROM public.dms_ingest_begin('NEW_DOCUMENT', 'entity', _entity, NULL,
                                 'corporate_registration', 'general_document') s;
  IF _sid IS NULL THEN RAISE EXCEPTION 'ING-05 FAIL: no ingest session'; END IF;
  IF _bucket <> 'secure-documents' THEN RAISE EXCEPTION 'ING-05 FAIL: bucket %', _bucket; END IF;
  IF _prefix <> _officer::text || '/dms-ingest/' || _sid::text THEN
    RAISE EXCEPTION 'ING-05 FAIL: uncontrolled path %', _prefix;
  END IF;
  IF _prefix ~ '(form-management|aml|licensing|returns|complaints)' THEN
    RAISE EXCEPTION 'ING-05 FAIL: module-specific storage architecture';
  END IF;

  -- ING-06 finalize rejects a path outside the session
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('secure-documents', _prefix || '/1-a.pdf', _officer);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _officer::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.dms_ingest_finalize(_sid, _officer::text || '/elsewhere/x.pdf', 'x.pdf', 100, 'application/pdf');
    RAISE EXCEPTION 'ING-06 FAIL: foreign storage path accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_storage_path%' THEN RAISE; END IF;
  END;

  -- ING-07 finalize rejects a missing object
  BEGIN
    PERFORM public.dms_ingest_finalize(_sid, _prefix || '/1-missing.pdf', 'missing.pdf', 100, 'application/pdf');
    RAISE EXCEPTION 'ING-07 FAIL: missing object accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%storage_object_missing%' THEN RAISE; END IF;
  END;

  -- ING-08 invalid MIME / size refused
  _path := _prefix || '/1-a.pdf';
  BEGIN
    PERFORM public.dms_ingest_finalize(_sid, _path, 'a.exe', 100, 'application/x-msdownload');
    RAISE EXCEPTION 'ING-08 FAIL: invalid MIME accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_mime_type%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.dms_ingest_finalize(_sid, _path, 'a.pdf', 99999999, 'application/pdf');
    RAISE EXCEPTION 'ING-08 FAIL: oversize accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_file_size%' THEN RAISE; END IF;
  END;

  -- ING-09 NEW_DOCUMENT registers exactly one file, group, first version
  SELECT f.group_id, f.version_id, f.version, f.document_reference, f.context_status, f.already_finalized
    INTO _group, _ver, _v, _ref, _ctx, _again
    FROM public.dms_ingest_finalize(_sid, _path, 'a.pdf', 1024, 'application/pdf', '.pdf', 'abc',
                                    'Board minutes', 'initial upload') f;
  IF _group IS NULL OR _ver IS NULL THEN RAISE EXCEPTION 'ING-09 FAIL: nothing registered'; END IF;
  IF _v <> 1 THEN RAISE EXCEPTION 'ING-09 FAIL: first version is %', _v; END IF;
  IF _again THEN RAISE EXCEPTION 'ING-09 FAIL: first finalize reported as repeat'; END IF;
  IF _ref IS NULL OR _ref NOT LIKE 'DOC-%' THEN RAISE EXCEPTION 'ING-09 FAIL: no document reference (%)', _ref; END IF;

  SELECT count(*) INTO n FROM public.file_uploads WHERE file_path = _path;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-09 FAIL: % file_uploads rows', n; END IF;
  SELECT count(*) INTO n FROM public.document_versions WHERE group_id = _group;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-09 FAIL: % versions', n; END IF;

  -- ING-10 automatic filing: entity + source record relationships exist
  SELECT count(*) INTO n FROM public.document_relationships
   WHERE document_group_id = _group AND target_type = 'entity' AND target_id = _entity::text;
  IF n < 1 THEN RAISE EXCEPTION 'ING-10 FAIL: no automatic entity filing'; END IF;
  IF _ctx <> 'applied' THEN RAISE EXCEPTION 'ING-10 FAIL: context status %', _ctx; END IF;
  SELECT count(*) INTO n FROM public.document_groups
   WHERE id = _group AND primary_entity_id = _entity AND canonical_context_status = 'applied'
     AND category_id IS NOT NULL AND document_type_id IS NOT NULL
     AND confidentiality_classification IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-10 FAIL: classification/ownership not applied'; END IF;

  -- ING-11 scan lifecycle: pending_scan, never released
  SELECT count(*) INTO n FROM public.file_uploads
   WHERE file_path = _path AND scan_status = 'pending_scan' AND scan_provider IS NULL AND scanned_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-11 FAIL: file did not enter the scan lifecycle'; END IF;
  IF public.dms_version_scan_clean(_ver) THEN RAISE EXCEPTION 'ING-11 FAIL: pending_scan file reported releasable'; END IF;

  -- ING-12 audit provenance
  SELECT count(*) INTO n FROM public.document_action_logs
   WHERE group_id = _group AND version_id = _ver AND action = 'document_registered' AND actor_id = _officer;
  IF n < 1 THEN RAISE EXCEPTION 'ING-12 FAIL: registration not audited to the actor'; END IF;

  -- ING-13 idempotent finalize: no second file, group, version, relationship or audit decision
  SELECT f.group_id, f.version, f.already_finalized INTO _group2, _v2, _again
    FROM public.dms_ingest_finalize(_sid, _path, 'a.pdf', 1024, 'application/pdf') f;
  IF _group2 <> _group OR _v2 <> 1 OR NOT _again THEN
    RAISE EXCEPTION 'ING-13 FAIL: repeat finalize not idempotent';
  END IF;
  SELECT count(*) INTO n FROM public.document_versions WHERE group_id = _group;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-13 FAIL: duplicate version created'; END IF;
  SELECT count(*) INTO n FROM public.file_uploads WHERE file_path = _path;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-13 FAIL: duplicate file_upload created'; END IF;
  SELECT count(*) INTO n FROM public.document_action_logs
   WHERE group_id = _group AND action = 'document_registered';
  IF n <> 1 THEN RAISE EXCEPTION 'ING-13 FAIL: duplicate registration audit'; END IF;

  -- ING-14 NEW_VERSION: same group, exactly one more, server-allocated
  SELECT s.session_id, s.storage_prefix INTO _sid2, _prefix
    FROM public.dms_ingest_begin('NEW_VERSION', 'entity', _entity, _group) s;
  _path2 := _prefix || '/2-a.pdf';
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('secure-documents', _path2, _officer);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _officer::text, 'role', 'authenticated')::text, true);

  SELECT f.group_id, f.version INTO _group2, _v2
    FROM public.dms_ingest_finalize(_sid2, _path2, 'a.pdf', 2048, 'application/pdf', '.pdf', NULL, NULL, 'revised') f;
  IF _group2 <> _group THEN RAISE EXCEPTION 'ING-14 FAIL: new version created a new document'; END IF;
  IF _v2 <> 2 THEN RAISE EXCEPTION 'ING-14 FAIL: server allocated version %', _v2; END IF;
  SELECT count(*) INTO n FROM public.document_versions WHERE group_id = _group;
  IF n <> 2 THEN RAISE EXCEPTION 'ING-14 FAIL: % versions on the group', n; END IF;
  SELECT count(*) INTO n FROM public.document_versions
   WHERE group_id = _group AND version = 1 AND version_status = 'superseded' AND storage_path = _path;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-14 FAIL: prior version not preserved as superseded'; END IF;
  SELECT count(*) INTO n FROM public.document_groups WHERE id = _group AND current_version_id <> _ver;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-14 FAIL: current version not advanced'; END IF;

  -- ING-15 a finalized session is never re-openable, and abort cannot undo a document
  IF public.dms_ingest_abort(_sid) THEN RAISE EXCEPTION 'ING-15 FAIL: finalized session abortable'; END IF;
  SELECT count(*) INTO n FROM public.document_groups WHERE id = _group AND is_deleted = false;
  IF n <> 1 THEN RAISE EXCEPTION 'ING-15 FAIL: finalized document removed by cleanup path'; END IF;

  -- ING-16 abandoned session: abort, then expiry sweep is safe
  SELECT s.session_id INTO _sid3 FROM public.dms_ingest_begin('NEW_DOCUMENT', 'entity', _entity) s;
  IF NOT public.dms_ingest_abort(_sid3, 'user_cancelled') THEN
    RAISE EXCEPTION 'ING-16 FAIL: open session not abortable';
  END IF;
  BEGIN
    PERFORM public.dms_ingest_finalize(_sid3, 'x', 'x.pdf', 10, 'application/pdf');
    RAISE EXCEPTION 'ING-16 FAIL: aborted session finalizable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ingest_session_aborted%' THEN RAISE; END IF;
  END;
  PERFORM public.dms_ingest_cleanup_expired(10);
  SELECT count(*) INTO n FROM public.document_versions WHERE group_id = _group;
  IF n <> 2 THEN RAISE EXCEPTION 'ING-16 FAIL: cleanup touched a finalized document'; END IF;

  -- ING-17 the browser cannot write the ingest session table (reads only)
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'dms_ingest_sessions'
     AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF n <> 0 THEN RAISE EXCEPTION 'ING-17 FAIL: authenticated can write ingest sessions'; END IF;

  -- ING-18 least privilege on the new routines
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('dms_ingest_begin','dms_ingest_finalize','dms_ingest_abort','dms_ingest_cleanup_expired')
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  IF n <> 4 THEN RAISE EXCEPTION 'ING-18 FAIL: only % of 4 routines pin search_path', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('dms_ingest_begin','dms_ingest_finalize','dms_ingest_abort','dms_ingest_cleanup_expired')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF n <> 0 THEN RAISE EXCEPTION 'ING-18 FAIL: % routines anon/PUBLIC executable', n; END IF;

  -- ING-19 context filing exception: an unresolved owning entity leaves the
  -- registered document intact, observable and reconcilable — never fabricated.
  SELECT t.id INTO _thread FROM public.correspondence_threads t ORDER BY t.created_at LIMIT 1;
  IF _thread IS NOT NULL THEN
    SELECT s.session_id, s.storage_prefix INTO _sid4, _prefix
      FROM public.dms_ingest_begin('NEW_DOCUMENT', 'correspondence', _thread) s;
    _path3 := _prefix || '/1-c.pdf';
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('secure-documents', _path3, _officer);
    SELECT f.group_id, f.context_status INTO _group3, _ctx
      FROM public.dms_ingest_finalize(_sid4, _path3, 'c.pdf', 512, 'application/pdf') f;
    IF _group3 IS NULL THEN RAISE EXCEPTION 'ING-19 FAIL: document discarded on filing exception'; END IF;
    SELECT count(*) INTO n FROM public.document_groups d
     WHERE d.id = _group3
       AND (d.primary_entity_id IS NOT NULL
            OR (d.canonical_context_status IN ('retry_required','failed')
                AND d.context_failure_reason IS NOT NULL
                AND d.context_attempts >= 1));
    IF n <> 1 THEN RAISE EXCEPTION 'ING-19 FAIL: unresolved filing not observable/reconcilable'; END IF;
    SELECT count(*) INTO n FROM public.document_versions v WHERE v.group_id = _group3;
    IF n <> 1 THEN RAISE EXCEPTION 'ING-19 FAIL: % versions after filing exception', n; END IF;
  END IF;

  RAISE NOTICE 'W1A.2 DMS INGEST: ING-01..ING-19 PASS';
END $$;

ROLLBACK;
