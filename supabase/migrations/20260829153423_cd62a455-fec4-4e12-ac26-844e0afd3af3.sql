CREATE OR REPLACE FUNCTION public.fee_assessment_preview(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_lines jsonb;
  v_total numeric := 0;
BEGIN
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'You do not have access to the financial record of this application.';
  END IF;

  v_res := public.fee_assessment_resolve_lines(_application_id);
  v_lines := COALESCE(v_res->'lines', '[]'::jsonb);

  SELECT COALESCE(ROUND(sum((l->>'amount')::numeric), 2), 0) INTO v_total
    FROM jsonb_array_elements(v_lines) l;

  RETURN jsonb_build_object(
    'preview', true,
    'found', COALESCE((v_res->>'found')::boolean, false),
    'application_id', _application_id,
    'basis', v_res->>'basis',
    'resolution_source', v_res->>'source',
    'currency', COALESCE(v_res->>'currency', 'USD'),
    'lines', v_lines,
    'assessed_total', v_total,
    'config_snapshot', v_res->'config_snapshot');
END $function$;

REVOKE ALL ON FUNCTION public.fee_assessment_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_assessment_preview(uuid) TO authenticated, service_role;