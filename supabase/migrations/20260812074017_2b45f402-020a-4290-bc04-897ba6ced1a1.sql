DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_application_decision_rationale'
      AND tgrelid = 'public.approval_actions'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Decision rationale synchronization trigger is missing';
  END IF;

  IF has_function_privilege('authenticated', 'public.sync_application_decision_rationale()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must not execute the rationale synchronization trigger function directly';
  END IF;
END;
$$;