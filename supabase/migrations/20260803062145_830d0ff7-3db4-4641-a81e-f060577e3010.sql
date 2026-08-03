-- =====================================================================
-- NOT-ESC-001 — Phase 2: engine (raise / notify / lifecycle / sweep)
-- =====================================================================

-- Tier config resolver -------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_tier_config(_rule_id uuid, _tier integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.escalation_rules;
BEGIN
  SELECT * INTO r FROM public.escalation_rules WHERE id = _rule_id;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN CASE _tier
    WHEN 0 THEN jsonb_build_object('tier',0,'role',r.initial_recipient_role,
                  'threshold', r.tier1_ack_threshold_minutes,'channels', to_jsonb(r.tier1_channels),'template_id', r.tier1_template_id)
    WHEN 1 THEN jsonb_build_object('tier',1,'role',r.tier1_recipient_role,
                  'threshold', r.tier2_ack_threshold_minutes,'channels', to_jsonb(r.tier1_channels),'template_id', r.tier1_template_id)
    WHEN 2 THEN jsonb_build_object('tier',2,'role',r.tier2_recipient_role,
                  'threshold', r.tier3_ack_threshold_minutes,'channels', to_jsonb(r.tier2_channels),'template_id', r.tier2_template_id)
    WHEN 3 THEN jsonb_build_object('tier',3,'role',r.tier3_recipient_role,
                  'threshold', NULL,'channels', to_jsonb(r.tier3_channels),'template_id', r.tier3_template_id)
    ELSE NULL END;
END;
$$;

-- Deadline helper honouring business hours ----------------------------
CREATE OR REPLACE FUNCTION public.escalation_deadline(_rule_id uuid, _from timestamptz, _minutes integer)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.escalation_rules;
BEGIN
  IF _minutes IS NULL OR _minutes <= 0 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.escalation_rules WHERE id = _rule_id;
  IF r.id IS NULL OR NOT r.business_hours_only THEN
    RETURN _from + make_interval(mins => _minutes);
  END IF;
  RETURN public.escalation_business_deadline(r.business_calendar_profile_id, _from, _minutes);
END;
$$;

-- Notification fan-out -------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_notify(
  _escalation_id uuid,
  _event_key text,
  _role text,
  _tier integer,
  _title text,
  _body text,
  _immediate boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e public.escalations;
  v_uid uuid;
  v_email text;
  v_sent integer := 0;
  v_channels text[];
BEGIN
  SELECT * INTO e FROM public.escalations WHERE id = _escalation_id;
  IF e.id IS NULL THEN RETURN 0; END IF;

  SELECT coalesce((public.escalation_tier_config(e.rule_id, _tier)->'channels')::jsonb, '["in_app","email"]'::jsonb)
    INTO v_channels
  FROM (SELECT 1) s;

  FOR v_uid, v_email IN
    SELECT DISTINCT p.id, p.email
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role::text = _role
    UNION
    SELECT p.id, p.email FROM public.profiles p
    WHERE e.assigned_user_id IS NOT NULL AND p.id = e.assigned_user_id
  LOOP
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

    IF v_email IS NOT NULL AND v_email <> '' THEN
      INSERT INTO public.notification_outbox
        (event_key, entity_type, entity_id, recipient_user_id, recipient_email, channel,
         subject, body, payload, status, correlation_id)
      VALUES
        (_event_key, 'escalation', e.id, v_uid, v_email, 'email',
         _title, _body,
         jsonb_build_object('escalation_ref', e.escalation_ref, 'tier', _tier,
                            'severity', e.severity, 'immediate', _immediate),
         'pending', e.correlation_id);

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
$$;

REVOKE ALL ON FUNCTION public.escalation_notify(uuid, text, text, integer, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalation_notify(uuid, text, text, integer, text, text, boolean) TO service_role;

-- Raise ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_raise(
  _source_module text,
  _source_event text,
  _escalation_type public.escalation_type,
  _source_entity_type text DEFAULT NULL,
  _source_entity_id uuid DEFAULT NULL,
  _source_reference text DEFAULT NULL,
  _severity public.escalation_severity DEFAULT NULL,
  _source_rule_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _correlation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rule public.escalation_rules;
  v_id uuid;
  v_existing uuid;
  v_sev public.escalation_severity;
  v_ack timestamptz;
  v_res timestamptz;
  v_cfg jsonb;
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
          'Escalation raised from ' || _source_module || ' (' || _source_event || ')', v_ack, auth.uid());

  PERFORM public.escalation_notify(
    v_id, 'escalation.raised', v_cfg->>'role', 0,
    format('[%s] %s escalation raised', upper(v_sev::text), replace(_escalation_type::text, '_', ' ')),
    format('Escalation %s was raised from %s. Source: %s. Please acknowledge before %s.',
           (SELECT escalation_ref FROM public.escalations WHERE id = v_id),
           _source_module, coalesce(_source_reference, coalesce(_source_entity_id::text, 'n/a')),
           coalesce(to_char(v_ack, 'DD Mon YYYY HH24:MI'), 'the configured deadline')),
    v_sev = 'critical');

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_raise(text, text, public.escalation_type, text, uuid, text, public.escalation_severity, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalation_raise(text, text, public.escalation_type, text, uuid, text, public.escalation_severity, uuid, jsonb, uuid) TO authenticated, service_role;

-- Acknowledge ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_acknowledge(_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e public.escalations; v_pause boolean;
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'acknowledge');
  SELECT * INTO e FROM public.escalations WHERE id = _id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'escalation_not_found'; END IF;
  IF e.status IN ('resolved','closed') THEN RAISE EXCEPTION 'escalation_is_terminal'; END IF;

  SELECT coalesce(pause_on_acknowledgement, true) INTO v_pause
  FROM public.escalation_rules WHERE id = e.rule_id;

  UPDATE public.escalations
  SET status = 'acknowledged',
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledged_by = coalesce(acknowledged_by, auth.uid()),
      auto_escalate_paused_at = CASE WHEN coalesce(v_pause, true) THEN now() ELSE auto_escalate_paused_at END,
      next_auto_escalation_at = CASE WHEN coalesce(v_pause, true) THEN NULL ELSE next_auto_escalation_at END
  WHERE id = _id;

  INSERT INTO public.escalation_ownership_events
    (escalation_id, from_user_id, to_user_id, event_type, note, actor_id)
  VALUES (_id, e.assigned_user_id, auth.uid(), 'acknowledged', _note, auth.uid());

  RETURN jsonb_build_object('ok', true, 'paused', coalesce(v_pause, true));
END;
$$;

-- Take ownership -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_take_ownership(_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e public.escalations;
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'own');
  SELECT * INTO e FROM public.escalations WHERE id = _id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'escalation_not_found'; END IF;
  IF e.status IN ('resolved','closed') THEN RAISE EXCEPTION 'escalation_is_terminal'; END IF;

  UPDATE public.escalations
  SET assigned_user_id = auth.uid(),
      status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
  WHERE id = _id;

  INSERT INTO public.escalation_ownership_events
    (escalation_id, from_user_id, to_user_id, from_role, to_role, event_type, note, actor_id)
  VALUES (_id, e.assigned_user_id, auth.uid(), e.assigned_role, e.assigned_role, 'ownership_taken', _note, auth.uid());

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Advance tier (shared by manual + automatic) --------------------------
CREATE OR REPLACE FUNCTION public.escalation_advance_tier(
  _id uuid, _trigger text DEFAULT 'manual', _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e public.escalations; v_next integer; v_cfg jsonb; v_ack timestamptz;
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
                 ELSE 'Manually escalated to the next tier' END), v_ack, auth.uid());

  PERFORM public.escalation_notify(
    _id, 'escalation.tier_advanced', v_cfg->>'role', v_next,
    format('[%s] Escalation %s moved to tier %s', upper(e.severity::text), e.escalation_ref, v_next),
    format('Escalation %s (%s from %s) has moved to tier %s. Source: %s. %s',
           e.escalation_ref, replace(e.escalation_type::text,'_',' '), e.source_module, v_next,
           coalesce(e.source_reference, 'n/a'),
           coalesce(to_char(v_ack,'"Acknowledge before "DD Mon YYYY HH24:MI'), '')),
    e.severity = 'critical');

  RETURN jsonb_build_object('ok', true, 'tier', v_next, 'role', v_cfg->>'role');
END;
$$;

CREATE OR REPLACE FUNCTION public.escalation_escalate_tier(_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'escalate');
  RETURN public.escalation_advance_tier(_id, 'manual', _reason);
END;
$$;

-- Resolve / close ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_resolve(
  _id uuid,
  _resolution_narrative text,
  _root_cause text DEFAULT NULL,
  _close boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e public.escalations; v_role text; v_count integer := 0;
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

  -- notify every recipient role involved at any tier
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
      false);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'notified', v_count,
                            'status', CASE WHEN _close THEN 'closed' ELSE 'resolved' END);
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_acknowledge(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalation_take_ownership(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalation_escalate_tier(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalation_resolve(uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalation_advance_tier(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalation_acknowledge(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalation_take_ownership(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalation_escalate_tier(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalation_resolve(uuid, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalation_advance_tier(uuid, text, text) TO service_role;

-- Feed -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_feed(
  _modules text[] DEFAULT NULL,
  _types text[] DEFAULT NULL,
  _severities text[] DEFAULT NULL,
  _tiers integer[] DEFAULT NULL,
  _statuses text[] DEFAULT NULL,
  _owner uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_all boolean; v_rows jsonb; v_total integer;
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'view');
  v_all := public.is_super_admin(v_uid) OR public.has_permission(v_uid, 'escalation_management', 'configure');

  WITH scoped AS (
    SELECT e.*
    FROM public.escalations e
    WHERE (v_all
           OR e.assigned_user_id = v_uid
           OR public.has_module_access_for_escalation(v_uid, e.source_module))
      AND (_modules IS NULL OR e.source_module = ANY(_modules))
      AND (_types IS NULL OR e.escalation_type::text = ANY(_types))
      AND (_severities IS NULL OR e.severity::text = ANY(_severities))
      AND (_tiers IS NULL OR e.current_tier = ANY(_tiers))
      AND (_statuses IS NULL OR e.status::text = ANY(_statuses))
      AND (_owner IS NULL OR e.assigned_user_id = _owner)
      AND (_from IS NULL OR e.created_at >= _from)
      AND (_to IS NULL OR e.created_at <= _to)
      AND (_search IS NULL OR btrim(_search) = ''
           OR e.escalation_ref ILIKE '%'||_search||'%'
           OR coalesce(e.source_reference,'') ILIKE '%'||_search||'%'
           OR e.source_event ILIKE '%'||_search||'%')
  )
  SELECT count(*)::int,
         coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb)
    INTO v_total, v_rows
  FROM (
    SELECT to_jsonb(s) - 'metadata' ||
           jsonb_build_object(
             'owner_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = s.assigned_user_id),
             'rule_name', (SELECT r.name FROM public.escalation_rules r WHERE r.id = s.rule_id),
             'hours_open', round(extract(epoch FROM (coalesce(s.resolved_at, now()) - s.created_at)) / 3600.0, 1),
             'ack_overdue', (s.acknowledged_at IS NULL AND s.acknowledgement_deadline IS NOT NULL AND s.acknowledgement_deadline < now()),
             'resolution_overdue', (s.resolved_at IS NULL AND s.resolution_deadline IS NOT NULL AND s.resolution_deadline < now())
           ) AS x
    FROM scoped s
    ORDER BY s.created_at DESC
    LIMIT greatest(coalesce(_limit, 50), 1) OFFSET greatest(coalesce(_offset, 0), 0)
  ) q;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

-- Detail ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_detail(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e public.escalations; v_uid uuid := auth.uid();
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'view');
  SELECT * INTO e FROM public.escalations WHERE id = _id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'escalation_not_found'; END IF;

  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid, 'escalation_management', 'configure')
          OR e.assigned_user_id = v_uid
          OR public.has_module_access_for_escalation(v_uid, e.source_module)) THEN
    RAISE EXCEPTION 'permission denied: escalation not in scope' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'escalation', to_jsonb(e) || jsonb_build_object(
        'owner_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = e.assigned_user_id),
        'acknowledged_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = e.acknowledged_by),
        'resolved_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = e.resolved_by)),
    'rule', (SELECT to_jsonb(r) FROM public.escalation_rules r WHERE r.id = e.rule_id),
    'tier_history', (SELECT coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
                        'actor_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = t.actor_id))
                        ORDER BY t.created_at), '[]'::jsonb)
                     FROM public.escalation_tier_events t WHERE t.escalation_id = _id),
    'ownership_history', (SELECT coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
                        'actor_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = o.actor_id),
                        'to_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = o.to_user_id))
                        ORDER BY o.created_at), '[]'::jsonb)
                     FROM public.escalation_ownership_events o WHERE o.escalation_id = _id),
    'notification_history', (SELECT coalesce(jsonb_agg(to_jsonb(n) || jsonb_build_object(
                        'recipient_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = n.recipient_user_id))
                        ORDER BY n.created_at DESC), '[]'::jsonb)
                     FROM public.escalation_notification_events n WHERE n.escalation_id = _id),
    'delivery_records', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'id', d.id, 'channel', d.channel, 'status', d.status, 'error', d.error,
                        'recipient_email', d.recipient_email, 'event_key', d.event_key,
                        'created_at', d.created_at, 'sent_at', d.sent_at) ORDER BY d.created_at DESC), '[]'::jsonb)
                     FROM public.notification_dispatch_log d
                     WHERE d.entity_type = 'escalation' AND d.entity_id = _id::text),
    'source_event', jsonb_build_object(
        'module', e.source_module, 'event', e.source_event,
        'entity_type', e.source_entity_type, 'entity_id', e.source_entity_id,
        'reference', e.source_reference, 'rule_id', e.source_rule_id,
        'metadata', e.metadata, 'correlation_id', e.correlation_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_feed(text[], text[], text[], integer[], text[], uuid, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalation_feed(text[], text[], text[], integer[], text[], uuid, timestamptz, timestamptz, text, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.escalation_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalation_detail(uuid) TO authenticated, service_role;

-- Stats ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalation_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'view');
  RETURN (
    SELECT jsonb_build_object(
      'open', count(*) FILTER (WHERE status IN ('open','acknowledged','in_progress','escalated')),
      'unacknowledged_overdue', count(*) FILTER (WHERE acknowledged_at IS NULL AND acknowledgement_deadline < now() AND status NOT IN ('resolved','closed')),
      'tier3', count(*) FILTER (WHERE current_tier = 3 AND status NOT IN ('resolved','closed')),
      'resolution_breached', count(*) FILTER (WHERE resolved_at IS NULL AND resolution_deadline < now() AND status NOT IN ('resolved','closed')),
      'critical', count(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','closed')),
      'resolved_30d', count(*) FILTER (WHERE resolved_at > now() - interval '30 days')
    ) FROM public.escalations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalation_stats() TO authenticated, service_role;

-- System health signals ------------------------------------------------
CREATE OR REPLACE VIEW public.escalation_health_signals
WITH (security_invoker = true) AS
SELECT 'integration_failure'::text AS signal_key,
       il.integration_key AS subject,
       count(*)::int AS failure_count,
       max(il.created_at) AS last_seen,
       'integration_failure'::text AS escalation_type
FROM public.integration_logs il
WHERE il.status IN ('error','failed') AND il.created_at > now() - interval '24 hours'
GROUP BY il.integration_key
UNION ALL
SELECT 'background_job_failure', jq.type, count(*)::int, max(jq.updated_at), 'scheduler_failure'
FROM public.job_queue jq
WHERE jq.status = 'failed' AND jq.updated_at > now() - interval '24 hours'
GROUP BY jq.type
UNION ALL
SELECT 'notification_queue_failure', 'notification_outbox', count(*)::int, max(no2.created_at), 'notification_delivery_failure'
FROM public.notification_outbox no2
WHERE no2.status = 'failed' AND no2.created_at > now() - interval '24 hours'
HAVING count(*) > 0
UNION ALL
SELECT 'repeated_email_failure', 'email', count(*)::int, max(d.created_at), 'notification_delivery_failure'
FROM public.notification_dispatch_log d
WHERE d.channel = 'email' AND d.status = 'failed' AND d.created_at > now() - interval '24 hours'
HAVING count(*) > 0
UNION ALL
SELECT 'sms_provider_failure', coalesce(d.provider, 'sms'), count(*)::int, max(d.created_at), 'notification_delivery_failure'
FROM public.notification_dispatch_log d
WHERE d.channel = 'sms' AND d.status = 'failed' AND d.created_at > now() - interval '24 hours'
GROUP BY coalesce(d.provider, 'sms');

GRANT SELECT ON public.escalation_health_signals TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.escalation_health_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.enforce_permission('escalation_management', 'view_system_health');
  RETURN jsonb_build_object(
    'signals', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.last_seen DESC), '[]'::jsonb)
                FROM public.escalation_health_signals s),
    'open_health_escalations', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'escalation_ref', e.escalation_ref, 'escalation_type', e.escalation_type,
        'severity', e.severity, 'status', e.status, 'current_tier', e.current_tier,
        'source_event', e.source_event, 'source_reference', e.source_reference,
        'created_at', e.created_at, 'acknowledgement_deadline', e.acknowledgement_deadline,
        'acknowledged_at', e.acknowledged_at) ORDER BY e.created_at DESC), '[]'::jsonb)
      FROM public.escalations e
      WHERE e.source_module = 'system_health' AND e.status NOT IN ('resolved','closed'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_health_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalation_health_report() TO authenticated, service_role;

-- Health sweep: raise critical system-health escalations immediately ---
CREATE OR REPLACE FUNCTION public.escalation_health_sweep(_min_failures integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE s record; v_raised integer := 0;
BEGIN
  FOR s IN SELECT * FROM public.escalation_health_signals LOOP
    IF s.failure_count < greatest(coalesce(_min_failures, 3), 1) THEN CONTINUE; END IF;
    PERFORM public.escalation_raise(
      'system_health',
      s.signal_key || '.' || coalesce(s.subject, 'unknown'),
      s.escalation_type::public.escalation_type,
      'system', NULL,
      coalesce(s.subject, s.signal_key),
      'critical'::public.escalation_severity,
      NULL,
      jsonb_build_object('signal', s.signal_key, 'subject', s.subject,
                         'failure_count', s.failure_count, 'last_seen', s.last_seen),
      NULL);
    v_raised := v_raised + 1;
  END LOOP;
  RETURN jsonb_build_object('raised', v_raised);
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_health_sweep(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalation_health_sweep(integer) TO service_role;

-- Main sweep: automatic tier progression -------------------------------
CREATE OR REPLACE FUNCTION public.escalation_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e record; v_advanced integer := 0; v_scanned integer := 0; v_maxed integer := 0; v_res jsonb;
BEGIN
  FOR e IN
    SELECT id FROM public.escalations
    WHERE status IN ('open','acknowledged','in_progress','escalated')
      AND auto_escalate_paused_at IS NULL
      AND next_auto_escalation_at IS NOT NULL
      AND next_auto_escalation_at < now()
    ORDER BY severity, next_auto_escalation_at
    LIMIT 500
  LOOP
    v_scanned := v_scanned + 1;
    v_res := public.escalation_advance_tier(e.id, 'automatic', NULL);
    IF (v_res->>'ok')::boolean THEN
      v_advanced := v_advanced + 1;
    ELSE
      v_maxed := v_maxed + 1;
      UPDATE public.escalations SET next_auto_escalation_at = NULL WHERE id = e.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_scanned, 'advanced', v_advanced, 'terminal_tier', v_maxed)
      || public.escalation_health_sweep(3);
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalation_sweep() TO service_role;
