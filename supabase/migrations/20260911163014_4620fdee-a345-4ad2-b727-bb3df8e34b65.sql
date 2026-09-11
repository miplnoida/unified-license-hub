-- PCOMP-R2D (3): trigger routines are platform-internal only.
REVOKE ALL ON FUNCTION public.supervisory_response_sla_obligation_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_response_sla_writer_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_response_sla_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_obligation_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_writer_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_sync() TO service_role;