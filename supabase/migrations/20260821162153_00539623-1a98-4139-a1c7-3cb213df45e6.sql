REVOKE EXECUTE ON FUNCTION public.license_fee_simulate(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_preview(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.license_fee_configuration_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.license_is_certification_scoped(uuid) FROM anon;