-- =========================================================
-- Phase 1A: first-class SLA stage tracking (additive)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.sla_stage_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  workflow_instance_id uuid,
  step_id uuid,
  stage_name text,
  sla_config_id uuid REFERENCES public.sla_configurations(id) ON DELETE SET NULL,
  sla_hours numeric,
  sla_source text NOT NULL DEFAULT 'step',
  calendar_profile_id uuid REFERENCES public.business_calendar_profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paused_at timestamptz,
  pause_seconds integer NOT NULL DEFAULT 0,
  active_seconds integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'active',
  breached_at timestamptz,
  first_breach_notified_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sla_stage_instances_state_chk CHECK (state IN ('active','paused','breached','completed'))
);

CREATE INDEX IF NOT EXISTS idx_sla_stage_inst_entity ON public.sla_stage_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sla_stage_inst_wf ON public.sla_stage_instances(workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_sla_stage_inst_open ON public.sla_stage_instances(state) WHERE state IN ('active','paused','breached');

CREATE TABLE IF NOT EXISTS public.sla_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id uuid NOT NULL REFERENCES public.sla_stage_instances(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  actor_kind text NOT NULL DEFAULT 'system',
  from_state text,
  to_state text,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sla_stage_events_type_chk CHECK (event_type IN ('started','paused','resumed','breached','escalated','completed'))
);

CREATE INDEX IF NOT EXISTS idx_sla_stage_events_inst ON public.sla_stage_events(stage_instance_id, occurred_at DESC);

GRANT SELECT ON public.sla_stage_instances TO authenticated;
GRANT SELECT ON public.sla_stage_events TO authenticated;
GRANT ALL ON public.sla_stage_instances TO service_role;
GRANT ALL ON public.sla_stage_events TO service_role;

ALTER TABLE public.sla_stage_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal staff read sla stage instances" ON public.sla_stage_instances;
CREATE POLICY "internal staff read sla stage instances"
  ON public.sla_stage_instances FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid()));

DROP POLICY IF EXISTS "internal staff read sla stage events" ON public.sla_stage_events;
CREATE POLICY "internal staff read sla stage events"
  ON public.sla_stage_events FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid()));

-- No INSERT/UPDATE/DELETE policies: writes only via SECURITY DEFINER routines below.

CREATE OR REPLACE FUNCTION public.tg_sla_stage_instances_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sla_stage_instances_touch ON public.sla_stage_instances;
CREATE TRIGGER trg_sla_stage_instances_touch
  BEFORE UPDATE ON public.sla_stage_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_sla_stage_instances_touch();

-- Append-only guard for the event log.
CREATE OR REPLACE FUNCTION public.tg_sla_stage_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'sla_stage_events is append-only';
END; $$;

DROP TRIGGER IF EXISTS trg_sla_stage_events_append_only ON public.sla_stage_events;
CREATE TRIGGER trg_sla_stage_events_append_only
  BEFORE UPDATE OR DELETE ON public.sla_stage_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_sla_stage_events_append_only();

-- ---------------------------------------------------------
-- Deadline resolution: configured SLA first, step SLA fallback
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sla_add_duration(
  _start timestamptz,
  _hours numeric,
  _calendar_profile_id uuid DEFAULT NULL
) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_working int[];
  v_remaining numeric := COALESCE(_hours, 0);
  v_cursor timestamptz := _start;
  v_guard int := 0;
  v_dow int;
  v_is_working boolean;
