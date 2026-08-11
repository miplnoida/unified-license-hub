CREATE OR REPLACE FUNCTION public.escalation_notify(_escalation_id uuid, _event_key text, _role text, _tier integer, _title text, _body text, _immediate boolean DEFAULT false)
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
$function$;