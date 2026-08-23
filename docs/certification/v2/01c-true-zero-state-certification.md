# Certification V2 — TRUE OPERATIONAL ZERO-STATE Certification (Wave 1.5c)

Captured: 2026-08-23T08:40:30Z
Environment: non-production certification database (guard: environment=non_production, reset_enabled=true)

No passwords or secrets are recorded in this document.

## Identity baseline

| Metric | Count |
|---|---|
| auth users | 46 |
| certification identities (manifest) | 46 |
| machine/system identities | 0 |
| old human identities | 0 |
| unknown identities (blockers) | 0 |
| profiles | 46 |
| sec_user_roles assignments (canonical) | 46 |
| user_dynamic_roles assignments (projection) | 55 |
| user_roles assignments (legacy projection) | 58 |

## Runtime volume by domain group (RUNTIME_MUST_ZERO tables only)

| Domain group | Rows |
|---|---|
| Notification runtime | 0 |
| Correspondence runtime | 0 |
| Audit / log runtime | 0 |
| Entity / licensing runtime | 0 |
| Returns runtime | 0 |
| Prudential runtime | 0 |
| Fit & Proper runtime | 0 |
| Complaints / conduct runtime | 0 |
| Inspection / examination runtime | 0 |
| Enforcement runtime | 0 |
| Workflow runtime | 0 |
| Supervisory intelligence runtime | 0 |
| Payments / fees runtime | 0 |
| Escalation runtime | 3 |
| Document runtime | 0 |

## Operational-area zero-state matrix

| Area | Runtime tables | Rows | Expectation | Status |
|---|---|---|---|---|
| AI runtime insights | 2 | 0 | ZERO before Wave 2 seed | PASS |
| Audit/Logs | 20 | 0 | ZERO before Wave 2 seed | PASS |
| Complaints | 15 | 0 | ZERO before Wave 2 seed | PASS |
| Conduct | 23 | 0 | ZERO before Wave 2 seed | PASS |
| Correspondence | 6 | 0 | ZERO before Wave 2 seed | PASS |
| Documents | 6 | 0 | ZERO before Wave 2 seed | PASS |
| Enforcement | 7 | 0 | ZERO before Wave 2 seed | PASS |
| Entity Registry | 22 | 0 | ZERO before Wave 2 seed | PASS |
| Entity Resolution | 4 | 0 | ZERO before Wave 2 seed | PASS |
| Escalations | 9 | 3 | ZERO before Wave 2 seed | FAIL |
| Fit & Proper | 19 | 0 | ZERO before Wave 2 seed | PASS |
| Inspections/Examinations | 11 | 0 | ZERO before Wave 2 seed | PASS |
| Licensing | 38 | 0 | ZERO before Wave 2 seed | PASS |
| Membership/User Access | 5 | 0 | ZERO before Wave 2 seed | PASS |
| Notifications | 9 | 0 | ZERO before Wave 2 seed | PASS |
| Payments/Fees runtime | 8 | 0 | ZERO before Wave 2 seed | PASS |
| Prudential | 20 | 0 | ZERO before Wave 2 seed | PASS |
| Registration | 10 | 0 | ZERO before Wave 2 seed | PASS |
| Reports/jobs/exports | 4 | 0 | ZERO before Wave 2 seed | PASS |
| Returns | 31 | 0 | ZERO before Wave 2 seed | PASS |
| Supervisory Intelligence | 4 | 0 | ZERO before Wave 2 seed | PASS |
| Thematic | 9 | 0 | ZERO before Wave 2 seed | PASS |
| UNCLASSIFIED runtime tables | 64 | 205 | ZERO before Wave 2 seed | FAIL |
| Workflow Instances | 6 | 0 | ZERO before Wave 2 seed | PASS |

## Configuration preservation gate

