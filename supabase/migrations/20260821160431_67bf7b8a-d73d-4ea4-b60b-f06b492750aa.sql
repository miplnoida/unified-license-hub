-- =====================================================================
-- P04 A.6 / A.14–A.18 — governed operations, gates and read models
-- =====================================================================

-- ---------- A.15/A.16 fee resolution + assessment ---------------------
CREATE OR REPLACE FUNCTION public.license_fee_resolve(_license_id uuid, _matter_kind text, _action_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; out jsonb := '[]'::jsonb; b record;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  FOR b IN
    SELECT fb.*,
           (CASE WHEN fb.category_id  IS NOT NULL THEN 8 ELSE 0 END
          + CASE WHEN fb.sub_sector_id IS NOT NULL THEN 4 ELSE 0 END
          + CASE WHEN fb.sector_id    IS NOT NULL THEN 2 ELSE 0 END
          + CASE WHEN fb.action_key   IS NOT NULL THEN 1 ELSE 0 END) AS specificity,
           COALESCE(fb.amount_override, fc.amount, 0) AS resolved_amount,
           COALESCE(fb.currency, fc.currency, 'JMD')  AS resolved_currency
      FROM public.license_fee_bindings fb
      LEFT JOIN public.fee_configurations fc ON fc.id = fb.fee_configuration_id
     WHERE fb.is_active
       AND fb.matter_kind = _matter_kind
       AND (fb.action_key IS NULL OR _action_key IS NULL OR fb.action_key = _action_key)
       AND (fb.regulator_id  IS NULL OR fb.regulator_id  = l.regulator_id)
       AND (fb.sector_id     IS NULL OR fb.sector_id     = l.sector_id)
       AND (fb.sub_sector_id IS NULL OR fb.sub_sector_id = l.sub_sector_id)
       AND (fb.category_id   IS NULL OR fb.category_id   = l.category_id)
       AND (fb.license_type  IS NULL OR fb.license_type  = l.license_type)
     ORDER BY specificity DESC, fb.created_at
  LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(out) x
                WHERE COALESCE(x->>'fee_type_code','') = COALESCE(b.fee_type_code,'')) THEN
      CONTINUE; -- highest specificity wins per fee type
    END IF;
    out := out || jsonb_build_array(jsonb_build_object(
      'binding_id', b.id, 'fee_type_code', b.fee_type_code,
      'description', COALESCE(b.description, b.fee_type_code, 'Lifecycle fee'),
      'amount', b.resolved_amount, 'currency', b.resolved_currency,
      'blocking', b.blocking, 'payment_verification_required', b.payment_verification_required,
      'due_days', b.due_days, 'fee_configuration_id', b.fee_configuration_id,
      'matter_kind', b.matter_kind, 'action_key', b.action_key));
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.license_fee_assess(_license_id uuid, _matter_id uuid, _matter_kind text, _action_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); f jsonb; created int := 0;
BEGIN
  FOR f IN SELECT value FROM jsonb_array_elements(public.license_fee_resolve(_license_id, _matter_kind, _action_key)) LOOP
    IF EXISTS (SELECT 1 FROM public.license_fee_assessments a
                WHERE a.license_id = _license_id
                  AND a.matter_id IS NOT DISTINCT FROM _matter_id
                  AND COALESCE(a.fee_type_code,'') = COALESCE(f->>'fee_type_code','')
                  AND a.status <> 'void') THEN CONTINUE; END IF;
    INSERT INTO public.license_fee_assessments(
      license_id, matter_id, binding_id, matter_kind, fee_type_code, description, amount, currency,
      blocking, payment_verification_required, due_date, binding_snapshot, assessed_by)
    VALUES (_license_id, _matter_id, (f->>'binding_id')::uuid, _matter_kind, f->>'fee_type_code',
      f->>'description', COALESCE((f->>'amount')::numeric,0), COALESCE(f->>'currency','JMD'),
      COALESCE((f->>'blocking')::boolean,true), COALESCE((f->>'payment_verification_required')::boolean,true),
      current_date + COALESCE((f->>'due_days')::int,30), f, uid);
    created := created + 1;
  END LOOP;
  RETURN jsonb_build_object('assessed', created);
