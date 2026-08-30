-- ===========================================================================
-- F7-B blocker closure: strict regulator-body monetary scope.
-- Additive. The frozen general monetary_config_resolve() is untouched.
-- ===========================================================================

ALTER TABLE public.monetary_configs
  ADD COLUMN IF NOT EXISTS fx_platform_shared_rates_allowed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.monetary_configs.fx_platform_shared_rates_allowed IS
  'Governed policy: may platform-scoped (regulator_id IS NULL) exchange rates be used for this regulator body? Explicit shared-rate policy, never an accidental SQL fallback.';

-- ---------------------------------------------------------------------------
-- Strict regulator-body monetary configuration resolver.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monetary_config_resolve_strict(_regulator_id uuid)
RETURNS public.monetary_configs
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE c public.monetary_configs;
BEGIN
  IF _regulator_id IS NULL THEN
    RAISE EXCEPTION 'REGULATOR_BODY_REQUIRED' USING ERRCODE = '22023',
      DETAIL = 'A canonical regulator body is required for regulator-specific monetary resolution.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators r WHERE r.id = _regulator_id
                  AND lower(COALESCE(r.status,'')) = 'active') THEN
    RAISE EXCEPTION 'ENTITY_REGULATOR_INACTIVE:%', _regulator_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.monetary_configs
   WHERE regulator_id = _regulator_id AND is_active
   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
   LIMIT 1;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'REGULATOR_MONETARY_CONFIG_MISSING:%', _regulator_id USING ERRCODE = 'P0002',
      DETAIL = 'This regulator body has no active monetary configuration; the platform default must not be substituted.';
  END IF;
  IF c.base_currency IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.currencies x WHERE x.code = c.base_currency AND x.is_active) THEN
    RAISE EXCEPTION 'REGULATOR_MONETARY_CONFIG_INVALID:%', _regulator_id USING ERRCODE = '22023',
      DETAIL = 'The regulator base currency is missing or inactive.';
  END IF;
  IF c.reporting_currency IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.currencies x WHERE x.code = c.reporting_currency AND x.is_active) THEN
    RAISE EXCEPTION 'REGULATOR_MONETARY_CONFIG_INVALID:%', _regulator_id USING ERRCODE = '22023',
      DETAIL = 'The regulator consolidated reporting currency is inactive.';
  END IF;
  RETURN c;
END $function$;

