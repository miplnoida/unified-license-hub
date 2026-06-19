
CREATE OR REPLACE FUNCTION public.mark_expired_licenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.licenses
     SET status = 'expired', updated_at = now()
   WHERE status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill now
SELECT public.mark_expired_licenses();

-- Schedule daily at 00:05 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('mark-expired-licenses-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-expired-licenses-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mark-expired-licenses-daily',
  '5 0 * * *',
  $$ SELECT public.mark_expired_licenses(); $$
);
