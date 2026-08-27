-- ============================================================================
-- GAP-F0-05: atomic authorization for previously client-checked mutations.
-- Each function fuses the permission check with the write in ONE transaction,
-- so a client that skips the UI pre-check gains nothing.
-- ============================================================================

-- ---------------------------------------------------------------- reports ---
CREATE OR REPLACE FUNCTION public.report_schedule_save(_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _out uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid, 'report_management', 'create')) THEN
    RAISE EXCEPTION 'Not authorized to manage report schedules' USING ERRCODE = '42501';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.report_schedules (
      report_id, report_slug, report_name, source, filters_json, selected_columns,
      group_by, sort_by, sort_dir, schedule_type, recipients, export_format,
      is_active, created_by, next_run_at
    ) VALUES (
      NULLIF(_payload->>'report_id','')::uuid,
      NULLIF(_payload->>'report_slug',''),
      NULLIF(_payload->>'report_name',''),
      NULLIF(_payload->>'source',''),
      COALESCE(_payload->'filters_json', '{}'::jsonb),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'selected_columns','[]'::jsonb))), '{}'::text[]),
      NULLIF(_payload->>'group_by',''),
      NULLIF(_payload->>'sort_by',''),
      NULLIF(_payload->>'sort_dir',''),
      _payload->>'schedule_type',
      COALESCE(_payload->'recipients', '[]'::jsonb),
      COALESCE(_payload->>'export_format','csv'),
      COALESCE((_payload->>'is_active')::boolean, true),
      _uid,
      NULLIF(_payload->>'next_run_at','')::timestamptz
    )
    RETURNING id INTO _out;
    RETURN _out;
  END IF;

  UPDATE public.report_schedules s SET
    is_active     = COALESCE((_payload->>'is_active')::boolean, s.is_active),
    schedule_type = COALESCE(NULLIF(_payload->>'schedule_type',''), s.schedule_type),
    next_run_at   = COALESCE(NULLIF(_payload->>'next_run_at','')::timestamptz, s.next_run_at),
    recipients    = COALESCE(_payload->'recipients', s.recipients),
    export_format = COALESCE(NULLIF(_payload->>'export_format',''), s.export_format),
    updated_at    = now()
  WHERE s.id = _id
    AND (s.created_by = _uid OR public.is_super_admin(_uid))
  RETURNING s.id INTO _out;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'Schedule not found or not owned by the caller' USING ERRCODE = '42501';
  END IF;
  RETURN _out;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_schedule_delete(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid, 'report_management', 'create')) THEN
    RAISE EXCEPTION 'Not authorized to manage report schedules' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.report_schedules
   WHERE id = _id AND (created_by = _uid OR public.is_super_admin(_uid));
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN
    RAISE EXCEPTION 'Schedule not found or not owned by the caller' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_template_save(_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _out uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid, 'report_management', 'create')) THEN
    RAISE EXCEPTION 'Not authorized to manage report templates' USING ERRCODE = '42501';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.report_templates (
      name, description, source, filters_json, selected_columns,
      group_by, sort_by, sort_dir, visibility, created_by
    ) VALUES (
      _payload->>'name',
      NULLIF(_payload->>'description',''),
      _payload->>'source',
      COALESCE(_payload->'filters_json','{}'::jsonb),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'selected_columns','[]'::jsonb))), '{}'::text[]),
      NULLIF(_payload->>'group_by',''),
      NULLIF(_payload->>'sort_by',''),
      COALESCE(NULLIF(_payload->>'sort_dir',''),'asc'),
      COALESCE(NULLIF(_payload->>'visibility',''),'private'),
      _uid
    )
    RETURNING id INTO _out;
    RETURN _out;
  END IF;

  UPDATE public.report_templates t SET
    name             = COALESCE(NULLIF(_payload->>'name',''), t.name),
    description      = NULLIF(_payload->>'description',''),
    source           = COALESCE(NULLIF(_payload->>'source',''), t.source),
    filters_json     = COALESCE(_payload->'filters_json', t.filters_json),
    selected_columns = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'selected_columns','[]'::jsonb))), t.selected_columns),
    group_by         = NULLIF(_payload->>'group_by',''),
    sort_by          = NULLIF(_payload->>'sort_by',''),
    sort_dir         = COALESCE(NULLIF(_payload->>'sort_dir',''), t.sort_dir),
    visibility       = COALESCE(NULLIF(_payload->>'visibility',''), t.visibility),
    updated_at       = now()
  WHERE t.id = _id
    AND (t.created_by = _uid OR public.is_super_admin(_uid))
  RETURNING t.id INTO _out;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'Template not found or not owned by the caller' USING ERRCODE = '42501';
  END IF;
  RETURN _out;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_template_delete(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid, 'report_management', 'create')) THEN
    RAISE EXCEPTION 'Not authorized to manage report templates' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.report_templates
   WHERE id = _id AND (created_by = _uid OR public.is_super_admin(_uid));
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN
    RAISE EXCEPTION 'Template not found or not owned by the caller' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ------------------------------------------------- fit & proper screening ---