REVOKE ALL ON FUNCTION public.monetary_config_resolve_strict(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monetary_config_resolve_strict(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Approval mode: strictly the resolved regulator body's own configuration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_currency_approval_mode(_entity_id uuid, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cfg public.monetary_configs; v_reg uuid := _regulator_id;
BEGIN
  IF v_reg IS NULL THEN
    v_reg := (public.entity_regulator_body_resolve(_entity_id, CURRENT_DATE, NULL, NULL)->>'regulator_id')::uuid;
  END IF;
  v_cfg := public.monetary_config_resolve_strict(v_reg);
  RETURN COALESCE(v_cfg.entity_currency_override_approval_mode, 'DIRECT_AUTHORIZED');
END $function$;

-- ---------------------------------------------------------------------------
-- Entity reporting currency: strict regulator monetary scope + explicit
-- return/regulator context consistency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_reporting_currency_resolve(_entity_id uuid, _as_of date DEFAULT CURRENT_DATE, _return_definition_id uuid DEFAULT NULL::uuid, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg uuid; v_regsrc text; v_body jsonb; v_defreg uuid;
  v_cfg public.monetary_configs;
  v_prof public.entity_currency_profiles; v_def public.return_definitions;
  v_cur text; v_src text; v_at date := COALESCE(_as_of, CURRENT_DATE);
BEGIN
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_ENTITY_NOT_RESOLVED' USING ERRCODE = 'P0002';
  END IF;

  IF _regulator_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id AND lower(COALESCE(status,'')) = 'active') THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_INACTIVE:%', _regulator_id USING ERRCODE = '22023';
    END IF;
    IF NOT public.entity_regulator_body_related(_entity_id, _regulator_id, v_at) THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_NOT_RELATED' USING ERRCODE = '42501';
    END IF;
    -- A browser-supplied regulator body can never override the return's own
    -- canonical regulatory context.
    IF _return_definition_id IS NOT NULL THEN
      v_defreg := (public.entity_regulator_body_resolve(_entity_id, v_at, _return_definition_id, NULL)->>'regulator_id')::uuid;
      IF v_defreg IS NOT NULL AND v_defreg <> _regulator_id THEN
        RAISE EXCEPTION 'RETURN_REGULATOR_CONTEXT_MISMATCH' USING ERRCODE = '22023',
          DETAIL = 'The regulator body supplied by the caller is not the regulator body of this return.';
      END IF;
    END IF;
    v_reg := _regulator_id; v_regsrc := 'EXPLICIT_CONTEXT';
  ELSE
    v_body := public.entity_regulator_body_resolve(_entity_id, v_at, _return_definition_id, NULL);
    v_reg := (v_body->>'regulator_id')::uuid;
    v_regsrc := v_body->>'source';
  END IF;

  -- Regulator body is authoritative; its own configuration is required.
  v_cfg := public.monetary_config_resolve_strict(v_reg);

  IF _return_definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.return_definitions WHERE id = _return_definition_id;
    IF v_def.mandatory_currency_code IS NOT NULL THEN
      v_cur := upper(v_def.mandatory_currency_code); v_src := 'RETURN_DEFINITION';
    END IF;
  END IF;

  IF v_cur IS NULL THEN
    SELECT * INTO v_prof FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id
       AND regulator_id = v_reg
       AND status IN ('ACTIVE','SUPERSEDED')
       AND effective_from <= v_at
       AND (effective_to IS NULL OR effective_to >= v_at)
     ORDER BY (status = 'ACTIVE') DESC, effective_from DESC, created_at DESC
     LIMIT 1;
    IF v_prof.id IS NOT NULL THEN
      v_cur := upper(v_prof.reporting_currency_override); v_src := 'ENTITY_OVERRIDE';
    END IF;
  END IF;

  IF v_cur IS NULL THEN
    v_cur := v_cfg.base_currency; v_src := 'REGULATOR_BASE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_cur AND is_active) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_INACTIVE:%', v_cur USING ERRCODE = '22023';
  END IF;
  IF v_src <> 'REGULATOR_BASE' AND NOT public.currency_is_supported(v_cur, v_reg) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_UNSUPPORTED:%', v_cur USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'entity_id', _entity_id,
    'regulator_id', v_reg, 'regulator_source', v_regsrc,
    'currency', v_cur, 'source', v_src, 'as_of', v_at,
    'entity_currency_profile_id', CASE WHEN v_src = 'ENTITY_OVERRIDE' THEN v_prof.id ELSE NULL END,
    'monetary_config_id', v_cfg.id,
    'monetary_config_scope', 'REGULATOR',
    'regulator_base_currency', v_cfg.base_currency,
    'regulator_reporting_currency', v_cfg.reporting_currency,
    'returns_fx_date_policy', v_cfg.returns_fx_date_policy);
END $function$;

-- ---------------------------------------------------------------------------
-- Exchange-rate resolution: regulator scope with explicit shared-rate policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fx_resolve_rate(_from text, _to text, _at date, _regulator_id uuid DEFAULT NULL::uuid, _policy_override text DEFAULT NULL::text)
RETURNS public.fx_rates
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.monetary_configs;
  r public.fx_rates;
  v_policy text;
  v_shared boolean := true;
  v_from text := upper(btrim(_from));
  v_to   text := upper(btrim(_to));
BEGIN
  IF v_from = v_to THEN
    RAISE EXCEPTION 'FX_NO_CONVERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _at IS NULL THEN
    RAISE EXCEPTION 'FX_EFFECTIVE_DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_from AND is_active)
     OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_to AND is_active) THEN
    RAISE EXCEPTION 'FX_CURRENCY_UNSUPPORTED' USING ERRCODE = '22023',
      DETAIL = format('Unknown or inactive currency in pair %s/%s', v_from, v_to);
  END IF;

  c := public.monetary_config_resolve(_regulator_id);
  v_policy := COALESCE(NULLIF(btrim(_policy_override),''), c.fx_resolution_policy);
  IF _regulator_id IS NOT NULL THEN
    v_shared := COALESCE((SELECT s.fx_platform_shared_rates_allowed
                            FROM public.monetary_configs s
                           WHERE s.regulator_id = _regulator_id AND s.is_active
                           LIMIT 1), true);
  END IF;

  SELECT * INTO r FROM public.fx_rates f
   WHERE f.status = 'APPROVED'
     AND f.from_currency = v_from AND f.to_currency = v_to
     AND (f.regulator_id = _regulator_id OR (f.regulator_id IS NULL AND v_shared))
     AND f.effective_from <= _at
     AND (f.effective_to IS NULL OR f.effective_to >= _at)
     AND (v_policy <> 'FIXED_RATE' OR f.regime = 'FIXED')
     AND (v_policy <> 'EXACT_DATE_REQUIRED' OR f.effective_from = _at OR f.regime = 'FIXED')
   ORDER BY (f.regulator_id IS NOT NULL) DESC, f.effective_from DESC, f.version DESC, f.created_at DESC
   LIMIT 1;

  IF r.id IS NULL THEN
    SELECT * INTO r FROM public.fx_rates f
     WHERE f.status = 'APPROVED'
       AND f.from_currency = v_to AND f.to_currency = v_from
       AND (f.regulator_id = _regulator_id OR (f.regulator_id IS NULL AND v_shared))
       AND f.effective_from <= _at
       AND (f.effective_to IS NULL OR f.effective_to >= _at)
       AND (v_policy <> 'FIXED_RATE' OR f.regime = 'FIXED')
       AND (v_policy <> 'EXACT_DATE_REQUIRED' OR f.effective_from = _at OR f.regime = 'FIXED')
     ORDER BY (f.regulator_id IS NOT NULL) DESC, f.effective_from DESC, f.version DESC, f.created_at DESC
     LIMIT 1;
  END IF;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'FX_RATE_NOT_FOUND' USING ERRCODE = '22023',
      DETAIL = format('No approved %s rate for %s/%s effective %s', v_policy, v_from, v_to, _at);
  END IF;
  RETURN r;
