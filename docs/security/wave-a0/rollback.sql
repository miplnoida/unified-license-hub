-- SEC-A0 v2 rollback. NOT to be run without explicit approval.
-- Purpose: restore legitimate privileged execution if certification tooling breaks.
-- NEVER reversed by this script (security controls preserved):
--   * no GRANT to PUBLIC, anon, authenticated or app_certification_runner
--   * destructive wrappers and the sec_a0_require_armed guard are kept
--   * __a0_impl functions stay owner-only and are not renamed back
--   * the permanent deny row in sec_a0_environment_identity is kept
--   * evidence tables are kept (append-only)
-- Callers keep resolving the same function names, so application behavior is unchanged.
DO $rb$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
             AND p.proname NOT LIKE '%\_\_a0\_impl'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $rb$;
