-- MC-10 privilege lockdown.
-- These registers inherited blanket table privileges for anon/authenticated, which
-- is inconsistent with the MC-05..MC-09 baseline where the authoritative supervisory
-- record is only mutated through SECURITY DEFINER governed operations.
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'conduct_attention_items','conduct_attention_events','conduct_attention_priority_calcs',
    'conduct_attention_reassessments','conduct_supervisory_plans','conduct_plan_events',
    'conduct_plan_milestones','conduct_interventions','conduct_intervention_events',
    'conduct_intervention_types','conduct_priority_configs','conduct_priority_runs',
    'conduct_priority_scores'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', _t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', _t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
  END LOOP;
END $$;