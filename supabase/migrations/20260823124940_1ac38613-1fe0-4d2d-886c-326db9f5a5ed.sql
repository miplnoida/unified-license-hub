DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.provision_application_entity(uuid)'::regprocedure);
  IF position('lifecycle_stages WHERE key = ''license_active''' in d) > 0 THEN
    -- licensees.lifecycle_stage_id must reference an ENTITY-domain stage; a licensed
    -- entity is 'authorised'. 'license_active' belongs to the licence domain.
    d := replace(d, $q$lifecycle_stages WHERE key = 'license_active'$q$,
                    $q$lifecycle_stages WHERE key = 'authorised' AND domain = 'entity'$q$);
    d := replace(d, $q$entity_identity_statuses WHERE key = 'verified'$q$,
                    $q$entity_identity_statuses WHERE key = 'verified'$q$);
    EXECUTE d;
  END IF;
END $do$;