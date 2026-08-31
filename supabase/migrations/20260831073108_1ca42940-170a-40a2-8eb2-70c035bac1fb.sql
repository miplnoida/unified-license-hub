-- Canonical base-currency accessor for server-side routines.
CREATE OR REPLACE FUNCTION public.monetary_base_currency(_regulator_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.monetary_config_resolve(_regulator_id)).base_currency
$$;

REVOKE ALL ON FUNCTION public.monetary_base_currency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monetary_base_currency(uuid) TO authenticated, service_role;

-- Replace hardcoded foreign-currency fallbacks with the configured base currency.
DO $mig$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'fee_assessment_preview','fee_assessment_resolve_lines','fee_assessment_ensure','fee_waiver_request',
         'fee_reconciliation_ingest','enforcement_case_action','payment_retail_volume_record','post_license_fee_assessment',
         'submit_application','license_fee_resolve','license_fee_simulate','submit_offline_payment',
         'create_or_get_application_payment','trg_notify_payment','complete_or_get_application_payment',
         'complaint_redress_save','license_fee_assess')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF def !~ '''(USD|JMD)''' THEN CONTINUE; END IF;
    def := replace(def, '''JMD''::text', 'NULL::text');
    def := replace(def, '''USD''', 'public.monetary_base_currency()');
    def := replace(def, '''JMD''', 'public.monetary_base_currency()');
    EXECUTE def;
    RAISE NOTICE 'currency fallback normalised: %', r.proname;
  END LOOP;
END
$mig$;