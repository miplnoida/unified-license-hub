create or replace function public.application_rfi_close(_rfi_id uuid, _closure_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
    user_id, action_type, object_type, object_id, after_value, justification
  ) VALUES (
    v_uid, 'UPDATE'::public.compliance_audit_action, 'application_rfis', _rfi_id::text,
    jsonb_build_object('status', 'closed', 'status_reverted_from', v_reverted),
    NULLIF(trim(COALESCE(_closure_notes, '')), '')
  );

  RETURN jsonb_build_object('success', true, 'status_reverted_from', v_reverted);
END;
$fn$;