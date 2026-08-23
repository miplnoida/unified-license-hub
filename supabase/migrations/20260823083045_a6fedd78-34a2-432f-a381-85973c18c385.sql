
REVOKE ALL ON FUNCTION public.cert_v2_auth_identity_classification() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_auth_purge_precheck() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_auth_identity_classification() TO service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_auth_purge_precheck() TO service_role;
REVOKE ALL ON FUNCTION public.cert_v2_operational_area_matrix() FROM PUBLIC, anon;
