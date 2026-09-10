-- AML-08 hardening: the internal consequence source/target resolvers and the
-- trigger guard functions are implementation detail. Signed-in users must reach
-- them only through the governed operations, never directly.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('supervisory_consequence_source_internal',
                         'supervisory_consequence_target_internal',
                         'supervisory_consequence_writer_guard',
                         'supervisory_consequence_immutable_guard')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('supervisory_consequence_source_internal','supervisory_consequence_target_internal',
                       'supervisory_consequence_writer_guard','supervisory_consequence_immutable_guard')
     AND has_function_privilege('authenticated', p.oid, 'execute');
  IF n > 0 THEN
    RAISE EXCEPTION 'AML-08: % internal helpers remain callable by signed-in users', n;
  END IF;
END $$;