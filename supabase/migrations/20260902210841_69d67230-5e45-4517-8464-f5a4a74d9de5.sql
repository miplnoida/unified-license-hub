DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE proname = 'aml_entity_panel' AND pronamespace = 'public'::regnamespace;
  d := replace(d,
    'WHERE entity_id = _entity_id AND domain_code=''AML_CFT'' ORDER BY approved_at DESC LIMIT 1;',
    'WHERE entity_id = _entity_id AND domain_code=''AML_CFT''
   ORDER BY (new_assessment_id IS NOT DISTINCT FROM _rs.driving_assessment_id) DESC,
            approved_at DESC, created_at DESC LIMIT 1;');
  IF d NOT LIKE '%driving_assessment_id) DESC%' THEN
    RAISE EXCEPTION 'aml_entity_panel movement selection could not be patched';
  END IF;
  EXECUTE d;
END $mig$;