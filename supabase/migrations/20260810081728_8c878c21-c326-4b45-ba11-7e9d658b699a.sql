-- Generic scheduler kick that reuses the working single-use worker-token path.
CREATE OR REPLACE FUNCTION public.worker_kick(_function_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN public.notification_worker_kick(_function_name);
END; $function$;

REVOKE ALL ON FUNCTION public.worker_kick(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_kick(text) FROM anon, authenticated;

SELECT cron.unschedule('sla-escalation-sweep-15min');
SELECT cron.schedule('sla-escalation-sweep-15min', '*/15 * * * *', $$select public.worker_kick('sla-escalation-sweep');$$);

SELECT cron.unschedule('fp-cycle-scheduler-daily');
SELECT cron.schedule('fp-cycle-scheduler-daily', '0 3 * * *', $$select public.worker_kick('fp-cycle-scheduler');$$);

SELECT cron.unschedule('fp-monitoring-sweep-6h');
SELECT cron.schedule('fp-monitoring-sweep-6h', '0 */6 * * *', $$select public.worker_kick('fp-monitoring-sweep');$$);

SELECT cron.unschedule('run-scheduled-reports-hourly');
SELECT cron.schedule('run-scheduled-reports-hourly', '0 * * * *', $$select public.worker_kick('run-scheduled-reports');$$);