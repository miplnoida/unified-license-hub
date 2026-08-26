-- =====================================================================
-- MC-02 part 4 : triage read model + automated evaluation recorder
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_complaint_triage(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.complaints;
  v_auto public.complaint_triage_evaluations;
  v_history jsonb;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'view');

  SELECT * INTO v_auto
    FROM public.complaint_triage_evaluations
   WHERE complaint_id = _complaint_id AND source IN ('auto','auto_retry')
   ORDER BY evaluated_at DESC
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'evaluated_at' DESC), '[]'::jsonb)
    INTO v_history
    FROM (
      SELECT jsonb_build_object(
               'id', e.id,
               'source', e.source,
               'rule_id', e.rule_id,
               'rule_name', r.name,
               'rule_version', e.rule_version,
               'consumer_harm', e.consumer_harm,
               'priority', e.priority,
               'conduct_risk_level', e.conduct_risk_level,
               'systemic_potential', e.systemic_potential,
               'sla_days', e.sla_days,
               'override_reason', e.override_reason,
               'evaluated_by', e.evaluated_by,
               'evaluated_by_name', p.full_name,
               'evaluated_at', e.evaluated_at,
               'input_snapshot', e.input_snapshot,
               'output_snapshot', e.output_snapshot
             ) AS x
        FROM public.complaint_triage_evaluations e
        LEFT JOIN public.conduct_triage_rules r ON r.id = e.rule_id
        LEFT JOIN public.profiles p ON p.id = e.evaluated_by
       WHERE e.complaint_id = _complaint_id
    ) s;

  RETURN jsonb_build_object(
    'complaint_id', c.id,
    'complaint_number', c.complaint_number,
    'updated_at', c.updated_at,
    'current', jsonb_build_object(
      'consumer_harm', c.consumer_harm,
      'priority', c.priority,
      'conduct_risk_level', c.conduct_risk_level,
      'systemic_potential', c.systemic_potential,
      'severity', c.severity,
      'sla_days', c.sla_days,
      'confirmation_status', c.triage_confirmation_status,
      'confirmed_at', c.triage_confirmed_at,
      'confirmed_by', c.triage_confirmed_by,
      'override_status', c.triage_override_status,
      'override_reason', c.triage_override_reason,
      'systemic_confirmed_at', c.systemic_confirmed_at
    ),
    'recommendation', CASE WHEN v_auto.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_auto.id,
      'rule_id', v_auto.rule_id,
      'rule_version', v_auto.rule_version,
      'consumer_harm', v_auto.consumer_harm,
      'priority', v_auto.priority,
      'conduct_risk_level', v_auto.conduct_risk_level,
      'systemic_potential', v_auto.systemic_potential,
      'sla_days', v_auto.sla_days,
      'evaluated_at', v_auto.evaluated_at,
      'input_snapshot', v_auto.input_snapshot,
      'output_snapshot', v_auto.output_snapshot
    ) END,
    'history', v_history,
    'capabilities', jsonb_build_object(
      'can_triage', public.has_complaint_perm(v_uid, 'triage'),
      'can_override', public.has_complaint_perm(v_uid, 'override_triage')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_complaint_triage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_complaint_triage(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Automated evaluation recorder (backend only).
-- The worker computes the recommendation from the published rule version
-- and records it here; human confirmation stays with complaint_triage_confirm.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_triage_record_evaluation(
  _complaint_id uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.complaints;
  v_harm text; v_priority text; v_risk text; v_sys text; v_sla int;
  v_rule uuid; v_rule_version_id uuid; v_rule_version int; v_source text;
  v_eval uuid;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not_authorized: automated triage evaluations are recorded by the backend only'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.complaints WHERE id = _complaint_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;

  v_source   := COALESCE(NULLIF(btrim(_payload->>'source'),''), 'auto');
  IF v_source NOT IN ('auto','auto_retry') THEN
    RAISE EXCEPTION 'Invalid automated triage source' USING ERRCODE = '22023';
  END IF;

  v_harm     := NULLIF(upper(btrim(coalesce(_payload->>'consumer_harm',''))), '');
  v_priority := NULLIF(lower(btrim(coalesce(_payload->>'priority',''))), '');
  v_risk     := NULLIF(upper(btrim(coalesce(_payload->>'conduct_risk_level',''))), '');
  v_sys      := NULLIF(upper(btrim(coalesce(_payload->>'systemic_potential',''))), '');
  v_sla      := NULLIF(_payload->>'sla_days','')::int;
  v_rule     := NULLIF(_payload->>'rule_id','')::uuid;
  v_rule_version_id := NULLIF(_payload->>'rule_version_id','')::uuid;
  v_rule_version    := NULLIF(_payload->>'rule_version','')::int;

  IF v_harm IS NOT NULL AND v_harm NOT IN ('LOW','MODERATE','HIGH','SEVERE') THEN
    RAISE EXCEPTION 'Invalid consumer harm level' USING ERRCODE = '22023'; END IF;
  IF v_priority IS NOT NULL AND v_priority NOT IN ('p1','p2','p3','p4') THEN
    RAISE EXCEPTION 'Invalid case priority' USING ERRCODE = '22023'; END IF;
  IF v_risk IS NOT NULL AND v_risk NOT IN ('LOW','MODERATE','HIGH','CRITICAL') THEN
    RAISE EXCEPTION 'Invalid conduct risk level' USING ERRCODE = '22023'; END IF;
  IF v_sys IS NOT NULL AND v_sys NOT IN ('INDIVIDUAL','RECURRING','POTENTIAL_SYSTEMIC') THEN
    RAISE EXCEPTION 'Automated triage may not confirm a systemic issue' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.complaint_triage_evaluations
    (complaint_id, source, rule_id, rule_version_id, rule_version, input_snapshot, output_snapshot,
     consumer_harm, priority, conduct_risk_level, systemic_potential, sla_days, evaluated_by)
  VALUES (_complaint_id, v_source, v_rule, v_rule_version_id, v_rule_version,
          public.complaint_triage_inputs(_complaint_id),
          COALESCE(_payload->'output_snapshot', jsonb_build_object(
            'consumer_harm', v_harm, 'priority', v_priority,
            'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
            'sla_days', v_sla, 'decided_by_human', false)),
          v_harm, v_priority, v_risk, v_sys, v_sla, NULL)
  RETURNING id INTO v_eval;

  -- The automated recommendation only pre-fills; it never marks triage confirmed.
  UPDATE public.complaints
     SET consumer_harm = COALESCE(consumer_harm, v_harm),
         priority = COALESCE(v_priority, priority),
         conduct_risk_level = COALESCE(conduct_risk_level, v_risk),
         systemic_potential = COALESCE(systemic_potential, v_sys),
         sla_days = COALESCE(v_sla, sla_days),
         triage_confirmation_status = COALESCE(triage_confirmation_status, 'PENDING_CONFIRMATION'),
         updated_at = now()
   WHERE id = _complaint_id;

  RETURN jsonb_build_object('evaluation_id', v_eval, 'source', v_source);
END;
$$;

REVOKE ALL ON FUNCTION public.complaint_triage_record_evaluation(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complaint_triage_record_evaluation(uuid, jsonb) TO service_role;