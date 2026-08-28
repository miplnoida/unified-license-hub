SELECT cron.unschedule('licensing-provisioning-worker-1min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'licensing-provisioning-worker-1min');

SELECT cron.schedule(
  'licensing-provisioning-worker-1min',
  '* * * * *',
  $$select public.worker_kick('licensing-provisioning-worker');$$
);