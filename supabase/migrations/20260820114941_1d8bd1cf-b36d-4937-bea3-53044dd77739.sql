
-- ============================================================
-- WAVE D STEP 0 — governed non-production business data reset
-- Engineering-only. No UI. service_role execute only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cert_nonproduction_guard (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  project_ref text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('non_production','staging','development')),
  reset_enabled boolean NOT NULL DEFAULT true,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cert_nonproduction_guard TO service_role;
ALTER TABLE public.cert_nonproduction_guard ENABLE ROW LEVEL SECURITY;
CREATE POLICY cert_guard_no_app_access ON public.cert_nonproduction_guard
  FOR SELECT TO authenticated USING (false);

-- ------------------------------------------------------------
-- Classification: what is preserved vs disposable
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cert_reset_preserved_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
  -- USER / SECURITY / ACCESS BACKBONE
  'profiles','pre_license_users','user_roles','user_dynamic_roles','roles','role_permissions',
  'permissions','permission_actions','permission_modules','permission_module_routes',
  'permission_dependent_actions','rbac_module_scopes','entity_membership_roles',
  'entity_membership_role_permissions','security_event_logs','api_keys','api_key_usage',
  'worker_invocation_tokens','otp_verifications','notification_preferences',
  'sec_modules','sec_permissions','sec_roles','sec_role_permissions','sec_role_scopes',
  'sec_role_templates','sec_role_template_permissions','sec_role_template_scopes','sec_routes',
  'sec_navigation_items','sec_user_roles','sec_scope_types','sec_module_scopes',
  'sec_permission_dependencies','sec_legacy_permission_map','sec_seed_reports',
  -- SYSTEM / REFERENCE VOCABULARIES
  'countries','states','master_data_items','regulators','sectors','sub_sectors','categories',
  'classification_schemes','classification_values','data_domains','data_concepts',
  'entity_identifier_types','entity_identity_statuses','lifecycle_stages','relationship_types',
  'role_types','ownership_types','form_purposes','form_trigger_types','regulatory_request_types',
  'registry_publication_policies','services','fee_types','fee_configurations','fee_rules',
  'entity_resolution_policies','entity_registry_failure_policies','entity_data_authority_rules',
  'certification_seed_manifest','cert_nonproduction_guard',
  -- PLATFORM CONFIGURATION
  'site_settings','captcha_configurations','captcha_secrets','sla_configurations',
  'sla_escalation_tiers','escalation_rules','business_calendar_profiles',
  'business_calendar_holidays','business_calendar_process_assignments',
  'complaint_types','complaint_status_catalogue','complaint_intake_rules',
  'complaint_escalation_rules','complaint_duplicate_rules','complaint_duplicate_scoring_config',
  'complaint_rfi_settings','complaint_storage_cleanup_deadletter',
  'conduct_channels','conduct_products','conduct_risk_categories','conduct_triage_rules',
  'conduct_monitoring_rules','conduct_monitoring_rule_versions','conduct_alert_thresholds',
  'conduct_intelligence_templates','conduct_saved_views',
  'correspondence_templates','correspondence_routing_rules','decision_rationale_templates',
  'notification_templates','notification_template_versions','notification_event_configs',
  'notification_event_channel_templates',
  'integration_connections','integration_credentials','integration_alert_rules',
  'engine_rules','engine_rule_versions','engine_rule_tests',
  'forms','form_templates','form_versions','form_fields','form_field_definitions',
  'form_field_dependencies','form_conditions','field_conditions','form_packages',
  'form_package_items','form_applicability_rules','form_lifecycle_applicability',
  'form_data_domains','registration_form_configs','application_rfi_auto_rules',
  'application_form_requirements_config',
  'approval_workflows','approval_workflow_versions','approval_workflow_types','approval_steps',
  'workflow_templates','delegation_rules','appeal_panel_scopes','review_narrative_fields',
  'review_role_display_settings','review_step_permissions','license_action_form_configs',
  'fp_screening_configs','fp_screening_execution_rules','fp_sector_decision_rules',
  'fp_committees','fp_committee_members',
  'prudential_ratios','prudential_ratio_versions','prudential_thresholds',
  'prudential_threshold_versions','prudential_risk_taxonomy','prudential_ewi_rules',
  'prudential_stress_indicators','pfmi_principles','pfmi_principle_applicability',
  'group_consolidation_methods','group_ewi_rules','risk_score_weights',
  'payment_oversight_config','payment_system_operators','rule_overrides',
  'report_definitions','report_sources','report_source_columns','report_source_filters',
  'report_option_sets','report_status_options','report_templates','report_dashboard_layouts',
  'report_dashboard_widgets','report_runtime_config','reports',
  -- RETURNS / METRICS CONFIGURATION (certification + platform)
  'return_definitions','return_definition_forms','reporting_obligation_rules',
  'regulatory_metrics','metric_calculation_rules','return_templates','return_configs',
  'return_configurations','return_config_forms','return_form_versions',
  'peer_group_settings','license_expiry_configs'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.cert_reset_classify_tables()
