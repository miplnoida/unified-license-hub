CREATE OR REPLACE FUNCTION public.enforcement_penalty_currency_override(
  _case_id uuid,
  _currency text,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_case public.enforcement_actions;
  v_before jsonb;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_case FROM public.enforcement_actions WHERE id = _case_id FOR UPDATE;
  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'Enforcement case not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_read_enforcement(v_uid, v_case.entity_id) THEN
    RAISE EXCEPTION 'You are not authorised for this enforcement case' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_uid, 'enforcement_management', 'decide') THEN
    RAISE EXCEPTION 'Only an enforcement decision maker may denominate a penalty in a non-base currency'
      USING ERRCODE = '42501';
  END IF;
  IF v_case.penalty_currency_set_at IS NOT NULL AND coalesce(v_case.penalty_amount,0) > 0 THEN
    RAISE EXCEPTION 'ENFORCEMENT_PENALTY_CURRENCY_IMMUTABLE' USING ERRCODE = '22023',
      DETAIL = 'The sanction currency is already fixed and cannot be rewritten.';
  END IF;

  -- validates policy, allowed list, currency master, regulator scope and reason
  v_res := public.enforcement_penalty_currency_resolve(v_case.entity_id, _currency, _reason, CURRENT_DATE);

  v_before := to_jsonb(v_case);
  UPDATE public.enforcement_actions
     SET penalty_currency_reason = btrim(_reason),
         penalty_currency = v_res->>'currency',
         updated_at = now()
   WHERE id = _case_id;

  PERFORM public.log_compliance_audit_as_actor(
    v_uid, 'UPDATE'::compliance_audit_action, 'enforcement_actions', _case_id::text,
    v_before, (SELECT to_jsonb(e) FROM public.enforcement_actions e WHERE e.id = _case_id),
    btrim(_reason), NULL, NULL, NULL,
    jsonb_build_object('process','P11','action','PENALTY_CURRENCY_OVERRIDE','resolution', v_res));

  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.enforcement_penalty_currency_override(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_penalty_currency_override(uuid, text, text) TO authenticated, service_role;