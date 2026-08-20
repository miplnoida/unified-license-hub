
CREATE OR REPLACE FUNCTION public.cert_reset_preserved_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (
    SELECT array_agg(x) FROM (
      SELECT unnest(base) AS x
      EXCEPT SELECT unnest(ARRAY['group_consolidation_methods','return_form_versions'])
      UNION SELECT unnest(ARRAY['master_data_types','return_types'])
    ) s
  )
  FROM (SELECT ARRAY[
  'profiles','pre_license_users','user_roles','user_dynamic_roles','roles','role_permissions',
  'permissions','permission_actions','permission_modules','permission_module_routes',
  'permission_dependent_actions','rbac_module_scopes','entity_membership_roles',
  'entity_membership_role_permissions','security_event_logs','api_keys','api_key_usage',
  'worker_invocation_tokens','otp_verifications','notification_preferences',
  'sec_modules','sec_permissions','sec_roles','sec_role_permissions','sec_role_scopes',
  'sec_role_templates','sec_role_template_permissions','sec_role_template_scopes','sec_routes',
  'sec_navigation_items','sec_user_roles','sec_scope_types','sec_module_scopes',
  'sec_permission_dependencies','sec_legacy_permission_map','sec_seed_reports',
  'countries','states','master_data_items','regulators','sectors','sub_sectors','categories',
  'classification_schemes','classification_values','data_domains','data_concepts',
  'entity_identifier_types','entity_identity_statuses','lifecycle_stages','relationship_types',
  'role_types','ownership_types','form_purposes','form_trigger_types','regulatory_request_types',
  'registry_publication_policies','services','fee_types','fee_configurations','fee_rules',
  'entity_resolution_policies','entity_registry_failure_policies','entity_data_authority_rules',
  'certification_seed_manifest','cert_nonproduction_guard',
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
  'approval_workflows','approval_workflow_versions','approval_workflow_types','approval_steps',
  'workflow_templates','delegation_rules','appeal_panel_scopes','review_narrative_fields',
  'review_role_display_settings','review_step_permissions','license_action_form_configs',
  'fp_screening_configs','fp_screening_execution_rules','fp_sector_decision_rules',
  'fp_committees','fp_committee_members',
  'prudential_ratios','prudential_ratio_versions','prudential_thresholds',
  'prudential_threshold_versions','prudential_risk_taxonomy','prudential_ewi_rules',
  'prudential_stress_indicators','pfmi_principles','pfmi_principle_applicability',
  'group_ewi_rules','risk_score_weights',
  'payment_oversight_config','payment_system_operators','rule_overrides',
  'report_definitions','report_sources','report_source_columns','report_source_filters',
  'report_option_sets','report_status_options','report_templates','report_dashboard_layouts',
  'report_dashboard_widgets','report_runtime_config','reports',
  'return_definitions','return_definition_forms','reporting_obligation_rules',
  'regulatory_metrics','metric_calculation_rules','return_templates','return_configs',
  'return_configurations','return_config_forms',
  'peer_group_settings','license_expiry_configs'
  ]::text[] AS base) b;
$$;
