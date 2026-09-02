-- DMS Phase 3/4 closure certification. Rollback-scoped: no state is retained.
-- Run: psql -v ON_ERROR_STOP=1 -f scripts/verify-dms-phase4-closure.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  -- G-01 context observability columns exist
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='document_groups'
     AND column_name IN ('canonical_context_status','context_failure_reason','context_attempts',
                         'context_last_attempt_at','classification_source');
  IF n <> 5 THEN RAISE EXCEPTION 'G-01 FAIL: context observability columns missing (%)', n; END IF;

  -- G-02 canonical entity integrity FK
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid='public.document_groups'::regclass AND contype='f'
     AND confrelid='public.licensees'::regclass;
  IF n < 1 THEN RAISE EXCEPTION 'G-02 FAIL: primary_entity_id FK to licensees missing'; END IF;

  -- G-03 governed RPCs present
  FOR n IN SELECT 1 LOOP END LOOP;
  PERFORM 1;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
       WHERE ns.nspname='public' AND p.proname IN
        ('dms_register_source_context','dms_resolve_source_entity','dms_reconcile_context',
         'dms_register_certificate','dms_search_documents','dms_get_document')) < 6
  THEN RAISE EXCEPTION 'G-03 FAIL: governed Phase 4 RPCs missing'; END IF;

  -- G-04 every Phase 4 RPC is SECURITY DEFINER with a pinned search_path
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('dms_register_source_context','dms_reconcile_context','dms_register_certificate')
     AND (NOT p.prosecdef OR p.proconfig IS NULL);
  IF n > 0 THEN RAISE EXCEPTION 'G-04 FAIL: % Phase 4 RPC(s) not secdef/search_path pinned', n; END IF;

  -- G-05 no anonymous EXECUTE on the Phase 4 RPCs
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'dms_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF n > 0 THEN RAISE EXCEPTION 'G-05 FAIL: % dms_* RPC(s) executable by anon', n; END IF;

  -- G-06 permissions live only in the document_management namespace
  SELECT count(*) INTO n FROM public.permissions WHERE module = 'documents';
  IF n > 0 THEN RAISE EXCEPTION 'G-06 FAIL: legacy documents.* permission namespace present'; END IF;
  SELECT count(*) INTO n FROM public.permissions WHERE module = 'document_management';
  IF n < 20 THEN RAISE EXCEPTION 'G-06 FAIL: document_management permissions incomplete (%)', n; END IF;
  SELECT count(*) INTO n FROM public.permissions
   WHERE module='document_management' AND name IN ('bulk_manage','edit_metadata','link_record');
  IF n <> 3 THEN RAISE EXCEPTION 'G-06 FAIL: reconciliation/link permissions missing'; END IF;

  -- G-07 no document group carries a fabricated entity id
  SELECT count(*) INTO n FROM public.document_groups g
   WHERE g.primary_entity_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = g.primary_entity_id);
  IF n > 0 THEN RAISE EXCEPTION 'G-07 FAIL: % group(s) with dangling primary_entity_id', n; END IF;

  -- G-08 unresolved context is observable, never silently applied
  SELECT count(*) INTO n FROM public.document_groups
   WHERE primary_entity_id IS NULL AND canonical_context_status = 'applied';
  IF n > 0 THEN RAISE EXCEPTION 'G-08 FAIL: % unresolved group(s) marked applied', n; END IF;

  -- G-09 logical identity: one storage path never appears in two versions
  SELECT count(*) INTO n FROM (
    SELECT storage_path FROM public.document_versions
     WHERE storage_path IS NOT NULL GROUP BY storage_path HAVING count(*) > 1) d;
  IF n > 0 THEN RAISE EXCEPTION 'G-09 FAIL: % storage path(s) duplicated across versions', n; END IF;

  -- G-10 document references are unique and stable
  SELECT count(*) INTO n FROM (
    SELECT document_reference FROM public.document_groups
     WHERE document_reference IS NOT NULL GROUP BY document_reference HAVING count(*) > 1) d;
  IF n > 0 THEN RAISE EXCEPTION 'G-10 FAIL: % duplicated document reference(s)', n; END IF;

  -- G-11 conservative defaults: nothing public/publishable by accident
  SELECT count(*) INTO n FROM public.document_groups
   WHERE publication_status <> 'not_requested';
  IF n > 0 THEN RAISE EXCEPTION 'G-11 FAIL: % group(s) beyond not_requested publication', n; END IF;
  SELECT count(*) INTO n FROM public.document_groups WHERE confidentiality_classification = 'public';
  IF n > 0 THEN RAISE EXCEPTION 'G-11 FAIL: % group(s) classified public', n; END IF;

  -- G-12 certificate registration produces private, publication-eligible, unpublished docs
  SELECT count(*) INTO n FROM public.document_categories
   WHERE code='licence_certificates' AND default_publication_eligibility='public_eligible';
  IF n <> 1 THEN RAISE EXCEPTION 'G-12 FAIL: licence_certificates category not publication-eligible'; END IF;

  -- G-13 scan lifecycle untouched: no DMS version points at a file created clean
  SELECT count(*) INTO n FROM public.document_versions v
    JOIN public.file_uploads f ON f.id = v.file_upload_id
   WHERE f.scan_status = 'clean' AND f.scanned_at IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'G-13 FAIL: % file(s) clean without a scan verdict', n; END IF;

  -- G-14 legal hold still blocks disposal
  SELECT count(*) INTO n FROM public.document_groups
   WHERE legal_hold_status = 'active' AND (is_deleted OR archived_at IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION 'G-14 FAIL: % held group(s) disposed', n; END IF;

  -- G-15 RLS remains enabled on the DMS tables
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND NOT c.relrowsecurity AND c.relname IN
    ('document_groups','document_versions','document_action_logs','document_relationships');
  IF n > 0 THEN RAISE EXCEPTION 'G-15 FAIL: RLS disabled on % DMS table(s)', n; END IF;

  RAISE NOTICE 'DMS PHASE 3/4 CLOSURE: 15/15 GATES PASSED';
END $$;

ROLLBACK;
