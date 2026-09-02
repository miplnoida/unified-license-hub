-- =====================================================================
-- DMS Phase 2 — permissions + governed service layer
-- =====================================================================

-- ------------------------------------------------------- permission registry
INSERT INTO public.sec_modules (key, label, description, module_type, audience, sort_order, is_system, is_active)
VALUES ('document_management','Document Management','Central document management system.','business','both',85,true,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_modules (key, label, description, audience, sort_order, is_system, is_active)
VALUES ('document_management','Document Management','Central document management system.','both',85,true,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, p.key, p.label, p.label, p.sort_order, p.sensitive, true, true, true
  FROM public.sec_modules m,
  (VALUES
    ('view','View Documents',10,false),
    ('view_entity','View Entity Documents',20,false),
    ('view_internal','View Regulator Internal Documents',30,true),
    ('view_restricted','View Restricted Documents',40,true),
    ('upload','Upload Documents',50,false),
    ('download','Download Documents',60,false),
    ('create_version','Create New Version',70,false),
    ('edit_metadata','Edit Document Metadata',80,false),
    ('classify','Classify Documents',90,true),
    ('verify','Verify Documents',100,false),
    ('reject','Reject Documents',110,false),
    ('accept','Accept Documents',120,false),
    ('archive','Archive Documents',130,false),
    ('restore','Restore Documents',140,false),
    ('link_record','Link Documents to Records',150,false),
    ('manage_retention','Manage Retention',160,true),
    ('manage_hold','Manage Legal Hold',170,true),
    ('delete','Delete Documents',180,true),
    ('audit_view','View Document Audit Trail',190,false),
    ('bulk_manage','Bulk Manage Documents',200,true),
    ('publish_request','Request Publication',210,true),
    ('publish_approve','Approve Publication',220,true)
  ) AS p(key,label,sort_order,sensitive)
 WHERE m.key = 'document_management'
ON CONFLICT (module_id, key) DO NOTHING;

-- ------------------------------------------------------------------ helpers
CREATE OR REPLACE FUNCTION public.dms_has(_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(auth.uid(), 'document_management', _action);
$$;

CREATE OR REPLACE FUNCTION public.dms_can_view_document(_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_groups g
     WHERE g.id = _group_id
       AND auth.uid() IS NOT NULL
       AND (
         public.is_super_admin(auth.uid())
         OR g.owner_id = auth.uid()
         OR (public.is_doc_staff(auth.uid()) AND (
              COALESCE(g.confidentiality_classification,'entity') IN ('public','entity')
              OR (g.confidentiality_classification = 'regulator_internal' AND public.dms_has('view_internal'))
              OR (g.confidentiality_classification IN ('restricted','confidential','legal_privileged')
                  AND public.dms_has('view_restricted'))))
         OR (g.primary_entity_id IS NOT NULL
             AND COALESCE(g.confidentiality_classification,'entity') IN ('public','entity')
             AND public.can_current_user_access_licensee(g.primary_entity_id, NULL))
       ));
$$;

CREATE OR REPLACE FUNCTION public.dms_version_scan_clean(_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT f.scan_status IN ('clean','released','not_required') AND f.is_quarantined = false
      FROM public.document_versions v
      JOIN public.file_uploads f ON f.id = v.file_upload_id
     WHERE v.id = _version_id), false);
$$;

CREATE OR REPLACE FUNCTION public.dms_log(_group_id uuid, _version_id uuid, _action text, _details jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.document_action_logs (group_id, version_id, actor_id, action, details)
  VALUES (_group_id, _version_id, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), _action, COALESCE(_details,'{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.dms_assert_can_manage(_group_id uuid, _action text)
RETURNS public.document_groups LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO g FROM public.document_groups WHERE id = _group_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'document_not_found'; END IF;
  IF NOT public.dms_can_view_document(_group_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.dms_has(_action)
          OR (g.owner_id = auth.uid() AND _action IN ('edit_metadata','upload','create_version','download','view'))) THEN
    RAISE EXCEPTION 'forbidden_action_%', _action;
  END IF;
  RETURN g;
END; $$;

-- --------------------------------------- document identity fix (multi-file field)
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
  _display text := COALESCE(_document_label, _original_file_name);
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

  -- Idempotency: the same physical object never creates a second version.
  SELECT v.id, v.group_id INTO _existing_version, _group
    FROM public.document_versions v
   WHERE v.storage_path = _storage_path AND COALESCE(v.bucket,'secure-documents') = _bucket
   LIMIT 1;
  IF _existing_version IS NOT NULL THEN
    RETURN QUERY
      SELECT _group, _existing_version, (SELECT version FROM public.document_versions WHERE id = _existing_version),
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
    -- Logical key includes the display name so two files in one multi-file
    -- field stay two logical documents.
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
        source_module, source_record_type, source_record_id,
        category_id
      ) VALUES (
        _entity_type, _entity_id, _document_type, _display, _document_label,
        _form_id, _field_id, _submission_id, _caller, _caller, _caller,
        _entity_type, _entity_type, _entity_id,
        (SELECT id FROM public.document_categories WHERE code = 'other')
      ) RETURNING id INTO _group;
    END IF;
  END IF;

  INSERT INTO public.file_uploads (
    id, file_name, file_path, file_size, mime_type, file_extension, uploaded_by,
    entity_type, entity_id, bucket_name, scan_status, metadata
  ) VALUES (
    _resolved_file_upload_id, _original_file_name, _storage_path, _file_size, _mime_type,
    COALESCE(_extension, '.bin'), _caller, _entity_type, _entity_id, _bucket, 'clean',
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

  PERFORM public.dms_log(_group, _new_version, CASE WHEN _next = 1 THEN 'document_registered' ELSE 'version_added' END,
                         jsonb_build_object('version', _next, 'file', _original_file_name));

  RETURN QUERY
    SELECT _group, _new_version, _next,
           (SELECT dg.current_version_id FROM public.document_groups dg WHERE dg.id = _group);
END; $$;

-- ------------------------------------------------------- context application
CREATE OR REPLACE FUNCTION public.dms_apply_document_context(
  _group_id uuid,
  _category_code text DEFAULT NULL,
  _type_code text DEFAULT NULL,
  _primary_entity_id uuid DEFAULT NULL,
  _source_module text DEFAULT NULL,
  _source_record_type text DEFAULT NULL,
  _source_record_id text DEFAULT NULL,
  _source_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.document_groups;
  cat public.document_categories;
  typ public.document_types;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'edit_metadata');

  SELECT * INTO cat FROM public.document_categories WHERE code = _category_code AND is_active;
  SELECT * INTO typ FROM public.document_types WHERE code = _type_code AND is_active;
  IF cat.id IS NULL AND typ.id IS NOT NULL THEN
    SELECT * INTO cat FROM public.document_categories WHERE id = typ.category_id;
  END IF;

  IF _primary_entity_id IS NOT NULL AND g.primary_entity_id IS NOT NULL
     AND g.primary_entity_id <> _primary_entity_id THEN
    RAISE EXCEPTION 'entity_reassignment_not_allowed';
  END IF;

  UPDATE public.document_groups d SET
    category_id = COALESCE(cat.id, d.category_id),
    document_type_id = COALESCE(typ.id, d.document_type_id),
    primary_entity_id = COALESCE(_primary_entity_id, d.primary_entity_id),
    owner_type = COALESCE(d.owner_type, 'entity'),
    source_module = COALESCE(_source_module, d.source_module),
    source_record_type = COALESCE(_source_record_type, d.source_record_type),
    source_record_id = COALESCE(_source_record_id, d.source_record_id),
    source_reference = COALESCE(_source_reference, d.source_reference),
    -- defaults recalculated only where no explicit override was recorded
    confidentiality_classification = CASE
      WHEN d.classification_overrides ? 'confidentiality_classification' THEN d.confidentiality_classification
      ELSE COALESCE(typ.default_confidentiality, cat.default_confidentiality, d.confidentiality_classification, 'entity') END,
    publication_eligibility = CASE
      WHEN d.classification_overrides ? 'publication_eligibility' THEN d.publication_eligibility
      ELSE COALESCE(typ.default_publication_eligibility, cat.default_publication_eligibility, d.publication_eligibility, 'not_publishable') END,
    retention_policy_id = CASE
      WHEN d.classification_overrides ? 'retention_policy_id' THEN d.retention_policy_id
      ELSE COALESCE(typ.default_retention_policy_id, cat.default_retention_policy_id, d.retention_policy_id) END,
    verification_status = CASE
      WHEN COALESCE(d.verification_status,'not_required') = 'not_required'
           AND COALESCE(typ.requires_verification, cat.requires_verification, false) THEN 'pending'
      ELSE d.verification_status END,
    acceptance_status = CASE
      WHEN COALESCE(d.acceptance_status,'not_required') = 'not_required'
           AND COALESCE(typ.requires_acceptance, cat.requires_acceptance, false) THEN 'pending'
      ELSE d.acceptance_status END,
    updated_at = now(), updated_by = auth.uid()
  WHERE d.id = _group_id;

  IF _primary_entity_id IS NOT NULL THEN
    INSERT INTO public.document_relationships (document_group_id, relationship_type, target_type, target_id, is_primary, created_by)
    VALUES (_group_id, 'belongs_to', 'entity', _primary_entity_id::text, true, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  IF _source_record_type IS NOT NULL AND _source_record_id IS NOT NULL THEN
    INSERT INTO public.document_relationships (document_group_id, relationship_type, target_type, target_id, target_reference, created_by)
    VALUES (_group_id, 'attached_to', _source_record_type, _source_record_id, _source_reference, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.dms_log(_group_id, NULL, 'context_applied',
    jsonb_build_object('category', _category_code, 'type', _type_code, 'entity', _primary_entity_id,
                       'source', jsonb_build_object('module', _source_module, 'record_type', _source_record_type, 'record_id', _source_record_id)));
  RETURN _group_id;
END; $$;

-- --------------------------------------------------------------- metadata ops
CREATE OR REPLACE FUNCTION public.dms_update_metadata(
  _group_id uuid, _display_name text DEFAULT NULL, _document_date date DEFAULT NULL,
  _effective_from date DEFAULT NULL, _effective_until date DEFAULT NULL, _expiry_date date DEFAULT NULL,
  _reporting_period_start date DEFAULT NULL, _reporting_period_end date DEFAULT NULL,
  _tags text[] DEFAULT NULL, _metadata jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'edit_metadata');
  UPDATE public.document_groups SET
    display_name = COALESCE(_display_name, display_name),
    document_date = COALESCE(_document_date, document_date),
    effective_from = COALESCE(_effective_from, effective_from),
    effective_until = COALESCE(_effective_until, effective_until),
    expiry_date = COALESCE(_expiry_date, expiry_date),
    reporting_period_start = COALESCE(_reporting_period_start, reporting_period_start),
    reporting_period_end = COALESCE(_reporting_period_end, reporting_period_end),
    tags = COALESCE(_tags, tags),
    metadata = COALESCE(metadata,'{}'::jsonb) || COALESCE(_metadata,'{}'::jsonb),
    updated_at = now(), updated_by = auth.uid()
  WHERE id = _group_id;
  PERFORM public.dms_log(_group_id, NULL, 'metadata_updated', jsonb_build_object('display_name', _display_name));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_classify(
  _group_id uuid, _category_code text DEFAULT NULL, _type_code text DEFAULT NULL,
  _confidentiality text DEFAULT NULL, _publication_eligibility text DEFAULT NULL,
  _retention_policy_code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.document_groups; cat uuid; typ uuid; ret uuid; ov jsonb := '{}'::jsonb;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'classify');
  SELECT id INTO cat FROM public.document_categories WHERE code = _category_code AND is_active;
  SELECT id INTO typ FROM public.document_types WHERE code = _type_code AND is_active;
  SELECT id INTO ret FROM public.document_retention_policies WHERE code = _retention_policy_code AND is_active;

  IF _confidentiality IS NOT NULL THEN ov := ov || jsonb_build_object('confidentiality_classification', true); END IF;
  IF _publication_eligibility IS NOT NULL THEN ov := ov || jsonb_build_object('publication_eligibility', true); END IF;
  IF ret IS NOT NULL THEN ov := ov || jsonb_build_object('retention_policy_id', true); END IF;

  UPDATE public.document_groups SET
    category_id = COALESCE(cat, category_id),
    document_type_id = COALESCE(typ, document_type_id),
    confidentiality_classification = COALESCE(_confidentiality, confidentiality_classification),
    publication_eligibility = COALESCE(_publication_eligibility, publication_eligibility),
    retention_policy_id = COALESCE(ret, retention_policy_id),
    classification_overrides = COALESCE(classification_overrides,'{}'::jsonb) || ov,
    updated_at = now(), updated_by = auth.uid()
  WHERE id = _group_id;

  PERFORM public.dms_log(_group_id, NULL, 'classified',
    jsonb_build_object('category', _category_code, 'type', _type_code,
                       'confidentiality', _confidentiality, 'publication_eligibility', _publication_eligibility));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_verify(_group_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  IF _decision NOT IN ('verified','rejected','pending') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  g := public.dms_assert_can_manage(_group_id, CASE WHEN _decision = 'rejected' THEN 'reject' ELSE 'verify' END);
  IF _decision = 'verified' AND NOT public.dms_version_scan_clean(g.current_version_id) THEN
    RAISE EXCEPTION 'scan_not_clean';
  END IF;
  UPDATE public.document_groups
     SET verification_status = _decision,
         document_status = CASE WHEN _decision = 'verified' THEN 'verified'
                                WHEN _decision = 'rejected' THEN 'rejected' ELSE document_status END,
         updated_at = now(), updated_by = auth.uid()
   WHERE id = _group_id;
  PERFORM public.dms_log(_group_id, g.current_version_id, 'verification_' || _decision, jsonb_build_object('note', _note));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_accept(_group_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  IF _decision NOT IN ('accepted','conditionally_accepted','rejected','pending') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  g := public.dms_assert_can_manage(_group_id, CASE WHEN _decision = 'rejected' THEN 'reject' ELSE 'accept' END);
  IF _decision IN ('accepted','conditionally_accepted') AND NOT public.dms_version_scan_clean(g.current_version_id) THEN
    RAISE EXCEPTION 'scan_not_clean';
  END IF;
  UPDATE public.document_groups
     SET acceptance_status = _decision,
         document_status = CASE WHEN _decision IN ('accepted','conditionally_accepted') THEN 'accepted'
                                WHEN _decision = 'rejected' THEN 'rejected' ELSE document_status END,
         updated_at = now(), updated_by = auth.uid()
   WHERE id = _group_id;
  PERFORM public.dms_log(_group_id, g.current_version_id, 'acceptance_' || _decision, jsonb_build_object('note', _note));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_archive(_group_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'archive');
  IF g.legal_hold_status = 'on_hold' THEN RAISE EXCEPTION 'document_on_legal_hold'; END IF;
  UPDATE public.document_groups
     SET document_status = 'archived', archived_at = now(), archived_by = auth.uid(),
         updated_at = now(), updated_by = auth.uid()
   WHERE id = _group_id;
  PERFORM public.dms_log(_group_id, NULL, 'archived', jsonb_build_object('reason', _reason));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_restore(_group_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'restore');
  UPDATE public.document_groups
     SET document_status = 'available', archived_at = NULL, archived_by = NULL, is_deleted = false,
         updated_at = now(), updated_by = auth.uid()
   WHERE id = _group_id;
  PERFORM public.dms_log(_group_id, NULL, 'restored', jsonb_build_object('reason', _reason));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_soft_delete(_group_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'delete');
  IF g.legal_hold_status = 'on_hold' THEN RAISE EXCEPTION 'document_on_legal_hold'; END IF;
  IF g.acceptance_status IN ('accepted','conditionally_accepted') THEN RAISE EXCEPTION 'accepted_evidence_cannot_be_deleted'; END IF;
  UPDATE public.document_groups
     SET is_deleted = true, document_status = 'archived', updated_at = now(), updated_by = auth.uid()
   WHERE id = _group_id;
  PERFORM public.dms_log(_group_id, NULL, 'soft_deleted', jsonb_build_object('reason', _reason));
  RETURN _group_id;
END; $$;

CREATE OR REPLACE FUNCTION public.dms_link_record(
  _group_id uuid, _target_type text, _target_id text,
  _relationship_type text DEFAULT 'attached_to', _target_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.document_groups; new_id uuid;
BEGIN
  g := public.dms_assert_can_manage(_group_id, 'link_record');
  IF _target_type = 'entity' THEN
    -- cross-entity linkage requires scope over both contexts
    IF NOT (public.is_super_admin(auth.uid())
            OR public.can_current_user_access_licensee(_target_id::uuid, NULL)
            OR public.dms_has('bulk_manage')) THEN
      RAISE EXCEPTION 'forbidden_target_scope';
    END IF;
    IF g.primary_entity_id IS NOT NULL AND g.primary_entity_id::text <> _target_id
       AND NOT (public.is_super_admin(auth.uid())
                OR (public.can_current_user_access_licensee(g.primary_entity_id, NULL)
                    AND public.can_current_user_access_licensee(_target_id::uuid, NULL))) THEN
      RAISE EXCEPTION 'cross_entity_link_forbidden';
    END IF;
  END IF;

  INSERT INTO public.document_relationships (document_group_id, relationship_type, target_type, target_id, target_reference, created_by)
  VALUES (_group_id, _relationship_type, _target_type, _target_id, _target_reference, auth.uid())
  ON CONFLICT (document_group_id, target_type, target_id, relationship_type) DO UPDATE
    SET target_reference = COALESCE(EXCLUDED.target_reference, public.document_relationships.target_reference)
  RETURNING id INTO new_id;

  PERFORM public.dms_log(_group_id, NULL, 'record_linked',
    jsonb_build_object('target_type', _target_type, 'target_id', _target_id, 'relationship', _relationship_type));
  RETURN new_id;
END; $$;

-- ----------------------------------------------------------------- read APIs
CREATE OR REPLACE FUNCTION public.dms_search_documents(
  _entity_id uuid DEFAULT NULL, _search text DEFAULT NULL, _category_code text DEFAULT NULL,
  _document_status text DEFAULT NULL, _include_archived boolean DEFAULT false,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, document_reference text, display_name text, document_type text,
  category_code text, category_name text, type_code text,
  document_status text, verification_status text, acceptance_status text,
  confidentiality_classification text, publication_eligibility text, publication_status text,
  primary_entity_id uuid, source_module text, source_record_type text, source_record_id text,
  current_version integer, file_name text, file_size bigint, mime_type text,
  bucket text, storage_path text, updated_at timestamptz, total_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
         cur_version, original_file_name, v_size, v_mime, v_bucket, v_path, updated_at,
         (SELECT count(*) FROM visible)
    FROM visible
   ORDER BY updated_at DESC
   LIMIT GREATEST(COALESCE(_limit,50), 1) OFFSET GREATEST(COALESCE(_offset,0), 0);
$$;

CREATE OR REPLACE FUNCTION public.dms_list_entity_documents(
  _entity_id uuid, _search text DEFAULT NULL, _category_code text DEFAULT NULL,
  _document_status text DEFAULT NULL, _include_archived boolean DEFAULT false,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS SETOF record LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.dms_search_documents(_entity_id, _search, _category_code, _document_status,
                                            _include_archived, _limit, _offset);
$$;

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

-- --------------------------------------------------------------------- grants
DO $grants$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'dms\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $grants$;
