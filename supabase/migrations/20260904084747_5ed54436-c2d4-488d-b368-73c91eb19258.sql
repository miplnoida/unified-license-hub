DO $$
DECLARE _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'public.sup_risk_ordinal(text)',
    'public.sup_assessment_status_ordinal(text)',
    'public.sup_examination_stage_ordinal(text)',
    'public.sup_finding_status_ordinal(text)',
    'public.aml_assessment_page(integer,integer,text,text,text,text)',
    'public.aml_portfolio_page(integer,integer,text,text,text,text,text,text)',
    'public.aml_work_queue_page(integer,integer,text,text,text,text,text,text,text,text)',
    'public.aml_examination_page(integer,integer,text,text,text,text,text,uuid,boolean,date,date)',
    'public.aml_finding_page(integer,integer,text,text,text,text,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', _f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_certification_runner') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_certification_runner', _f);
    END IF;
  END LOOP;
END $$;