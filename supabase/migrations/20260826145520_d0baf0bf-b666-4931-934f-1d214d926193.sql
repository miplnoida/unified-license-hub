-- MC-08 certification defect: the AI control-plane registers had been left with
-- blanket privileges for anon and authenticated, so a browser session could in
-- principle write directly to the model, instruction, stop-control, surface,
-- activity and assurance registers, bypassing the governed operations. Reduce
-- them to read-only for signed-in staff (RLS still scopes the rows), remove
-- anonymous access entirely, and keep write access to server-side roles.
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'ai_governance_models','ai_governance_instructions','ai_governance_kill_switches',
    'ai_governance_surfaces','ai_governance_events','ai_governance_activity_attempts',
    'ai_assurance_reviews','ai_assurance_criteria_assessments','ai_governance_thresholds',
    'ai_prohibited_actions','conduct_ai_use_cases','conduct_ai_insights','conduct_ai_review_events'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', _t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', _t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
  END LOOP;
END $$;