END $function$;

-- ---------------------------------------------------------------------------
-- Historical filing display: filing snapshot only, strict regulator config,
-- and the canonical FX engine result actually read correctly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_filing_metrics_display(_filing_id uuid, _mode text DEFAULT 'AS_REPORTED'::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); f record; v_mode text := upper(btrim(COALESCE(_mode,'AS_REPORTED')));
  v_target text; v_reg uuid; v_at date; v_rows jsonb := '[]'::jsonb; v_incomplete int := 0;
  r record; v_val numeric; v_status text; v_prov text; v_monprov text;
  v_cfg public.monetary_configs; v_conv jsonb;
BEGIN
  IF v_mode NOT IN ('AS_REPORTED','REGULATOR_BASE','CONSOLIDATED_REPORTING') THEN
    RAISE EXCEPTION 'RETURN_DISPLAY_MODE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT fi.*, p.period_end INTO f
    FROM public.return_filings fi
    JOIN public.reporting_periods p ON p.id = fi.reporting_period_id
   WHERE fi.id = _filing_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'RETURN_FILING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'returns_management','view')
          OR public.returns_can_view_filing_scope(f.entity_id)) THEN
    RAISE EXCEPTION 'RETURN_FILING_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Never re-resolve today's regulator body, officer assignment or currency
  -- for a filing that already carries its own provenance.
  v_reg := f.regulator_id;
  v_prov := CASE WHEN v_reg IS NULL THEN 'DATA_REMEDIATION_REQUIRED' ELSE 'FILING_SNAPSHOT' END;
  v_at := COALESCE(f.currency_as_of, f.period_end, CURRENT_DATE);
  v_monprov := 'NOT_REQUIRED';

  IF v_mode <> 'AS_REPORTED' AND v_reg IS NOT NULL THEN
    -- The monetary configuration of record is the one snapshotted on the
    -- filing, and it must belong to the filing's own regulator body.
    SELECT * INTO v_cfg FROM public.monetary_configs
     WHERE id = f.monetary_config_id AND regulator_id = v_reg;
    IF v_cfg.id IS NOT NULL THEN
      v_monprov := 'FILING_SNAPSHOT';
    ELSE
      BEGIN
        v_cfg := public.monetary_config_resolve_strict(v_reg);
        v_monprov := 'REGULATOR_CONFIG';
      EXCEPTION WHEN OTHERS THEN
        v_cfg := NULL; v_monprov := 'CONFIGURATION_REQUIRED';
      END;
    END IF;
  END IF;

  v_target := CASE
    WHEN v_mode = 'AS_REPORTED' THEN f.reporting_currency
    WHEN v_reg IS NULL OR v_cfg.id IS NULL THEN NULL
    WHEN v_mode = 'REGULATOR_BASE' THEN v_cfg.base_currency
    ELSE COALESCE(v_cfg.reporting_currency, v_cfg.base_currency) END;

  FOR r IN
    SELECT rm.code, rm.name, rm.unit, v.value_numeric
      FROM public.return_metric_values v
      JOIN public.return_filing_versions ver ON ver.id = v.return_filing_version_id
      JOIN public.regulatory_metrics rm ON rm.id = v.regulatory_metric_id
     WHERE ver.return_filing_id = _filing_id
     ORDER BY rm.code
  LOOP
    v_val := NULL; v_status := 'OK';
    IF r.value_numeric IS NULL THEN
      v_status := 'NOT_REPORTED';
    ELSIF v_target IS NULL OR f.reporting_currency IS NULL THEN
      v_status := 'UNCONVERTED';
    ELSIF v_target = f.reporting_currency THEN
      v_val := r.value_numeric;
    ELSE
      BEGIN
        v_conv := public.fx_convert(r.value_numeric, f.reporting_currency, v_target, v_at, v_reg, NULL);
        v_val := (v_conv->>'target_amount')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_val := NULL; v_status := 'UNCONVERTED';
      END;
      IF v_val IS NULL THEN v_status := 'UNCONVERTED'; END IF;
    END IF;

    IF v_status = 'UNCONVERTED' THEN v_incomplete := v_incomplete + 1; END IF;

    v_rows := v_rows || jsonb_build_object(
      'code', r.code, 'name', r.name, 'unit', r.unit,
      'as_reported', r.value_numeric,
      'as_reported_currency', f.reporting_currency,
      'display_currency', v_target,
      'display_value', v_val,
      'status', v_status);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'filing_id', _filing_id, 'mode', v_mode,
    'filing_currency', f.reporting_currency,
    'regulator_id', v_reg,
    'regulator_source', f.regulator_source,
    'regulator_provenance', v_prov,
    'monetary_config_id', CASE WHEN v_cfg.id IS NOT NULL THEN v_cfg.id ELSE f.monetary_config_id END,
    'monetary_provenance', v_monprov,
    'display_currency', v_target,
    'fx_as_of', v_at,
    'mixed_currency', (v_target IS DISTINCT FROM f.reporting_currency),
    'incomplete_count', v_incomplete,
    'summable', (v_incomplete = 0 AND v_target IS NOT NULL),
    'metrics', v_rows);
