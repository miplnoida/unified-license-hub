-- ============================================================
-- DMS Foundation closure: canonical context observability,
-- entity integrity, governed context registration + reconciliation,
-- licence certificate registration, richer search filters.
-- Additive only. No existing column renamed or dropped.
-- ============================================================

ALTER TABLE public.document_groups
  ADD COLUMN IF NOT EXISTS canonical_context_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS context_failure_reason text,
  ADD COLUMN IF NOT EXISTS context_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS classification_source text NOT NULL DEFAULT 'taxonomy_default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_groups_context_status_check'
  ) THEN
    ALTER TABLE public.document_groups
      ADD CONSTRAINT document_groups_context_status_check
      CHECK (canonical_context_status IN ('pending','applied','failed','retry_required','not_applicable'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_groups_classification_source_check'
  ) THEN
    ALTER TABLE public.document_groups
      ADD CONSTRAINT document_groups_classification_source_check
      CHECK (classification_source IN ('taxonomy_default','explicit_override','legacy_conservative','system_registered'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_groups_context_status
  ON public.document_groups (canonical_context_status)
  WHERE canonical_context_status IN ('pending','failed','retry_required');

-- Canonical entity integrity: primary_entity_id must be a real regulated entity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_groups_primary_entity_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_groups g
       WHERE g.primary_entity_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = g.primary_entity_id)
    ) THEN
      ALTER TABLE public.document_groups
        ADD CONSTRAINT document_groups_primary_entity_fkey
        FOREIGN KEY (primary_entity_id) REFERENCES public.licensees(id) ON DELETE RESTRICT;
    ELSE
      RAISE NOTICE 'document_groups.primary_entity_id has unresolvable values; FK not added.';
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Server-side resolution of the owning regulated entity from the
-- document's source record. Never fabricates an entity id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_resolve_source_entity(
  _source_record_type text, _source_record_id text
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _app uuid; _entity uuid;
BEGIN
  IF _source_record_id IS NULL OR _source_record_type IS NULL THEN RETURN NULL; END IF;
  BEGIN
    IF _source_record_type IN ('application','pre_license_application','form_submission') THEN
      _app := _source_record_id::uuid;
    ELSIF _source_record_type = 'registration' THEN
      SELECT h.application_id INTO _app
        FROM public.registration_licensing_handoffs h
       WHERE h.registration_id = _source_record_id::uuid
       ORDER BY h.created_at DESC LIMIT 1;
    ELSIF _source_record_type = 'entity' THEN
      SELECT l.id INTO _entity FROM public.licensees l WHERE l.id = _source_record_id::uuid;
      RETURN _entity;
    ELSE
      RETURN NULL;
    END IF;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF _app IS NULL THEN RETURN NULL; END IF;

  SELECT a.entity_id INTO _entity FROM public.applications a WHERE a.id = _app;
  IF _entity IS NOT NULL AND EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = _entity) THEN
    RETURN _entity;
  END IF;

  SELECT el.entity_id INTO _entity
    FROM public.licenses li
    JOIN public.entity_licenses el ON el.license_id = li.id
   WHERE li.application_id = _app
   ORDER BY el.effective_from DESC LIMIT 1;
  IF _entity IS NOT NULL AND EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = _entity) THEN
    RETURN _entity;
  END IF;

  RETURN NULL;
END; $$;

-- ------------------------------------------------------------
-- Governed source-context registration for a freshly uploaded
-- document. Idempotent: never creates a second group or version.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_register_source_context(
  _group_id uuid,
  _source_module text DEFAULT NULL,
  _source_record_type text DEFAULT NULL,
  _source_record_id text DEFAULT NULL,
  _source_reference text DEFAULT NULL,
  _category_code text DEFAULT NULL,
  _type_code text DEFAULT NULL
) RETURNS TABLE(group_id uuid, context_status text, resolved_entity_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE g public.document_groups; _entity uuid; _status text;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'edit_metadata');

  _entity := COALESCE(g.primary_entity_id,
                      public.dms_resolve_source_entity(_source_record_type, _source_record_id));

  -- An entity id is only written when it is a real regulated entity the actor
  -- can act for (or the actor is privileged); otherwise the document stays
  -- deliberately unresolved.
  IF _entity IS NOT NULL AND g.primary_entity_id IS NULL
     AND NOT (public.is_super_admin(auth.uid())
              OR public.dms_has('bulk_manage')
              OR public.can_current_user_access_licensee(_entity, NULL)) THEN
    _entity := NULL;
  END IF;

  PERFORM public.dms_apply_document_context(
    _group_id, _category_code, _type_code, _entity,
    _source_module, _source_record_type, _source_record_id, _source_reference);

  _status := CASE WHEN _entity IS NULL THEN 'retry_required' ELSE 'applied' END;

  UPDATE public.document_groups d SET
    canonical_context_status = _status,
    context_failure_reason = CASE WHEN _status = 'applied' THEN NULL
                                  ELSE 'owning_entity_unresolved' END,
    context_attempts = d.context_attempts + 1,
    context_last_attempt_at = now(),
    updated_at = now()
  WHERE d.id = _group_id;

  RETURN QUERY SELECT _group_id, _status, _entity;
