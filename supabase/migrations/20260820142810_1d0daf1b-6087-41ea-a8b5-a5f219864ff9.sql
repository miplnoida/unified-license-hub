-- A1: governed-write-only lockdown for regulatory decision / canonical state tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fp_appeals','license_conditions','licensing_audit_determinations','licensing_audit_risk_profiles',
    'risk_ratings','entity_relationships','twinpeaks_clearances','twinpeaks_disagreements','inspection_findings'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;