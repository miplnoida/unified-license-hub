
CREATE OR REPLACE FUNCTION public.link_complaint_licensee(_complaint_id uuid, _licensee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  v_old uuid;
  v_name text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_complaint_perm(actor, 'triage') OR public.has_complaint_perm(actor, 'escalate') OR public.has_complaint_perm(actor, 'assign')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF _licensee_id IS NULL THEN RAISE EXCEPTION 'Licensee is required'; END IF;
  SELECT legal_name INTO v_name FROM public.licensees WHERE id = _licensee_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Licensee not found'; END IF;

  SELECT licensee_id INTO v_old FROM public.complaints WHERE id = _complaint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complaint not found'; END IF;

  UPDATE public.complaints
     SET licensee_id = _licensee_id,
         updated_at = now()
   WHERE id = _complaint_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'licensee_linked', 'complaint', _complaint_id,
          jsonb_build_object('licensee_id', v_old),
          jsonb_build_object('licensee_id', _licensee_id, 'licensee_name', v_name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_complaint_licensee(uuid, uuid) TO authenticated;
