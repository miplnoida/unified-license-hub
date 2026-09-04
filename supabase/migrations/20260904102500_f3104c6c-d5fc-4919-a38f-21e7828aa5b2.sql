CREATE OR REPLACE FUNCTION public.dms_ingest_finalize(
  _session_id uuid,
  _storage_path text,
  _file_name text,
  _file_size bigint,
  _mime_type text,
  _extension text DEFAULT NULL,
  _checksum text DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _change_note text DEFAULT NULL
)
RETURNS TABLE(group_id uuid, version_id uuid, version integer,
              document_reference text, context_status text, already_finalized boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  s public.dms_ingest_sessions;
  _group uuid;
  _file uuid;
  _ver uuid;
  _next integer;
  _display text;
  _ctx text := 'applied';
  _existing_ver uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO s FROM public.dms_ingest_sessions WHERE id = _session_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'ingest_session_not_found'; END IF;
  IF s.actor_id <> _actor THEN RAISE EXCEPTION 'forbidden_session_owner'; END IF;

  -- Idempotency: a repeated finalize returns the already-registered result.
  IF s.status = 'finalized' THEN
    RETURN QUERY SELECT s.document_group_id, s.result_version_id, s.result_version,
                        s.result_document_reference, s.context_status, true;
    RETURN;
  END IF;
  IF s.status <> 'open' THEN RAISE EXCEPTION 'ingest_session_%', s.status; END IF;
  IF s.expires_at < now() THEN
    UPDATE public.dms_ingest_sessions AS t SET status = 'expired' WHERE t.id = s.id;
    RAISE EXCEPTION 'ingest_session_expired';
  END IF;

  IF NOT (public.is_super_admin(_actor) OR public.dms_has('upload')) THEN
    RAISE EXCEPTION 'forbidden_action_upload';
  END IF;

  -- Path must belong to this session; no caller-chosen location.
  IF _storage_path IS NULL OR position(s.storage_prefix || '/' in _storage_path) <> 1 THEN
    RAISE EXCEPTION 'invalid_storage_path';
  END IF;
  IF _file_size IS NULL OR _file_size <= 0 OR _file_size > 20971520 THEN
    RAISE EXCEPTION 'invalid_file_size';
  END IF;
  IF _mime_type IS NULL OR _mime_type NOT IN (
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg','image/png','image/webp','text/plain','text/csv') THEN
    RAISE EXCEPTION 'invalid_mime_type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o
                  WHERE o.bucket_id = s.storage_bucket AND o.name = _storage_path) THEN
    RAISE EXCEPTION 'storage_object_missing';
  END IF;

  -- Same physical object never yields a second version.
  SELECT v.id, v.group_id INTO _existing_ver, _group
    FROM public.document_versions v
   WHERE v.storage_path = _storage_path
     AND COALESCE(v.bucket, 'secure-documents') = s.storage_bucket
   LIMIT 1;
  IF _existing_ver IS NOT NULL THEN
    UPDATE public.dms_ingest_sessions AS t
       SET status = 'finalized', finalized_at = now(), document_group_id = _group,
           result_version_id = _existing_ver,
           result_version = (SELECT v.version FROM public.document_versions v WHERE v.id = _existing_ver),
           result_document_reference = (SELECT d.document_reference FROM public.document_groups d WHERE d.id = _group),
           context_status = COALESCE(t.context_status, 'applied')
     WHERE t.id = s.id;
    RETURN QUERY SELECT t.document_group_id, t.result_version_id, t.result_version,
                        t.result_document_reference, t.context_status, true
                   FROM public.dms_ingest_sessions t WHERE t.id = _session_id;
    RETURN;
  END IF;

  _display := COALESCE(NULLIF(btrim(COALESCE(_display_name, '')), ''), _file_name);

  IF s.mode = 'NEW_VERSION' THEN
    _group := s.document_group_id;
    PERFORM public.dms_assert_can_manage(_group, 'create_version');
  ELSE
    INSERT INTO public.document_groups (
      entity_type, entity_id, document_type, display_name, document_label,
      owner_id, created_by, updated_by, owner_type,
      source_module, source_record_type, source_record_id, source_reference,
      primary_entity_id, document_reference,
      category_id, document_type_id,
      document_status, canonical_context_status, classification_source
    ) VALUES (
      s.canonical_target_type, s.source_record_id,
      COALESCE(s.type_code, 'general_document'), _display, _display,
      _actor, _actor, _actor, 'entity',
      s.source_module, s.canonical_target_type, s.source_record_id, s.source_reference,
      s.entity_id, public.dms_next_document_reference(),
      (SELECT c.id FROM public.document_categories c WHERE c.code = COALESCE(s.category_code, 'other')),
      (SELECT t.id FROM public.document_types t WHERE t.code = COALESCE(s.type_code, 'general_document')),
      'available', 'pending', 'taxonomy_default'
    ) RETURNING id INTO _group;
  END IF;

  -- Governed file registration: enters the scan lifecycle, never asserts release.
  INSERT INTO public.file_uploads (
    file_name, file_path, file_size, mime_type, file_extension, uploaded_by,
    entity_type, entity_id, bucket_name, scan_status, scan_provider, scanned_at, metadata
  ) VALUES (
    _file_name, _storage_path, _file_size, _mime_type,
    COALESCE(NULLIF(_extension, ''), '.bin'), _actor,
    s.canonical_target_type, s.source_record_id, s.storage_bucket,
    'pending_scan', NULL, NULL,
    jsonb_build_object('ingest_session_id', s.id, 'source_module', s.source_module,
                       'original_name', _file_name)
  ) RETURNING id INTO _file;

  -- Server allocates the version number; the client never guesses it.
  SELECT COALESCE(MAX(v.version), 0) + 1 INTO _next
    FROM public.document_versions v WHERE v.group_id = _group;

  INSERT INTO public.document_versions (
    group_id, version, file_upload_id, uploaded_by, change_note, bucket, storage_path,
    original_file_name, safe_file_name, file_size, mime_type, extension, checksum,
    metadata, version_status
  ) VALUES (
    _group, _next, _file, _actor, _change_note, s.storage_bucket, _storage_path,
    _file_name, regexp_replace(_file_name, '[^a-zA-Z0-9._-]', '_', 'g'),
    _file_size, _mime_type, _extension, _checksum,
    jsonb_build_object('display_name', _display, 'ingest_session_id', s.id), 'current'
  ) RETURNING id INTO _ver;

  UPDATE public.document_versions AS dv
     SET version_status = 'superseded', superseded_at = now()
   WHERE dv.group_id = _group AND dv.id <> _ver
     AND COALESCE(dv.version_status, 'current') = 'current';

  UPDATE public.document_groups AS d
     SET current_version_id = _ver, updated_at = now(), updated_by = _actor,
         document_status = COALESCE(d.document_status, 'available')
   WHERE d.id = _group;

  PERFORM public.dms_log(_group, _ver,
    CASE WHEN _next = 1 THEN 'document_registered' ELSE 'version_added' END,
    jsonb_build_object('version', _next, 'file', _file_name,
                       'ingest_session_id', s.id, 'mode', s.mode));

  -- Classification defaults, retention, source context and canonical relationships.
  -- A filing failure must never discard an already-registered document.
  IF s.mode = 'NEW_DOCUMENT' THEN
    BEGIN
      PERFORM public.dms_apply_document_context(
        _group, s.category_code, s.type_code, s.entity_id,
        s.source_module, s.canonical_target_type, s.source_record_id, s.source_reference);
      _ctx := CASE WHEN s.entity_id IS NULL THEN 'retry_required' ELSE 'applied' END;
    EXCEPTION WHEN others THEN
      _ctx := 'failed';
    END;

    UPDATE public.document_groups d SET
      canonical_context_status = _ctx,
      context_failure_reason = CASE WHEN _ctx = 'applied' THEN NULL
                                    WHEN _ctx = 'failed' THEN 'context_application_failed'
                                    ELSE 'owning_entity_unresolved' END,
      context_attempts = COALESCE(d.context_attempts, 0) + 1,
      context_last_attempt_at = now(),
      metadata = COALESCE(d.metadata, '{}'::jsonb)
                 || CASE WHEN s.evidentiary_role IS NULL THEN '{}'::jsonb
                         ELSE jsonb_build_object('evidentiary_role', s.evidentiary_role) END
    WHERE d.id = _group;
  ELSE
    SELECT COALESCE(d.canonical_context_status, 'applied') INTO _ctx
      FROM public.document_groups d WHERE d.id = _group;
  END IF;

  UPDATE public.dms_ingest_sessions AS t SET
    status = 'finalized', finalized_at = now(), document_group_id = _group,
    result_version_id = _ver, result_version = _next,
    result_document_reference = (SELECT d.document_reference FROM public.document_groups d WHERE d.id = _group),
    context_status = _ctx,
    failure_reason = CASE WHEN _ctx = 'applied' THEN NULL ELSE _ctx END
  WHERE t.id = s.id;

  RETURN QUERY
    SELECT _group, _ver, _next,
           (SELECT d.document_reference FROM public.document_groups d WHERE d.id = _group),
           _ctx, false;
END; $function$;

REVOKE ALL ON FUNCTION public.dms_ingest_finalize(uuid, text, text, bigint, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dms_ingest_finalize(uuid, text, text, bigint, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_ingest_finalize(uuid, text, text, bigint, text, text, text, text, text) TO authenticated, service_role;
