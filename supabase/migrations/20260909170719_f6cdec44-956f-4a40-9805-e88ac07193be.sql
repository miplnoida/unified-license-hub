-- These two are internal calculation helpers, not governed entry points:
-- the snapshot builder bypasses the confidentiality filters applied by the
-- read models, and the authority helper is the check itself. Only the
-- SECURITY DEFINER operations that call them may reach them.
REVOKE ALL ON FUNCTION public.supervisory_calc_inputs_snapshot(uuid) FROM authenticated, anon, PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_calc_run_authority(uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_inputs_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_run_authority(uuid) TO service_role;