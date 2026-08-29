CREATE OR REPLACE FUNCTION public.entity_currency_override_decide(_profile_id uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid(); v_row public.entity_currency_profiles;
  v_dec text := upper(btrim(COALESCE(_decision,''))); v_prior uuid;
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_dec NOT IN ('APPROVE','REJECT') THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_DECISION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.entity_currency_profiles WHERE id = _profile_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_PROPOSED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_row.proposed_by, v_row.created_by) = v_uid AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_SELF_APPROVAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_dec = 'REJECT' THEN
    UPDATE public.entity_currency_profiles
       SET status = 'REJECTED', decision_by = v_uid, decision_at = now(),
           decision_reason = btrim(_reason)
     WHERE id = _profile_id;
    PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_REJECTED',
      jsonb_build_object('entity_id', v_row.entity_id, 'currency', v_row.reporting_currency_override,
                         'reason', btrim(_reason)));
    RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'REJECTED');
  END IF;

  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = v_row.entity_id AND status = 'ACTIVE'
       AND (effective_to IS NULL OR effective_to >= v_row.effective_from)
  LOOP
    UPDATE public.entity_currency_profiles
       SET status = 'SUPERSEDED', superseded_at = now(), superseded_by = _profile_id,
           effective_to = LEAST(COALESCE(effective_to, v_row.effective_from - 1), v_row.effective_from - 1)
     WHERE id = v_prior;
  END LOOP;

  UPDATE public.entity_currency_profiles
     SET status = 'ACTIVE', approved_by = v_uid, approved_at = now(),
         decision_by = v_uid, decision_at = now(), decision_reason = btrim(_reason)
   WHERE id = _profile_id;

  PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_APPROVED',
    jsonb_build_object('entity_id', v_row.entity_id, 'currency', v_row.reporting_currency_override,
                       'effective_from', v_row.effective_from, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'ACTIVE');
END $fn$;

REVOKE ALL ON FUNCTION public.entity_currency_override_decide(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_decide(uuid, text, text) TO authenticated, service_role;