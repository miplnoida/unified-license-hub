-- =====================================================================
-- DMS scan lifecycle correction
-- 1. create_document_version_metadata must never self-certify a file as
--    clean. New DMS-managed uploads enter the governed F0 scan lifecycle
--    as 'pending_scan'; only public.file_upload_record_scan (worker /
--    privileged path) may release a file.
-- 2. dms_get_document returns the authoritative current-file security
--    state so UI never derives malware safety from version_status.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_document_version_metadata(
  _entity_type text, _entity_id text, _document_type text, _document_label text,
  _form_id text, _field_id text, _submission_id text, _bucket text, _storage_path text,
  _file_upload_id uuid, _original_file_name text, _safe_file_name text, _file_size bigint,
  _mime_type text, _extension text, _checksum text, _metadata jsonb DEFAULT '{}'::jsonb,
  _change_note text DEFAULT NULL, _group_id uuid DEFAULT NULL
)
RETURNS TABLE (document_upload_id uuid, document_version_id uuid, version_number int, current_version_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage
AS $$
DECLARE
  _caller uuid := auth.uid();
  _group uuid;
  _next int;
  _new_version uuid;
  _resolved_file_upload_id uuid := COALESCE(_file_upload_id, gen_random_uuid());
  _path_parts text[] := storage.foldername(_storage_path);
  -- Logical document identity is the physical file name, matching the client
  -- probe, so distinct files in one multi-file field never collapse.
  _display text := COALESCE(NULLIF(_metadata->>'display_name',''), _original_file_name, _document_label);
  _existing_version uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _bucket <> 'secure-documents' THEN RAISE EXCEPTION 'invalid_bucket'; END IF;
  IF _storage_path IS NULL
     OR COALESCE(_path_parts[1], '') <> _caller::text
     OR COALESCE(_path_parts[2], '') <> 'form-management' THEN
    RAISE EXCEPTION 'invalid_storage_path';
  END IF;
  IF _file_size IS NULL OR _file_size <= 0 OR _file_size > 20971520 THEN RAISE EXCEPTION 'invalid_file_size'; END IF;
  IF _mime_type IS NULL OR _mime_type NOT IN (
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg','image/png','image/webp','text/plain','text/csv') THEN
    RAISE EXCEPTION 'invalid_mime_type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = _bucket AND o.name = _storage_path) THEN
    RAISE EXCEPTION 'storage_object_missing';
  END IF;

  SELECT v.id, v.group_id INTO _existing_version, _group
    FROM public.document_versions v
   WHERE v.storage_path = _storage_path AND COALESCE(v.bucket,'secure-documents') = _bucket
   LIMIT 1;
  IF _existing_version IS NOT NULL THEN
    RETURN QUERY
      SELECT _group, _existing_version,
             (SELECT version FROM public.document_versions WHERE id = _existing_version),
             (SELECT dg.current_version_id FROM public.document_groups dg WHERE dg.id = _group);
    RETURN;
  END IF;

  IF _group_id IS NOT NULL THEN
    SELECT id INTO _group FROM public.document_groups WHERE id = _group_id AND is_deleted = false FOR UPDATE;
    IF _group IS NULL THEN RAISE EXCEPTION 'group_not_found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_groups g WHERE g.id = _group
                     AND (g.owner_id = _caller OR public.is_doc_staff(_caller))) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSE
    SELECT id INTO _group FROM public.document_groups
     WHERE entity_type = _entity_type
       AND COALESCE(entity_id,'') = COALESCE(_entity_id,'')
       AND document_type = _document_type
       AND COALESCE(field_id,'') = COALESCE(_field_id,'')
       AND COALESCE(form_id,'') = COALESCE(_form_id,'')
       AND COALESCE(display_name,'') = COALESCE(_display,'')
       AND owner_id = _caller
       AND is_deleted = false
     ORDER BY created_at ASC LIMIT 1 FOR UPDATE;

    IF _group IS NULL THEN
      INSERT INTO public.document_groups (
        entity_type, entity_id, document_type, display_name, document_label,
        form_id, field_id, submission_id, owner_id, created_by, updated_by,
        source_module, source_record_type, source_record_id, category_id
      ) VALUES (
        _entity_type, _entity_id, _document_type, _display, _document_label,
        _form_id, _field_id, _submission_id, _caller, _caller, _caller,
        _entity_type, _entity_type, _entity_id,
        (SELECT id FROM public.document_categories WHERE code = 'other')
      ) RETURNING id INTO _group;
    END IF;
  END IF;

  -- F0 CONTROL: a DMS-managed upload NEVER asserts a release state. The file
  -- enters the governed scan lifecycle as 'pending_scan' with no provider and
  -- no scanned_at; public.file_upload_record_scan is the only writer that may
  -- move it to clean / released.
  INSERT INTO public.file_uploads (
    id, file_name, file_path, file_size, mime_type, file_extension, uploaded_by,
    entity_type, entity_id, bucket_name, scan_status, scan_provider, scanned_at, metadata
  ) VALUES (
    _resolved_file_upload_id, _original_file_name, _storage_path, _file_size, _mime_type,
    COALESCE(_extension, '.bin'), _caller, _entity_type, _entity_id, _bucket,
    'pending_scan', NULL, NULL,
    COALESCE(_metadata,'{}'::jsonb)
  ) ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE(MAX(version), 0) + 1 INTO _next FROM public.document_versions WHERE group_id = _group;

  INSERT INTO public.document_versions (
    group_id, version, file_upload_id, uploaded_by, change_note, bucket, storage_path,
    original_file_name, safe_file_name, file_size, mime_type, extension, checksum,
    metadata, version_status
  ) VALUES (
    _group, _next, _resolved_file_upload_id, _caller, _change_note, _bucket, _storage_path,
    _original_file_name, _safe_file_name, _file_size, _mime_type, _extension, _checksum,
    COALESCE(_metadata,'{}'::jsonb), 'current'
  ) RETURNING id INTO _new_version;

  UPDATE public.document_versions
     SET version_status = 'superseded', superseded_at = now()
   WHERE group_id = _group AND id <> _new_version AND COALESCE(version_status,'current') = 'current';

  UPDATE public.document_groups
     SET current_version_id = _new_version, updated_at = now(), updated_by = _caller,
         document_status = COALESCE(document_status,'available')
   WHERE id = _group;

  PERFORM public.dms_log(_group, _new_version,
    CASE WHEN _next = 1 THEN 'document_registered' ELSE 'version_added' END,
    jsonb_build_object('version', _next, 'file', _original_file_name));

  RETURN QUERY
    SELECT _group, _new_version, _next,
           (SELECT dg.current_version_id FROM public.document_groups dg WHERE dg.id = _group);
END; $$;

COMMENT ON FUNCTION public.create_document_version_metadata(
  text, text, text, text, text, text, text, text, text, uuid, text, text,
  bigint, text, text, text, jsonb, text, uuid
) IS
'Registers a DMS document/version for an already-uploaded storage object. The backing file_uploads row always starts at scan_status=pending_scan; only public.file_upload_record_scan may release it.';

-- ---------------------------------------------------------------------
-- Authoritative current-file security state in the DMS detail read model.
-- `released` mirrors public.dms_version_scan_clean exactly so the UI can
-- never present an action the server would refuse.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_get_document(_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.dms_can_view_document(_group_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'document', to_jsonb(g) - 'metadata' || jsonb_build_object('metadata', COALESCE(g.metadata,'{}'::jsonb)),
    'category', (SELECT to_jsonb(c) FROM public.document_categories c WHERE c.id = g.category_id),
    'type', (SELECT to_jsonb(t) FROM public.document_types t WHERE t.id = g.document_type_id),
    'retention_policy', (SELECT to_jsonb(p) FROM public.document_retention_policies p WHERE p.id = g.retention_policy_id),
    'current_file', (
      SELECT jsonb_build_object(
               'file_upload_id', f.id,
               'version_id', v.id,
               'scan_status', COALESCE(f.scan_status, 'unknown'),
               'is_quarantined', COALESCE(f.is_quarantined, false),
               'scan_provider', f.scan_provider,
               'scanned_at', f.scanned_at,
               'released', COALESCE(f.scan_status,'') IN ('clean','released','not_required')
                           AND COALESCE(f.is_quarantined, false) = false
             )
        FROM public.document_versions v
        LEFT JOIN public.file_uploads f ON f.id = v.file_upload_id
       WHERE v.id = g.current_version_id
    ),
    'versions', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version DESC)
                            FROM public.document_versions v WHERE v.group_id = g.id), '[]'::jsonb),
    'relationships', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at)
                            FROM public.document_relationships r WHERE r.document_group_id = g.id), '[]'::jsonb),
    'holds', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.placed_at DESC)
                            FROM public.document_holds h WHERE h.document_group_id = g.id), '[]'::jsonb),
    'audit', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC)
                            FROM public.document_action_logs l WHERE l.group_id = g.id), '[]'::jsonb)
  ) INTO result
  FROM public.document_groups g WHERE g.id = _group_id;
  RETURN result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.dms_get_document(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dms_get_document(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_get_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dms_get_document(uuid) TO service_role;