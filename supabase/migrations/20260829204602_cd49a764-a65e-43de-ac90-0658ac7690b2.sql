-- F7-B: optional maker-checker governance for entity reporting-currency overrides.

ALTER TABLE public.monetary_configs
  ADD COLUMN IF NOT EXISTS entity_currency_override_approval_mode text NOT NULL DEFAULT 'DIRECT_AUTHORIZED';

DO $$ BEGIN
  ALTER TABLE public.monetary_configs
    ADD CONSTRAINT monetary_configs_ecoam_chk
    CHECK (entity_currency_override_approval_mode IN ('DIRECT_AUTHORIZED','MAKER_CHECKER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.entity_currency_profiles
  ADD COLUMN IF NOT EXISTS proposed_by uuid,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_by uuid,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS approval_mode text;

ALTER TABLE public.entity_currency_profiles DROP CONSTRAINT IF EXISTS ecp_status_chk;
ALTER TABLE public.entity_currency_profiles
  ADD CONSTRAINT ecp_status_chk
  CHECK (status IN ('PROPOSED','ACTIVE','REJECTED','SUPERSEDED','WITHDRAWN'));

CREATE INDEX IF NOT EXISTS idx_ecp_entity_status ON public.entity_currency_profiles(entity_id, status);

-- Resolve the configured approval mode for an entity's regulator.
CREATE OR REPLACE FUNCTION public.entity_currency_approval_mode(_entity_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_cfg public.monetary_configs;
BEGIN
  v_cfg := public.monetary_config_resolve(public.entity_reporting_regulator(_entity_id));
  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_MONETARY_CONFIG_MISSING' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(v_cfg.entity_currency_override_approval_mode, 'DIRECT_AUTHORIZED');
END $fn$;

REVOKE ALL ON FUNCTION public.entity_currency_approval_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_currency_approval_mode(uuid) TO authenticated, service_role;

-- Override maintenance honours the configured mode: DIRECT_AUTHORIZED activates
-- immediately (unchanged frozen behaviour), MAKER_CHECKER records a PROPOSED row
-- that the resolver ignores until an independent officer approves it.
CREATE OR REPLACE FUNCTION public.entity_currency_override_set(_entity_id uuid, _currency text, _effective_from date, _reason text, _effective_to date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid(); v_reg uuid; v_code text := upper(btrim(_currency));
  v_id uuid; v_prior uuid; v_mode text;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_ENTITY_NOT_RESOLVED' USING ERRCODE = 'P0002';
  END IF;
  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_EFFECTIVE_FROM_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_code AND is_active) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_INACTIVE:%', COALESCE(v_code,'?') USING ERRCODE = '22023';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);
  IF NOT public.currency_is_supported(v_code, v_reg) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_UNSUPPORTED:%', v_code USING ERRCODE = '22023';
  END IF;

  v_mode := public.entity_currency_approval_mode(_entity_id);

  IF v_mode = 'MAKER_CHECKER' THEN
    INSERT INTO public.entity_currency_profiles(
      entity_id, reporting_currency_override, effective_from, effective_to, status,
      reason, source, created_by, proposed_by, proposed_at, approval_mode)
    VALUES (_entity_id, v_code, _effective_from, _effective_to, 'PROPOSED',
            btrim(_reason), 'ENTITY_360', v_uid, v_uid, now(), v_mode)
    RETURNING id INTO v_id;

    PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_PROPOSED',
      jsonb_build_object('entity_id', _entity_id, 'currency', v_code,
                         'effective_from', _effective_from, 'effective_to', _effective_to,
                         'approval_mode', v_mode, 'reason', btrim(_reason)));

    RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id,
                              'currency', v_code, 'status', 'PROPOSED', 'approval_mode', v_mode);
  END IF;

  -- DIRECT_AUTHORIZED
  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id AND status = 'ACTIVE'
       AND (effective_to IS NULL OR effective_to >= _effective_from)
  LOOP
    UPDATE public.entity_currency_profiles
       SET status = 'SUPERSEDED', superseded_at = now(),
           effective_to = LEAST(COALESCE(effective_to, _effective_from - 1), _effective_from - 1)
     WHERE id = v_prior;
  END LOOP;

  INSERT INTO public.entity_currency_profiles(
    entity_id, reporting_currency_override, effective_from, effective_to, status,
    reason, source, created_by, approved_by, approved_at, approval_mode,
    proposed_by, proposed_at, decision_by, decision_at)
  VALUES (_entity_id, v_code, _effective_from, _effective_to, 'ACTIVE',
          btrim(_reason), 'ENTITY_360', v_uid, v_uid, now(), v_mode,
          v_uid, now(), v_uid, now())
  RETURNING id INTO v_id;

  UPDATE public.entity_currency_profiles SET superseded_by = v_id
   WHERE entity_id = _entity_id AND status = 'SUPERSEDED' AND superseded_by IS NULL;

  PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_SET',
    jsonb_build_object('entity_id', _entity_id, 'currency', v_code,
                       'effective_from', _effective_from, 'effective_to', _effective_to,
                       'approval_mode', v_mode, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id,
                            'currency', v_code, 'status', 'ACTIVE', 'approval_mode', v_mode);
END $fn$;

REVOKE ALL ON FUNCTION public.entity_currency_override_set(uuid, text, date, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_set(uuid, text, date, text, date) TO authenticated, service_role;

-- Independent decision on a proposed override. The proposer can never approve.
CREATE OR REPLACE FUNCTION public.entity_currency_override_decide(_profile_id uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid(); v_row public.entity_currency_profiles;
  v_dec text := upper(btrim(COALESCE(_decision,''))); v_prior uuid;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','approve')
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

  -- APPROVE: close overlapping actives, then activate.
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

-- Withdraw a proposal that has not been decided (maker or authorised officer).
CREATE OR REPLACE FUNCTION public.entity_currency_override_withdraw(_profile_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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
  IF v_row.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_PROPOSED' USING ERRCODE = '22023';
  END IF;
  UPDATE public.entity_currency_profiles
     SET status = 'WITHDRAWN', decision_by = v_uid, decision_at = now(),
         decision_reason = btrim(_reason)
   WHERE id = _profile_id;
  PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_WITHDRAWN',
    jsonb_build_object('entity_id', v_row.entity_id, 'reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'WITHDRAWN');
END $fn$;

REVOKE ALL ON FUNCTION public.entity_currency_override_withdraw(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_withdraw(uuid, text) TO authenticated, service_role;

-- Overview surfaces the configured mode and pending proposals for the UI.
CREATE OR REPLACE FUNCTION public.entity_currency_profile_overview(_entity_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_uid uuid := auth.uid(); v_res jsonb; v_hist jsonb;
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'licensee_management','view')
          OR public.has_permission(v_uid,'returns_management','view')
          OR public.entity_membership_capability(v_uid, _entity_id, 'returns.view')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_res := public.entity_reporting_currency_resolve(_entity_id, _as_of, NULL);
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.effective_from DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_hist FROM public.entity_currency_profiles p WHERE p.entity_id = _entity_id;
  RETURN v_res || jsonb_build_object(
    'can_manage', public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit'),
    'approval_mode', public.entity_currency_approval_mode(_entity_id),
    'current_user_id', v_uid,
    'pending_proposals', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
        FROM public.entity_currency_profiles p
       WHERE p.entity_id = _entity_id AND p.status = 'PROPOSED'), '[]'::jsonb),
    'history', v_hist,
    'mandated_definitions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('return_definition_id', d.id, 'code', d.code,
                                          'name', d.name, 'currency', d.mandatory_currency_code)
                       ORDER BY d.code)
        FROM public.return_definitions d
        JOIN public.entity_reporting_obligations o ON o.return_definition_id = d.id AND o.entity_id = _entity_id
       WHERE d.mandatory_currency_code IS NOT NULL), '[]'::jsonb));
END $fn$;

REVOKE ALL ON FUNCTION public.entity_currency_profile_overview(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_currency_profile_overview(uuid, date) TO authenticated, service_role;