END $$;

-- ---------- A.17 payment record / verification / waiver ---------------
CREATE OR REPLACE FUNCTION public.license_fee_operation(_assessment_id uuid, _operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.license_fee_assessments WHERE id = _assessment_id;
  IF a IS NULL THEN RAISE EXCEPTION 'ASSESSMENT_NOT_FOUND' USING ERRCODE='22023'; END IF;

  IF _operation = 'record_payment' THEN
    IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    IF a.status NOT IN ('due') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL='Only a fee that is still due can have a payment recorded.'; END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'payment_reference','')),'') IS NULL THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='Payment reference is required.'; END IF;
    UPDATE public.license_fee_assessments
       SET status = CASE WHEN payment_verification_required THEN 'paid' ELSE 'verified' END,
           payment_reference = _payload->>'payment_reference',
           paid_at = now(), recorded_by = uid,
           verified_by = CASE WHEN payment_verification_required THEN NULL ELSE uid END,
           verified_at = CASE WHEN payment_verification_required THEN NULL ELSE now() END,
           updated_at = now()
     WHERE id = a.id;

  ELSIF _operation = 'verify_payment' THEN
    IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','approve')) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    IF a.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL='Only a recorded payment can be verified.'; END IF;
    IF a.recorded_by = uid AND NOT public.is_super_admin(uid) THEN
      RAISE EXCEPTION 'MAKER_CHECKER' USING ERRCODE='42501',
        DETAIL='The officer who recorded the payment cannot verify it.'; END IF;
    UPDATE public.license_fee_assessments
       SET status='verified', verified_by=uid, verified_at=now(), updated_at=now() WHERE id=a.id;

  ELSIF _operation = 'waive' THEN
    IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','approve')) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    IF a.status IN ('verified','waived','void') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL='This fee can no longer be waived.'; END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'reason','')),'') IS NULL THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A written waiver rationale is required.'; END IF;
    UPDATE public.license_fee_assessments
       SET status='waived', waived_by=uid, waived_at=now(), waiver_reason=_payload->>'reason', updated_at=now()
     WHERE id=a.id;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license_fee_' || _operation, 'license_fee_assessment', a.id,
          jsonb_build_object('license_id', a.license_id, 'matter_id', a.matter_id,
                             'fee_type_code', a.fee_type_code, 'payload', _payload));

  RETURN (SELECT to_jsonb(x) FROM public.license_fee_assessments x WHERE x.id = a.id);
END $$;

