-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule run-scheduled-reports so "Schedule Report" actually delivers
-- automatically instead of only running when a user clicks "Run Now".
--
-- The edge function already scans every active report_schedules row where
-- next_run_at <= now() when called with no scheduleId in the body — no
-- function code changes are needed, only the missing cron registration.
-- The migration that created report_schedules
-- (20260609095834_4ecb7770-0ec7-4818-82ae-a3fa7259cfd9.sql) shipped this as a
-- commented-out instruction for an admin to run manually later; nothing ever
-- did. Mirrors the exact live pattern already used by fp-monitoring-sweep-6h
-- (20260708110000_fp_monitoring_sweep_cron.sql) — same project ref, same
-- app.settings.service_role_key auth header.
--
-- Hourly cadence: the finest schedule frequency offered is 'daily', so hourly
-- polling delivers well within that window without over-polling.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-scheduled-reports-hourly') THEN
      PERFORM cron.unschedule('run-scheduled-reports-hourly');
    END IF;
    PERFORM cron.schedule(
      'run-scheduled-reports-hourly',
      '0 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/run-scheduled-reports',
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
