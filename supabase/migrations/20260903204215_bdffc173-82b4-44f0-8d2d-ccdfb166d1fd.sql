REVOKE ALL ON FUNCTION public.supervisory_calc_as_of_for(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_calc_as_of_for(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_as_of_for(uuid) TO authenticated, service_role;