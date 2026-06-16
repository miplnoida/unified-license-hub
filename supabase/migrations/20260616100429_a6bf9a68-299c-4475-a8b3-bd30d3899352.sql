
-- Extend document_groups
ALTER TABLE public.document_groups
  ADD COLUMN IF NOT EXISTS form_id text,
  ADD COLUMN IF NOT EXISTS field_id text,
  ADD COLUMN IF NOT EXISTS submission_id text,
  ADD COLUMN IF NOT EXISTS document_label text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_document_groups_entity_type
  ON public.document_groups(entity_type, entity_id, document_type);
CREATE INDEX IF NOT EXISTS idx_document_groups_form_field
  ON public.document_groups(form_id, field_id);
CREATE INDEX IF NOT EXISTS idx_document_groups_submission
  ON public.document_groups(submission_id);

-- Extend document_versions with full self-contained metadata
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS original_file_name text,
  ADD COLUMN IF NOT EXISTS safe_file_name text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_document_versions_group_version
  ON public.document_versions(group_id, version DESC);

-- Expand allowed action types
ALTER TABLE public.document_action_logs
  DROP CONSTRAINT IF EXISTS document_action_logs_action_check;
ALTER TABLE public.document_action_logs
  ADD CONSTRAINT document_action_logs_action_check
  CHECK (action IN (
    'upload','new_version','version_created','batch_uploaded',
    'replace','replaced','delete','deleted','restore','restored',
    'download','downloaded','make_current',
    'validation_failed','upload_failed'
  ));

CREATE INDEX IF NOT EXISTS idx_document_action_logs_entity
  ON public.document_action_logs(group_id);

-- Atomic find-or-create group + next-version insertion
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
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _group uuid;
  _next int;
  _new_version uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Resolve / create group
  IF _group_id IS NOT NULL THEN
    SELECT id INTO _group FROM public.document_groups
      WHERE id = _group_id FOR UPDATE;
    IF _group IS NULL THEN RAISE EXCEPTION 'group_not_found'; END IF;
  ELSE
    -- Try to find an existing logical document for this entity+type(+field)
    SELECT id INTO _group FROM public.document_groups
      WHERE entity_type = _entity_type
        AND COALESCE(entity_id,'') = COALESCE(_entity_id,'')
        AND document_type = _document_type
        AND COALESCE(field_id,'') = COALESCE(_field_id,'')
        AND COALESCE(form_id,'') = COALESCE(_form_id,'')
        AND owner_id = _caller
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
        COALESCE(_document_label, _original_file_name),
        _document_label,
        _form_id, _field_id, _submission_id, _caller
      ) RETURNING id INTO _group;
    END IF;
  END IF;

  -- Allocate next version
  SELECT COALESCE(MAX(version),0) + 1 INTO _next
    FROM public.document_versions WHERE group_id = _group;

  INSERT INTO public.document_versions (
    group_id, version, file_upload_id, uploaded_by, change_note,
    bucket, storage_path, original_file_name, safe_file_name,
    file_size, mime_type, extension, checksum, metadata
  ) VALUES (
    _group, _next, _file_upload_id, _caller, _change_note,
    _bucket, _storage_path, _original_file_name, _safe_file_name,
    _file_size, _mime_type, _extension, _checksum, COALESCE(_metadata,'{}'::jsonb)
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
      'file_upload_id', _file_upload_id,
      'storage_path', _storage_path,
      'mime_type', _mime_type,
      'file_size', _file_size,
      'original_file_name', _original_file_name
    )
  );

  RETURN QUERY
    SELECT _group, _new_version, _next,
           (SELECT current_version_id FROM public.document_groups WHERE id = _group);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_document_version_metadata(
  text, text, text, text, text, text, text, text, text, uuid,
  text, text, bigint, text, text, text, jsonb, text, uuid
) TO authenticated;

-- Convenience: log a batch_uploaded summary action (allowed via existing RLS)
CREATE OR REPLACE FUNCTION public.log_document_batch_action(
  _group_id uuid,
  _action text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.document_action_logs (group_id, actor_id, action, details)
  VALUES (_group_id, _caller, _action, COALESCE(_details,'{}'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_document_batch_action(uuid, text, jsonb) TO authenticated;
