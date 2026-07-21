-- Ensures every SECURITY DEFINER function in `public` pins its search_path.
-- Any new definer function must include `SET search_path = ...`. This test
-- fails CI when a regression is introduced.
--
-- Allowlist is intentionally empty — we now expect zero unsafe definer
-- functions in `public`. Add exceptions here only with a written rationale
-- and a matching entry in docs/rbac/audit-2026-07-21/08_rpc_security.md.
BEGIN;
SELECT plan(1);

WITH offenders AS (
  SELECT p.proname
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
      WHERE c LIKE 'search_path=%'
    )
)
SELECT is(
  (SELECT COUNT(*)::int FROM offenders),
  0,
  'every SECURITY DEFINER function in public pins search_path'
);

SELECT * FROM finish();
ROLLBACK;
