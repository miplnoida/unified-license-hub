CREATE OR REPLACE FUNCTION public.complaint_rfi_cancel(p_rfi_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complaint uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT complaint_id INTO v_complaint FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_complaint IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;

  UPDATE public.complaint_rfis
  SET status = 'cancelled', closure_notes = btrim(p_reason),
      closed_by = auth.uid(), closed_at = now()
  WHERE id = p_rfi_id AND status IN ('draft','open','submitted');

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'complaint.rfi_cancelled', 'complaint', v_complaint,
          jsonb_build_object('rfi_id', p_rfi_id, 'reason', btrim(p_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.complaint_rfi_cancel(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_cancel(uuid, text) TO authenticated, service_role;