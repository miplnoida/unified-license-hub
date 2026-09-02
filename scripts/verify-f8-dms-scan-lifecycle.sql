-- F8-DMS — Document scan / release lifecycle certification
--
-- Proves that DMS-managed uploads join the EXISTING governed F0 scan lifecycle
-- and that no DMS path can release a file itself:
--   * a new DMS version starts non-released (pending_scan, not quarantined)
--   * verify / accept are refused while the file is not released (scan_not_clean)
--   * only the trusted scan-verdict path (file_upload_record_scan) releases it
--   * suspicious / infected / quarantined files stay blocked
--   * dms_get_document reports the authoritative current-file security state
--   * an adverse verdict immediately withdraws release
--   * legal hold still blocks disposal (archive and delete)
--   * relationship removal remains an out-of-scope residual (no unlink RPC)
--
-- Rollback-scoped fixture: everything created here is deleted again inside the
-- same transaction and the script ends with ROLLBACK. No auth.users seeding,
-- no grants, nothing weakened.
--
-- Run as the certification super-admin persona so the governed read path
-- (dms_get_document) resolves an authorised actor.

\set ON_ERROR_STOP on
BEGIN;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub','4248640c-3397-4cf6-a274-fa09bad4ba64','role','authenticated')::text,
  true);

-- ---------------------------------------------------------------------------
-- 1. create_document_version_metadata can never mint a released file
-- ---------------------------------------------------------------------------
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'create_document_version_metadata';
  IF d IS NULL THEN
    RAISE EXCEPTION 'FAIL 1: create_document_version_metadata is missing';
  END IF;
  IF d ~* '''clean''' OR d ~* '''released''' OR d ~* '''not_required''' THEN
    RAISE EXCEPTION 'FAIL 1: create_document_version_metadata references a released scan verdict';
  END IF;
  IF d NOT LIKE '%pending_scan%' THEN
    RAISE EXCEPTION 'FAIL 1: create_document_version_metadata does not enter the pending_scan lifecycle';
  END IF;
  RAISE NOTICE 'PASS 1: DMS upload metadata enters the governed scan lifecycle as pending_scan only';
END $$;

-- ---------------------------------------------------------------------------
-- 2. the release rule is the single canonical predicate
-- ---------------------------------------------------------------------------
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'dms_version_scan_clean';
  IF d IS NULL OR d NOT LIKE '%is_quarantined%' OR d NOT LIKE '%file_uploads%' THEN
    RAISE EXCEPTION 'FAIL 2: dms_version_scan_clean no longer derives release from the file scan state';
  END IF;
  RAISE NOTICE 'PASS 2: release is decided from file_uploads scan_status + is_quarantined';
END $$;

-- ---------------------------------------------------------------------------
-- 3. verify / accept are hard-gated on the release predicate
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname IN ('dms_verify','dms_accept')
  LOOP
    IF r.def NOT LIKE '%dms_version_scan_clean%' OR r.def NOT LIKE '%scan_not_clean%' THEN
      RAISE EXCEPTION 'FAIL 3: %() does not refuse unreleased files', r.proname;
    END IF;
    n := n + 1;
  END LOOP;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 3: expected dms_verify and dms_accept (found %)', n; END IF;
  RAISE NOTICE 'PASS 3: dms_verify and dms_accept refuse files that have not been released';
END $$;

-- ---------------------------------------------------------------------------
-- 4. behavioural fixture
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  owner_id uuid := '4248640c-3397-4cf6-a274-fa09bad4ba64';
  fid uuid; gid uuid; vid uuid; cf jsonb;