END; $$;

-- ------------------------------------------------------------
-- Resolve an existing document to its owning entity, preserving the
-- same document group and document reference.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_resolve_entity(_group_id uuid, _entity_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE g public.document_groups;
BEGIN
  IF _entity_id IS NULL THEN RAISE EXCEPTION 'entity_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = _entity_id) THEN
    RAISE EXCEPTION 'unknown_entity';
  END IF;
  g := public.dms_assert_can_manage(_group_id, 'edit_metadata');
  IF g.primary_entity_id IS NOT NULL AND g.primary_entity_id <> _entity_id THEN
    RAISE EXCEPTION 'entity_reassignment_not_allowed';
  END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.dms_has('bulk_manage')
          OR public.can_current_user_access_licensee(_entity_id, NULL)) THEN
    RAISE EXCEPTION 'forbidden_target_scope';
  END IF;

  PERFORM public.dms_apply_document_context(_group_id, NULL, NULL, _entity_id, NULL, NULL, NULL, NULL);

  UPDATE public.document_groups d SET
    canonical_context_status = 'applied', context_failure_reason = NULL,
    context_attempts = d.context_attempts + 1, context_last_attempt_at = now(),
    updated_at = now()
  WHERE d.id = _group_id;

  PERFORM public.dms_log(_group_id, NULL, 'entity_resolved',
    jsonb_build_object('entity_id', _entity_id));
  RETURN _group_id;
END; $$;

-- ------------------------------------------------------------
-- Idempotent bulk reconciliation of documents whose canonical context
-- could not be applied at upload time.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_reconcile_context(_limit integer DEFAULT 100)
RETURNS TABLE(examined integer, resolved integer, still_pending integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; _entity uuid; _examined int := 0; _resolved int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.dms_has('bulk_manage')) THEN
    RAISE EXCEPTION 'forbidden_action_bulk_manage';
  END IF;

  FOR r IN
    SELECT g.id, g.source_record_type, g.source_record_id
      FROM public.document_groups g
     WHERE g.is_deleted = false
       AND g.primary_entity_id IS NULL
       AND g.canonical_context_status IN ('pending','failed','retry_required')
     ORDER BY g.context_last_attempt_at NULLS FIRST, g.created_at
     LIMIT GREATEST(COALESCE(_limit, 100), 1)
  LOOP
    _examined := _examined + 1;
    _entity := public.dms_resolve_source_entity(r.source_record_type, r.source_record_id);
    IF _entity IS NOT NULL THEN
      PERFORM public.dms_apply_document_context(r.id, NULL, NULL, _entity, NULL, NULL, NULL, NULL);
      UPDATE public.document_groups d SET
        canonical_context_status = 'applied', context_failure_reason = NULL,
        context_attempts = d.context_attempts + 1, context_last_attempt_at = now(), updated_at = now()
      WHERE d.id = r.id;
      PERFORM public.dms_log(r.id, NULL, 'context_reconciled', jsonb_build_object('entity_id', _entity));
      _resolved := _resolved + 1;
    ELSE
      UPDATE public.document_groups d SET
        canonical_context_status = 'retry_required',
        context_failure_reason = 'owning_entity_unresolved',
        context_attempts = d.context_attempts + 1, context_last_attempt_at = now()
      WHERE d.id = r.id;
    END IF;
  END LOOP;

  RETURN QUERY SELECT _examined, _resolved, (_examined - _resolved);
END; $$;

