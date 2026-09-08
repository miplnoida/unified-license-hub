REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_reference_decision FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_regulator_approval FROM authenticated;

GRANT SELECT ON public.supervisory_methodology_reference_decision TO authenticated;
GRANT SELECT ON public.supervisory_methodology_regulator_approval TO authenticated;

GRANT ALL ON public.supervisory_methodology_reference_decision TO service_role;
GRANT ALL ON public.supervisory_methodology_regulator_approval TO service_role;