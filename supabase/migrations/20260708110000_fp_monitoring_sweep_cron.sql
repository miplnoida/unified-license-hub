-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule fp-monitoring-sweep so condition reminders and SLA breach detection
-- run automatically instead of depending on a staff member clicking "Trigger
-- recheck" on an unrelated page. Reminders/breaches are day-granularity (7-day
-- lookahead, due-date comparisons), so a 6-hourly cadence is frequent enough —
-- matches the existing cron pattern used by sla-escalation-sweep-15min /
-- license-expiry-reminders-daily / notification-failure-sweep-hourly.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fp-monitoring-sweep-6h') THEN
      PERFORM cron.unschedule('fp-monitoring-sweep-6h');
    END IF;
    PERFORM cron.schedule(
      'fp-monitoring-sweep-6h',
      '0 */6 * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/fp-monitoring-sweep',
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