BEGIN
  INSERT INTO public.file_uploads (file_name, file_path, file_size, mime_type, file_extension,
                                   uploaded_by, entity_type, bucket_name)
  VALUES ('dms-cert-fixture.pdf', 'dms-cert/dms-cert-fixture.pdf', 1024, 'application/pdf', 'pdf',
          owner_id, 'dms_certification', 'secure-documents')
  RETURNING id INTO fid;

  -- 4a. a DMS-managed upload starts non-released
  IF (SELECT scan_status FROM public.file_uploads WHERE id = fid) <> 'pending_scan'
     OR (SELECT is_quarantined FROM public.file_uploads WHERE id = fid) THEN
    RAISE EXCEPTION 'FAIL 4a: a new DMS-managed upload did not start non-released';
  END IF;
  RAISE NOTICE 'PASS 4a: new DMS-managed upload starts pending_scan and not quarantined';

  INSERT INTO public.document_groups (entity_type, entity_id, document_type, display_name, owner_id)
  VALUES ('dms_certification', NULL, 'certification_fixture', 'DMS scan lifecycle fixture', owner_id)
  RETURNING id INTO gid;
  INSERT INTO public.document_versions (group_id, version, file_upload_id, uploaded_by)
  VALUES (gid, 1, fid, owner_id) RETURNING id INTO vid;
  UPDATE public.document_groups SET current_version_id = vid WHERE id = gid;

  -- 4b. not released while pending
  IF public.dms_version_scan_clean(vid) THEN
    RAISE EXCEPTION 'FAIL 4b: a pending_scan file was treated as released';
  END IF;
  cf := (public.dms_get_document(gid)) -> 'current_file';
  IF cf IS NULL OR cf = 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL 4b: dms_get_document did not return current_file security state';
  END IF;
  IF (cf ->> 'released')::boolean OR (cf ->> 'scan_status') <> 'pending_scan' THEN
    RAISE EXCEPTION 'FAIL 4b: current_file did not report the pending, unreleased state (%)', cf;
  END IF;
  RAISE NOTICE 'PASS 4b: pending file is not released and the detail contract says so';

  -- 4c. verify and accept are refused before a clean verdict
  BEGIN
    PERFORM public.dms_verify(gid, 'verified', 'certification');
    RAISE EXCEPTION 'FAIL 4c: verification succeeded on an unreleased file';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'scan_not_clean' THEN RAISE EXCEPTION 'FAIL 4c: unexpected error %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.dms_accept(gid, 'accepted', 'certification');
    RAISE EXCEPTION 'FAIL 4c: acceptance succeeded on an unreleased file';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'scan_not_clean' THEN RAISE EXCEPTION 'FAIL 4c: unexpected error %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'PASS 4c: verification and acceptance are refused before a clean scan verdict';

  -- 4d. adverse verdicts stay blocked
  PERFORM public.file_upload_record_scan(fid, 'suspicious', 'certification', 'fixture');
  IF public.dms_version_scan_clean(vid) THEN
    RAISE EXCEPTION 'FAIL 4d: a suspicious file was treated as released';
  END IF;
  PERFORM public.file_upload_record_scan(fid, 'infected', 'certification', 'fixture');
  IF public.dms_version_scan_clean(vid) THEN
    RAISE EXCEPTION 'FAIL 4d: an infected file was treated as released';
  END IF;
  IF NOT (SELECT is_quarantined FROM public.file_uploads WHERE id = fid) THEN
    RAISE EXCEPTION 'FAIL 4d: an infected file was not quarantined';
  END IF;
  RAISE NOTICE 'PASS 4d: suspicious and infected verdicts remain blocked, infected is quarantined';

  -- 4e. quarantine flag alone blocks a nominally clean status
  UPDATE public.file_uploads SET scan_status = 'clean', is_quarantined = true WHERE id = fid;
  IF public.dms_version_scan_clean(vid) THEN
    RAISE EXCEPTION 'FAIL 4e: a quarantined file was treated as released';
  END IF;
  RAISE NOTICE 'PASS 4e: quarantined file stays blocked even with a clean scan_status';

  -- 4f. only the trusted verdict path releases the file
  UPDATE public.file_uploads SET scan_status = 'pending_scan', is_quarantined = false WHERE id = fid;
  PERFORM public.file_upload_record_scan(fid, 'clean', 'certification', 'fixture');
  IF NOT public.dms_version_scan_clean(vid) THEN
    RAISE EXCEPTION 'FAIL 4f: a trusted clean verdict did not release the file';
  END IF;
  cf := (public.dms_get_document(gid)) -> 'current_file';
  IF (cf ->> 'scan_status') <> 'clean'
     OR (cf ->> 'is_quarantined')::boolean
     OR NOT (cf ->> 'released')::boolean
     OR (cf ->> 'file_upload_id')::uuid <> fid THEN
    RAISE EXCEPTION 'FAIL 4f: current_file does not match the authoritative file state (%)', cf;
  END IF;
  RAISE NOTICE 'PASS 4f: trusted clean verdict releases the file and the detail contract reports it';

  -- 4g. verify and accept become possible once released
  PERFORM public.dms_verify(gid, 'verified', 'certification');
  PERFORM public.dms_accept(gid, 'accepted', 'certification');
  RAISE NOTICE 'PASS 4g: verification and acceptance succeed only after security release';

  -- 4h. an adverse verdict immediately withdraws release
  PERFORM public.file_upload_record_scan(fid, 'infected', 'certification', 'fixture');
  cf := (public.dms_get_document(gid)) -> 'current_file';
  IF (cf ->> 'released')::boolean OR NOT (cf ->> 'is_quarantined')::boolean THEN
    RAISE EXCEPTION 'FAIL 4h: dms_get_document still reported a released file after an adverse verdict (%)', cf;
  END IF;
  RAISE NOTICE 'PASS 4h: an adverse verdict immediately withdraws release in the detail contract';

  -- 4i. legal hold takes effect and blocks disposal
  INSERT INTO public.document_holds (document_group_id, reason, status, placed_by)
  VALUES (gid, 'Certification fixture hold', 'active', owner_id);
  IF (SELECT legal_hold_status FROM public.document_groups WHERE id = gid) <> 'on_hold' THEN
    RAISE EXCEPTION 'FAIL 4i: an active hold was not reflected on the document';
  END IF;
  BEGIN
    PERFORM public.dms_archive(gid, 'certification');
    RAISE EXCEPTION 'archive_not_blocked';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT ILIKE '%hold%' THEN RAISE EXCEPTION 'FAIL 4i: unexpected error %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.dms_soft_delete(gid, 'certification');
    RAISE EXCEPTION 'delete_not_blocked';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT ILIKE '%hold%' THEN RAISE EXCEPTION 'FAIL 4i: unexpected error %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'PASS 4i: archive and delete are refused while a legal hold is active';

  -- 4j. releasing the last hold lifts the restriction
  UPDATE public.document_holds SET status = 'released', released_at = now()
   WHERE document_group_id = gid;
  IF (SELECT legal_hold_status FROM public.document_groups WHERE id = gid) = 'on_hold' THEN
    RAISE EXCEPTION 'FAIL 4j: releasing the hold was not reflected on the document';
  END IF;
  RAISE NOTICE 'PASS 4j: releasing the last hold lifts the disposal restriction';


  -- fixture teardown (belt and braces; the script also rolls back)
  DELETE FROM public.document_holds WHERE document_group_id = gid;
  DELETE FROM public.document_action_logs WHERE group_id = gid;
  UPDATE public.document_groups SET current_version_id = NULL WHERE id = gid;
  DELETE FROM public.document_versions WHERE group_id = gid;
  DELETE FROM public.document_groups WHERE id = gid;
  DELETE FROM public.file_uploads WHERE id = fid;
  RAISE NOTICE 'PASS 4z: fixture removed';
