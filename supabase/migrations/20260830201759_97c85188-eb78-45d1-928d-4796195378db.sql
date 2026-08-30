CREATE OR REPLACE FUNCTION public.notification_channel_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_smtp jsonb;
  v_workers jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_permission(v_uid, 'notification_management', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(value -> 'smtp', '{}'::jsonb)
    INTO v_smtp
    FROM public.site_settings
   WHERE key = 'email_sms_settings';

  -- Worker health: the run history is consumed ONCE (single scan + DISTINCT ON)
  -- instead of one LATERAL scan/sort per cron job. Semantics are unchanged:
  -- the latest run of each relevant worker, with a deterministic tie-break on
  -- runid when end_time is equal or NULL. No time-window filter is applied.
  WITH relevant_jobs AS (
    SELECT j.jobid,
           j.jobname::text AS jobname,
           j.schedule::text AS schedule,
           j.active
      FROM cron.job j
     WHERE j.jobname ILIKE '%notification%'
        OR j.jobname ILIKE '%digest%'
        OR j.jobname ILIKE '%escalation%'
  ),
  latest_runs AS (
    SELECT DISTINCT ON (r.jobid)
           r.jobid,
           r.end_time,
           r.status::text AS status
      FROM cron.job_run_details r
      JOIN relevant_jobs j ON j.jobid = r.jobid
     ORDER BY r.jobid, r.end_time DESC NULLS LAST, r.runid DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'jobname', j.jobname,
           'schedule', j.schedule,
           'active', j.active,
           'last_run_at', r.end_time,
           'last_status', r.status
         ) ORDER BY j.jobname), '[]'::jsonb)
    INTO v_workers
    FROM relevant_jobs j
    LEFT JOIN latest_runs r ON r.jobid = j.jobid;

  SELECT jsonb_build_object(
    'smtp', jsonb_build_object(
      'configured', COALESCE(
        COALESCE((v_smtp ->> 'enabled')::boolean, false)
        AND COALESCE(v_smtp ->> 'host', '') <> ''
        AND COALESCE(v_smtp ->> 'username', '') <> ''
        AND COALESCE(v_smtp ->> 'password', '') <> ''
        AND COALESCE(v_smtp ->> 'fromEmail', '') <> '', false),
      'host_set', COALESCE(v_smtp ->> 'host', '') <> '',
      'enabled', COALESCE((v_smtp ->> 'enabled')::boolean, false)
    ),
    'sms', jsonb_build_object('configured', false, 'available', false, 'reason', 'sms_provider_not_configured'),
    'email', jsonb_build_object(
      'last_success_at', (SELECT max(sent_at) FROM public.notification_dispatch_log WHERE channel = 'email' AND status IN ('sent','delivered')),
      'failures_1h', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'email' AND status IN ('failed','bounced') AND created_at > now() - interval '1 hour'),
      'failures_24h', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'email' AND status IN ('failed','bounced') AND created_at > now() - interval '24 hours'),
      'sent_24h', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'email' AND status IN ('sent','delivered') AND created_at > now() - interval '24 hours'),
      'bounced_24h', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'email' AND status = 'bounced' AND created_at > now() - interval '24 hours'),
      'poisoned', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'email' AND poisoned)
    ),
    'in_app', jsonb_build_object(
      'last_success_at', (SELECT max(delivered_at) FROM public.notification_dispatch_log WHERE channel = 'in_app' AND status = 'delivered'),
      'failures_24h', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'in_app' AND status = 'failed' AND created_at > now() - interval '24 hours')
    ),
    'queue', jsonb_build_object(
      'dispatch_pending', (SELECT count(*) FROM public.notification_dispatch_log WHERE status IN ('queued','processing')),
      'dispatch_oldest_pending_at', (SELECT min(created_at) FROM public.notification_dispatch_log WHERE status IN ('queued','processing')),
      'event_queue_pending', (SELECT count(*) FROM public.notification_event_queue WHERE status = 'pending'),
      'event_queue_dead', (SELECT count(*) FROM public.notification_event_queue WHERE status = 'dead'),
      'event_queue_oldest_pending_at', (SELECT min(created_at) FROM public.notification_event_queue WHERE status = 'pending'),
      'retry_backlog', (SELECT count(*) FROM public.notification_dispatch_log WHERE channel = 'email' AND status = 'failed' AND poisoned = false AND attempts < 5)
    ),
    'workers', v_workers,
    'recent_errors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_key', e.event_key,
        'channel', e.channel,
        'status', e.status,
        'attempts', e.attempts,
        'created_at', e.created_at,
        'recipient_masked', CASE
          WHEN e.recipient_email IS NULL THEN NULL
          ELSE regexp_replace(e.recipient_email, '^(.).*(@.*)$', '\1***\2')
        END,
        'error', left(regexp_replace(COALESCE(e.error, ''), '(?i)(pass(word)?|secret|token|key)\s*[:=]\s*\S+', '\1=[redacted]', 'g'), 240)
      ) ORDER BY e.created_at DESC)
      FROM (
        SELECT * FROM public.notification_dispatch_log
         WHERE status IN ('failed','bounced')
         ORDER BY created_at DESC LIMIT 10
      ) e
    ), '[]'::jsonb),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END; $function$;