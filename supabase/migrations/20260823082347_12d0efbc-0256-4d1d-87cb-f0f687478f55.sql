CREATE OR REPLACE FUNCTION public.cert_v2_table_classification()
RETURNS TABLE(table_name text, category text, reason text, row_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH keep_config AS (
    SELECT unnest(ARRAY[
      'approval_workflows','approval_workflow_versions','approval_workflow_types',
      'approval_steps','approval_step_actions','approval_action_notifications',
      'approval_step_entry_notifications','workflow_templates','process_templates',
      'delegation_rules_config','review_step_permissions','review_role_display_settings',
      'review_narrative_fields','decision_rationale_templates','appeal_panel_scopes',
      'lifecycle_stages','enforcement_workflow_stages','enforcement_workflow_transitions',
      'enforcement_case_number_counters',
      'forms','form_templates','form_versions','form_fields','form_purposes','form_packages',
      'form_trigger_types','form_field_definitions','form_field_dependencies',
      'form_applicability_rules','form_data_domains','registration_form_configs',
      'registration_journey_types','license_action_form_configs',
      'license_verification_templates','application_form_requirements',
      'application_rfi_auto_rules',
      'return_definitions','return_definition_forms','return_configs','return_config_forms',
      'return_configurations','return_templates','return_types','reporting_obligation_rules',
      'regulatory_metrics','metric_calculation_rules','prudential_ratios',
      'prudential_ratio_versions','prudential_thresholds','prudential_threshold_versions',
      'prudential_ewi_rules','prudential_stress_indicators','prudential_risk_taxonomy',
      'prudential_process_sla_config','pfmi_principles','pfmi_principle_applicability',
      'group_ewi_rules','risk_score_weights',
      'payment_oversight_config','payment_system_operators',
      'complaint_types','complaint_status_catalogue','complaint_intake_rules',
      'complaint_escalation_rules','complaint_duplicate_rules',
      'complaint_duplicate_scoring_config','complaint_rfi_settings',
      'conduct_channels','conduct_products','conduct_risk_categories',
      'conduct_triage_rules','conduct_monitoring_rules','conduct_monitoring_rule_versions',
      'conduct_alert_thresholds','conduct_intelligence_templates',
      'fp_screening_configs','fp_screening_execution_rules','fp_sector_decision_rules',
      'fp_committees','fp_committee_members',
      'notification_event_configs','notification_templates','notification_template_versions',
      'notification_event_channel_templates','notification_channel_policies',
      'correspondence_templates','correspondence_routing_rules',
      'fee_types','fee_configurations','fee_components','fee_rules',
      'license_fee_bindings','license_fee_process_settings','license_lifecycle_configs',
      'license_terms',
      'escalation_rules','sla_configurations','sla_escalation_tiers',
      'business_calendar_profiles','business_calendar_holidays',
      'business_calendar_process_assignments',
      'report_definitions','report_sources','report_source_columns','report_source_filters',
      'report_option_sets','report_status_options','report_templates','report_runtime_config',
      'report_dashboard_layouts','report_dashboard_widgets',
      'entity_identifier_types','entity_identity_statuses','entity_resolution_policies',
      'entity_registry_failure_policies','entity_membership_roles',
      'entity_membership_role_permissions','entity_data_authority_rules',
      'registry_publication_policies','classification_schemes','classification_values',
      'data_domains','data_concepts',
      'integration_connections','integration_credentials','integration_alert_rules',
      'captcha_configurations','captcha_secrets','site_settings','engine_rules',
      'engine_rule_versions','rule_overrides','onboarding_alert_rules',
      'onboarding_retention_policies','rbac_module_scopes'
    ]) AS t
  ), keep_reference AS (
    SELECT unnest(ARRAY[
      'countries','states','sectors','sub_sectors','categories','regulators','services',
      'master_data_types','master_data_items','relationship_types','ownership_types',
      'regulatory_request_types','role_types'
    ]) AS t
  ),
  cls AS (
    SELECT c.relname::text AS tbl,
      CASE
        WHEN c.relname LIKE 'cert\_%' OR c.relname = 'certification_seed_manifest'
          THEN 'CERTIFICATION_HARNESS_KEEP'
        WHEN (c.relname LIKE 'sec\_%' AND c.relname <> 'sec_user_roles')
          OR c.relname IN ('permissions','permission_actions','permission_modules',
                           'permission_module_routes','permission_dependent_actions',
                           'roles','role_permissions')
          THEN 'SECURITY_CONFIG_KEEP'
        WHEN c.relname IN (SELECT t FROM keep_reference) THEN 'REFERENCE_KEEP'
        WHEN c.relname IN (SELECT t FROM keep_config)    THEN 'CONFIG_KEEP'
        ELSE 'RUNTIME_MUST_ZERO'
      END AS cat
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  )
  SELECT cls.tbl, cls.cat,
    CASE cls.cat
      WHEN 'CERTIFICATION_HARNESS_KEEP' THEN 'Certification fixture registry / guard'
      WHEN 'SECURITY_CONFIG_KEEP' THEN 'Roles, permissions, navigation and route configuration'
      WHEN 'REFERENCE_KEEP' THEN 'Reference / master data'
      WHEN 'CONFIG_KEEP' THEN 'Business configuration (definitions, templates, rules, thresholds)'
      ELSE 'Operational/runtime population — must be zero before the V2 seed'
    END,
    (xpath('/row/c/text()', query_to_xml(
        format('select count(*) as c from public.%I', cls.tbl), false, true, '')))[1]::text::bigint
  FROM cls
  ORDER BY 2, 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cert_v2_table_classification() TO authenticated, service_role;