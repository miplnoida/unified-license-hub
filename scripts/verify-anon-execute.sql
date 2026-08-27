-- ============================================================================
-- GAP-F0-08 — anonymous EXECUTE certification gate
--
-- Fails when any project-owned (non-extension) routine in schema public is
-- executable by the anon role without an entry in
-- public.sec_anon_execute_allowlist.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-anon-execute.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = notice;

DO $verify$
DECLARE
  v_defects int;
  v_allowed int;
  v_ext int;
  r record;
BEGIN
  SELECT count(*) FILTER (WHERE NOT allowlisted AND NOT is_extension),
         count(*) FILTER (WHERE allowlisted),
         count(*) FILTER (WHERE is_extension)
    INTO v_defects, v_allowed, v_ext
  FROM public.sec_anon_executable_functions;

  RAISE NOTICE 'anon-executable: % allowlisted, % extension-owned (residual), % defects',
    v_allowed, v_ext, v_defects;

  IF v_defects > 0 THEN
    FOR r IN
      SELECT signature, security_definer
      FROM public.sec_anon_executable_functions
      WHERE NOT allowlisted AND NOT is_extension
      ORDER BY signature
    LOOP
      RAISE WARNING 'DEFECT anon-executable: % (security_definer=%)', r.signature, r.security_definer;
    END LOOP;
    RAISE EXCEPTION 'GAP-F0-08 regression: % project routine(s) executable by anon without an allowlist entry', v_defects;
  END IF;

  -- Every allowlist entry must resolve to a real routine that is still callable.
  FOR r IN
    SELECT a.function_name
    FROM public.sec_anon_execute_allowlist a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sec_anon_executable_functions f
      WHERE f.function_name = a.function_name
    )
  LOOP
    RAISE EXCEPTION 'GAP-F0-08 drift: allowlisted routine % is not anon-executable (stale registry entry)', r.function_name;
  END LOOP;

  RAISE NOTICE 'GAP-F0-08 anonymous EXECUTE gate: PASS';
END
$verify$;
