CREATE OR REPLACE FUNCTION public.returns_filing_metrics_display(_filing_id uuid, _mode text DEFAULT 'AS_REPORTED')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid(); f record; v_mode text := upper(btrim(COALESCE(_mode,'AS_REPORTED')));
  v_target text; v_reg uuid; v_at date; v_rows jsonb := '[]'::jsonb; v_incomplete int := 0;
  r record; v_val numeric; v_status text;
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

  v_reg := public.entity_reporting_regulator(f.entity_id);
  v_at := COALESCE(f.currency_as_of, f.period_end, CURRENT_DATE);
  v_target := CASE v_mode
    WHEN 'REGULATOR_BASE' THEN public.fx_base_currency(v_reg)
    WHEN 'CONSOLIDATED_REPORTING' THEN public.fx_reporting_currency(v_reg)
    ELSE f.reporting_currency END;

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
        v_val := (public.fx_convert(r.value_numeric, f.reporting_currency, v_target, v_at, v_reg, NULL)->>'amount')::numeric;
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
    'display_currency', v_target,
    'fx_as_of', v_at,
    'mixed_currency', (v_target IS DISTINCT FROM f.reporting_currency),
    'incomplete_count', v_incomplete,
    'summable', (v_incomplete = 0 AND v_target IS NOT NULL),
    'metrics', v_rows);
END $fn$;

REVOKE ALL ON FUNCTION public.returns_filing_metrics_display(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_filing_metrics_display(uuid, text) TO authenticated, service_role;