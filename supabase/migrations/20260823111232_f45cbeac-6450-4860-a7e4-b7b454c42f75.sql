CREATE OR REPLACE FUNCTION public.cert_v2_clear_message_runtime()
RETURNS TABLE(table_name text, rows_deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t text;
  n bigint;
  v_tables text[] := ARRAY[
    'notification_digest_items','notification_digest_log','notification_digest_runs',
    'notification_dispatch_log','notification_event_queue','notification_outbox','notifications',
    'correspondence_attachments','correspondence_events','correspondence_dispatches',
    'correspondence_messages','correspondence_thread_participants','correspondence_threads'
  ];
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables it
                WHERE it.table_schema = 'public' AND it.table_name = t) THEN
      n := public.cert_v2_exec_unguarded(
             t,
             format('DELETE FROM public.%I WHERE ($1 IS NULL OR id = ANY($1))', t),
             NULL::uuid[]);
      RETURN QUERY SELECT t, n;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.cert_v2_clear_message_runtime() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_clear_message_runtime() TO service_role;