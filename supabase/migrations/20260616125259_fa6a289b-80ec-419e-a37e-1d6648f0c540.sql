CREATE OR REPLACE FUNCTION public.create_document_version_metadata(
  _entity_type text,
  _entity_id text,
  _document_type text,
  _document_label text,
  _form_id text,
  _field_id text,
  _submission_id text,
  _bucket text,
  _storage_path text,
  _file_upload_id uuid,
  _original_file_name text,
  _safe_file_name text,
  _file_size bigint,
  _mime_type text,
  _extension text,
  _checksum text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _change_note text DEFAULT NULL,
  _group_id uuid DEFAULT NULL
)
RETURNS TABLE (
  document_upload_id uuid,
  document_version_id uuid,
  version_number int,
  current_version_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _caller uuid := auth.uid();
  _group uuid;
  _next int;
  _new_version uuid;
  _resolved_file_upload_id uuid := COALESCE(_file_upload_id, gen_random_uuid());
  _path_parts text[] := storage.foldername(_storage_path);
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _bucket <> 'secure-documents' THEN
    RAISE EXCEPTION 'invalid_bucket';
  END IF;

  IF _storage_path IS NULL
     OR COALESCE(_path_parts[1], '') <> _caller::text
     OR COALESCE(_path_parts[2], '') <> 'form-management' THEN
    RAISE EXCEPTION 'invalid_storage_path';
  END IF;

  IF _file_size IS NULL OR _file_size <= 0 OR _file_size > 20971520 THEN
    RAISE EXCEPTION 'invalid_file_size';
  END IF;

  IF _mime_type IS NULL OR _mime_type NOT IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv'
  ) THEN
    RAISE EXCEPTION 'invalid_mime_type';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = _bucket
      AND o.name = _storage_path
  ) THEN
    RAISE EXCEPTION 'storage_object_missing';
  END IF;

  IF _group_id IS NOT NULL THEN
    -- Explicit version target: caller is re-versioning a specific logical document.
    SELECT id INTO _group
    FROM public.document_groups
    WHERE id = _group_id
      AND is_deleted = false
    FOR UPDATE;

    IF _group IS NULL THEN
      RAISE EXCEPTION 'group_not_found';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.document_groups g
      WHERE g.id = _group
        AND (g.owner_id = _caller OR public.is_doc_staff(_caller))
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSE
    -- Find-or-create: a logical document is uniquely identified by
    -- (entity, document_type, form_id, field_id, owner, ORIGINAL FILE NAME).
    -- Including the original file name prevents distinct files uploaded into the
    -- same multi-file form field from collapsing into a single shared group
    -- (which previously caused every file in the field to receive a new version
    -- whenever any one of them was re-uploaded).
    SELECT id INTO _group
    FROM public.document_groups
    WHERE entity_type = _entity_type
      AND COALESCE(entity_id,'') = COALESCE(_entity_id,'')
      AND document_type = _document_type
      AND COALESCE(field_id,'') = COALESCE(_field_id,'')
      AND COALESCE(form_id,'') = COALESCE(_form_id,'')
      AND owner_id = _caller
      AND COALESCE(display_name,'') = COALESCE(_original_file_name,'')
      AND is_deleted = false
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF _group IS NULL THEN
      INSERT INTO public.document_groups (
        entity_type, entity_id, document_type, display_name, document_label,
        form_id, field_id, submission_id, owner_id
      ) VALUES (
        _entity_type, _entity_id, _document_type,
        _original_file_name,
        _document_label,
        _form_id, _field_id, _submission_id, _caller
      ) RETURNING id INTO _group;
    END IF;
  END IF;

  INSERT INTO public.file_uploads (
    id,
    file_name,
    file_path,
    file_size,
    mime_type,
    file_extension,
    uploaded_by,
    entity_type,
    entity_id,
    bucket_name,
    scan_status,
    metadata
  ) VALUES (
    _resolved_file_upload_id,
    _original_file_name,
    _storage_path,
    _file_size,
    _mime_type,
    COALESCE(_extension, ''),
    _caller,
    'document_version',
    _group::text,
    _bucket,
    'clean',
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object(
      'original_name', _original_file_name,
      'safe_name', _safe_file_name,
      'document_type', _document_type,
      'document_group_id', _group,
      'checksum_sha256', _checksum,
      'created_via', 'create_document_version_metadata'
    )
  );

  SELECT COALESCE(MAX(version),0) + 1 INTO _next
  FROM public.document_versions
  WHERE group_id = _group;

  INSERT INTO public.document_versions (
    group_id, version, file_upload_id, uploaded_by, change_note,
    bucket, storage_path, original_file_name, safe_file_name,
    file_size, mime_type, extension, checksum, metadata
  ) VALUES (
    _group, _next, _resolved_file_upload_id, _caller, _change_note,
    _bucket, _storage_path, _original_file_name, _safe_file_name,
    _file_size, _mime_type, _extension, _checksum,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object('file_upload_id', _resolved_file_upload_id)
  ) RETURNING id INTO _new_version;

  UPDATE public.document_groups
     SET current_version_id = _new_version, updated_at = now()
   WHERE id = _group;

  INSERT INTO public.document_action_logs (group_id, version_id, actor_id, action, details)
  VALUES (
    _group, _new_version, _caller,
    CASE WHEN _next = 1 THEN 'upload' ELSE 'version_created' END,
    jsonb_build_object(
      'version', _next,
      'file_upload_id', _resolved_file_upload_id,
      'storage_path', _storage_path,
      'mime_type', _mime_type,
      'file_size', _file_size,
      'original_file_name', _original_file_name
    )
  );

  RETURN QUERY
    SELECT _group, _new_version, _next,
           (SELECT dg.current_version_id FROM public.document_groups dg WHERE dg.id = _group);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_document_version_metadata(
  text, text, text, text, text, text, text, text, text, uuid,
  text, text, bigint, text, text, text, jsonb, text, uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_document_version_metadata(
  text, text, text, text, text, text, text, text, text, uuid,
  text, text, bigint, text, text, text, jsonb, text, uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_document_version_metadata(
  text, text, text, text, text, text, text, text, text, uuid,
  text, text, bigint, text, text, text, jsonb, text, uuid
) TO authenticated;