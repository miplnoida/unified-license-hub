-- SEC-A0 rollback (NOT to be run without approval).
-- Restores privileged execution only. Never grants to PUBLIC, anon or authenticated.
-- The destructive-function arming guard (sec_a0_require_armed) is intentionally KEPT.
DO $rb$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_certification_runner') THEN
      -- Restores the certification runner identity only if explicitly re-approved.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_certification_runner', f.sig);
    END IF;
  END LOOP;
END $rb$;
-- Evidence tables remain (append-only audit). Arming table remains empty.
