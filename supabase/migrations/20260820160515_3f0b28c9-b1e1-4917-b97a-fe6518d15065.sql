-- A1 Prudential/Supervisory: withdraw direct browser DML on canonical stores.
-- All mutations must now flow through the governed operations
-- (prudential_* / supervisory_* SECURITY DEFINER routines) which enforce
-- authority, rationale and audit server-side. Read access is unchanged.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prudential_assessments',
    'prudential_assessment_component_ratings',
    'prudential_actions',
    'prudential_escalations',
    'prudential_risk_taxonomy',
    'prudential_thresholds',
    'prudential_ratios',
    'prudential_stress_indicators',
    'prudential_stress_events',
    'prudential_data_feed_logs',
    'supervisory_plans',
    'supervisory_plan_actions',
    'return_threshold_breaches'
  ]
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;