REVOKE EXECUTE ON FUNCTION public.fp_positive_outcomes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.application_status_vocabulary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_positive_outcomes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.application_status_vocabulary() TO authenticated, service_role;