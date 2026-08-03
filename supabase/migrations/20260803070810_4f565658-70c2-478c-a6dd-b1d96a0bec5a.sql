ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS poisoned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;

UPDATE public.notification_dispatch_log
   SET attempts = COALESCE(retry_count, 0)
 WHERE attempts = 0 AND COALESCE(retry_count, 0) > 0;

CREATE INDEX IF NOT EXISTS idx_ndl_email_retry
  ON public.notification_dispatch_log (channel, status, next_attempt_at)
  WHERE channel = 'email' AND status = 'failed' AND poisoned = false;

CREATE INDEX IF NOT EXISTS idx_ndl_status_created
  ON public.notification_dispatch_log (status, created_at DESC);

UPDATE public.notification_dispatch_log
   SET status = 'sent',
       delivered_at = NULL
 WHERE channel = 'email'
   AND status = 'delivered'
   AND (provider IS NULL OR provider = 'smtp');

CREATE OR REPLACE FUNCTION public.notification_dispatch_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.rendered_content IS NOT NULL AND NEW.rendered_content IS DISTINCT FROM OLD.rendered_content THEN
    NEW.rendered_content := OLD.rendered_content;
  END IF;
  IF OLD.subject IS NOT NULL AND NEW.subject IS DISTINCT FROM OLD.subject THEN
    NEW.subject := OLD.subject;
  END IF;
  IF OLD.template_id IS NOT NULL AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN
    NEW.template_id := OLD.template_id;
  END IF;
  IF OLD.template_version IS NOT NULL AND NEW.template_version IS DISTINCT FROM OLD.template_version THEN
    NEW.template_version := OLD.template_version;
  END IF;
  IF OLD.recipient_email IS NOT NULL AND NEW.recipient_email IS DISTINCT FROM OLD.recipient_email THEN
    NEW.recipient_email := OLD.recipient_email;
  END IF;
  IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    NEW.sent_at := OLD.sent_at;
  END IF;
  IF OLD.event_key IS NOT NULL AND NEW.event_key IS DISTINCT FROM OLD.event_key THEN
    NEW.event_key := OLD.event_key;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ndl_immutable ON public.notification_dispatch_log;
CREATE TRIGGER trg_ndl_immutable
  BEFORE UPDATE ON public.notification_dispatch_log
  FOR EACH ROW EXECUTE FUNCTION public.notification_dispatch_log_immutable();

CREATE OR REPLACE FUNCTION public.claim_email_retry_batch(_limit integer DEFAULT 25, _worker text DEFAULT NULL)
RETURNS SETOF public.notification_dispatch_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
      FROM public.notification_dispatch_log
     WHERE channel = 'email'
       AND status = 'failed'
       AND poisoned = false
       AND attempts < 5
       AND recipient_email IS NOT NULL
       AND COALESCE(error, '') NOT IN ('no_email', 'recipient_preference_opted_out', 'deferred_to_digest')
       AND COALESCE(error, '') !~* 'no such user|mailbox unavailable|recipient rejected|smtp authentication failed'
       AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
     ORDER BY created_at
     LIMIT GREATEST(1, COALESCE(_limit, 25))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_dispatch_log l
     SET status = 'processing',
         claimed_at = now(),
         claimed_by = _worker
    FROM claimed c
   WHERE l.id = c.id
  RETURNING l.*;
END; $$;

REVOKE ALL ON FUNCTION public.claim_email_retry_batch(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_retry_batch(integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.notification_channel_health()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_smtp jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_permission(v_uid, 'notification_management', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(value -> 'smtp', '{}'::jsonb)
    INTO v_smtp
    FROM public.site_settings
   WHERE key = 'email_sms_settings';

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
    'workers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jobname', w.jobname,
        'schedule', w.schedule,
        'active', w.active,
        'last_run_at', w.last_run_at,
        'last_status', w.last_status
      ) ORDER BY w.jobname)
      FROM (
        SELECT j.jobname::text AS jobname,
               j.schedule::text AS schedule,
               j.active,
               d.end_time AS last_run_at,
               d.status::text AS last_status
          FROM cron.job j
          LEFT JOIN LATERAL (
            SELECT end_time, status FROM cron.job_run_details r
             WHERE r.jobid = j.jobid ORDER BY end_time DESC NULLS LAST LIMIT 1
          ) d ON true
         WHERE j.jobname ILIKE '%notification%' OR j.jobname ILIKE '%digest%' OR j.jobname ILIKE '%escalation%'
      ) w
    ), '[]'::jsonb),
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
END; $$;

REVOKE ALL ON FUNCTION public.notification_channel_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_channel_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_channel_health() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-email-retry-worker') THEN
      PERFORM cron.unschedule('notification-email-retry-worker');
    END IF;
    PERFORM cron.schedule(
      'notification-email-retry-worker',
      '*/2 * * * *',
      $cron$ SELECT public.notification_worker_kick('notification-email-retry-worker'); $cron$
    );
  END IF;
END $$;