CREATE OR REPLACE FUNCTION public.request_return_edit(
  _return_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.returns_filed%ROWTYPE;
  v_uid uuid := auth.uid();
  v_req_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated', 'code', 'UNAUTHORIZED', 'http', 401);
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RETURN jsonb_build_object('error', 'A reason is required', 'code', 'BAD_REQUEST', 'http', 400);
  END IF;

  SELECT * INTO v_return FROM public.returns_filed WHERE id = _return_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Return not found', 'code', 'NOT_FOUND', 'http', 404);
  END IF;

  IF v_return.created_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('error', 'You are not authorised to request edits for this return', 'code', 'FORBIDDEN', 'http', 403);
  END IF;

  IF upper(coalesce(v_return.workflow_status::text, '')) NOT IN ('SUB','VAL') THEN
    RETURN jsonb_build_object('error', 'Edit requests are only allowed on submitted or validated returns', 'code', 'INVALID_STATE', 'http', 422);
  END IF;

  IF EXISTS (SELECT 1 FROM public.return_edit_requests WHERE return_id = _return_id AND status = 'pending') THEN
    RETURN jsonb_build_object('error', 'An edit request is already pending admin review', 'code', 'ALREADY_PENDING', 'http', 409);
  END IF;

  INSERT INTO public.return_edit_requests(return_id, reason, status, requested_by)
  VALUES (_return_id, btrim(_reason), 'pending', v_uid)
  RETURNING id INTO v_req_id;

  BEGIN
    INSERT INTO public.return_audit_log(return_id, action, previous_status, new_status, comments, performed_by, created_at)
    VALUES (_return_id, 'applicant_edit_requested', v_return.workflow_status::text, v_return.workflow_status::text, btrim(_reason), v_uid, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req_id);
END $$;

REVOKE ALL ON FUNCTION public.request_return_edit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_return_edit(uuid, text) TO authenticated;