| Configuration area | Actual | Expected minimum | Status |
|---|---|---|---|
| correspondence_templates | 5 | 5 | PASS |
| form_fields | 2892 | 2892 | PASS |
| form_templates | 55 | 55 | PASS |
| master_data_items | 20950 | 20950 | PASS |
| metric_calculation_rules | 5 | 5 | PASS |
| navigation_items | 257 | 257 | PASS |
| notification_event_configs | 248 | 248 | PASS |
| notification_templates | 426 | 426 | PASS |
| permissions | 336 | 336 | PASS |
| prudential_ewi_rules | 8 | 8 | PASS |
| prudential_thresholds | 15 | 15 | PASS |
| regulatory_metrics | 25 | 25 | PASS |
| return_definitions | 6 | 6 | PASS |
| role_permissions | 1233 | 1233 | PASS |
| role_templates | 48 | 48 | PASS |
| roles | 60 | 60 | PASS |
| routes | 134 | 134 | PASS |
| sectors | 12 | 12 | PASS |
| sub_sectors | 12 | 12 | PASS |
| workflow_definitions | 11 | 11 | PASS |
| workflow_steps | 35 | 35 | PASS |

## Table-by-table row counts by classification

### CONFIG_KEEP — 132 tables, 5854 rows

| Table | Rows |
|---|---|
| appeal_panel_scopes | 3 |
| application_form_requirements | 0 |
| application_rfi_auto_rules | 0 |
| approval_action_notifications | 4 |
| approval_step_actions | 58 |
| approval_step_entry_notifications | 0 |
| approval_steps | 35 |
| approval_workflow_types | 6 |
| approval_workflow_versions | 8 |
| approval_workflows | 11 |
| business_calendar_holidays | 0 |
| business_calendar_process_assignments | 0 |
| business_calendar_profiles | 3 |
| captcha_configurations | 1 |
| captcha_secrets | 1 |
| classification_schemes | 5 |
| classification_values | 8 |
| complaint_duplicate_rules | 8 |
| complaint_duplicate_scoring_config | 1 |
| complaint_escalation_rules | 5 |
| complaint_intake_rules | 4 |
| complaint_rfi_settings | 1 |
| complaint_status_catalogue | 6 |
| complaint_types | 11 |
| conduct_alert_thresholds | 2 |
| conduct_channels | 6 |
| conduct_intelligence_templates | 5 |
| conduct_monitoring_rule_versions | 4 |
| conduct_monitoring_rules | 4 |
| conduct_products | 13 |
| conduct_risk_categories | 11 |
| conduct_triage_rules | 6 |
| correspondence_routing_rules | 5 |
| correspondence_templates | 5 |
| data_concepts | 19 |
| data_domains | 9 |
| decision_rationale_templates | 6 |
| enforcement_case_number_counters | 1 |
| enforcement_workflow_stages | 10 |
| enforcement_workflow_transitions | 20 |
| engine_rule_versions | 2 |
| engine_rules | 1 |
| entity_data_authority_rules | 0 |
| entity_identifier_types | 5 |
| entity_identity_statuses | 7 |
| entity_membership_role_permissions | 20 |
| entity_membership_roles | 4 |
| entity_registry_failure_policies | 3 |
| entity_resolution_policies | 3 |
| escalation_rules | 14 |
| fee_components | 0 |
| fee_configurations | 23 |
| fee_rules | 0 |
| fee_types | 25 |
| form_applicability_rules | 0 |
| form_data_domains | 0 |
| form_field_definitions | 0 |
| form_field_dependencies | 0 |
| form_fields | 2892 |
| form_packages | 0 |
| form_purposes | 6 |
| form_templates | 55 |
| form_trigger_types | 5 |
| form_versions | 63 |
| forms | 13 |
| fp_committee_members | 4 |
| fp_committees | 1 |
| fp_screening_configs | 7 |
| fp_screening_execution_rules | 1 |
| fp_sector_decision_rules | 3 |
| group_ewi_rules | 3 |
| integration_alert_rules | 1 |
| integration_connections | 15 |
| integration_credentials | 2 |
| license_action_form_configs | 2 |
| license_fee_bindings | 10 |
| license_fee_process_settings | 5 |
| license_lifecycle_configs | 0 |
| license_terms | 0 |
| license_verification_templates | 7 |
| lifecycle_stages | 23 |
| metric_calculation_rules | 5 |
| notification_event_channel_templates | 405 |
| notification_event_configs | 248 |
| notification_template_versions | 428 |
| notification_templates | 426 |
| onboarding_alert_rules | 6 |
| onboarding_retention_policies | 3 |
| payment_oversight_config | 1 |
| payment_system_operators | 1 |
| pfmi_principle_applicability | 119 |
| pfmi_principles | 24 |
| process_templates | 3 |
| prudential_ewi_rules | 8 |
| prudential_process_sla_config | 8 |
| prudential_ratio_versions | 15 |
| prudential_ratios | 13 |
| prudential_risk_taxonomy | 11 |
| prudential_stress_indicators | 13 |
| prudential_threshold_versions | 17 |
| prudential_thresholds | 15 |
| rbac_module_scopes | 65 |
| registration_form_configs | 2 |
| registration_journey_types | 2 |
| registry_publication_policies | 4 |
| regulatory_metrics | 25 |
| report_dashboard_layouts | 1 |
| report_dashboard_widgets | 14 |
| report_definitions | 39 |
| report_option_sets | 21 |
| report_runtime_config | 8 |
| report_source_columns | 108 |
| report_source_filters | 53 |
| report_sources | 10 |
| report_status_options | 27 |
| report_templates | 1 |
| reporting_obligation_rules | 36 |
| return_config_forms | 5 |
| return_configs | 5 |
| return_configurations | 4 |
| return_definition_forms | 2 |
| return_definitions | 6 |
| return_templates | 13 |
| return_types | 4 |
| review_narrative_fields | 9 |
| review_role_display_settings | 11 |
| review_step_permissions | 55 |
| risk_score_weights | 1 |
| site_settings | 11 |
| sla_configurations | 2 |
| sla_escalation_tiers | 9 |
| workflow_templates | 2 |

