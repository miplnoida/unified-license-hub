-- Digest dispatch entirely inside Postgres so scheduled runs do not depend on
-- HTTP worker credentials being present in the pg_cron session.
CREATE OR REPLACE FUNCTION public.notification_digest_dispatch(
  _period text,
  _period_start timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_build jsonb;
  v_run record;
  v_email text;
  v_body text;
  v_subject text;
  v_label text;
  v_queued int := 0;
  v_skipped int := 0;
BEGIN
  IF _period NOT IN ('hourly','daily') THEN
    RAISE EXCEPTION 'invalid_digest_period: %', _period USING ERRCODE = 'P0001';
  END IF;

  v_build := public.notification_digest_build(_period, _period_start);
  v_label := CASE WHEN _period = 'hourly' THEN 'Hourly' ELSE 'Daily' END;

  FOR v_run IN
    SELECT r.*
    FROM public.notification_digest_runs r
    WHERE r.period = _period
      AND r.status IN ('pending','failed')
      AND r.item_count > 0
  LOOP
    SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = v_run.user_id;

    IF v_email IS NULL OR v_email = '' THEN
      PERFORM public.notification_digest_mark(v_run.id, 'failed', 'no_recipient_email');
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT string_agg(
             format('- [%s] %s: %s', upper(n.severity::text), n.title, coalesce(n.message,'')),
             E'\n' ORDER BY n.created_at
           )
      INTO v_body
      FROM public.notification_digest_items di
      JOIN public.notifications n ON n.id = di.notification_id
     WHERE di.run_id = v_run.id;

    v_subject := format('%s notification digest — %s update(s)', v_label, v_run.item_count);
    v_body := format(
      E'%s notification digest for %s to %s.\n\nYou have %s new notification(s):\n\n%s\n\nOpen the Notification Centre to review and act on these items.\nYou can change your digest settings in Settings > Notifications.',
      v_label,
      to_char(v_run.period_start, 'DD Mon YYYY HH24:MI'),
      to_char(v_run.period_end, 'DD Mon YYYY HH24:MI'),
      v_run.item_count,
      coalesce(v_body, '')
    );

    INSERT INTO public.notification_outbox
      (event_key, entity_type, entity_id, recipient_user_id, recipient_email,
       channel, subject, body, payload, status)
    VALUES
      ('notification.digest', 'notification_digest_run', v_run.id, v_run.user_id, v_email,
       'email', v_subject, v_body,
       jsonb_build_object('period', _period, 'item_count', v_run.item_count,
                          'period_start', v_run.period_start, 'period_end', v_run.period_end),
       'pending');

    PERFORM public.notification_digest_mark(v_run.id, 'sent', NULL);
    v_queued := v_queued + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'period', _period,
    'built', coalesce(jsonb_array_length(v_build->'runs'), 0),
    'queued', v_queued,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notification_digest_dispatch(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_digest_dispatch(text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_digest_dispatch(text, timestamptz) TO service_role;

-- Reschedule digest jobs to run the routine directly (no HTTP credentials needed).
SELECT cron.unschedule('notification-digest-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-digest-hourly');
SELECT cron.unschedule('notification-digest-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-digest-daily');

SELECT cron.schedule(
  'notification-digest-hourly',
  '10 * * * *',
  $$SELECT public.notification_digest_dispatch('hourly');$$
);

SELECT cron.schedule(
  'notification-digest-daily',
  '0 6 * * *',
  $$SELECT public.notification_digest_dispatch('daily');$$
);
