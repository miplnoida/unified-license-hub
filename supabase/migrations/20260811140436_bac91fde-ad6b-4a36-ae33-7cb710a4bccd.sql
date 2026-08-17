DO $$
BEGIN
  PERFORM set_config('conduct.closure_rpc','on', true);
  UPDATE public.conduct_investigation_closures
     SET status='draft',
         findings_summary=NULL,
         evidence_relied_upon=NULL,
         rationale=NULL
   WHERE id='6b58deee-3ba5-4d2d-8dba-c09d18e5b7af';
  DELETE FROM public.conduct_post_closure_monitoring WHERE id='32b1638e-002e-4428-9984-0b1272547dc1';
  PERFORM set_config('conduct.closure_rpc','off', true);
END $$;