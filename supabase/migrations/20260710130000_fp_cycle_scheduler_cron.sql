-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule fp-cycle-scheduler so periodic/ongoing-monitoring reassessment
-- cycles open automatically instead of depending on a staff member clicking
-- the "Run Cycle Scheduler" button. The function itself is date-granularity
-- (next_reassessment_due <= today), so a once-daily run is frequent enough —
-- matches fp-monitoring-sweep-6h's reasoning and the existing
-- license-expiry-reminders-daily job, just offset to a different time so the
-- two daily jobs don't contend.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fp-cycle-scheduler-daily') THEN
      PERFORM cron.unschedule('fp-cycle-scheduler-daily');
    END IF;
    PERFORM cron.schedule(
      'fp-cycle-scheduler-daily',
      '0 3 * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/fp-cycle-scheduler',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
