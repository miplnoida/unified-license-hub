DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.provision_application_entity(uuid)'::regprocedure);
  IF position('APPLICANT_DECLARED' in d) > 0 THEN
    d := replace(d,
      $q$VALUES (v_party_id, v_entity_name, v_entity_name, 'APPLICANT_DECLARED')$q$,
      $q$VALUES (v_party_id, v_entity_name, v_entity_name, 'LOCAL_VERIFIED')$q$);
    EXECUTE d;
  END IF;
END $do$;