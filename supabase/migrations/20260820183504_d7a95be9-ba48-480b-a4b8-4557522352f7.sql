CREATE OR REPLACE FUNCTION public.application_draft_save(
  _application_id uuid,
  _data jsonb,
  _license_type text DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.applications;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to save an application.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application % does not exist.', _application_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR v_app.applicant_id = v_uid
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.entity_user_memberships m
       WHERE m.user_id = v_uid AND m.status = 'APPROVED'
         AND m.entity_id = v_app.entity_id
    )
  ) THEN
    RAISE EXCEPTION 'APPLICATION_EDIT_FORBIDDEN: You do not have permission to edit this application.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_app.status, 'draft') NOT IN (
    'draft', 'in_progress', 'returned', 'info_requested', 'query_raised',
    'resubmission_required', 'pending_payment'
  ) AND NOT public.is_super_admin(v_uid)
    AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE: This application is not currently open for editing.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.applications
     SET data = COALESCE(_data, data),
         license_type = COALESCE(NULLIF(trim(COALESCE(_license_type, '')), ''), license_type),
         regulator_id = COALESCE(_regulator_id, regulator_id),
         updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('success', true, 'application_id', _application_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.application_draft_save(uuid, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_draft_save(uuid, jsonb, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.application_rfi_close(
  _rfi_id uuid,
  _closure_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rfi public.application_rfis;
  v_status text;
  v_reverted text := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to close an information request.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rfi FROM public.application_rfis WHERE id = _rfi_id;
  IF v_rfi.id IS NULL THEN
    RAISE EXCEPTION 'RFI_NOT_FOUND: Information request % does not exist.', _rfi_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR public.has_permission(v_uid, 'application_management', 'review')
  ) THEN
    RAISE EXCEPTION 'RFI_CLOSE_FORBIDDEN: You do not have permission to close information requests.'
      USING ERRCODE = '42501';
  END IF;

  IF v_rfi.status = 'closed' THEN
    RETURN jsonb_build_object('success', true, 'already_closed', true);
  END IF;

  UPDATE public.application_rfis
     SET status = 'closed',
         closed_by = v_uid,
         closed_at = now(),
         closure_notes = NULLIF(trim(COALESCE(_closure_notes, '')), '')
   WHERE id = _rfi_id;

  SELECT status INTO v_status FROM public.applications WHERE id = v_rfi.application_id;
  IF v_status IN ('info_requested', 'query_raised') THEN
    UPDATE public.applications
       SET status = 'under_review', updated_at = now()
     WHERE id = v_rfi.application_id;
    v_reverted := v_status;
  END IF;

  INSERT INTO public.compliance_audit_logs (
    user_id, action, table_name, record_id, new_values
  ) VALUES (
    v_uid, 'UPDATE'::public.compliance_audit_action, 'application_rfis', _rfi_id,
    jsonb_build_object('status', 'closed', 'status_reverted_from', v_reverted)
  );

  RETURN jsonb_build_object('success', true, 'status_reverted_from', v_reverted);
END;
$function$;

REVOKE ALL ON FUNCTION public.application_rfi_close(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_rfi_close(uuid, text) TO authenticated, service_role;

REVOKE INSERT ON public.applications FROM authenticated;
REVOKE INSERT ON public.applications FROM anon;