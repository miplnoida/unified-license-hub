ALTER FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_complaint_regulator_route() SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_complaint_jurisdiction_regulator_route() SET search_path = public, pg_temp;