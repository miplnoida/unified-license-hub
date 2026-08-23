REVOKE ALL ON FUNCTION public.is_production_environment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_production_environment() TO service_role;