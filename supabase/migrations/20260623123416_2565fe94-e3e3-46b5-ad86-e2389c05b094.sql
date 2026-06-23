DO $$
DECLARE
  r record;
  res jsonb;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  FOR r IN
    SELECT id, application_number FROM public.applications
     WHERE workflow_id IS NULL
       AND status IN ('submitted','in_progress','resubmission_requested',
                      'resubmission_required','returned_for_correction',
                      'info_requested','query_raised','in_review',
                      'pending_review','under_review','forwarded','awaiting_approval')
  LOOP
    res := public.repair_application_workflow(r.id);
    RAISE NOTICE 'repair % => %', r.application_number, res;
  END LOOP;
END $$;