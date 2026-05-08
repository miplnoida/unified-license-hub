-- PHASE 6: Safeguards and admin override

-- 1) Block hard-delete of used form versions
CREATE OR REPLACE FUNCTION public._prevent_form_version_delete_if_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  -- form_responses
  SELECT count(*) INTO v_count FROM public.form_responses WHERE version_id = OLD.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FORM_VERSION_IN_USE: This version has % form response(s) and cannot be deleted. Retire or archive it instead.', v_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- normalized assignments
  SELECT count(*) INTO v_count FROM public.application_form_versions WHERE version_id = OLD.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FORM_VERSION_IN_USE: This version is assigned to % application(s) and cannot be deleted. Retire or archive it instead.', v_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- legacy JSON pins or direct column reference on non-draft apps
  SELECT count(*) INTO v_count
    FROM public.applications a
   WHERE (
     a.form_version_id = OLD.id
     OR EXISTS (
       SELECT 1 FROM jsonb_each_text(COALESCE(a.data->'form_version_ids','{}'::jsonb)) v(k, val)
        WHERE val = OLD.id::text
     )
   )
   AND a.status <> 'draft';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FORM_VERSION_IN_USE: This version is referenced by % non-draft application(s) and cannot be deleted. Retire or archive it instead.', v_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_form_version_delete_if_used ON public.form_versions;
CREATE TRIGGER trg_prevent_form_version_delete_if_used
  BEFORE DELETE ON public.form_versions
  FOR EACH ROW EXECUTE FUNCTION public._prevent_form_version_delete_if_used();

-- 2) Admin override: replace the active form version assignment for an application
CREATE OR REPLACE FUNCTION public.admin_override_form_version_assignment(
  _application_id uuid,
  _template_id uuid,
  _version_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_old record;
  v_new record;
  v_now timestamptz := now();
  v_existing_map jsonb;
  v_new_map jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RETURN jsonb_build_object('error','Reason is required for an admin override','code','REASON_REQUIRED','http',422);
  END IF;
  IF _application_id IS NULL OR _template_id IS NULL OR _version_id IS NULL THEN
    RETURN jsonb_build_object('error','application_id, template_id and version_id are required','code','BAD_REQUEST','http',400);
  END IF;

  SELECT id, applicant_id, data INTO v_app
    FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  SELECT id, version, semantic_version, status, template_id INTO v_new
    FROM public.form_versions
   WHERE id = _version_id AND template_id = _template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Target version not found for this template','code','VERSION_NOT_FOUND','http',404);
  END IF;

  -- Mark current active assignment as superseded
  SELECT id, version_id INTO v_old
    FROM public.application_form_versions
   WHERE application_id = _application_id AND template_id = _template_id AND status = 'active'
   LIMIT 1;
  IF FOUND THEN
    UPDATE public.application_form_versions
       SET status = 'superseded', updated_at = v_now
     WHERE id = v_old.id;
  END IF;

  INSERT INTO public.application_form_versions
    (application_id, template_id, version_id, assigned_reason, assigned_by, locked_at, status)
  VALUES
    (_application_id, _template_id, _version_id, 'admin_override', v_uid, v_now, 'active');

  -- Mirror to legacy JSON
  v_existing_map := COALESCE(v_app.data->'form_version_ids', '{}'::jsonb);
  v_new_map := v_existing_map || jsonb_build_object(_template_id::text, _version_id::text);
  UPDATE public.applications
     SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('form_version_ids', v_new_map),
         updated_at = v_now
   WHERE id = _application_id;

  PERFORM public.create_audit_log(
    v_uid, 'application_form_version_overridden', 'application',
    _application_id::text, NULL,
    jsonb_build_object(
      'template_id', _template_id,
      'old_version_id', v_old.version_id,
      'new_version_id', _version_id,
      'new_version_number', v_new.version,
      'reason', trim(_reason)
    ), NULL
  );

  PERFORM public.create_notification(
    v_app.applicant_id,
    'Form version updated by admin',
    'An administrator has updated the form version assigned to one of your applications.',
    'info', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true, 'http', 200,
    'application_id', _application_id,
    'template_id', _template_id,
    'old_version_id', v_old.version_id,
    'new_version_id', _version_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_override_form_version_assignment(uuid, uuid, uuid, text) TO authenticated;