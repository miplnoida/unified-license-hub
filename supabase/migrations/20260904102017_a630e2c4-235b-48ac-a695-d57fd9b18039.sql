-- =====================================================================
-- W1A.2 — Canonical DMS ingestion foundation
-- =====================================================================

CREATE TABLE public.dms_ingest_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode                   text NOT NULL CHECK (mode IN ('NEW_DOCUMENT','NEW_VERSION')),
  -- NEW_VERSION input group and, after finalize, the resulting group for both modes.
  document_group_id      uuid REFERENCES public.document_groups(id) ON DELETE RESTRICT,
  entity_id              uuid REFERENCES public.licensees(id) ON DELETE RESTRICT,
  picker_type            text,
  canonical_target_type  text,
  source_module          text,
  source_record_id       text,
  source_reference       text,
  category_code          text,
  type_code              text,
  evidentiary_role       text,
  storage_bucket         text NOT NULL DEFAULT 'secure-documents',
  storage_prefix         text NOT NULL,
  status                 text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','finalized','aborted','expired','failed')),
  result_version_id      uuid,
  result_version         integer,
  result_document_reference text,
  context_status         text,
  failure_reason         text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  expires_at             timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  finalized_at           timestamptz
);

CREATE INDEX dms_ingest_sessions_actor_idx  ON public.dms_ingest_sessions (actor_id, created_at DESC);
CREATE INDEX dms_ingest_sessions_status_idx ON public.dms_ingest_sessions (status, expires_at);

-- The browser never writes this table: reads only, and only its own sessions.
GRANT SELECT ON public.dms_ingest_sessions TO authenticated;
GRANT ALL    ON public.dms_ingest_sessions TO service_role;

ALTER TABLE public.dms_ingest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dms_ingest_sessions_read_own ON public.dms_ingest_sessions
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.dms_has('bulk_manage'));

CREATE TRIGGER dms_ingest_sessions_updated_at
  BEFORE UPDATE ON public.dms_ingest_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_document_groups_set_updated_at();

-- ---------------------------------------------------------------------
-- BEGIN: validate authority + business context, hand back a controlled path
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_ingest_begin(
  _mode text,
  _picker_type text,
  _record_id uuid,
  _document_group_id uuid DEFAULT NULL,
  _category_code text DEFAULT NULL,
  _type_code text DEFAULT NULL,
  _evidentiary_role text DEFAULT NULL,
  _source_module text DEFAULT NULL
)
RETURNS TABLE(session_id uuid, bucket text, storage_prefix text, mode text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _mode_u text := upper(btrim(COALESCE(_mode, 'NEW_DOCUMENT')));
  _resolved jsonb;
  _target text;
  _entity uuid;
  _group public.document_groups;
  _sid uuid;
  _prefix text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _mode_u NOT IN ('NEW_DOCUMENT','NEW_VERSION') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF NOT (public.is_super_admin(_actor) OR public.dms_has('upload')) THEN
    RAISE EXCEPTION 'forbidden_action_upload';
  END IF;

  -- Business context: the record must exist and be inside the caller's own scope.
  _resolved := public.record_picker_target_resolve(_picker_type, _record_id);
  IF NOT (_resolved->>'visible')::boolean THEN
    RAISE EXCEPTION 'target_not_found_or_out_of_scope';
  END IF;
  _target := _resolved->>'target_type';

  -- Owning entity is derived server-side, never supplied by an officer.
  IF (_resolved->>'picker_type') = 'entity' THEN
    _entity := _record_id;
  ELSE
    _entity := public.dms_resolve_source_entity(_target, _record_id::text);
  END IF;
  IF _entity IS NOT NULL AND NOT (public.is_super_admin(_actor) OR public.dms_has('bulk_manage')
                                  OR public.can_current_user_access_licensee(_entity, NULL)) THEN
    _entity := NULL;
  END IF;

  IF _category_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.document_categories WHERE code = _category_code AND is_active) THEN
    RAISE EXCEPTION 'invalid_document_category';
  END IF;
  IF _type_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.document_types WHERE code = _type_code AND is_active) THEN
    RAISE EXCEPTION 'invalid_document_type';
  END IF;

  IF _mode_u = 'NEW_VERSION' THEN
    IF _document_group_id IS NULL THEN RAISE EXCEPTION 'document_required_for_new_version'; END IF;
    -- Raises when the caller cannot see the document or lacks create_version.
    _group := public.dms_assert_can_manage(_document_group_id, 'create_version');
  ELSE
    _document_group_id := NULL;
  END IF;

  _sid := gen_random_uuid();
  _prefix := _actor::text || '/dms-ingest/' || _sid::text;

  INSERT INTO public.dms_ingest_sessions (
    id, actor_id, mode, document_group_id, entity_id, picker_type, canonical_target_type,
    source_module, source_record_id, source_reference, category_code, type_code,
    evidentiary_role, storage_prefix
  ) VALUES (
    _sid, _actor, _mode_u, _document_group_id, _entity,
    _resolved->>'picker_type', _target,
    COALESCE(NULLIF(btrim(COALESCE(_source_module,'')), ''), _target),
    _record_id::text, _resolved->>'reference', _category_code, _type_code,
    NULLIF(btrim(COALESCE(_evidentiary_role,'')), ''), _prefix
  );

  RETURN QUERY
    SELECT s.id, s.storage_bucket, s.storage_prefix, s.mode, s.expires_at
      FROM public.dms_ingest_sessions s WHERE s.id = _sid;