### REFERENCE_KEEP — 13 tables, 21264 rows

| Table | Rows |
|---|---|
| categories | 12 |
| countries | 31 |
| master_data_items | 20950 |
| master_data_types | 6 |
| ownership_types | 5 |
| regulators | 4 |
| regulatory_request_types | 17 |
| relationship_types | 10 |
| role_types | 11 |
| sectors | 12 |
| services | 16 |
| states | 178 |
| sub_sectors | 12 |

### SECURITY_CONFIG_KEEP — 24 tables, 4682 rows

| Table | Rows |
|---|---|
| permission_actions | 224 |
| permission_dependent_actions | 31 |
| permission_module_routes | 57 |
| permission_modules | 40 |
| permissions | 222 |
| role_permissions | 779 |
| roles | 21 |
| sec_legacy_permission_map | 222 |
| sec_module_scopes | 57 |
| sec_modules | 54 |
| sec_navigation_items | 257 |
| sec_permission_dependencies | 250 |
| sec_permissions | 336 |
| sec_role_permissions | 1233 |
| sec_role_scope_values | 0 |
| sec_role_scopes | 100 |
| sec_role_template_permissions | 473 |
| sec_role_template_scope_values | 0 |
| sec_role_template_scopes | 53 |
| sec_role_templates | 48 |
| sec_roles | 60 |
| sec_routes | 134 |
| sec_scope_types | 5 |
| sec_seed_reports | 26 |

### CERTIFICATION_HARNESS_KEEP — 7 tables, 98 rows

| Table | Rows |
|---|---|
| cert_certification_users | 46 |
| cert_fixture_object_types | 24 |
| cert_fixture_objects | 0 |
| cert_fixture_runs | 2 |
| cert_machine_identities | 0 |
| cert_nonproduction_guard | 1 |
| certification_seed_manifest | 25 |

### RUNTIME_MUST_ZERO — 330 tables, 208 rows

