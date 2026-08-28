-- ============================================================================
-- F0-B7 — vacuous SECURITY DEFINER guard gate
--
-- Fails when a SECURITY DEFINER routine in schema public uses `current_user`
-- as an authorization predicate. Inside a SECURITY DEFINER function
-- `current_user` is the function owner, so such a guard can never deny.
-- Request-derived identity must be used instead
-- (public.request_role() / public.is_trusted_service_request() / auth.uid()).
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-definer-guards.sql
-- ============================================================================

\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
-- Every gate restores the default explicitly so RLS probes are deterministic.
SET row_security = on;
SET client_min_messages = notice;

DO $verify$
DECLARE
  v_defects int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND pg_get_functiondef(p.oid) ~* '(^|[^_[:alnum:]])current_user([^_[:alnum:]]|$)'
    ORDER BY 1
  LOOP
    -- Allowed: workflow_resolve_actor reads the JWT role claim first and only
    -- falls back to current_user, which can never equal 'service_role'.
    IF r.sig LIKE 'workflow_resolve_actor(%' THEN
      CONTINUE;
    END IF;
    v_defects := v_defects + 1;
    RAISE WARNING 'DEFECT vacuous definer guard: % references current_user', r.sig;
  END LOOP;

  IF v_defects > 0 THEN
    RAISE EXCEPTION 'F0-B7 regression: % SECURITY DEFINER routine(s) authorize on current_user', v_defects;
  END IF;

  IF to_regprocedure('public.is_trusted_service_request()') IS NULL
     OR to_regprocedure('public.request_role()') IS NULL THEN
    RAISE EXCEPTION 'F0-B7 regression: request-identity helpers are missing';
  END IF;

  -- Trigger functions must never be directly callable through the API roles.
  SELECT count(*) INTO v_defects
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prorettype = 'trigger'::regtype
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_defects > 0 THEN
    RAISE EXCEPTION 'F0-B7 regression: % trigger function(s) executable by anon/authenticated', v_defects;
  END IF;

  RAISE NOTICE 'F0-B7 definer-guard gate: PASS';
END
$verify$;
