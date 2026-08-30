CREATE OR REPLACE FUNCTION public.entity_currency_override_supersede(_profile_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row public.entity_currency_profiles;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.entity_currency_profiles WHERE id = _profile_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;
  -- An arrangement withdrawn today stops governing today: it is closed the day
  -- before, so resolution reverts to the regulator body's base currency at once,
  -- while the historical record itself is never deleted.
  UPDATE public.entity_currency_profiles
     SET status = CASE WHEN v_row.effective_from > CURRENT_DATE THEN 'WITHDRAWN' ELSE 'SUPERSEDED' END,
         superseded_at = now(),
         effective_to = CASE
           WHEN v_row.effective_from > CURRENT_DATE THEN effective_to
           ELSE LEAST(COALESCE(effective_to, CURRENT_DATE - 1), CURRENT_DATE - 1) END,
         reason = COALESCE(v_row.reason,'') || ' | superseded: ' || btrim(_reason)
   WHERE id = _profile_id;
  PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_SUPERSEDED',
    jsonb_build_object('entity_id', v_row.entity_id, 'regulator_id', v_row.regulator_id,
                       'reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id);
END $function$;
