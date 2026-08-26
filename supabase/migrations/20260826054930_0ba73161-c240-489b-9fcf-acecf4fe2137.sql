REVOKE ALL ON FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_complaint_regulator_route() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_complaint_jurisdiction_regulator_route() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_complaint_regulator_route() TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_complaint_jurisdiction_regulator_route() TO service_role;