-- MC-10: no supervisory planning operation may be invoked without signing in.
DO $$
DECLARE _f record;
BEGIN
  FOR _f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'conduct_attention%' OR p.proname LIKE 'conduct_plan_%'
            OR p.proname LIKE 'conduct_planning%' OR p.proname LIKE 'conduct_intervention%'
            OR p.proname LIKE 'conduct_priority%' OR p.proname = 'conduct_entity_planning_links')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', _f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', _f.sig);
  END LOOP;
END $$;