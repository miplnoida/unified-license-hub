-- RC1 §5 — production cutover: remove certification / test-only database objects.
--
-- This migration is part of the permanent history and therefore also runs on
-- non-production deployments. It is a NO-OP unless the deployment is classified
-- as production by public.app_environment_config (see §3), so the certification
-- environment keeps its harness while a production install is cleaned.
--
-- Scope (classified TEST_ONLY / NONPROD_ONLY in
-- docs/certification/rc1-test-object-inventory.md):
--   * public.cert_*  tables and functions        (certification fixtures/harness)
--   * public.certification_seed_manifest         (fixture manifest)
--   * public.rc1_time_ms / rc1_time_as_user_ms   (latency measurement helpers)
--   * public._time_trial* scratch objects        (perf scratch)
--   * extension pgtap and every object it owns

DO $$
DECLARE
  r record;
  dropped_functions int := 0;
  dropped_tables    int := 0;
BEGIN
  IF NOT public.is_production_environment() THEN
    RAISE NOTICE 'RC1 cutover skipped: deployment is not classified as production';
    RETURN;
  END IF;

  -- 1. Functions first: they reference the fixture tables.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind IN ('f','p')
       AND (p.proname LIKE 'cert\_%'
         OR p.proname LIKE 'rc1\_%'
         OR p.proname LIKE '\_time\_trial%')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    dropped_functions := dropped_functions + 1;
  END LOOP;

  -- 2. Fixture / harness tables and views.
  FOR r IN
    SELECT c.relname, c.relkind
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r','v','m')
       AND (c.relname LIKE 'cert\_%'
         OR c.relname LIKE 'rc1\_%'
         OR c.relname LIKE '\_time\_trial%'
         OR c.relname = 'certification_seed_manifest')
  LOOP
    IF r.relkind = 'r' THEN
      EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
    ELSIF r.relkind = 'v' THEN
      EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
    ELSE
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.relname);
    END IF;
    dropped_tables := dropped_tables + 1;
  END LOOP;

  -- 3. pgTAP: unit-test framework, never required at runtime.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgtap') THEN
    EXECUTE 'DROP EXTENSION pgtap CASCADE';
  END IF;

  RAISE NOTICE 'RC1 cutover complete: % functions, % relations dropped',
    dropped_functions, dropped_tables;
END $$;