-- ------------------------------------------------------------
-- Canonical registration of an issued licence certificate.
-- Registered as a private, publication-eligible document with
-- publication_status 'not_requested' (no publication workflow here).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_register_certificate(
  _license_id uuid,
  _entity_id uuid,
  _bucket text,
  _storage_path text,
  _file_name text,
  _file_size bigint,
  _mime_type text DEFAULT 'application/pdf',
  _version integer DEFAULT 1,
  _license_number text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _group uuid; _file uuid; _ver uuid; _actor uuid := auth.uid(); _next int;
BEGIN
  IF _actor IS NOT NULL AND NOT (public.is_super_admin(_actor) OR public.dms_has('upload')) THEN
    RAISE EXCEPTION 'forbidden_action_upload';
  END IF;
  IF _license_id IS NULL OR _storage_path IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  IF _entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = _entity_id) THEN
    _entity_id := NULL;
  END IF;

  SELECT id INTO _group FROM public.document_groups
   WHERE source_record_type = 'license' AND source_record_id = _license_id::text
     AND document_type = 'licence_certificate' AND is_deleted = false
   ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF _group IS NULL THEN
    INSERT INTO public.document_groups (
      entity_type, entity_id, document_type, display_name, document_label,
      owner_id, created_by, updated_by, owner_type,
      source_module, source_record_type, source_record_id, source_reference,
      primary_entity_id, category_id, document_type_id,
      confidentiality_classification, publication_eligibility, publication_status,
      document_status, canonical_context_status, classification_source
    ) VALUES (
      'license', _license_id::text, 'licence_certificate',
      COALESCE(_file_name, 'Licence certificate'), 'Licence certificate',
      _actor, _actor, _actor, 'entity',
      'licensing', 'license', _license_id::text, _license_number,
      _entity_id,
      (SELECT id FROM public.document_categories WHERE code = 'licence_certificates'),
      (SELECT id FROM public.document_types WHERE code = 'licence_certificate'),
      'entity', 'public_eligible', 'not_requested',
      'available',
      CASE WHEN _entity_id IS NULL THEN 'retry_required' ELSE 'applied' END,
      'system_registered'
    ) RETURNING id INTO _group;
  ELSE
    UPDATE public.document_groups d SET
      primary_entity_id = COALESCE(d.primary_entity_id, _entity_id),
      canonical_context_status = CASE WHEN COALESCE(d.primary_entity_id, _entity_id) IS NULL
                                      THEN 'retry_required' ELSE 'applied' END,
      updated_at = now()
    WHERE d.id = _group;
  END IF;

  -- Same physical path never creates a duplicate version.
  SELECT id INTO _ver FROM public.document_versions
   WHERE storage_path = _storage_path AND COALESCE(bucket, 'secure-documents') = _bucket LIMIT 1;
  IF _ver IS NOT NULL THEN RETURN _group; END IF;

  INSERT INTO public.file_uploads (
    file_name, file_path, file_size, mime_type, file_extension, uploaded_by,
    entity_type, entity_id, bucket_name, scan_status, metadata
  ) VALUES (
    COALESCE(_file_name, 'certificate.pdf'), _storage_path, COALESCE(_file_size, 0),
    COALESCE(_mime_type, 'application/pdf'), 'pdf', _actor,
    'license', _license_id::text, _bucket, 'pending_scan',
    jsonb_build_object('source', 'licence_certificate', 'license_id', _license_id)
  ) RETURNING id INTO _file;

  SELECT COALESCE(MAX(version), 0) + 1 INTO _next FROM public.document_versions WHERE group_id = _group;

  INSERT INTO public.document_versions (
    group_id, version, file_upload_id, bucket, storage_path, original_file_name,
    file_size, mime_type, extension, uploaded_by, change_note
  ) VALUES (
    _group, _next, _file, _bucket, _storage_path, COALESCE(_file_name, 'certificate.pdf'),
    COALESCE(_file_size, 0), COALESCE(_mime_type, 'application/pdf'), 'pdf', _actor,
    'Licence certificate v' || COALESCE(_version, _next)
  ) RETURNING id INTO _ver;

  UPDATE public.document_groups SET current_version_id = _ver, updated_at = now() WHERE id = _group;

  IF _entity_id IS NOT NULL THEN
    INSERT INTO public.document_relationships (document_group_id, relationship_type, target_type, target_id, is_primary, created_by)
    VALUES (_group, 'belongs_to', 'entity', _entity_id::text, true, _actor)
    ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.document_relationships (document_group_id, relationship_type, target_type, target_id, target_reference, created_by)
  VALUES (_group, 'attached_to', 'license', _license_id::text, _license_number, _actor)
  ON CONFLICT DO NOTHING;

  PERFORM public.dms_log(_group, _ver, 'certificate_registered',
    jsonb_build_object('license_id', _license_id, 'version', _next, 'entity_id', _entity_id));
  RETURN _group;
END; $$;

