-- P08 fix: wire complaint.rfi_due_reminder and
-- conduct_investigation.monitoring_review_due to real idempotent emitters
-- (complaint-rfi-reminder-sweep / conduct-monitoring-review-reminder-sweep)
-- and schedule them via pg_cron. Both were previously left is_active=false
-- with no emitter; they are reactivated here now that a real emitter exists.

UPDATE public.notification_event_configs
SET is_active = true,
    description = coalesce(description,'') || ' [reactivated: wired to complaint-rfi-reminder-sweep emitter, P08]'
WHERE event_key = 'complaint.rfi_due_reminder';

UPDATE public.notification_event_configs
SET is_active = true,
    description = coalesce(description,'') || ' [reactivated: wired to conduct-monitoring-review-reminder-sweep emitter, P08]'
WHERE event_key = 'conduct_investigation.monitoring_review_due';

DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'complaint-rfi-reminder-sweep-daily';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'complaint-rfi-reminder-sweep-daily',
  '15 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/complaint-rfi-reminder-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZGZ0dHpxbWJrbWtjbnJ2cGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDI5MjUsImV4cCI6MjA4NjAxODkyNX0.i8z3U8j6NO19dBmXTiHykQuqF0GSeEa4Ge7bgvDvJNI'
    ),
    body := jsonb_build_object('triggered_by','cron','at', now())
  );
  $cron$
);

DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'conduct-monitoring-review-reminder-sweep-daily';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'conduct-monitoring-review-reminder-sweep-daily',
  '25 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/conduct-monitoring-review-reminder-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZGZ0dHpxbWJrbWtjbnJ2cGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDI5MjUsImV4cCI6MjA4NjAxODkyNX0.i8z3U8j6NO19dBmXTiHykQuqF0GSeEa4Ge7bgvDvJNI'
    ),
    body := jsonb_build_object('triggered_by','cron','at', now())
  );
  $cron$
);
