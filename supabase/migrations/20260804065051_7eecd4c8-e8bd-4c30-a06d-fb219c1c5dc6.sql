CREATE OR REPLACE FUNCTION public.integration_alert_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_errors bigint;
  v_fired int := 0;
BEGIN
  FOR r IN
    SELECT ar.*, c.integration_key, c.name AS connection_name
    FROM public.integration_alert_rules ar
    LEFT JOIN public.integration_connections c ON c.id = ar.connection_id
    WHERE ar.enabled
  LOOP
    SELECT COUNT(*) INTO v_errors
    FROM public.integration_logs l
    WHERE l.status = 'failure'
      AND l.created_at > now() - make_interval(mins => r.window_minutes)
      AND (r.connection_id IS NULL OR l.integration_key = r.integration_key);

    IF v_errors >= r.error_count_threshold
       AND (r.last_fired_at IS NULL
            OR r.last_fired_at < now() - make_interval(mins => r.window_minutes)) THEN

      PERFORM public.escalation_raise(
        'integration_manager',
        'integration_error_threshold_breached',
        'integration_failure'::escalation_type,
        'integration_connection',
        r.connection_id,
        COALESCE(r.integration_key, 'global'),
        'high'::escalation_severity,
        NULL,
        jsonb_build_object(
          'alert_rule_id', r.id,
          'connection_name', COALESCE(r.connection_name, 'All integrations'),
          'error_count', v_errors,
          'window_minutes', r.window_minutes,
          'threshold', r.error_count_threshold,
          'recipient_user_ids', r.recipient_user_ids,
          'recipient_emails', r.recipient_emails
        ),
        NULL
      );

      UPDATE public.integration_alert_rules SET last_fired_at = now() WHERE id = r.id;
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('rules_fired', v_fired, 'swept_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.integration_alert_sweep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_alert_sweep() TO service_role;