REVOKE EXECUTE ON FUNCTION public.license_lifecycle_step(uuid, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.license_related_cases(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_related_cases(uuid) TO authenticated, service_role;