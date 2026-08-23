-- GAP: enforcement obligation status vocabulary was split three ways —
-- RECORD_OBLIGATION wrote 'pending', enforcement_obligation_set_status accepted
-- only ('outstanding','in_progress','complied','breached','waived') and the CLOSE
-- gate accepted only ('completed','waived','closed'). Obligations could therefore
-- never be discharged and no enforcement case could ever close.
-- Canonical vocabulary: outstanding | in_progress | complied | breached | waived.

CREATE OR REPLACE FUNCTION public.enforcement_obligation_set_status(_obligation_id uuid, _status text, _breach_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _case public.enforcement_actions;
  _before jsonb;
  _after jsonb;
BEGIN
  IF _status NOT IN ('outstanding','in_progress','complied','breached','waived') THEN
    RAISE EXCEPTION 'Unsupported obligation status: %', _status USING ERRCODE='22023';
  END IF;
  IF _status = 'breached' AND coalesce(length(btrim(_breach_note)),0) < 5 THEN
    RAISE EXCEPTION 'Breach note required (min 5 characters)' USING ERRCODE='22023';
  END IF;

  SELECT ea.* INTO _case
  FROM public.enforcement_actions ea
  JOIN public.enforcement_obligations o ON o.case_id = ea.id
  WHERE o.id = _obligation_id;
  IF _case.id IS NULL THEN
    RAISE EXCEPTION 'Obligation not found' USING ERRCODE='22023';
  END IF;
  IF NOT public.can_act_on_enforcement(_uid, _case.entity_id) THEN
    RAISE EXCEPTION 'You are not authorised for this enforcement case' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(o) INTO _before FROM public.enforcement_obligations o WHERE o.id=_obligation_id;
  UPDATE public.enforcement_obligations SET
    status = _status,
    breach_note = CASE WHEN _status='breached' THEN btrim(_breach_note) ELSE breach_note END,
    completed_at = CASE WHEN _status='complied' THEN now() ELSE NULL END,
    completed_by = CASE WHEN _status='complied' THEN _uid ELSE NULL END,
    updated_at = now()
  WHERE id=_obligation_id RETURNING to_jsonb(enforcement_obligations) INTO _after;

  PERFORM public.log_compliance_audit('UPDATE','enforcement_obligation',_obligation_id,_before,_after,_breach_note);
  RETURN _after;
END;
$function$;