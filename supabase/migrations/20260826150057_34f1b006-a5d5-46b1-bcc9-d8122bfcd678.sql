-- allow the certification test runner to execute the MC-09 operations
DO $$
DECLARE _r text; _f text;
BEGIN
  FOREACH _r IN ARRAY ARRAY['sandbox_exec','sandbox_exec_sndfttzqmbkmkcnrvpfn'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = _r) THEN
      FOREACH _f IN ARRAY ARRAY[
        'public.conduct_cross_entity_snapshot(uuid,integer,uuid)',
        'public.conduct_emerging_risk_create(jsonb)',
        'public.conduct_emerging_risk_transition(uuid,text,text)',
        'public.conduct_emerging_risk_link_record(uuid,text,uuid,text,text)',
        'public.conduct_emerging_risk_require(text[])',
        'public.conduct_emerging_risk_guard(uuid,text[])',
        'public.conduct_emerging_risk_next_reference()'
      ] LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', _f, _r);
      END LOOP;
    END IF;
  END LOOP;
END $$;