END $function$;

-- ---------------------------------------------------------------------------
-- Override history: every ACTIVE-closing write is regulator-body scoped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_currency_override_set(_entity_id uuid, _currency text, _effective_from date, _reason text, _effective_to date DEFAULT NULL::date, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_reg uuid; v_code text := upper(btrim(_currency));
  v_id uuid; v_prior uuid; v_mode text; v_closed uuid[] := '{}';
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

  IF _regulator_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id AND lower(COALESCE(status,'')) = 'active') THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_INACTIVE:%', _regulator_id USING ERRCODE = '22023';
    END IF;
    IF NOT public.entity_regulator_body_related(_entity_id, _regulator_id, _effective_from) THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_NOT_RELATED' USING ERRCODE = '42501';
    END IF;
    v_reg := _regulator_id;
  ELSE
    v_reg := (public.entity_regulator_body_resolve(_entity_id, _effective_from, NULL, NULL)->>'regulator_id')::uuid;
  END IF;
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'ENTITY_REGULATOR_UNRESOLVED' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.currency_is_supported(v_code, v_reg) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_UNSUPPORTED:%', v_code USING ERRCODE = '22023';
  END IF;

  -- Strict: the regulator body's own governance policy, never the platform row.
  v_mode := public.entity_currency_approval_mode(_entity_id, v_reg);

  IF v_mode = 'MAKER_CHECKER' THEN
    INSERT INTO public.entity_currency_profiles(
      entity_id, regulator_id, reporting_currency_override, effective_from, effective_to, status,
      reason, source, created_by, proposed_by, proposed_at, approval_mode)
    VALUES (_entity_id, v_reg, v_code, _effective_from, _effective_to, 'PROPOSED',
            btrim(_reason), 'ENTITY_360', v_uid, v_uid, now(), v_mode)
    RETURNING id INTO v_id;

    PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_PROPOSED',
      jsonb_build_object('entity_id', _entity_id, 'regulator_id', v_reg, 'currency', v_code,
                         'effective_from', _effective_from, 'effective_to', _effective_to,
                         'approval_mode', v_mode, 'reason', btrim(_reason)));

    RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id, 'regulator_id', v_reg,
                              'currency', v_code, 'status', 'PROPOSED', 'approval_mode', v_mode);
  END IF;

  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id AND regulator_id = v_reg AND status = 'ACTIVE'
       AND (effective_to IS NULL OR effective_to >= _effective_from)
  LOOP
    UPDATE public.entity_currency_profiles
       SET status = 'SUPERSEDED', superseded_at = now(),
           effective_to = LEAST(COALESCE(effective_to, _effective_from - 1), _effective_from - 1)
     WHERE id = v_prior;
    v_closed := v_closed || v_prior;
  END LOOP;

  INSERT INTO public.entity_currency_profiles(
    entity_id, regulator_id, reporting_currency_override, effective_from, effective_to, status,
    reason, source, created_by, approved_by, approved_at, approval_mode,
    proposed_by, proposed_at, decision_by, decision_at)
  VALUES (_entity_id, v_reg, v_code, _effective_from, _effective_to, 'ACTIVE',
          btrim(_reason), 'ENTITY_360', v_uid, v_uid, now(), v_mode,
          v_uid, now(), v_uid, now())
  RETURNING id INTO v_id;

  -- Only the rows this action actually closed are attributed to it.
  UPDATE public.entity_currency_profiles SET superseded_by = v_id
   WHERE id = ANY(v_closed) AND superseded_by IS NULL;

  PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_SET',
    jsonb_build_object('entity_id', _entity_id, 'regulator_id', v_reg, 'currency', v_code,
                       'effective_from', _effective_from, 'effective_to', _effective_to,
                       'approval_mode', v_mode, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id, 'regulator_id', v_reg,
                            'currency', v_code, 'status', 'ACTIVE', 'approval_mode', v_mode);
