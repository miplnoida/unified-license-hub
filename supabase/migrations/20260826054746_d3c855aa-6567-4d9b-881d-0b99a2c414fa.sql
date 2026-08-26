ALTER FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.normalize_complaint_regulator_route() OWNER TO postgres;
ALTER FUNCTION public.normalize_complaint_jurisdiction_regulator_route() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_complaint_regulator_route() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_complaint_jurisdiction_regulator_route() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_complaint_regulator_route() TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_complaint_jurisdiction_regulator_route() TO service_role;