RETURNS TABLE(table_name text, classification text, live_rows bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.relname::text,
         CASE WHEN c.relname = ANY (public.cert_reset_preserved_tables())
              THEN 'PRESERVED' ELSE 'DISPOSABLE_BUSINESS_DATA' END,
         COALESCE(st.n_live_tup, 0)::bigint
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables st ON st.relid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY 2, 1;
$$;

REVOKE ALL ON FUNCTION public.cert_reset_classify_tables() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_reset_classify_tables() TO service_role;

-- ------------------------------------------------------------
-- THE RESET
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cert_reset_nonproduction_business_data_v1(
  _confirmation text,
  _project_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g record;
  preserved text[] := public.cert_reset_preserved_tables();
  wipe text[];
  pending text[];
  next_pending text[];
  t text;
  pass int := 0;
  fk record;
  cleared jsonb := '[]'::jsonb;
  before_counts jsonb := '{}'::jsonb;
  after_counts jsonb := '{}'::jsonb;
  n bigint;
  deleted jsonb := '{}'::jsonb;
  total_deleted bigint := 0;
  last_err text;
BEGIN
  -- L. PRODUCTION SAFETY -------------------------------------
  IF _confirmation IS DISTINCT FROM 'RESET-NONPRODUCTION-BUSINESS-DATA-CERT-V1' THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','confirmation phrase not supplied');
  END IF;

  SELECT * INTO g FROM public.cert_nonproduction_guard WHERE id;
  IF g IS NULL THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','non-production status cannot be proven: no guard row');
  END IF;
  IF g.environment = 'production' OR NOT g.reset_enabled THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','guard forbids reset','environment',g.environment);
  END IF;
  IF g.project_ref IS DISTINCT FROM _project_ref THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','project reference does not match the allow-list');
  END IF;

  -- M. concurrency control -----------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('cert_dataset_v1_reset_or_seed'));

  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO wipe
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT (c.relname = ANY (preserved));

  -- BEFORE counts (exact) for disposable tables that hold rows
  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN before_counts := before_counts || jsonb_build_object(t, n); END IF;
  END LOOP;

  -- D. clear obsolete compatibility pointers on PRESERVED rows
  FOR fk IN
    SELECT con.conrelid::regclass::text AS child_tbl,
           child_att.attname::text AS child_col,
           child_att.attnotnull AS notnull_col,
           con.confrelid::regclass::text AS parent_tbl
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute child_att
      ON child_att.attrelid = con.conrelid AND child_att.attnum = k.attnum
    WHERE con.contype = 'f'
      AND cc.relnamespace = 'public'::regnamespace
      AND pc.relnamespace = 'public'::regnamespace
      AND cc.relname = ANY (preserved)
      AND NOT (pc.relname = ANY (preserved))
  LOOP
    IF fk.notnull_col THEN
      RAISE EXCEPTION 'reset blocked: preserved table %.% is NOT NULL and references disposable table %',
        fk.child_tbl, fk.child_col, fk.parent_tbl;
    END IF;
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I IS NOT NULL', fk.child_tbl, fk.child_col, fk.child_col);
    IF ROW_COUNT_HACK() IS NULL THEN NULL; END IF; -- placeholder, replaced below
  END LOOP;

  -- D/M. dependency-safe deletion in retry passes -------------
  pending := wipe;
  WHILE array_length(pending, 1) IS NOT NULL AND pass < 15 LOOP
    pass := pass + 1;
    next_pending := ARRAY[]::text[];
    FOREACH t IN ARRAY pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          deleted := deleted || jsonb_build_object(t, COALESCE((deleted->>t)::bigint, 0) + n);
          total_deleted := total_deleted + n;
        END IF;
      EXCEPTION WHEN others THEN
        last_err := SQLERRM;
        next_pending := next_pending || t;
      END;
    END LOOP;
    EXIT WHEN array_length(next_pending, 1) IS NULL;
    pending := next_pending;
  END LOOP;

  -- final sweep for audit/notification rows re-created by triggers
  FOREACH t IN ARRAY ARRAY['audit_logs','compliance_audit_logs','notifications',
    'notification_outbox','notification_event_queue','notification_dispatch_log']
  LOOP
    IF NOT (t = ANY (preserved)) THEN
      BEGIN EXECUTE format('DELETE FROM public.%I', t); EXCEPTION WHEN others THEN NULL; END;
    END IF;
  END LOOP;

  IF array_length(pending, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'reset blocked after % passes; undeletable tables: % (last error: %)',
      pass, array_to_string(pending, ', '), last_err;
  END IF;

  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN after_counts := after_counts || jsonb_build_object(t, n); END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','RESET_COMPLETE',
    'environment', g.environment,
    'project_ref', g.project_ref,
    'passes', pass,
    'disposable_tables', array_length(wipe, 1),
    'rows_deleted_total', total_deleted,
    'before_counts', before_counts,
    'deleted_counts', deleted,
    'after_counts_nonzero', after_counts,
    'pointers_cleared', cleared
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) TO service_role;