BEGIN
  IF _hours IS NULL OR _hours <= 0 THEN RETURN NULL; END IF;
  IF _calendar_profile_id IS NULL THEN RETURN _start + make_interval(hours => 0) + (_hours || ' hours')::interval; END IF;

  SELECT working_days INTO v_working FROM public.business_calendar_profiles WHERE id = _calendar_profile_id;
  IF v_working IS NULL OR array_length(v_working, 1) IS NULL THEN
    RETURN _start + (_hours || ' hours')::interval;
  END IF;

  -- Consume the SLA in 24h working-day chunks, skipping non-working days and holidays.
  WHILE v_remaining > 0 AND v_guard < 2000 LOOP
    v_guard := v_guard + 1;
    v_dow := EXTRACT(DOW FROM v_cursor)::int;
    v_is_working := v_dow = ANY (v_working)
      AND NOT EXISTS (
        SELECT 1 FROM public.business_calendar_holidays h
        WHERE h.profile_id = _calendar_profile_id AND h.holiday_date = v_cursor::date
      );
    IF v_is_working THEN
      IF v_remaining <= 24 THEN
        v_cursor := v_cursor + (v_remaining || ' hours')::interval;
        v_remaining := 0;
      ELSE
        v_cursor := v_cursor + interval '24 hours';
        v_remaining := v_remaining - 24;
      END IF;
    ELSE
      v_cursor := v_cursor + interval '24 hours';
    END IF;
  END LOOP;

  RETURN v_cursor;
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_stage_sla(
  _process_type text,
  _stage_name text,
  _step_id uuid DEFAULT NULL
) RETURNS TABLE (sla_hours numeric, sla_source text, sla_config_id uuid, calendar_profile_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg RECORD;
  v_step_hours integer;
BEGIN
  SELECT c.id, c.sla_duration, c.sla_unit, c.calendar_profile_id
    INTO v_cfg
  FROM public.sla_configurations c
  WHERE c.active
    AND c.process_type = _process_type
    AND lower(trim(c.stage_name)) = lower(trim(COALESCE(_stage_name, '')))
  LIMIT 1;

  IF v_cfg.id IS NOT NULL THEN
    RETURN QUERY SELECT
      CASE WHEN v_cfg.sla_unit = 'days' THEN v_cfg.sla_duration * 24.0 ELSE v_cfg.sla_duration::numeric END,
      'configuration'::text,
      v_cfg.id,
      v_cfg.calendar_profile_id;
    RETURN;
  END IF;

  IF _step_id IS NOT NULL THEN
    SELECT s.sla_hours INTO v_step_hours FROM public.approval_steps s WHERE s.id = _step_id;
  END IF;

  RETURN QUERY SELECT v_step_hours::numeric, 'step'::text, NULL::uuid, NULL::uuid;
END; $$;

-- ---------------------------------------------------------
-- Stage lifecycle routines (server-side only)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sla_stage_log_event(
  _stage_instance_id uuid,
  _event_type text,
  _from_state text,
  _to_state text,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.sla_stage_events(stage_instance_id, event_type, actor_id, actor_kind, from_state, to_state, reason, metadata)
  VALUES (_stage_instance_id, _event_type, auth.uid(),
          CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
          _from_state, _to_state, _reason, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.sla_stage_open(
  _process_type text,
  _entity_type text,
  _entity_id uuid,
  _workflow_instance_id uuid DEFAULT NULL,
  _step_id uuid DEFAULT NULL,
  _stage_name text DEFAULT NULL,
  _started_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res RECORD;
  v_id uuid;
  v_start timestamptz := COALESCE(_started_at, now());
  v_name text := COALESCE(_stage_name, (SELECT name FROM public.approval_steps WHERE id = _step_id));
BEGIN
  -- Close any still-open stage for the same workflow instance.
  PERFORM public.sla_stage_complete(id, 'superseded')
  FROM public.sla_stage_instances
  WHERE state IN ('active','paused','breached')
    AND (
      (_workflow_instance_id IS NOT NULL AND workflow_instance_id = _workflow_instance_id)
      OR (_workflow_instance_id IS NULL AND entity_type = _entity_type AND entity_id = _entity_id)
    );

  SELECT * INTO v_res FROM public.resolve_stage_sla(_process_type, v_name, _step_id);

  INSERT INTO public.sla_stage_instances(
    process_type, entity_type, entity_id, workflow_instance_id, step_id, stage_name,
    sla_config_id, sla_hours, sla_source, calendar_profile_id, started_at, due_at, state
  ) VALUES (
    _process_type, _entity_type, _entity_id, _workflow_instance_id, _step_id, v_name,
    v_res.sla_config_id, v_res.sla_hours, COALESCE(v_res.sla_source, 'step'), v_res.calendar_profile_id,
    v_start, public.sla_add_duration(v_start, v_res.sla_hours, v_res.calendar_profile_id), 'active'
  ) RETURNING id INTO v_id;

  PERFORM public.sla_stage_log_event(v_id, 'started', NULL, 'active', NULL,
    jsonb_build_object('sla_hours', v_res.sla_hours, 'sla_source', COALESCE(v_res.sla_source,'step')));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.sla_stage_complete(_stage_instance_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.sla_stage_instances;
BEGIN
  SELECT * INTO v_row FROM public.sla_stage_instances WHERE id = _stage_instance_id;
  IF v_row.id IS NULL OR v_row.state = 'completed' THEN RETURN; END IF;

  UPDATE public.sla_stage_instances SET
    state = 'completed',
    completed_at = now(),
    pause_seconds = pause_seconds + CASE WHEN paused_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - paused_at))::int) ELSE 0 END,
    active_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::int)
      - (pause_seconds + CASE WHEN paused_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - paused_at))::int) ELSE 0 END),
    paused_at = NULL
  WHERE id = _stage_instance_id;

  PERFORM public.sla_stage_log_event(_stage_instance_id, 'completed', v_row.state, 'completed', _reason, '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.sla_stage_pause(
  _entity_type text, _entity_id uuid, _reason text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.sla_stage_instances;
BEGIN
  SELECT * INTO v_row FROM public.sla_stage_instances
  WHERE entity_type = _entity_type AND entity_id = _entity_id AND state IN ('active','breached')
  ORDER BY started_at DESC LIMIT 1;
  IF v_row.id IS NULL THEN RETURN; END IF;

  UPDATE public.sla_stage_instances
    SET state = 'paused', paused_at = COALESCE(paused_at, now())
    WHERE id = v_row.id;
  PERFORM public.sla_stage_log_event(v_row.id, 'paused', v_row.state, 'paused', _reason, _metadata);
END; $$;

CREATE OR REPLACE FUNCTION public.sla_stage_resume(
  _entity_type text, _entity_id uuid, _reason text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.sla_stage_instances;
  v_added int;
BEGIN
  SELECT * INTO v_row FROM public.sla_stage_instances
  WHERE entity_type = _entity_type AND entity_id = _entity_id AND state = 'paused'
  ORDER BY started_at DESC LIMIT 1;
  IF v_row.id IS NULL THEN RETURN; END IF;

  v_added := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(v_row.paused_at, now())))::int);

  UPDATE public.sla_stage_instances SET
    state = 'active',
    paused_at = NULL,
    pause_seconds = pause_seconds + v_added,
    due_at = CASE WHEN due_at IS NULL THEN NULL ELSE due_at + make_interval(secs => v_added) END
  WHERE id = v_row.id;

  PERFORM public.sla_stage_log_event(v_row.id, 'resumed', 'paused', 'active', _reason,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object('pause_seconds_added', v_added));
