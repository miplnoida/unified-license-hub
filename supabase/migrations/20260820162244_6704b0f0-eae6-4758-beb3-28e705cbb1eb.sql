
CREATE OR REPLACE FUNCTION public.enforcement_obligation_set_status(_obligation_id uuid, _status text, _breach_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('enforcement_management','edit');
  IF _status NOT IN ('outstanding','in_progress','complied','breached','waived') THEN
    RAISE EXCEPTION 'Unsupported obligation status: %', _status USING ERRCODE='22023';
  END IF;
  IF _status = 'breached' AND coalesce(length(btrim(_breach_note)),0) < 5 THEN
    RAISE EXCEPTION 'Breach note required (min 5 characters)' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(o) INTO _before FROM public.enforcement_obligations o WHERE o.id=_obligation_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Obligation not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.enforcement_obligations SET
    status = _status,
    breach_note = CASE WHEN _status='breached' THEN btrim(_breach_note) ELSE breach_note END,
    completed_at = CASE WHEN _status='complied' THEN now() ELSE NULL END,
    completed_by = CASE WHEN _status='complied' THEN _uid ELSE NULL END,
    updated_at = now()
  WHERE id=_obligation_id RETURNING to_jsonb(enforcement_obligations) INTO _after;
  PERFORM public.log_compliance_audit('UPDATE','enforcement_obligation',_obligation_id,_before,_after,_breach_note);
  RETURN _after;
END; $$;

REVOKE ALL ON FUNCTION public.enforcement_obligation_set_status(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforcement_obligation_set_status(uuid,text,text) TO authenticated;
