-- Wave 2: message runtime must be empty after seeding so notification E2E waves
-- start from a clean delivery baseline. Configuration (templates, event configs,
-- routing rules, preferences) is retained.
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
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND information_schema.tables.table_name = t) THEN
      PERFORM public.cert_v2_exec_unguarded(format('DELETE FROM public.%I', t));
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RETURN QUERY SELECT t, n;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.cert_v2_clear_message_runtime() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_clear_message_runtime() TO service_role;

CREATE OR REPLACE FUNCTION public.cert_v2_seed_universe(_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_run uuid; v_ref jsonb; v_ent jsonb; v_ret jsonb; v_calc jsonb; v_msg bigint;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  v_run := public.cert_v2_begin_run('WAVE2-UNIVERSE-1.0',
             COALESCE(_notes, 'Wave 2 supervisory universe (20 entities)'));
  v_ref  := public.cert_v2_seed_reference(v_run);
  v_ent  := public.cert_v2_seed_entities(v_run);
  v_ret  := public.cert_v2_seed_returns(v_run);
  v_calc := public.cert_v2_seed_calculate(v_run);
  SELECT coalesce(sum(rows_deleted),0) INTO v_msg FROM public.cert_v2_clear_message_runtime();
  PERFORM public.cert_v2_complete_run(v_run, 'completed');
  RETURN jsonb_build_object('run_id', v_run, 'reference', v_ref, 'entities', v_ent,
                            'returns', v_ret, 'calculation', v_calc,
                            'message_runtime_rows_remaining', v_msg);
END $$;

REVOKE ALL ON FUNCTION public.cert_v2_seed_universe(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_universe(text) TO service_role;