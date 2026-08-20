DROP FUNCTION IF EXISTS public.escalation_notify(uuid, text, text, integer, text, text, boolean);

CREATE OR REPLACE FUNCTION public.escalation_notify(
  _escalation_id uuid,
  _event_key text,
  _role text,
  _tier integer,
  _title text,
  _body text,
  _immediate boolean DEFAULT false,
  _dedupe_ref uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e public.escalations;
  v_uid uuid;
  v_email text;
  v_sent integer := 0;
  v_channels text[];
  v_raw jsonb;
  v_ref uuid := coalesce(_dedupe_ref, gen_random_uuid());
BEGIN
  SELECT * INTO e FROM public.escalations WHERE id = _escalation_id;
  IF e.id IS NULL THEN RETURN 0; END IF;

  v_raw := public.escalation_tier_config(e.rule_id, _tier)->'channels';
  IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'array' OR jsonb_array_length(v_raw) = 0 THEN
    v_channels := ARRAY['in_app','email']::text[];
  ELSE
    v_channels := ARRAY(SELECT jsonb_array_elements_text(v_raw));
  END IF;

  FOR v_uid, v_email IN
    SELECT DISTINCT p.id, p.email
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role::text = _role
    UNION
    SELECT p.id, p.email FROM public.profiles p
    WHERE e.assigned_user_id IS NOT NULL AND p.id = e.assigned_user_id
  LOOP
    IF 'in_app' = ANY(v_channels) THEN
      INSERT INTO public.notifications
        (user_id, title, message, type, entity_type, entity_id, channel, severity, category,
         module, action_required, event_key, correlation_id, metadata, recipient_role,
         source_reference, source_route, system_required)
      VALUES
        (v_uid, _title, _body, 'alert', 'escalation', e.id::text, 'in_app',
         CASE e.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
                         WHEN 'low' THEN 'low' ELSE 'medium' END::public.notification_severity,
         'action_required'::public.notification_category,
         'escalation_management', true, _event_key, e.correlation_id,
         jsonb_build_object('escalation_ref', e.escalation_ref, 'tier', _tier,
                            'source_module', e.source_module, 'escalation_type', e.escalation_type),
         _role, e.escalation_ref, '/admin/escalations',
         e.severity = 'critical');

      INSERT INTO public.escalation_notification_events
        (escalation_id, tier, event_key, recipient_role, recipient_user_id, channel, outcome)
      VALUES (e.id, _tier, _event_key, _role, v_uid, 'in_app', 'delivered');
    END IF;

    IF 'email' = ANY(v_channels) AND v_email IS NOT NULL AND v_email <> '' THEN
      INSERT INTO public.notification_outbox
        (event_key, entity_type, entity_id, recipient_user_id, recipient_email, channel,
         subject, body, payload, status, correlation_id, action_history_id)
      VALUES
        (_event_key, 'escalation', e.id, v_uid, v_email, 'email',
         _title, _body,
         jsonb_build_object('escalation_ref', e.escalation_ref, 'tier', _tier,
                            'severity', e.severity, 'immediate', _immediate),
         'pending', e.correlation_id, v_ref)
      ON CONFLICT (event_key, entity_id, COALESCE((recipient_user_id)::text, recipient_email),
                   channel, COALESCE((action_history_id)::text, ''::text))
      DO NOTHING;

      INSERT INTO public.escalation_notification_events
        (escalation_id, tier, event_key, recipient_role, recipient_user_id, channel, outcome)
      VALUES (e.id, _tier, _event_key, _role, v_uid, 'email', 'queued');
    END IF;

    v_sent := v_sent + 1;
  END LOOP;

  IF v_sent = 0 THEN
    INSERT INTO public.escalation_notification_events
      (escalation_id, tier, event_key, recipient_role, channel, outcome, detail)
    VALUES (e.id, _tier, _event_key, _role, 'in_app', 'no_recipient',
            jsonb_build_object('reason', 'no user holds role ' || coalesce(_role, '(null)')));
  END IF;

  RETURN v_sent;
END;
$function$;

CREATE OR REPLACE FUNCTION public.escalation_advance_tier(_id uuid, _trigger text DEFAULT 'manual'::text, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e public.escalations; v_next integer; v_cfg jsonb; v_ack timestamptz; v_event_id uuid;
BEGIN
  SELECT * INTO e FROM public.escalations WHERE id = _id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'escalation_not_found'; END IF;
  IF e.status IN ('resolved','closed') THEN RAISE EXCEPTION 'escalation_is_terminal'; END IF;

  v_next := e.current_tier + 1;
  IF v_next > 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'max_tier_reached', 'tier', e.current_tier);
  END IF;

  v_cfg := public.escalation_tier_config(e.rule_id, v_next);
  IF v_cfg IS NULL OR coalesce(v_cfg->>'role','') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_tier_configured', 'tier', e.current_tier);
  END IF;

  v_ack := public.escalation_deadline(e.rule_id, now(), (v_cfg->>'threshold')::int);

  UPDATE public.escalations
  SET current_tier = v_next,
      status = 'escalated',
      assigned_role = v_cfg->>'role',
      acknowledgement_deadline = v_ack,
      acknowledged_at = NULL,
      acknowledged_by = NULL,
      auto_escalate_paused_at = NULL,
      next_auto_escalation_at = v_ack
  WHERE id = _id;

  INSERT INTO public.escalation_tier_events
    (escalation_id, from_tier, to_tier, trigger_source, recipient_role, reason, acknowledgement_deadline, actor_id)
  VALUES (_id, e.current_tier, v_next, _trigger, v_cfg->>'role',
          coalesce(_reason, CASE WHEN _trigger = 'automatic'
                 THEN 'Acknowledgement deadline passed without response'
                 ELSE 'Manually escalated to the next tier' END), v_ack, auth.uid())
  RETURNING id INTO v_event_id;

  PERFORM public.escalation_notify(
    _id, 'escalation.tier_advanced', v_cfg->>'role', v_next,
    format('[%s] Escalation %s moved to tier %s', upper(e.severity::text), e.escalation_ref, v_next),
    format('Escalation %s (%s from %s) has moved to tier %s. Source: %s. %s',
           e.escalation_ref, replace(e.escalation_type::text,'_',' '), e.source_module, v_next,
           coalesce(e.source_reference, 'n/a'),
           coalesce(to_char(v_ack,'"Acknowledge before "DD Mon YYYY HH24:MI'), '')),
    e.severity = 'critical', v_event_id);

  RETURN jsonb_build_object('ok', true, 'tier', v_next, 'role', v_cfg->>'role');
END;
$function$;

CREATE OR REPLACE FUNCTION public.escalation_resolve(_id uuid, _resolution_narrative text, _root_cause text DEFAULT NULL::text, _close boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE e public.escalations; v_role text; v_count integer := 0; v_ref uuid := gen_random_uuid();
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'resolve');

  IF coalesce(length(btrim(_resolution_narrative)), 0) < 50 THEN
    RAISE EXCEPTION 'resolution_narrative_too_short: at least 50 characters are required';
  END IF;

  SELECT * INTO e FROM public.escalations WHERE id = _id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'escalation_not_found'; END IF;
  IF e.status IN ('resolved','closed') THEN RAISE EXCEPTION 'escalation_is_terminal'; END IF;

  UPDATE public.escalations
  SET status = CASE WHEN _close THEN 'closed' ELSE 'resolved' END,
      resolution_narrative = btrim(_resolution_narrative),
      root_cause = coalesce(nullif(btrim(_root_cause), ''), root_cause),
      resolved_at = now(),
      resolved_by = auth.uid(),
      next_auto_escalation_at = NULL
  WHERE id = _id;

  INSERT INTO public.escalation_ownership_events
    (escalation_id, from_user_id, to_user_id, event_type, note, actor_id)
  VALUES (_id, e.assigned_user_id, auth.uid(),
          CASE WHEN _close THEN 'closed' ELSE 'resolved' END,
          left(btrim(_resolution_narrative), 500), auth.uid());

  FOR v_role IN
    SELECT DISTINCT recipient_role FROM public.escalation_tier_events
    WHERE escalation_id = _id AND recipient_role IS NOT NULL
  LOOP
    v_count := v_count + public.escalation_notify(
      _id, 'escalation.resolved', v_role, e.current_tier,
      format('Escalation %s resolved', e.escalation_ref),
      format('Escalation %s (%s from %s) was resolved.%s%sResolution: %s',
             e.escalation_ref, replace(e.escalation_type::text,'_',' '), e.source_module,
             E'\n', E'\n', btrim(_resolution_narrative)),
      false, v_ref);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'notified', v_count,
                            'status', CASE WHEN _close THEN 'closed' ELSE 'resolved' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.escalation_raise(_source_module text, _source_event text, _escalation_type escalation_type, _source_entity_type text DEFAULT NULL::text, _source_entity_id uuid DEFAULT NULL::uuid, _source_reference text DEFAULT NULL::text, _severity escalation_severity DEFAULT NULL::escalation_severity, _source_rule_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _correlation_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule public.escalation_rules;
  v_id uuid;
  v_existing uuid;
  v_sev public.escalation_severity;
  v_ack timestamptz;
  v_res timestamptz;
  v_cfg jsonb;
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_internal_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: escalation_management.raise' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing
  FROM public.escalations
  WHERE source_module = _source_module
    AND source_event = _source_event
    AND coalesce(source_entity_id, '00000000-0000-0000-0000-000000000000') = coalesce(_source_entity_id, '00000000-0000-0000-0000-000000000000')
    AND coalesce(source_rule_id, '00000000-0000-0000-0000-000000000000') = coalesce(_source_rule_id, '00000000-0000-0000-0000-000000000000')
    AND status IN ('open','acknowledged','in_progress','escalated');
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_rule
  FROM public.escalation_rules
  WHERE source_module = _source_module
    AND escalation_type = _escalation_type
    AND is_active
  ORDER BY created_at
  LIMIT 1;

  v_sev := coalesce(_severity, v_rule.default_severity, 'medium');
  v_cfg := public.escalation_tier_config(v_rule.id, 0);
  v_ack := public.escalation_deadline(v_rule.id, now(), (v_cfg->>'threshold')::int);
  v_res := public.escalation_deadline(v_rule.id, now(), v_rule.resolution_threshold_minutes);

  INSERT INTO public.escalations
    (source_module, source_event, source_rule_id, source_entity_type, source_entity_id,
     source_reference, escalation_type, severity, current_tier, status, rule_id,
     assigned_role, acknowledgement_deadline, resolution_deadline, next_auto_escalation_at,
     correlation_id, metadata, created_by)
  VALUES
    (_source_module, _source_event, _source_rule_id, _source_entity_type, _source_entity_id,
     _source_reference, _escalation_type, v_sev, 0, 'open', v_rule.id,
     v_cfg->>'role', v_ack, v_res, v_ack,
     coalesce(_correlation_id, gen_random_uuid()), coalesce(_metadata, '{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.escalation_tier_events
    (escalation_id, from_tier, to_tier, trigger_source, recipient_role, reason, acknowledgement_deadline, actor_id)
  VALUES (v_id, NULL, 0, 'automatic', v_cfg->>'role',
          'Escalation raised from ' || _source_module || ' (' || _source_event || ')', v_ack, auth.uid())
  RETURNING id INTO v_event_id;

  PERFORM public.escalation_notify(
    v_id, 'escalation.raised', v_cfg->>'role', 0,
    format('[%s] %s escalation raised', upper(v_sev::text), replace(_escalation_type::text, '_', ' ')),
    format('Escalation %s was raised from %s. Source: %s. Please acknowledge before %s.',
           (SELECT escalation_ref FROM public.escalations WHERE id = v_id),
           _source_module, coalesce(_source_reference, coalesce(_source_entity_id::text, 'n/a')),
           coalesce(to_char(v_ack, 'DD Mon YYYY HH24:MI'), 'the configured deadline')),
    v_sev = 'critical', v_event_id);

  RETURN v_id;
END;
$function$;