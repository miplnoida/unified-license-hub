-- 1. Allow the EWI evaluation to run in a trusted system context (scheduled sweep),
--    while keeping the existing per-user authorization check for human callers.
DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prudential_ewi_evaluate';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'prudential_ewi_evaluate not found';
  END IF;

  v_def := replace(
    v_def,
    'IF NOT public.can_read_prudential_entity(auth.uid(), _entity_id) THEN',
    'IF NOT (current_user IN (''service_role'',''postgres'',''supabase_admin'') OR public.can_read_prudential_entity(auth.uid(), _entity_id)) THEN'
  );

  EXECUTE v_def;
END $mig$;

-- 2. Validate stress indicator taxonomy codes against the configured taxonomy.
CREATE OR REPLACE FUNCTION public.validate_stress_indicator_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.taxonomy_code IS NOT NULL AND NEW.taxonomy_code <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.prudential_risk_taxonomy t WHERE t.code = NEW.taxonomy_code) THEN
      RAISE EXCEPTION 'Unknown risk taxonomy code: %', NEW.taxonomy_code
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_stress_indicator_taxonomy ON public.prudential_stress_indicators;
CREATE TRIGGER trg_validate_stress_indicator_taxonomy
  BEFORE INSERT OR UPDATE ON public.prudential_stress_indicators
  FOR EACH ROW EXECUTE FUNCTION public.validate_stress_indicator_taxonomy();

-- 3. Re-point the prudential schedules at the working single-use worker-token kick.
SELECT cron.unschedule('prudential-monitoring-sweep-daily');
SELECT cron.schedule('prudential-monitoring-sweep-daily', '0 0 * * *',
  $$select public.worker_kick('prudential-monitoring-sweep');$$);

SELECT cron.unschedule('overdue-action-sweep-daily');
SELECT cron.schedule('overdue-action-sweep-daily', '0 0 * * *',
  $$select public.worker_kick('overdue-action-sweep');$$);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prudential-early-warnings-daily') THEN
    PERFORM cron.unschedule('prudential-early-warnings-daily');
  END IF;
END $$;
SELECT cron.schedule('prudential-early-warnings-daily', '30 0 * * *',
  $$select public.worker_kick('evaluate-prudential-early-warnings');$$);