-- AML-06 policy and calculation-run tables must be read-only to signed-in users:
-- every write goes through a governed SECURITY DEFINER operation that enforces
-- configuration authority, maker/checker and append-only run history.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supervisory_calculation_question_weight',
    'supervisory_calculation_dimension_weight',
    'supervisory_calculation_fact_rule',
    'supervisory_calculation_fact_threshold',
    'supervisory_calculation_materiality_rule',
    'supervisory_assessment_calculation_run',
    'supervisory_assessment_calculation_override'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated, anon, PUBLIC', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;