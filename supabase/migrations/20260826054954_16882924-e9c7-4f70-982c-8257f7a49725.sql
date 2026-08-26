DO $verify$
BEGIN
  IF has_function_privilege('anon','public.resolve_complaint_intake_regulator(uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.resolve_complaint_intake_regulator(uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.normalize_complaint_regulator_route()','EXECUTE')
     OR has_function_privilege('authenticated','public.normalize_complaint_regulator_route()','EXECUTE')
     OR has_function_privilege('anon','public.normalize_complaint_jurisdiction_regulator_route()','EXECUTE')
     OR has_function_privilege('authenticated','public.normalize_complaint_jurisdiction_regulator_route()','EXECUTE') THEN
    RAISE EXCEPTION 'MC-01 routing helper permission verification failed';
  END IF;
END;
$verify$;