-- ------------------------------------------------------------
-- Richer governed search (adds filters + context status column).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dms_search_documents(uuid, text, text, text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION public.dms_search_documents(
  _entity_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _category_code text DEFAULT NULL,
  _document_status text DEFAULT NULL,
  _include_archived boolean DEFAULT false,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _type_code text DEFAULT NULL,
  _source_module text DEFAULT NULL,
  _confidentiality text DEFAULT NULL,
  _verification_status text DEFAULT NULL,
  _acceptance_status text DEFAULT NULL,
  _context_status text DEFAULT NULL
) RETURNS TABLE(
  id uuid, document_reference text, display_name text, document_type text,
  category_code text, category_name text, type_code text, document_status text,
  verification_status text, acceptance_status text, confidentiality_classification text,
  publication_eligibility text, publication_status text, primary_entity_id uuid,
  source_module text, source_record_type text, source_record_id text,
  current_version integer, file_name text, file_size bigint, mime_type text,
  bucket text, storage_path text, document_date date,
  canonical_context_status text, classification_source text,
  updated_at timestamptz, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH visible AS (
    SELECT g.*, c.code AS cat_code, c.name AS cat_name, t.code AS typ_code,
           v.version AS cur_version, v.original_file_name, v.file_size AS v_size,
           v.mime_type AS v_mime, v.bucket AS v_bucket, v.storage_path AS v_path
      FROM public.document_groups g
      LEFT JOIN public.document_categories c ON c.id = g.category_id
      LEFT JOIN public.document_types t ON t.id = g.document_type_id
      LEFT JOIN public.document_versions v ON v.id = g.current_version_id
     WHERE public.dms_can_view_document(g.id)
       AND (_include_archived OR (g.is_deleted = false AND COALESCE(g.document_status,'available') <> 'archived'))
       AND (_entity_id IS NULL OR g.primary_entity_id = _entity_id
            OR EXISTS (SELECT 1 FROM public.document_relationships r
                        WHERE r.document_group_id = g.id AND r.target_type = 'entity' AND r.target_id = _entity_id::text))
       AND (_category_code IS NULL OR c.code = _category_code)
       AND (_type_code IS NULL OR t.code = _type_code)
       AND (_source_module IS NULL OR g.source_module = _source_module)
       AND (_confidentiality IS NULL OR COALESCE(g.confidentiality_classification,'entity') = _confidentiality)
       AND (_verification_status IS NULL OR COALESCE(g.verification_status,'not_required') = _verification_status)
       AND (_acceptance_status IS NULL OR COALESCE(g.acceptance_status,'not_required') = _acceptance_status)
       AND (_context_status IS NULL OR g.canonical_context_status = _context_status)
       AND (_document_status IS NULL OR g.document_status = _document_status)
       AND (_search IS NULL OR _search = '' OR
            g.display_name ILIKE '%' || _search || '%' OR
            g.document_reference ILIKE '%' || _search || '%' OR
            g.document_type ILIKE '%' || _search || '%')
  )
  SELECT id, document_reference, display_name, document_type, cat_code, cat_name, typ_code,
         document_status, verification_status, acceptance_status,
         confidentiality_classification, publication_eligibility, publication_status,
         primary_entity_id, source_module, source_record_type, source_record_id,
         cur_version, original_file_name, v_size, v_mime, v_bucket, v_path, document_date,
         canonical_context_status, classification_source, updated_at,
         (SELECT count(*) FROM visible)
    FROM visible
   ORDER BY updated_at DESC
   LIMIT GREATEST(COALESCE(_limit,50), 1) OFFSET GREATEST(COALESCE(_offset,0), 0);
$$;

-- ------------------------------------------------------------
-- Grants: authenticated callers only (service_role for system paths).
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.dms_resolve_source_entity(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dms_register_source_context(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dms_resolve_entity(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dms_reconcile_context(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dms_register_certificate(uuid, uuid, text, text, text, bigint, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dms_search_documents(uuid, text, text, text, boolean, integer, integer, text, text, text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dms_resolve_source_entity(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_register_source_context(uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_resolve_entity(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_reconcile_context(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_register_certificate(uuid, uuid, text, text, text, bigint, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_search_documents(uuid, text, text, text, boolean, integer, integer, text, text, text, text, text, text) TO authenticated, service_role;

-- Legacy rows keep conservative classification but are now marked as such.
UPDATE public.document_groups
   SET classification_source = 'legacy_conservative',
       canonical_context_status = CASE WHEN primary_entity_id IS NULL THEN 'retry_required' ELSE 'applied' END
 WHERE created_at < now() AND classification_source = 'taxonomy_default';