END $$;

-- ---------------------------------------------------------------------------
-- 5. disposal actions remain hold-aware on the server
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname IN ('dms_archive','dms_soft_delete')
  LOOP
    IF r.def NOT LIKE '%document_holds%' AND r.def NOT LIKE '%legal_hold%' THEN
      RAISE EXCEPTION 'FAIL 5: %() does not consider legal hold', r.proname;
    END IF;
    n := n + 1;
  END LOOP;
  IF n < 2 THEN RAISE EXCEPTION 'FAIL 5: expected dms_archive and dms_soft_delete (found %)', n; END IF;
  RAISE NOTICE 'PASS 5: disposal actions remain gated on legal hold server-side';
END $$;

-- ---------------------------------------------------------------------------
-- 6. governed audit history accepts every DMS lifecycle verb
-- ---------------------------------------------------------------------------
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
   WHERE conrelid = 'public.document_action_logs'::regclass
     AND conname = 'document_action_logs_action_check';
  IF d IS NULL THEN RAISE EXCEPTION 'FAIL 6: document history action constraint is missing'; END IF;
  IF d NOT LIKE '%verification_verified%' OR d NOT LIKE '%acceptance_accepted%'
     OR d NOT LIKE '%classified%' OR d NOT LIKE '%record_linked%' THEN
    RAISE EXCEPTION 'FAIL 6: document history rejects governed DMS lifecycle verbs (%)', d;
  END IF;
  RAISE NOTICE 'PASS 6: document history accepts the governed DMS lifecycle verbs';
END $$;

-- ---------------------------------------------------------------------------
-- 7. residual: relationship removal is deliberately absent
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('dms_unlink_record','dms_delete_relationship');
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL 7: an unreviewed unlink operation exists (%), review scope', n;
  END IF;
  RAISE NOTICE 'PASS 7: relationship removal remains an out-of-scope residual (no client-side unlink)';
END $$;

ROLLBACK;
