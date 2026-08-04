CREATE OR REPLACE FUNCTION public.engine_rule_alert_transition(
  _alert_id uuid, _to_status text, _note text DEFAULT NULL, _assign_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.engine_rule_alerts;
  v_before jsonb;
  v_from text;
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_allowed text[];
BEGIN
  SELECT * INTO v_row FROM public.engine_rule_alerts WHERE id = _alert_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'alert_not_found'; END IF;

  v_manage := public.can_manage_rule_engine(v_uid);
  IF NOT v_manage AND coalesce(v_row.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(v_uid, '11111111-1111-1111-1111-111111111111'::uuid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_from := coalesce(v_row.status, 'open');
  v_allowed := CASE v_from
    WHEN 'open'         THEN ARRAY['acknowledged','assigned','closed']
    WHEN 'acknowledged' THEN ARRAY['assigned','resolved','closed']
    WHEN 'assigned'     THEN ARRAY['resolved','closed']
    WHEN 'resolved'     THEN ARRAY['closed']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (_to_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_transition:% ->%', v_from, _to_status;
  END IF;
  IF _to_status = 'assigned' AND _assign_to IS NULL THEN
    RAISE EXCEPTION 'assignee_required';
  END IF;

  v_before := to_jsonb(v_row);

  UPDATE public.engine_rule_alerts SET
    status = _to_status,
    acknowledged_by = CASE WHEN _to_status = 'acknowledged' THEN v_uid ELSE acknowledged_by END,
    acknowledged_at = CASE WHEN _to_status = 'acknowledged' THEN now() ELSE acknowledged_at END,
    assigned_to     = CASE WHEN _to_status = 'assigned' THEN _assign_to ELSE assigned_to END,
    assigned_by     = CASE WHEN _to_status = 'assigned' THEN v_uid ELSE assigned_by END,
    assigned_at     = CASE WHEN _to_status = 'assigned' THEN now() ELSE assigned_at END,
    resolved_by     = CASE WHEN _to_status = 'resolved' THEN v_uid ELSE resolved_by END,
    resolved_at     = CASE WHEN _to_status = 'resolved' THEN now() ELSE resolved_at END,
    closed_by       = CASE WHEN _to_status = 'closed' THEN v_uid ELSE closed_by END,
    closed_at       = CASE WHEN _to_status = 'closed' THEN now() ELSE closed_at END,
    updated_at = now()
  WHERE id = _alert_id RETURNING * INTO v_row;

  INSERT INTO public.engine_rule_lifecycle_events (
    target_type, target_id, rule_id, version, from_status, to_status, note,
    actor_id, actor_role, correlation_id
  ) VALUES (
    'alert', _alert_id, v_row.rule_id, v_row.version, v_from, _to_status, nullif(btrim(coalesce(_note,'')),''),
    v_uid, public.resolve_actor_role(v_uid), v_row.correlation_id
  );

  PERFORM public.create_audit_log(
    v_uid, 'RULE_ALERT_' || upper(_to_status), 'engine_rule_alert', _alert_id::text, v_before,
    jsonb_build_object('from_status', v_from, 'to_status', _to_status, 'note', _note,
      'rule_id', v_row.rule_id, 'version', v_row.version, 'rule_family', 'shared_engine',
      'correlation_id', v_row.correlation_id, 'source_event_id', v_row.source_event_id,
      'action_index', v_row.action_index)
  );

  RETURN jsonb_build_object('ok', true, 'alert', to_jsonb(v_row));
END; $fn$;

CREATE OR REPLACE FUNCTION public.engine_rule_task_transition(
  _task_id uuid, _to_status text, _note text DEFAULT NULL, _assign_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.engine_rule_tasks;
  v_before jsonb;
  v_from text;
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_allowed text[];
BEGIN
  SELECT * INTO v_row FROM public.engine_rule_tasks WHERE id = _task_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'task_not_found'; END IF;

  v_manage := public.can_manage_rule_engine(v_uid);
  IF NOT v_manage AND coalesce(v_row.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(v_uid, '11111111-1111-1111-1111-111111111111'::uuid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_from := coalesce(v_row.status, 'open');
  v_allowed := CASE v_from
    WHEN 'open'        THEN ARRAY['in_progress','completed','cancelled']
    WHEN 'in_progress' THEN ARRAY['completed','cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (_to_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_transition:% ->%', v_from, _to_status;
  END IF;

  v_before := to_jsonb(v_row);

  UPDATE public.engine_rule_tasks SET
    status = _to_status,
    assigned_to  = coalesce(_assign_to, assigned_to),
    started_at   = CASE WHEN _to_status = 'in_progress' THEN now() ELSE started_at END,
    started_by   = CASE WHEN _to_status = 'in_progress' THEN v_uid ELSE started_by END,
    completed_by = CASE WHEN _to_status = 'completed' THEN v_uid ELSE completed_by END,
    completed_at = CASE WHEN _to_status = 'completed' THEN now() ELSE completed_at END,
    cancelled_by = CASE WHEN _to_status = 'cancelled' THEN v_uid ELSE cancelled_by END,
    cancelled_at = CASE WHEN _to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = _task_id RETURNING * INTO v_row;

  INSERT INTO public.engine_rule_lifecycle_events (
    target_type, target_id, rule_id, version, from_status, to_status, note,
    actor_id, actor_role, correlation_id
  ) VALUES (
    'task', _task_id, v_row.rule_id, v_row.version, v_from, _to_status, nullif(btrim(coalesce(_note,'')),''),
    v_uid, public.resolve_actor_role(v_uid), v_row.correlation_id
  );

  PERFORM public.create_audit_log(
    v_uid, 'RULE_TASK_' || upper(_to_status), 'engine_rule_task', _task_id::text, v_before,
    jsonb_build_object('from_status', v_from, 'to_status', _to_status, 'note', _note,
      'rule_id', v_row.rule_id, 'version', v_row.version, 'rule_family', 'shared_engine',
      'correlation_id', v_row.correlation_id, 'source_event_id', v_row.source_event_id,
      'action_index', v_row.action_index)
  );

  RETURN jsonb_build_object('ok', true, 'task', to_jsonb(v_row));
END; $fn$;