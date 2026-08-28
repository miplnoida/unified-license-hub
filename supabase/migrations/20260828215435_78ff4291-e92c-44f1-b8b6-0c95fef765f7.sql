REVOKE ALL ON FUNCTION public.post_license_establishment_input(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_establishment_reference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.regulated_establishment_write_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_application_establishment_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_license_establishment_input(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_establishment_reference() TO service_role;