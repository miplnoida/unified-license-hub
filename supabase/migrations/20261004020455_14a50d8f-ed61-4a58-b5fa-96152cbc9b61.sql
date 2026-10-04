REVOKE ALL ON public.supervisory_calculation_applicability_rule FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.supervisory_calculation_applicability_rule FROM authenticated;
GRANT SELECT ON public.supervisory_calculation_applicability_rule TO authenticated;
GRANT ALL ON public.supervisory_calculation_applicability_rule TO service_role;