REVOKE ALL ON FUNCTION public.sector_effective_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sector_effective_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sector_effective_id(uuid) TO authenticated, service_role;