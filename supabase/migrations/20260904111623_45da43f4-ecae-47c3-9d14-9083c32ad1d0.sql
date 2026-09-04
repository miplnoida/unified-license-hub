REVOKE EXECUTE ON FUNCTION public.supervisory_calc_policy_from_config(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer) FROM authenticated;
COMMENT ON FUNCTION public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer) IS
  'Internal engine. Not callable by signed-in users: reached only through supervisory_calc_compute_core (real calculation) or supervisory_calc_simulate (read-only calibration).';