END $function$;

CREATE OR REPLACE FUNCTION public.entity_currency_override_decide(_profile_id uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      jsonb_build_object('entity_id', v_row.entity_id, 'regulator_id', v_row.regulator_id,
                         'currency', v_row.reporting_currency_override, 'reason', btrim(_reason)));
    RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'REJECTED');
  END IF;

  IF v_row.regulator_id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REGULATOR_SCOPE_REQUIRED' USING ERRCODE = '22023',
      DETAIL = 'This override predates regulator scoping and requires data remediation before activation.';
  END IF;

  -- Regulator-body scoped: activating for A can never close B's arrangement.
  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = v_row.entity_id
       AND regulator_id = v_row.regulator_id
       AND status = 'ACTIVE'
       AND id <> _profile_id
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
    jsonb_build_object('entity_id', v_row.entity_id, 'regulator_id', v_row.regulator_id,
                       'currency', v_row.reporting_currency_override,
                       'effective_from', v_row.effective_from, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'ACTIVE');
END $function$;

-- ---------------------------------------------------------------------------
-- Entity 360 overview: per regulator body, strict configuration visibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_currency_profile_overview(_entity_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_res jsonb; v_hist jsonb; v_bodies jsonb;
  v_regs jsonb := '[]'::jsonb; b jsonb; v_r jsonb; v_can boolean;
  v_cfg public.monetary_configs; v_mode text; v_cfgok boolean;
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'licensee_management','view')
          OR public.has_permission(v_uid,'returns_management','view')
          OR public.entity_membership_capability(v_uid, _entity_id, 'returns.view')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_can := public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit');
  v_bodies := public.entity_regulator_bodies(_entity_id, _as_of);

  FOR b IN SELECT * FROM jsonb_array_elements(v_bodies) LOOP
    BEGIN
      v_r := public.entity_reporting_currency_resolve(
               _entity_id, _as_of, NULL, (b->>'regulator_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_r := jsonb_build_object('ok', false, 'error', SQLERRM);
    END;

    v_cfgok := true; v_mode := NULL;
    BEGIN
      v_cfg := public.monetary_config_resolve_strict((b->>'regulator_id')::uuid);
      v_mode := COALESCE(v_cfg.entity_currency_override_approval_mode,'DIRECT_AUTHORIZED');
    EXCEPTION WHEN OTHERS THEN
      v_cfgok := false; v_cfg := NULL;
    END;

    v_regs := v_regs || jsonb_build_array(b || v_r || jsonb_build_object(
      'monetary_config_present', v_cfgok,
      'monetary_config_id', v_cfg.id,
      'base_currency', v_cfg.base_currency,
      'reporting_currency', v_cfg.reporting_currency,
      'configuration_required', NOT v_cfgok,
      'approval_mode', v_mode,
      'overrides', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.effective_from DESC, p.created_at DESC)
                               FROM public.entity_currency_profiles p
                              WHERE p.entity_id = _entity_id
                                AND p.regulator_id = (b->>'regulator_id')::uuid), '[]'::jsonb),
      'pending_proposals', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
                               FROM public.entity_currency_profiles p
                              WHERE p.entity_id = _entity_id
                                AND p.regulator_id = (b->>'regulator_id')::uuid
                                AND p.status = 'PROPOSED'), '[]'::jsonb)));
  END LOOP;

  BEGIN
    v_res := public.entity_reporting_currency_resolve(_entity_id, _as_of, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_res := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.effective_from DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_hist FROM public.entity_currency_profiles p WHERE p.entity_id = _entity_id;

  RETURN v_res || jsonb_build_object(
    'can_manage', v_can,
    'current_user_id', v_uid,
    'regulator_bodies', v_regs,
    'multi_regulator', (jsonb_array_length(v_bodies) > 1),
    'approval_mode', (v_regs->0->>'approval_mode'),
    'pending_proposals', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
        FROM public.entity_currency_profiles p
       WHERE p.entity_id = _entity_id AND p.status = 'PROPOSED'), '[]'::jsonb),
    'history', v_hist,
    'data_remediation_required', EXISTS (
      SELECT 1 FROM public.entity_currency_profiles p
       WHERE p.entity_id = _entity_id AND p.regulator_id IS NULL),
    'mandated_definitions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('return_definition_id', d.id, 'code', d.code,
                                          'name', d.name, 'currency', d.mandatory_currency_code)
                       ORDER BY d.code)
        FROM public.return_definitions d
        JOIN public.entity_reporting_obligations o ON o.return_definition_id = d.id AND o.entity_id = _entity_id
       WHERE d.mandatory_currency_code IS NOT NULL), '[]'::jsonb));
END $function$;