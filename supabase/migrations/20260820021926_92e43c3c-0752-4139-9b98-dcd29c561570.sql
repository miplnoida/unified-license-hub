DO $$
DECLARE r jsonb;
BEGIN
  r := public.escalation_sweep();
  RAISE NOTICE 'escalation_sweep result: %', r;
END $$;