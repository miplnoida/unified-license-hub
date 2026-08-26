-- anon inherits EXECUTE via PUBLIC; revoke from PUBLIC and re-grant narrowly.
DO $$
DECLARE _sig text;
BEGIN
  FOR _sig IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('market_conduct_require','conduct_planning_scope',
                         'conduct_priority_compute','conduct_priority_register',
                         'conduct_intervention_guard','conduct_intervention_propose',
                         'conduct_intervention_decide','conduct_intervention_transition',
                         'conduct_intervention_case','tg_conduct_intervention_events_append_only')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', _sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _sig);
  END LOOP;
END $$;
