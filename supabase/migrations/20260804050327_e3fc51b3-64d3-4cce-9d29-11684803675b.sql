-- ============================================================
-- Rule Engine: tester metadata, lifecycle history, idempotency
-- ============================================================

ALTER TABLE public.engine_rule_tests
  ADD COLUMN IF NOT EXISTS run_mode text NOT NULL DEFAULT 'current_snapshot',
  ADD COLUMN IF NOT EXISTS target_version integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.engine_rule_alerts
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.engine_rule_tasks
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- ---------- lifecycle transition history ----------
CREATE TABLE IF NOT EXISTS public.engine_rule_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('alert','task','suppression')),
  target_id uuid NOT NULL,
  rule_id uuid REFERENCES public.engine_rules(id) ON DELETE CASCADE,
  version integer,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_id uuid,
  actor_role text,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.engine_rule_lifecycle_events TO authenticated;
GRANT ALL ON public.engine_rule_lifecycle_events TO service_role;
ALTER TABLE public.engine_rule_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rule lifecycle events readable by rule engine viewers" ON public.engine_rule_lifecycle_events;
CREATE POLICY "rule lifecycle events readable by rule engine viewers"
  ON public.engine_rule_lifecycle_events FOR SELECT TO authenticated
  USING (public.can_view_rule_engine(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_engine_rule_lifecycle_target
  ON public.engine_rule_lifecycle_events (target_type, target_id, created_at DESC);

-- ---------- exactly-once guards ----------
CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_rule_exec_idem
  ON public.engine_rule_executions (
    rule_id, version, source_event_id,
    (coalesce(entity_key, coalesce(entity_id::text, 'global')))
  )
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_rule_action_idem
  ON public.engine_rule_action_results (execution_id, action_index);

CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_rule_alert_idem
  ON public.engine_rule_alerts (
    rule_id, version, source_event_id, action_index,
    (coalesce(entity_id::text, 'global'))
  )
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_rule_task_idem
  ON public.engine_rule_tasks (
    rule_id, version, source_event_id, action_index,
    (coalesce(entity_id::text, 'global'))
  )
  WHERE source_event_id IS NOT NULL;

-- ---------- test run recording (service-role callable) ----------
CREATE OR REPLACE FUNCTION public.engine_rule_record_test_run(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rule_id uuid := (_payload->>'rule_id')::uuid;
  v_run_by uuid := nullif(_payload->>'run_by','')::uuid;
  v_actor uuid := coalesce(auth.uid(), v_run_by);
  v_ver int;
  v_id uuid;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.can_manage_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT version INTO v_ver FROM public.engine_rules WHERE id = v_rule_id;
  IF v_ver IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  INSERT INTO public.engine_rule_tests (
    rule_id, version, target_version, run_mode, passed, params, results,
    evaluated_count, matched_count, error, run_by, duration_ms, correlation_id, label
  ) VALUES (
    v_rule_id,
    v_ver,
    coalesce((_payload->>'target_version')::int, v_ver),
    coalesce(nullif(_payload->>'run_mode',''), 'current_snapshot'),
    coalesce((_payload->>'passed')::boolean, false),
    coalesce(_payload->'params', '{}'::jsonb),
    coalesce(_payload->'results', '[]'::jsonb),
    coalesce((_payload->>'evaluated')::int, 0),
    coalesce((_payload->>'matched')::int, 0),
    nullif(_payload->>'error',''),
    v_actor,
    (_payload->>'duration_ms')::int,
    nullif(_payload->>'correlation_id','')::uuid,
    nullif(_payload->>'label','')
  ) RETURNING id INTO v_id;

  PERFORM public.create_audit_log(
    v_actor, 'RULE_TEST_RUN', 'engine_rule', v_rule_id::text, NULL,
    jsonb_build_object(
      'test_id', v_id,
      'run_mode', coalesce(nullif(_payload->>'run_mode',''), 'current_snapshot'),
      'target_version', coalesce((_payload->>'target_version')::int, v_ver),
      'evaluated', coalesce((_payload->>'evaluated')::int, 0),
      'matched', coalesce((_payload->>'matched')::int, 0),
      'passed', coalesce((_payload->>'passed')::boolean, false),
      'correlation_id', nullif(_payload->>'correlation_id',''),
      'rule_family', 'shared_engine'
    )
  );

  RETURN v_id;
END; $fn$;

REVOKE ALL ON FUNCTION public.engine_rule_record_test_run(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.engine_rule_record_test_run(jsonb) TO authenticated, service_role;

-- ---------- suppression state (read-only preview) ----------
CREATE OR REPLACE FUNCTION public.engine_rule_suppression_state(
  _rule_id uuid, _entity_key text, _at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_rule public.engine_rules; v_sup public.engine_rule_suppressions;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.can_view_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rule FROM public.engine_rules WHERE id = _rule_id;
  IF v_rule.id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  SELECT * INTO v_sup FROM public.engine_rule_suppressions
   WHERE rule_id = _rule_id AND entity_key = _entity_key;

  RETURN jsonb_build_object(
    'rule_id', _rule_id,
    'entity_key', _entity_key,
    'as_of', _at,
    'suppression_days', v_rule.suppression_days,
    'critical_bypass', v_rule.severity = 'critical',
    'record_exists', v_sup.id IS NOT NULL,
    'suppressed_until', v_sup.suppressed_until,
    'suppressed_count', coalesce(v_sup.suppressed_count, 0),
    'last_suppressed_at', v_sup.last_suppressed_at,
    'expired', v_sup.id IS NOT NULL AND v_sup.suppressed_until <= _at,
    'suppressed',
      v_rule.severity <> 'critical'
      AND coalesce(v_rule.suppression_days, 0) > 0
      AND v_sup.id IS NOT NULL
      AND v_sup.suppressed_until > _at
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.engine_rule_suppression_state(uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.engine_rule_suppression_state(uuid, text, timestamptz) TO authenticated, service_role;

-- ---------- alert lifecycle ----------
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
    v_uid, public.current_user_primary_role(), v_row.correlation_id
  );

  PERFORM public.create_audit_log(
    v_uid, 'RULE_ALERT_' || upper(_to_status), 'engine_rule_alert', _alert_id::text, v_before,
    jsonb_build_object('from_status', v_from, 'to_status', _to_status, 'note', _note,
      'rule_id', v_row.rule_id, 'version', v_row.version, 'rule_family', 'shared_engine',
      'correlation_id', v_row.correlation_id, 'source_event_id', v_row.source_event_id,
      'action_index', v_row.action_index)
  );

  IF _to_status = 'assigned' AND _assign_to IS NOT NULL THEN
    BEGIN
      PERFORM public.notification_enqueue_event(
        'engine_rule_alert_generated', 'engine_rule_alert', _alert_id,
        jsonb_build_object('alert_title', v_row.title, 'assigned_to', _assign_to),
        _alert_id::text || ':assigned'
      );
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'alert', to_jsonb(v_row));
END; $fn$;

REVOKE ALL ON FUNCTION public.engine_rule_alert_transition(uuid, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.engine_rule_alert_transition(uuid, text, text, uuid) TO authenticated, service_role;

-- ---------- task lifecycle ----------
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
    v_uid, public.current_user_primary_role(), v_row.correlation_id
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

REVOKE ALL ON FUNCTION public.engine_rule_task_transition(uuid, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.engine_rule_task_transition(uuid, text, text, uuid) TO authenticated, service_role;