CREATE OR REPLACE FUNCTION public.supervisory_remediation_escalate(_action_id uuid, _reason text, _materiality text DEFAULT 'high'::text, _urgency text DEFAULT 'high'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_remediation_action; _f public.supervisory_finding;
        _attention uuid; _overdue boolean;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.remediation_manage',
            'supervisory_spine.edit','prudential_supervision.manage_remediation',
            'market_conduct.approve']);
  SELECT * INTO _row FROM public.supervisory_remediation_action WHERE id = _action_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: remediation action' USING ERRCODE='22023'; END IF;
  SELECT * INTO _f FROM public.supervisory_finding WHERE id = _row.finding_id;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);
  IF length(btrim(COALESCE(_reason,''))) < 20 THEN
    RAISE EXCEPTION 'an escalation basis of at least 20 characters is required' USING ERRCODE='22023'; END IF;

  _overdue := _row.target_date IS NOT NULL AND _row.target_date < current_date
              AND _row.status NOT IN ('EFFECTIVE','CLOSED');
  IF NOT _overdue AND _row.status NOT IN ('INEFFECTIVE','PARTIALLY_EFFECTIVE','REOPENED') THEN
    RAISE EXCEPTION 'escalation_not_available: the action is neither materially overdue nor ineffective'
      USING ERRCODE='22023'; END IF;

  -- governed escalation opportunity only: a supervisor still decides the response
  -- DEFECT FIX (Epic 3): supervisory_attention_open returns jsonb; take the id.
  _attention := (public.supervisory_attention_open(
    _title := 'Unresolved remediation: ' || _f.reference || ' (' || _row.reference || ')',
    _domain_code := _row.domain_code,
    _supervisory_basis := btrim(_reason),
    _origin_kind := 'UNRESOLVED_REMEDIATION',
    _entity_ids := ARRAY[_row.entity_id],
    _assessment_id := _f.assessment_id,
    _assessment_dimension_id := _f.assessment_dimension_id,
    _examination_id := _f.examination_id,
    _external_reference := _row.reference,
    _materiality := lower(_materiality),
    _urgency := lower(_urgency)) ->> 'id')::uuid;

  UPDATE public.supervisory_remediation_action
     SET escalated_attention_id = _attention,
         escalated_at = now(),
         escalated_by = _uid,
         updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.supervisory_remediation_event(remediation_action_id, event_type, notes, actor_id)
  VALUES (_action_id, 'ESCALATED', btrim(_reason), _uid);

  RETURN _attention;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.supervisory_remediation_escalate(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_remediation_escalate(uuid, text, text, text) TO authenticated, service_role;