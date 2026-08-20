DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fp_appeals','license_conditions','licensing_audit_determinations','licensing_audit_risk_profiles',
    'risk_ratings','entity_relationships','twinpeaks_clearances','twinpeaks_disagreements','inspection_findings'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;