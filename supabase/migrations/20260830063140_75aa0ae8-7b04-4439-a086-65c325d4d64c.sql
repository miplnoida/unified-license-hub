CREATE OR REPLACE FUNCTION public.entity_currency_override_supersede(_profile_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row public.entity_currency_profiles; v_status text; v_to date;
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

  -- Not yet in force, or withdrawn on the very day it began: it never governed
  -- any reporting date, so it is withdrawn and its stored window is untouched.
  IF v_row.effective_from >= CURRENT_DATE THEN
    v_status := 'WITHDRAWN'; v_to := v_row.effective_to;
  ELSE
    -- Already in force: it stops governing today, so it is closed yesterday.
    v_status := 'SUPERSEDED';
    v_to := LEAST(COALESCE(v_row.effective_to, CURRENT_DATE - 1), CURRENT_DATE - 1);
  END IF;

  UPDATE public.entity_currency_profiles
     SET status = v_status,
         superseded_at = now(),
         effective_to = v_to,
         reason = COALESCE(v_row.reason,'') || ' | superseded: ' || btrim(_reason)
   WHERE id = _profile_id;
  PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_SUPERSEDED',
    jsonb_build_object('entity_id', v_row.entity_id, 'regulator_id', v_row.regulator_id,
                       'status', v_status, 'reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', v_status);
END $function$;
