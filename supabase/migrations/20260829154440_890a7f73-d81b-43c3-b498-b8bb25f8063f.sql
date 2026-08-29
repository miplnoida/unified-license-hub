-- ===========================================================================
-- F6: preview/assessment monetary semantic parity + fee-component authority
-- ===========================================================================

-- 1. fee_assessment_preview: total ONLY blocking/payable lines, exactly as
--    fee_assessment_ensure() does when it raises the assessment of record.
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

  -- IDENTICAL monetary semantics to fee_assessment_ensure(): blocking lines only.
  SELECT ROUND(COALESCE(sum((l->>'amount')::numeric), 0), 2) INTO v_total
    FROM jsonb_array_elements(v_lines) l
   WHERE COALESCE((l->>'blocking')::boolean, true);

  RETURN jsonb_build_object(
    'preview', true,
    'found', COALESCE((v_res->>'found')::boolean, false),
    'application_id', _application_id,
    'basis', v_res->>'basis',
    'resolution_source', v_res->>'source',
    'currency', COALESCE(v_res->>'currency', 'USD'),
    'lines', v_lines,
    'assessed_total', v_total,
    'blocking_total', v_total,
    'config_snapshot', v_res->'config_snapshot');
END $function$;

REVOKE ALL ON FUNCTION public.fee_assessment_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_assessment_preview(uuid) TO authenticated, service_role;

-- 2. fee_component_operation: single catalogued F6 authority (fee_management.edit
--    via fee_can_administer). The application_management.edit fallback is removed
--    so the UI guard, the RPC authority and the RBAC audit agree. Also accepts
--    'component_id' as an alias for 'id' in the payload.
CREATE OR REPLACE FUNCTION public.fee_component_operation(_application_id uuid, _operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_id uuid; v_amount numeric; v_ft uuid; v_before jsonb; v_paid numeric;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501',
      DETAIL='Fee administration permission (fee_management.edit) is required to change fee components.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id = _application_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT COALESCE(sum(al.amount),0) INTO v_paid
    FROM public.fee_payment_allocations al
    JOIN public.fee_assessments fa ON fa.id = al.assessment_id
   WHERE fa.application_id = _application_id AND al.reversed_at IS NULL;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'ASSESSMENT_SETTLED' USING ERRCODE='22023',
      DETAIL='Fees cannot be re-itemised after a payment has been allocated.';
  END IF;

  IF _operation = 'add' THEN
    v_ft := NULLIF(btrim(COALESCE(_payload->>'fee_type_id','')),'')::uuid;
    v_amount := ROUND(COALESCE((_payload->>'amount')::numeric, -1), 2);
    IF v_ft IS NULL THEN RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='Fee type is required.'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023', DETAIL='Amount must be greater than zero.'; END IF;
    IF EXISTS (SELECT 1 FROM public.fee_components WHERE application_id=_application_id AND fee_type_id=v_ft) THEN
      RAISE EXCEPTION 'DUPLICATE_FEE_TYPE' USING ERRCODE='23505', DETAIL='That fee type is already itemised.';
    END IF;
    INSERT INTO public.fee_components(application_id, fee_type_id, amount, description)
    VALUES (_application_id, v_ft, v_amount, NULLIF(btrim(COALESCE(_payload->>'description','')),''))
    RETURNING id INTO v_id;

  ELSIF _operation = 'update' THEN
    v_id := NULLIF(btrim(COALESCE(_payload->>'id', _payload->>'component_id','')),'')::uuid;
    v_amount := ROUND(COALESCE((_payload->>'amount')::numeric, -1), 2);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023', DETAIL='Amount must be greater than zero.'; END IF;
    SELECT to_jsonb(f) INTO v_before FROM public.fee_components f WHERE f.id = v_id AND f.application_id = _application_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'COMPONENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    UPDATE public.fee_components
       SET amount = v_amount, description = NULLIF(btrim(COALESCE(_payload->>'description','')),'')
     WHERE id = v_id;

  ELSIF _operation = 'remove' THEN
    v_id := NULLIF(btrim(COALESCE(_payload->>'id', _payload->>'component_id','')),'')::uuid;
    SELECT to_jsonb(f) INTO v_before FROM public.fee_components f WHERE f.id = v_id AND f.application_id = _application_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'COMPONENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    DELETE FROM public.fee_components WHERE id = v_id;

  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
  END IF;

  -- the itemisation changed: void the un-settled assessment so the next read re-assesses
  PERFORM public.fee_assessment_supersede(_application_id, 'Fee itemisation changed (' || _operation || ')');

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fee.component.' || _operation, 'fee_component', COALESCE(v_id, _application_id),
          v_before, jsonb_build_object('application_id', _application_id, 'payload', _payload));

  RETURN jsonb_build_object('ok', true, 'operation', _operation, 'component_id', v_id);
END $function$;

REVOKE ALL ON FUNCTION public.fee_component_operation(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_component_operation(uuid, text, jsonb) TO authenticated, service_role;