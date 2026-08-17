DO $$
DECLARE
  v_config text[];
BEGIN
  SELECT proconfig INTO v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_application_decision_rationale';

  IF NOT ('search_path=public' = ANY(coalesce(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Rationale sync function search path is not fixed';
  END IF;
END;
$$;