END; $function$;

-- ---------------------------------------------------------------------
-- FINALIZE: register the uploaded object as a canonical document / version
-- ---------------------------------------------------------------------
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
    UPDATE public.dms_ingest_sessions SET status = 'expired' WHERE id = s.id;
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
    UPDATE public.dms_ingest_sessions
       SET status = 'finalized', finalized_at = now(), document_group_id = _group,
           result_version_id = _existing_ver,
           result_version = (SELECT v.version FROM public.document_versions v WHERE v.id = _existing_ver),
           result_document_reference = (SELECT d.document_reference FROM public.document_groups d WHERE d.id = _group),
           context_status = COALESCE(s.context_status, 'applied')
     WHERE id = s.id;
    RETURN QUERY SELECT s.document_group_id, s.result_version_id, s.result_version,
                        s.result_document_reference, s.context_status, true
                   FROM public.dms_ingest_sessions s WHERE s.id = _session_id;
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
      (SELECT id FROM public.document_categories WHERE code = COALESCE(s.category_code, 'other')),
      (SELECT id FROM public.document_types WHERE code = COALESCE(s.type_code, 'general_document')),
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

  UPDATE public.document_versions
     SET version_status = 'superseded', superseded_at = now()
   WHERE group_id = _group AND id <> _ver AND COALESCE(version_status, 'current') = 'current';

  UPDATE public.document_groups
     SET current_version_id = _ver, updated_at = now(), updated_by = _actor,
         document_status = COALESCE(document_status, 'available')
   WHERE id = _group;

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

  UPDATE public.dms_ingest_sessions SET
    status = 'finalized', finalized_at = now(), document_group_id = _group,
    result_version_id = _ver, result_version = _next,
    result_document_reference = (SELECT d.document_reference FROM public.document_groups d WHERE d.id = _group),
    context_status = _ctx,
    failure_reason = CASE WHEN _ctx = 'applied' THEN NULL ELSE _ctx END
  WHERE id = s.id;

  RETURN QUERY
    SELECT _group, _ver, _next,
           (SELECT d.document_reference FROM public.document_groups d WHERE d.id = _group),
           _ctx, false;
END; $function$;

-- ---------------------------------------------------------------------
-- ABORT + expiry sweep (never touches a finalized document)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dms_ingest_abort(_session_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE s public.dms_ingest_sessions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO s FROM public.dms_ingest_sessions WHERE id = _session_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'ingest_session_not_found'; END IF;
  IF s.actor_id <> auth.uid() AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden_session_owner';
  END IF;
  IF s.status = 'finalized' THEN RETURN false; END IF;

  UPDATE public.dms_ingest_sessions
     SET status = 'aborted', failure_reason = COALESCE(_reason, 'aborted_by_actor')
   WHERE id = s.id;
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.dms_ingest_cleanup_expired(_limit integer DEFAULT 200)
RETURNS TABLE(expired integer, storage_prefixes text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ids uuid[]; _prefixes text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.dms_has('bulk_manage')) THEN
    RAISE EXCEPTION 'forbidden_action_bulk_manage';
  END IF;

  SELECT array_agg(id), array_agg(storage_prefix) INTO _ids, _prefixes
    FROM (SELECT id, storage_prefix FROM public.dms_ingest_sessions
           WHERE status = 'open' AND expires_at < now()
           ORDER BY expires_at LIMIT GREATEST(COALESCE(_limit, 200), 1)) q;

  IF _ids IS NULL THEN RETURN QUERY SELECT 0, ARRAY[]::text[]; RETURN; END IF;

  UPDATE public.dms_ingest_sessions
     SET status = 'expired', failure_reason = 'expired_without_finalize'
   WHERE id = ANY(_ids) AND status = 'open';

  RETURN QUERY SELECT array_length(_ids, 1), _prefixes;
END; $function$;

-- ---------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.dms_ingest_begin(text, text, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dms_ingest_begin(text, text, uuid, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_ingest_begin(text, text, uuid, uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dms_ingest_finalize(uuid, text, text, bigint, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dms_ingest_finalize(uuid, text, text, bigint, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_ingest_finalize(uuid, text, text, bigint, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dms_ingest_abort(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dms_ingest_abort(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_ingest_abort(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dms_ingest_cleanup_expired(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dms_ingest_cleanup_expired(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_ingest_cleanup_expired(integer) TO authenticated, service_role;

COMMENT ON TABLE public.dms_ingest_sessions IS
  'W1A.2 short-lived staging record for canonical DMS ingestion. Not a business document lifecycle. Server-written only.';
COMMENT ON FUNCTION public.create_document_version_metadata(text, text, text, text, text, text, text, text, text, uuid, text, text, bigint, text, text, text, jsonb, text, uuid) IS
  'DOMAIN_COMPATIBILITY (Form Management). Canonical path is dms_ingest_begin/dms_ingest_finalize.';