END; $$;

CREATE OR REPLACE FUNCTION public.sla_stage_mark_breached(_stage_instance_id uuid, _reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.sla_stage_instances;
BEGIN
  SELECT * INTO v_row FROM public.sla_stage_instances WHERE id = _stage_instance_id;
  IF v_row.id IS NULL OR v_row.state <> 'active' OR v_row.due_at IS NULL OR v_row.due_at > now() THEN
    RETURN false;
  END IF;

  UPDATE public.sla_stage_instances
    SET state = 'breached', breached_at = COALESCE(breached_at, now())
    WHERE id = _stage_instance_id;

  PERFORM public.sla_stage_log_event(_stage_instance_id, 'breached', 'active', 'breached', _reason,
    jsonb_build_object('due_at', v_row.due_at));

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (NULL, 'workflow.sla.breached', v_row.entity_type, v_row.entity_id,
          jsonb_build_object('stage_instance_id', _stage_instance_id, 'due_at', v_row.due_at, 'stage_name', v_row.stage_name),
          jsonb_build_object('actor','system','process_type', v_row.process_type));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.sla_stage_mark_escalated(_stage_instance_id uuid, _tier integer, _recipients text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sla_stage_instances
    SET first_breach_notified_at = COALESCE(first_breach_notified_at, now())
    WHERE id = _stage_instance_id;
  PERFORM public.sla_stage_log_event(_stage_instance_id, 'escalated', NULL, NULL, 'tier ' || _tier,
    jsonb_build_object('tier', _tier, 'recipients', _recipients));
END; $$;

REVOKE ALL ON FUNCTION public.sla_stage_open(text,text,uuid,uuid,uuid,text,timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_stage_complete(uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_stage_pause(text,uuid,text,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_stage_resume(text,uuid,text,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_stage_mark_breached(uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_stage_mark_escalated(uuid,integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_stage_log_event(uuid,text,text,text,text,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stage_sla(text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sla_add_duration(timestamptz,numeric,uuid) TO authenticated;

-- ---------------------------------------------------------
-- Wire stage tracking into existing workflow + RFI behaviour
-- ---------------------------------------------------------

-- Open/advance a stage whenever a workflow instance starts or changes step.
CREATE OR REPLACE FUNCTION public.tg_workflow_instance_sla_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_process text;
BEGIN
  v_process := COALESCE(NEW.entity_type, 'application');

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      PERFORM public.sla_stage_open(v_process, NEW.entity_type, NEW.entity_id, NEW.id, NEW.current_step_id,
                                    NULL, COALESCE(NEW.started_at, NEW.created_at, now()));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('completed','cancelled','rejected') AND OLD.status <> NEW.status THEN
    PERFORM public.sla_stage_complete(id, 'workflow_' || NEW.status)
      FROM public.sla_stage_instances
      WHERE workflow_instance_id = NEW.id AND state IN ('active','paused','breached');
    RETURN NEW;
  END IF;

  IF NEW.status = 'active' AND COALESCE(NEW.current_step_id::text,'') <> COALESCE(OLD.current_step_id::text,'') THEN
    PERFORM public.sla_stage_open(v_process, NEW.entity_type, NEW.entity_id, NEW.id, NEW.current_step_id, NULL, now());
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_workflow_instance_sla_stage_ins ON public.workflow_instances;
CREATE TRIGGER trg_workflow_instance_sla_stage_ins
  AFTER INSERT ON public.workflow_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_workflow_instance_sla_stage();

DROP TRIGGER IF EXISTS trg_workflow_instance_sla_stage_upd ON public.workflow_instances;
CREATE TRIGGER trg_workflow_instance_sla_stage_upd
  AFTER UPDATE ON public.workflow_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_workflow_instance_sla_stage();

-- Extend the existing RFI pause trigger to also record stage evidence.
CREATE OR REPLACE FUNCTION public.rfi_pause_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pauses_sla AND NEW.status IN ('open') THEN
      UPDATE public.workflow_instances
        SET paused_at = COALESCE(paused_at, now()),
            paused_reason = COALESCE(paused_reason, 'RFI ' || NEW.id::text),
            resumed_at = NULL
        WHERE entity_type = 'application' AND entity_id = NEW.application_id AND status = 'active';

      PERFORM public.sla_stage_pause('application', NEW.application_id, 'rfi_open',
                                     jsonb_build_object('rfi_id', NEW.id));

      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value, metadata)
        VALUES (auth.uid(), 'workflow.sla.paused', 'application', NEW.application_id,
                jsonb_build_object('rfi_id', NEW.id),
                jsonb_build_object('trigger','rfi_open'));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.pauses_sla AND OLD.status = 'open' AND NEW.status IN ('responded','closed','cancelled') THEN
      UPDATE public.workflow_instances w
        SET resumed_at = now(),
            total_pause_seconds = w.total_pause_seconds + GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(w.paused_at, now())))::int),
            paused_at = NULL,
            paused_reason = NULL
        WHERE w.entity_type='application' AND w.entity_id = NEW.application_id AND w.status='active';

      PERFORM public.sla_stage_resume('application', NEW.application_id, 'rfi_' || NEW.status,
                                      jsonb_build_object('rfi_id', NEW.id));

      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value, metadata)
        VALUES (auth.uid(), 'workflow.sla.resumed', 'application', NEW.application_id,
                jsonb_build_object('rfi_id', NEW.id, 'new_status', NEW.status),
                jsonb_build_object('trigger','rfi_'||NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Backfill stage records for currently open workflow instances so live queues
-- have config-driven deadlines immediately (idempotent, additive).
INSERT INTO public.sla_stage_instances(
  process_type, entity_type, entity_id, workflow_instance_id, step_id, stage_name,
  sla_config_id, sla_hours, sla_source, calendar_profile_id, started_at, due_at, state, paused_at, pause_seconds
)
SELECT
  wi.entity_type, wi.entity_type, wi.entity_id, wi.id, wi.current_step_id, s.name,
  r.sla_config_id, r.sla_hours, COALESCE(r.sla_source,'step'), r.calendar_profile_id,
  COALESCE(wi.updated_at, wi.started_at, wi.created_at, now()),
  public.sla_add_duration(COALESCE(wi.updated_at, wi.started_at, wi.created_at, now()), r.sla_hours, r.calendar_profile_id),
  CASE WHEN wi.status = 'paused' OR (wi.paused_at IS NOT NULL AND wi.resumed_at IS NULL) THEN 'paused' ELSE 'active' END,
  CASE WHEN wi.status = 'paused' OR (wi.paused_at IS NOT NULL AND wi.resumed_at IS NULL) THEN COALESCE(wi.paused_at, now()) END,
  COALESCE(wi.total_pause_seconds, 0)
FROM public.workflow_instances wi
LEFT JOIN public.approval_steps s ON s.id = wi.current_step_id
LEFT JOIN LATERAL public.resolve_stage_sla(wi.entity_type, s.name, wi.current_step_id) r ON true
WHERE wi.status IN ('active','paused')
  AND NOT EXISTS (
    SELECT 1 FROM public.sla_stage_instances x
    WHERE x.workflow_instance_id = wi.id AND x.state IN ('active','paused','breached')
  );