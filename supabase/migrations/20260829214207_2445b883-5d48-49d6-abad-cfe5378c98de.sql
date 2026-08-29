CREATE OR REPLACE FUNCTION public.entity_reporting_currency_resolve(_entity_id uuid, _as_of date DEFAULT CURRENT_DATE, _return_definition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg uuid; v_cfg public.monetary_configs; v_prof public.entity_currency_profiles;
  v_def public.return_definitions; v_cur text; v_src text; v_at date := COALESCE(_as_of, CURRENT_DATE);
BEGIN
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_ENTITY_NOT_RESOLVED' USING ERRCODE = 'P0002';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);
  v_cfg := public.monetary_config_resolve(v_reg);
  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_MONETARY_CONFIG_MISSING' USING ERRCODE = 'P0002';
  END IF;

  IF _return_definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.return_definitions WHERE id = _return_definition_id;
    IF v_def.mandatory_currency_code IS NOT NULL THEN
      v_cur := upper(v_def.mandatory_currency_code); v_src := 'RETURN_DEFINITION';
    END IF;
  END IF;

  IF v_cur IS NULL THEN
    -- Effective-dated resolution: an arrangement that has since been superseded
    -- still governs the dates it actually covered. Proposals, rejections and
    -- withdrawn-before-effect records never govern anything. A live arrangement
    -- always outranks a superseded one for the same date.
    SELECT * INTO v_prof FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id
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
    'ok', true, 'entity_id', _entity_id, 'regulator_id', v_reg,
    'currency', v_cur, 'source', v_src, 'as_of', v_at,
    'entity_currency_profile_id', CASE WHEN v_src = 'ENTITY_OVERRIDE' THEN v_prof.id ELSE NULL END,
    'monetary_config_id', v_cfg.id,
    'regulator_base_currency', v_cfg.base_currency,
    'regulator_reporting_currency', v_cfg.reporting_currency,
    'returns_fx_date_policy', v_cfg.returns_fx_date_policy);
END $function$;