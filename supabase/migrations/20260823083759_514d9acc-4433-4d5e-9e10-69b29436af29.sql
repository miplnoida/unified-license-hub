
CREATE OR REPLACE FUNCTION public.cert_v2_zero_message_runtime()
RETURNS TABLE(table_name text, rows_before bigint, rows_after bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tables text[] := ARRAY[
    'notifications','notification_event_queue','notification_dispatch_log',
    'notification_delivery_attempts','notification_digest_queue',
    'correspondence_messages','correspondence_threads','correspondence_dispatches',
    'correspondence_events','correspondence_attachments',
    'audit_logs','compliance_audit_logs','security_event_logs','integration_logs',
    'worker_invocation_tokens','otp_verifications','document_action_logs'
  ];
  t text; v_before bigint; v_after bigint;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_before;
      IF v_before > 0 THEN
        EXECUTE format('DELETE FROM public.%I', t);
      END IF;
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_after;
      RETURN QUERY SELECT t, v_before, v_after;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_zero_message_runtime() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_message_runtime() TO service_role;
