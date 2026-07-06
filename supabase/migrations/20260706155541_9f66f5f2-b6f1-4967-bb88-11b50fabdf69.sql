
DO $$
DECLARE t text;
DECLARE tbls text[] := ARRAY[
  'return_form_data','returns_filed','return_audit_log','return_requests','return_comments',
  'return_calculated_ratios','return_threshold_breaches','return_validation_run_log',
  'return_configs','return_configurations','return_config_forms','return_documents',
  'return_due_dates','return_form_versions','return_notification_templates','return_notifications_log',
  'return_templates','return_types','return_validation_rules','return_validation_rule_versions',
  'return_consolidated_analysis','return_cutoff_config',
  'compliance_returns','compliance_audit_logs'
];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relkind='r') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;