-- ---------- A.18 verification cases ----------------------------------
CREATE OR REPLACE FUNCTION public.license_verification_operation(_operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l record; tpl record; c record; it jsonb; v_case_id uuid; v_item record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF _operation = 'start' THEN
    SELECT * INTO l FROM public.licenses WHERE id = (_payload->>'license_id')::uuid;
    IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_verification_cases
                WHERE license_id=l.id AND matter_id IS NOT DISTINCT FROM (_payload->>'matter_id')::uuid
                  AND status='in_progress') THEN
      RAISE EXCEPTION 'ALREADY_OPEN' USING ERRCODE='22023', DETAIL='A verification case is already open.'; END IF;
    SELECT * INTO tpl FROM public.license_verification_templates
     WHERE is_active AND matter_kind = _payload->>'matter_kind'
       AND (license_type IS NULL OR license_type = l.license_type)
       AND (sector_id IS NULL OR sector_id = l.sector_id)
       AND (regulator_id IS NULL OR regulator_id = l.regulator_id)
     ORDER BY (category_check.x) DESC NULLS LAST, created_at
     LIMIT 1;
    IF tpl IS NULL THEN RAISE EXCEPTION 'NO_TEMPLATE' USING ERRCODE='22023',
      DETAIL='No active verification template is configured for this licence and matter kind.'; END IF;
    INSERT INTO public.license_verification_cases(license_id, matter_id, matter_kind, template_id,
      template_snapshot, started_by)
    VALUES (l.id, (_payload->>'matter_id')::uuid, _payload->>'matter_kind', tpl.id, to_jsonb(tpl), uid)
    RETURNING id INTO v_case_id;
    FOR it IN SELECT value FROM jsonb_array_elements(tpl.items) LOOP
      INSERT INTO public.license_verification_items(case_id, item_key, label, required)
      VALUES (v_case_id, it->>'key', COALESCE(it->>'label', it->>'key'), COALESCE((it->>'required')::boolean, true));
    END LOOP;
    RETURN jsonb_build_object('case_id', v_case_id);

  ELSIF _operation = 'record_item' THEN
    SELECT * INTO v_item FROM public.license_verification_items WHERE id = (_payload->>'item_id')::uuid;
    IF v_item IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF (_payload->>'result') NOT IN ('satisfied','not_satisfied','not_applicable') THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A valid verification result is required.'; END IF;
    UPDATE public.license_verification_items
       SET result = _payload->>'result', note = _payload->>'note',
           evidence_document_id = NULLIF(_payload->>'evidence_document_id','')::uuid,
           recorded_by = uid, recorded_at = now()
     WHERE id = v_item.id;
    RETURN jsonb_build_object('ok', true);

  ELSIF _operation = 'complete' THEN
    SELECT * INTO c FROM public.license_verification_cases WHERE id = (_payload->>'case_id')::uuid;
    IF c IS NULL THEN RAISE EXCEPTION 'CASE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_verification_items
                WHERE case_id=c.id AND required AND result IS NULL) THEN
      RAISE EXCEPTION 'INCOMPLETE' USING ERRCODE='22023',
        DETAIL='All required verification items must be recorded before completion.'; END IF;
    UPDATE public.license_verification_cases
       SET status='completed', completed_by=uid, completed_at=now(), updated_at=now(),
           outcome = CASE WHEN EXISTS (SELECT 1 FROM public.license_verification_items
                                        WHERE case_id=c.id AND result='not_satisfied')
                          THEN 'deficiencies_identified' ELSE 'satisfied' END
     WHERE id=c.id;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
END $$;

-- ---------- gates consumed by the lifecycle step ---------------------
CREATE OR REPLACE FUNCTION public.license_lifecycle_gates(_license_id uuid, _matter_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
             'key','fee_outstanding',
             'label', 'Fee outstanding: ' || COALESCE(a.description,'lifecycle fee')
                      || ' (' || a.currency || ' ' || to_char(a.amount,'FM999,999,999.00') || ')',
             'href', '/licenses/' || a.license_id || '?tab=fees') AS b
      FROM public.license_fee_assessments a
     WHERE a.license_id = _license_id
       AND (_matter_id IS NULL OR a.matter_id IS NOT DISTINCT FROM _matter_id)
       AND a.blocking AND a.status IN ('due','paid')
    UNION ALL
    SELECT jsonb_build_object('key','verification_incomplete',
             'label','Verification case not completed',
             'href','/licenses/' || c.license_id || '?tab=verification')
      FROM public.license_verification_cases c
     WHERE c.license_id = _license_id
       AND (_matter_id IS NULL OR c.matter_id IS NOT DISTINCT FROM _matter_id)
       AND c.status = 'in_progress'
  ) s;
$$;

REVOKE ALL ON FUNCTION public.license_fee_resolve(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.license_fee_assess(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.license_fee_operation(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.license_verification_operation(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.license_lifecycle_gates(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_fee_resolve(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.license_fee_assess(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.license_fee_operation(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.license_verification_operation(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_gates(uuid, uuid) TO authenticated, service_role;