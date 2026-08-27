CREATE OR REPLACE FUNCTION public.complaint_triage_confirm(
  _complaint_id uuid, _payload jsonb, _expected_updated_at timestamp with time zone DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); c public.complaints;
  v_harm text; v_priority text; v_risk text; v_sys text; v_reason text; v_sla int;
  v_auto public.complaint_triage_evaluations; v_material boolean := false;
  v_status text; v_eval uuid; v_rule_version_id uuid; v_rule_version int;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'triage');

  IF NOT public.complaint_triage_gate_ok(_complaint_id) THEN
    RAISE EXCEPTION 'Triage can be confirmed only after jurisdiction is decided as within or partly within our role'
      USING ERRCODE = '22023';
  END IF;

  IF _expected_updated_at IS NOT NULL THEN
    PERFORM public._assert_complaint_fresh(_complaint_id, _expected_updated_at);
  END IF;

  v_harm     := NULLIF(upper(btrim(coalesce(_payload->>'consumer_harm',''))), '');
  v_priority := NULLIF(lower(btrim(coalesce(_payload->>'priority',''))), '');
  v_risk     := NULLIF(upper(btrim(coalesce(_payload->>'conduct_risk_level',''))), '');
  v_sys      := NULLIF(upper(btrim(coalesce(_payload->>'systemic_potential',''))), '');
  v_reason   := NULLIF(btrim(coalesce(_payload->>'override_reason','')), '');
  v_sla      := NULLIF(_payload->>'sla_days','')::int;

  IF v_harm IS NOT NULL AND v_harm NOT IN ('LOW','MODERATE','HIGH','SEVERE') THEN
    RAISE EXCEPTION 'Invalid consumer harm level' USING ERRCODE = '22023'; END IF;
  IF v_priority IS NOT NULL AND v_priority NOT IN ('p1','p2','p3','p4') THEN
    RAISE EXCEPTION 'Invalid case priority' USING ERRCODE = '22023'; END IF;
  IF v_risk IS NOT NULL AND v_risk NOT IN ('LOW','MODERATE','HIGH','CRITICAL') THEN
    RAISE EXCEPTION 'Invalid conduct risk level' USING ERRCODE = '22023'; END IF;
  IF v_sys IS NOT NULL AND v_sys NOT IN ('INDIVIDUAL','RECURRING','POTENTIAL_SYSTEMIC','CONFIRMED_SYSTEMIC') THEN
    RAISE EXCEPTION 'Invalid systemic potential' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_auto FROM public.complaint_triage_evaluations
   WHERE complaint_id = _complaint_id AND source IN ('auto','auto_retry')
   ORDER BY evaluated_at DESC LIMIT 1;

  -- A dimension is a MATERIAL OVERRIDE only when an automated recommendation
  -- actually exists for it and the supervisor departs from it. With no
  -- recommendation there is nothing to override: this is a first confirmation.
  v_material := (v_harm     IS NOT NULL AND v_auto.consumer_harm       IS NOT NULL AND v_harm     IS DISTINCT FROM v_auto.consumer_harm)
             OR (v_priority IS NOT NULL AND v_auto.priority            IS NOT NULL AND v_priority IS DISTINCT FROM v_auto.priority)
             OR (v_risk     IS NOT NULL AND v_auto.conduct_risk_level  IS NOT NULL AND v_risk     IS DISTINCT FROM v_auto.conduct_risk_level)
             OR (v_sys      IS NOT NULL AND v_auto.systemic_potential  IS NOT NULL AND v_sys      IS DISTINCT FROM v_auto.systemic_potential);

  IF v_material THEN
    IF NOT public.has_complaint_perm(v_uid, 'override_triage') THEN
      RAISE EXCEPTION 'not_authorized: complaint_management.override_triage' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'A reason of at least 10 characters is required to change the triage recommendation'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_sys = 'CONFIRMED_SYSTEMIC' THEN
    IF NOT public.has_complaint_perm(v_uid, 'override_triage') THEN
      RAISE EXCEPTION 'not_authorized: confirming a systemic issue requires triage override authority'
        USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'Confirming a systemic issue requires a written justification' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_status := CASE WHEN v_material THEN 'OVERRIDDEN' ELSE 'CONFIRMED' END;
  v_rule_version_id := v_auto.rule_version_id;
  v_rule_version := v_auto.rule_version;

  UPDATE public.complaints
     SET consumer_harm = COALESCE(v_harm, consumer_harm),
         priority = COALESCE(v_priority, priority),
         conduct_risk_level = COALESCE(v_risk, conduct_risk_level),
         systemic_potential = COALESCE(v_sys, systemic_potential),
         severity = COALESCE(public.complaint_harm_to_severity(v_harm), severity),
         sla_days = COALESCE(v_sla, sla_days),
         triage_confirmed_at = now(),
         triage_confirmed_by = v_uid,
         triage_confirmation_status = v_status,
         triage_override_status = CASE WHEN v_material THEN 'overridden' ELSE triage_override_status END,
         triage_override_reason = COALESCE(v_reason, triage_override_reason),
         systemic_confirmed_by = CASE WHEN v_sys = 'CONFIRMED_SYSTEMIC' THEN v_uid ELSE systemic_confirmed_by END,
         systemic_confirmed_at = CASE WHEN v_sys = 'CONFIRMED_SYSTEMIC' THEN now() ELSE systemic_confirmed_at END,
         updated_at = now()
   WHERE id = _complaint_id;

  INSERT INTO public.complaint_triage_evaluations
    (complaint_id, source, rule_id, rule_version_id, rule_version, input_snapshot, output_snapshot,
     consumer_harm, priority, conduct_risk_level, systemic_potential, sla_days, override_reason, evaluated_by)
  VALUES (_complaint_id,
          CASE WHEN v_material THEN 'manual_override' ELSE 'manual_confirm' END,
          c.triage_rule_id, v_rule_version_id, v_rule_version,
          public.complaint_triage_inputs(_complaint_id),
          jsonb_build_object('consumer_harm', v_harm, 'priority', v_priority,
                             'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
                             'sla_days', v_sla, 'decided_by_human', true,
                             'auto_recommendation', CASE WHEN v_auto.id IS NULL THEN NULL
                                                         ELSE v_auto.output_snapshot END),
          v_harm, v_priority, v_risk, v_sys, v_sla, v_reason, v_uid)
  RETURNING id INTO v_eval;

  PERFORM public.notification_enqueue_event('complaint_triage_completed','complaint',_complaint_id,
    jsonb_build_object('complaint_id', _complaint_id, 'complaint_number', c.complaint_number,
                       'priority', COALESCE(v_priority, c.priority),
                       'cta_url', '/complaints/' || _complaint_id, 'cta_label', 'Open complaint'),
    v_eval::text);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, CASE WHEN v_material THEN 'complaint.triage.overridden' ELSE 'complaint.triage.confirmed' END,
          'complaint', _complaint_id,
          jsonb_build_object('evaluation_id', v_eval, 'consumer_harm', v_harm, 'priority', v_priority,
                             'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
                             'rule_version', v_rule_version, 'reason', v_reason));

  RETURN jsonb_build_object('evaluation_id', v_eval, 'status', v_status);
END;
$$;