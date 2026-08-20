
-- ===== 1. Application RFI raise (atomic, governed) =====
CREATE OR REPLACE FUNCTION public.application_rfi_raise(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _rfi_id uuid; _app_id uuid; _item jsonb; _ord int := 0;
        _step_action_id uuid; _pause boolean; _summary text; _after jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT (public.has_permission(_uid,'application_management','workflow_action')
          OR public.has_permission(_uid,'application_management','edit')
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Application workflow permission required' USING ERRCODE='42501';
  END IF;

  _app_id := nullif(_payload->>'application_id','')::uuid;
  IF _app_id IS NULL THEN
    RAISE EXCEPTION 'application_id is required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id=_app_id) THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE='P0002';
  END IF;
  IF coalesce(jsonb_array_length(_payload->'items'),0) = 0 THEN
    RAISE EXCEPTION 'At least one information request item is required' USING ERRCODE='22023';
  END IF;

  _summary := nullif(btrim(coalesce(_payload->>'summary','')),'');
  _step_action_id := nullif(_payload->>'approval_step_action_id','')::uuid;
  _pause := coalesce((_payload->>'pause_sla')::boolean, false);

  INSERT INTO public.application_rfis (
    application_id, raised_by, due_at, summary, approval_step_action_id, status,
    sufficiency_evaluation_id, pauses_sla
  ) VALUES (
    _app_id, _uid,
    nullif(_payload->>'due_at','')::timestamptz,
    _summary,
    _step_action_id,
    'open',
    nullif(_payload->>'sufficiency_evaluation_id','')::uuid,
    coalesce((_payload->>'pauses_sla')::boolean, nullif(_payload->>'sufficiency_evaluation_id','') IS NOT NULL)
  ) RETURNING id INTO _rfi_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_payload->'items') LOOP
    IF coalesce(length(btrim(_item->>'prompt')),0) = 0 THEN
      RAISE EXCEPTION 'Every information request item needs a prompt' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.application_rfi_items (
      rfi_id, ordinal, prompt, question_type, required, item_due_at, response_status
    ) VALUES (
      _rfi_id, _ord, btrim(_item->>'prompt'),
      coalesce(nullif(_item->>'question_type',''),'text'),
      coalesce((_item->>'required')::boolean, true),
      nullif(_item->>'item_due_at','')::timestamptz,
      'pending'
    );
    _ord := _ord + 1;
  END LOOP;

  IF _pause AND _step_action_id IS NOT NULL THEN
    UPDATE public.approval_step_actions SET
      paused_at = now(),
      paused_reason = 'RFI raised: ' || coalesce(_summary,'awaiting applicant response'),
      resumed_at = NULL
    WHERE id = _step_action_id;
  END IF;

  SELECT to_jsonb(r) INTO _after FROM public.application_rfis r WHERE r.id=_rfi_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,
    'application_rfi', _rfi_id::text, NULL, _after, _summary);
  RETURN _after;
END; $$;

-- ===== 2. Workflow step configuration write (governed config) =====
CREATE OR REPLACE FUNCTION public.approval_step_config_write(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row jsonb; _n_actions int := 0; _n_entry int := 0; _n_notif int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT (public.has_permission(_uid,'workflow_management','edit')
          OR public.has_permission(_uid,'workflow_management','manage_config')
          OR public.has_permission(_uid,'workflow_management','publish')
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Workflow configuration permission required' USING ERRCODE='42501';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'step_actions','[]'::jsonb)) LOOP
    INSERT INTO public.approval_step_actions SELECT * FROM jsonb_populate_record(NULL::public.approval_step_actions, _row);
    _n_actions := _n_actions + 1;
  END LOOP;
  FOR _row IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'entry_notifications','[]'::jsonb)) LOOP
    INSERT INTO public.approval_step_entry_notifications SELECT * FROM jsonb_populate_record(NULL::public.approval_step_entry_notifications, _row);
    _n_entry := _n_entry + 1;
  END LOOP;
  FOR _row IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'action_notifications','[]'::jsonb)) LOOP
    INSERT INTO public.approval_action_notifications SELECT * FROM jsonb_populate_record(NULL::public.approval_action_notifications, _row);
    _n_notif := _n_notif + 1;
  END LOOP;

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,
    'approval_step_config', nullif(_payload->>'workflow_id','')::text, NULL,
    jsonb_build_object('step_actions',_n_actions,'entry_notifications',_n_entry,'action_notifications',_n_notif),
    'Workflow step configuration written');
  RETURN jsonb_build_object('step_actions',_n_actions,'entry_notifications',_n_entry,'action_notifications',_n_notif);
END; $$;

-- ===== 3. Payment verification =====
CREATE OR REPLACE FUNCTION public.application_payment_verify(_payment_id uuid, _application_id uuid, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb; _target uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT (public.has_permission(_uid,'fee_management','edit')
          OR public.has_permission(_uid,'application_management','approve')
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Payment verification permission required' USING ERRCODE='42501';
  END IF;

  IF _payment_id IS NOT NULL THEN
    SELECT id INTO _target FROM public.payments WHERE id=_payment_id;
  ELSIF _application_id IS NOT NULL THEN
    SELECT id INTO _target FROM public.payments WHERE application_id=_application_id ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF _target IS NULL THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE='P0002'; END IF;

  SELECT to_jsonb(p) INTO _before FROM public.payments p WHERE p.id=_target;
  UPDATE public.payments SET status='success', paid_at=now() WHERE id=_target
    RETURNING to_jsonb(payments) INTO _after;
  PERFORM public.log_compliance_audit('APPROVE'::compliance_audit_action,
    'payment', _target::text, _before, _after, nullif(btrim(coalesce(_note,'')),''));
  RETURN _after;
END; $$;

-- ===== 4. Refund decision (admin-only, reasoned) =====
CREATE OR REPLACE FUNCTION public.payment_refund_decide(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb; _payment_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_permission(_uid,'fee_management','edit')) THEN
    RAISE EXCEPTION 'Refund approval permission required' USING ERRCODE='42501';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Refund decision must be approved or rejected' USING ERRCODE='22023';
  END IF;
  IF coalesce(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'A refund decision rationale of at least 10 characters is required' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(r) INTO _before FROM public.refunds r WHERE r.id=_refund_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Refund request not found' USING ERRCODE='P0002'; END IF;
  IF _before->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'This refund request has already been decided' USING ERRCODE='22023';
  END IF;
  _payment_id := nullif(_before->>'payment_id','')::uuid;

  UPDATE public.refunds SET
    status = _decision,
    approved_by = CASE WHEN _decision='approved' THEN _uid ELSE approved_by END
  WHERE id=_refund_id RETURNING to_jsonb(refunds) INTO _after;

  IF _decision='approved' AND _payment_id IS NOT NULL THEN
    UPDATE public.payments SET status='refunded' WHERE id=_payment_id;
  END IF;

  PERFORM public.log_compliance_audit(
    (CASE WHEN _decision='approved' THEN 'APPROVE' ELSE 'REJECT' END)::compliance_audit_action,
    'payment_refund', _refund_id::text, _before, _after, btrim(_reason));
  RETURN _after;
END; $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('application_rfi_raise','approval_step_config_write',
                        'application_payment_verify','payment_refund_decide')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
