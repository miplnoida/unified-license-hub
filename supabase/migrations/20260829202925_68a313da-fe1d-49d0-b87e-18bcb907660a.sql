-- F7-B: canonical returns tables are written only by governed SECURITY DEFINER
-- routines. Direct browser DML is removed; anonymous callers lose all access.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'return_filings','return_filing_versions','return_filing_validation_results',
    'return_metric_values','return_filing_extensions','return_filing_evidence',
    'return_overdue_events','entity_currency_profiles','return_filing_requests',
    'return_filing_form_requirements'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;