CREATE OR REPLACE FUNCTION public.fp_screening_config_save(_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _out uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.can_manage_fp_config(_uid)
          OR public.has_permission(_uid, 'fit_and_proper_screening', CASE WHEN _id IS NULL THEN 'create' ELSE 'edit' END)) THEN
    RAISE EXCEPTION 'Not authorized to manage screening configuration' USING ERRCODE = '42501';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.fp_screening_configs (
      key, display_label, description, check_type, provider,
      severity_default, sort_order, is_active
    ) VALUES (
      _payload->>'key',
      _payload->>'display_label',
      NULLIF(_payload->>'description',''),
      _payload->>'check_type',
      NULLIF(_payload->>'provider',''),
      COALESCE(NULLIF(_payload->>'severity_default',''),'medium'),
      COALESCE((_payload->>'sort_order')::int, 0),
      COALESCE((_payload->>'is_active')::boolean, true)
    )
    RETURNING id INTO _out;
    RETURN _out;
  END IF;

  UPDATE public.fp_screening_configs c SET
    display_label    = COALESCE(NULLIF(_payload->>'display_label',''), c.display_label),
    description      = COALESCE(NULLIF(_payload->>'description',''), c.description),
    check_type       = COALESCE(NULLIF(_payload->>'check_type',''), c.check_type),
    provider         = NULLIF(_payload->>'provider',''),
    severity_default = COALESCE(NULLIF(_payload->>'severity_default',''), c.severity_default),
    sort_order       = COALESCE((_payload->>'sort_order')::int, c.sort_order),
    is_active        = COALESCE((_payload->>'is_active')::boolean, c.is_active),
    updated_at       = now()
  WHERE c.id = _id
  RETURNING c.id INTO _out;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'Screening configuration not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN _out;
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_screening_config_set_active(_id uuid, _is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.can_manage_fp_config(_uid)
          OR public.has_permission(_uid, 'fit_and_proper_screening', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to manage screening configuration' USING ERRCODE = '42501';
  END IF;
  UPDATE public.fp_screening_configs
     SET is_active = _is_active, updated_at = now()
   WHERE id = _id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN
    RAISE EXCEPTION 'Screening configuration not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_screening_run_cancel(_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid, 'fit_and_proper_screening', 'manage_screening')
          OR public.has_permission(_uid, 'fit_and_proper', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to cancel screening runs' USING ERRCODE = '42501';
  END IF;
  UPDATE public.fp_screening_runs
     SET status = 'failed', completed_at = now()
   WHERE id = _run_id AND status NOT IN ('completed','failed');
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN
    RAISE EXCEPTION 'Screening run not found or already finished' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.report_schedule_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_schedule_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_template_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_template_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_screening_config_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_screening_config_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_screening_run_cancel(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.report_schedule_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_schedule_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_template_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_template_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_screening_config_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_screening_config_set_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_screening_run_cancel(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_schedule_save(uuid, jsonb) TO service_role;
GRANT ALL ON FUNCTION public.report_schedule_delete(uuid) TO service_role;
GRANT ALL ON FUNCTION public.report_template_save(uuid, jsonb) TO service_role;
GRANT ALL ON FUNCTION public.report_template_delete(uuid) TO service_role;
GRANT ALL ON FUNCTION public.fp_screening_config_save(uuid, jsonb) TO service_role;
GRANT ALL ON FUNCTION public.fp_screening_config_set_active(uuid, boolean) TO service_role;
GRANT ALL ON FUNCTION public.fp_screening_run_cancel(uuid) TO service_role;