| Table | Rows |
|---|---|
| ai_insight_actions | 0 |
| ai_insights | 0 |
| aml_assessments | 0 |
| aml_findings | 0 |
| api_key_usage | 0 |
| api_keys | 0 |
| application_acknowledgements | 0 |
| application_ai_assessments | 0 |
| application_form_versions | 0 |
| application_fp_links | 0 |
| application_legal_notes | 0 |
| application_legal_referrals | 0 |
| application_requirement_migration_status | 0 |
| application_rfi_items | 0 |
| application_rfi_responses | 0 |
| application_rfis | 0 |
| applications | 0 |
| approval_actions | 0 |
| audit_export_downloads | 0 |
| audit_export_jobs | 0 |
| audit_logs | 0 |
| captcha_verifications | 0 |
| complaint_closure_reviews | 0 |
| complaint_correspondence | 0 |
| complaint_duplicate_clusters | 0 |
| complaint_duplicate_pairs | 0 |
| complaint_escalation_cases | 0 |
| complaint_escalation_log | 0 |
| complaint_evidence | 0 |
| complaint_import_batches | 0 |
| complaint_import_rows | 0 |
| complaint_investigation_tasks | 0 |
| complaint_rfi_items | 0 |
| complaint_rfi_responses | 0 |
| complaint_rfis | 0 |
| complaint_storage_cleanup_deadletter | 0 |
| complaints | 0 |
| compliance_audit_logs | 0 |
| compliance_returns | 0 |
| conduct_actions | 0 |
| conduct_alerts | 0 |
| conduct_closure_breaches | 0 |
| conduct_evidence | 0 |
| conduct_evidence_access_log | 0 |
| conduct_findings | 0 |
| conduct_intelligence_report_recipients | 0 |
| conduct_intelligence_report_versions | 0 |
| conduct_intelligence_reports | 0 |
| conduct_interview_attachments | 0 |
| conduct_interview_participants | 0 |
| conduct_interviews | 0 |
| conduct_investigation_closures | 0 |
| conduct_investigations | 0 |
| conduct_monitoring_results | 0 |
| conduct_monitoring_reviews | 0 |
| conduct_monitoring_rule_runs | 0 |
| conduct_post_closure_monitoring | 0 |
| conduct_saved_views | 0 |
| conduct_signal_events | 0 |
| conduct_signal_evidence | 0 |
| conduct_supervision_annotations | 0 |
| conduct_triage_audit_events | 0 |
| coordination_cases | 0 |
| coordination_escalations | 0 |
| coordination_flags | 0 |
| coordination_messages | 0 |
| coordination_participants | 0 |
| correspondence_attachments | 0 |
| correspondence_dispatches | 0 |
| correspondence_events | 0 |
| correspondence_messages | 0 |
| correspondence_thread_participants | 0 |
| correspondence_threads | 0 |
| decision_artifacts | 0 |
| decision_options | 0 |
| declaration_invitations | 0 |
| delegation_rules | 0 |
| document_action_logs | 0 |
| document_extractions | 0 |
| document_groups | 0 |
| document_versions | 0 |
| documents | 0 |
| enforcement_actions | 0 |
| enforcement_appeals | 0 |
| enforcement_case_events | 0 |
| enforcement_compliance_evidence | 0 |
| enforcement_obligations | 0 |
| enforcement_penalty_payments | 0 |
| enforcement_representations | 0 |
| engine_rule_action_results | 0 |
| engine_rule_alerts | 0 |
| engine_rule_executions | 0 |
| engine_rule_lifecycle_events | 0 |
| engine_rule_suppressions | 0 |
| engine_rule_tasks | 0 |
| engine_rule_tests | 0 |
| entity_appointments | 0 |
| entity_change_items | 0 |
| entity_change_sets | 0 |
| entity_external_references | 0 |
| entity_facts | 0 |
| entity_identifiers | 0 |
| entity_identity_resolution_events | 0 |
| entity_identity_snapshots | 0 |
| entity_licenses | 0 |
| entity_match_candidates | 0 |
| entity_merges | 0 |
| entity_registry_bindings | 0 |
| entity_registry_sync_states | 0 |
| entity_relationships | 0 |
| entity_reporting_obligations | 0 |
| entity_resolution_cases | 0 |
| entity_resolution_events | 0 |
| entity_risk_scores | 0 |
| entity_supervision_assignments | 0 |
| entity_sync_conflicts | 0 |
| entity_user_access | 0 |
| entity_user_memberships | 0 |
| escalation_notification_events | 1 |
| escalation_ownership_events | 0 |
| escalation_tier_events | 1 |
| escalations | 1 |
| examination_data_requests | 0 |
| examination_events | 0 |
| examination_exit_meetings | 0 |
| examination_findings | 0 |
| examination_reports | 0 |
| examination_scoping | 0 |
| examination_team_members | 0 |
| examination_workpapers | 0 |
| examinations | 0 |
| field_conditions | 0 |
| file_uploads | 0 |
| financial_group_members | 0 |
| financial_groups | 0 |
| form_lifecycle_applicability | 0 |
| form_package_items | 0 |
| form_responses | 0 |
| form_submission_values | 0 |
| fp_appeals | 0 |
| fp_assessments | 0 |
| fp_committee_decision_snapshots | 0 |
| fp_committee_votes | 0 |
| fp_condition_events | 0 |
| fp_condition_evidence | 0 |
| fp_conditions | 0 |
| fp_determinations | 0 |
| fp_findings | 0 |
| fp_individual_party_links | 0 |
| fp_individual_roles | 0 |
| fp_individuals | 0 |
| fp_manual_screening_tasks | 0 |
| fp_monitoring_events | 0 |
| fp_screening_runs | 0 |
| fp_task_evidence | 0 |
| fp_training_attestations | 0 |
| group_consolidated_snapshots | 0 |
| group_consolidation_methods | 0 |
| group_ewi_alerts | 0 |
| group_risk_scores | 0 |
| inspection_findings | 0 |
| inspections | 0 |
| integration_dead_letter | 0 |
| integration_fallback_events | 0 |
| integration_logs | 0 |
| integration_retry_queue | 0 |
| intragroup_exposures | 0 |
| job_queue | 0 |
| late_fee_penalty_tiers | 0 |
| late_fee_structures | 0 |
| license_actions | 0 |
| license_appeal_events | 0 |
| license_appeal_panel_members | 0 |
| license_appeal_panel_snapshots | 0 |
| license_appeal_panels | 0 |
| license_appeals | 0 |
| license_certificate_signatures | 0 |
| license_certificates | 0 |
| license_condition_evidence | 0 |
| license_conditions | 0 |
| license_decision_appeals | 0 |
| license_decisions | 0 |
| license_expiry_sweep_runs | 0 |
| license_fee_assessments | 0 |
| license_lifecycle_matters | 0 |
| license_matter_notices | 0 |
| license_matter_representations | 0 |
| license_renewals | 0 |
| license_variation_items | 0 |
| license_variations | 0 |
| license_verification_cases | 0 |
| license_verification_items | 0 |
| licensee_channels | 0 |
| licensee_products | 0 |
| licensees | 0 |
| licenses | 0 |
| licensing_audit_determinations | 0 |
| licensing_audit_risk_profiles | 0 |
| module_rule_tests | 0 |
| notification_digest_items | 0 |
| notification_digest_log | 0 |
| notification_digest_runs | 0 |
| notification_dispatch_log | 0 |
| notification_event_queue | 0 |
| notification_outbox | 0 |
| notification_preferences | 0 |
| notification_user_event_preferences | 0 |
| notifications | 0 |
| onboarding_alert_signals | 0 |
| onboarding_journey_state | 0 |
| onboarding_resolution_tokens | 0 |
| onboarding_security_metadata | 0 |
| organization_names | 0 |
| organizations | 0 |
| otp_verifications | 0 |
| ownership_interests | 0 |
| parties | 0 |
| party_relationships | 0 |
| payment_attachments | 0 |
| payment_oversight_events | 0 |
| payment_receipts | 0 |
| payment_remarks | 0 |
| payment_retail_volumes | 0 |
| payment_system_incidents | 0 |
| payments | 0 |
| persons | 0 |
| pfmi_assessment_principles | 0 |
| pfmi_assessments | 0 |
| ppoc_entity_mappings | 0 |
| ppoc_mapping_sectors | 0 |
| pre_license_users | 0 |
| profiles | 46 |
| prudential_action_events | 0 |
| prudential_action_responses | 0 |
| prudential_actions | 0 |
| prudential_assessment_component_ratings | 0 |
| prudential_assessment_components | 0 |
| prudential_assessments | 0 |
| prudential_data_feed_logs | 0 |
| prudential_detection_runs | 0 |
| prudential_escalations | 0 |
| prudential_ewi_alerts | 0 |
| prudential_stress_events | 0 |
| rdm_migration_decisions | 0 |
| refunds | 0 |
| registration_entity_bindings | 0 |
| registration_form_submissions | 0 |
| registration_journey_events | 0 |
| registrations | 0 |
| regulatory_request_form_requirements | 0 |
| regulatory_requests | 0 |
| reinsurance_contracts | 0 |
| report_favorites | 0 |
| report_filters | 0 |
| report_logs | 0 |
| report_run_files | 0 |
| report_run_rows | 0 |
| report_schedules | 0 |
| reporting_periods | 0 |
| reports | 0 |
| resilience_arrangements | 0 |
| resilience_incidents | 0 |
| return_audit_log | 0 |
| return_calculated_ratios | 0 |
| return_comments | 0 |
| return_consolidated_analysis | 0 |
| return_cutoff_config | 0 |
| return_data_revisions | 0 |
| return_documents | 0 |
| return_due_dates | 0 |
| return_edit_requests | 0 |
| return_filing_form_requirements | 0 |
| return_filing_requests | 0 |
| return_filing_validation_results | 0 |
| return_filing_versions | 0 |
| return_filings | 0 |
| return_form_data | 0 |
| return_form_versions | 0 |
| return_metric_values | 0 |
| return_notification_templates | 0 |
| return_notifications_log | 0 |
| return_requests | 0 |
| return_template_downloads | 0 |
| return_threshold_breach_acknowledgements | 0 |
| return_threshold_breaches | 0 |
| return_upload_attempts | 0 |
| return_upload_imports | 0 |
| return_validation_rule_versions | 0 |
| return_validation_rules | 0 |
| return_validation_run_log | 0 |
| returns_filed | 0 |
| returns_legacy_mappings | 0 |
| review_comments | 0 |
| review_suggestions | 0 |
| risk_ratings | 0 |
| role_migration_log | 0 |
| rule_overrides | 0 |
| sec_user_roles | 46 |
| security_event_logs | 0 |
| share_classes | 0 |
| sla_escalation_dispatches | 0 |
| sla_process_team_leads | 0 |
| sla_stage_events | 0 |
| sla_stage_instances | 0 |
| sufficiency_determinations | 0 |
| sufficiency_evaluation_results | 0 |
| sufficiency_evaluations | 0 |
| sufficiency_overrides | 0 |
| sufficiency_rule_set_items | 0 |
| sufficiency_rule_sets | 0 |
| sufficiency_rules | 0 |
| supervisory_plan_actions | 0 |
| supervisory_plan_template_actions | 0 |
| supervisory_plan_templates | 0 |
| supervisory_plans | 0 |
| thematic_review_actions | 0 |
| thematic_review_entities | 0 |
| thematic_review_evidence | 0 |
| thematic_review_findings | 0 |
| thematic_review_letters | 0 |
| thematic_review_products | 0 |
| thematic_review_reports | 0 |
| thematic_review_status_history | 0 |
| thematic_reviews | 0 |
| twinpeaks_clearances | 0 |
| twinpeaks_disagreements | 0 |
| user_dynamic_roles | 55 |
| user_roles | 58 |
| worker_invocation_tokens | 0 |
| workflow_instances | 0 |

