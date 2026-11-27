# Phase 1 — Database and backend-function proposals (NOT EXECUTED)

Baseline commit: 37467d921cd1418f45fbf6eca9e5530316034964 (2026-11-27). Nothing below has been run.

## Why backend-function fixes were not made
Lovable-managed backend functions deploy automatically when their files change. The approval note requires stopping before any change that would deploy. SEC-09/10/11/12/13/18 are therefore BLOCKED — DEPLOYMENT APPROVAL REQUIRED. Code-level evidence and minimal fixes follow.

| ID | Function | Confirmed defect (file:line) | Minimal fix |
|---|---|---|---|
| SEC-09 | document-extract | File read by caller-supplied id with service role, no ownership/entity check (index.ts:77-115); scan/release state never selected or checked before signed URL (84-88, 111-115) | Resolve file via caller-scoped client; refuse unless existing released scan state. Needs the authoritative release-state values confirmed (business decision). |
| SEC-10 | send-notification | Any signed-in user may send to any recipient and update any dispatch log by id (23-89, 119-150); batch mode reports success with failures hidden (298-339) | Restrict to existing worker contract or admin permission; bind log id to recipient; return failure counts. |
| SEC-11 | send-correspondence | Dispatch permission checked, but source record read with service role without scope (36-47, 74, 107); stored as "sent" with no transport (135-174) | Pass record scope to existing gate; store as queued until provider accepts. |
| SEC-12 | generate-return-analysis | Only view permission, no return scope (116-144); ratios taken from caller body (147-178); AI failure returns ok:true (250-291) | Require generate/edit permission and return scope; load ratios server-side; return partial/failed status. Internal evaluator call path must be kept (business decision on trusted path). |
| SEC-13 | developer-api | Scopes selected but never enforced (43-85); DB errors returned as empty 200 (33, 67-80); expiry/revocation already rejected (no defect) | Per-route scope map using existing scope names; return 5xx on query error. Scope-to-endpoint mapping needs confirmation. |
| SEC-18 | process-queue | No provider call; marks every queued notification for the template as "delivered" (168-179); write errors ignored, no stale reclaim (102-125) | Send via shared email provider, mark only the specific notification "sent"; reserve "delivered" for callbacks; check write errors. Lease/idempotency key would need a schema change (separate proposal). |

## SEC-01 — Excessive table privileges (CONFIRMED, read-only check)
Public tables: 765, all with RLS on. anon can TRUNCATE 391 and INSERT 365; authenticated can TRUNCATE 441. TRUNCATE ignores RLS. The app's data API cannot issue TRUNCATE, so no legitimate browser path uses it.

Proposed SQL:
```sql
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', r.relname);
  END LOOP; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
```
Rollback: same loop with `GRANT TRUNCATE ... TO anon, authenticated` and default-privileges GRANT.
Acceptance: `has_table_privilege('anon', t, 'TRUNCATE')` false for every public table; full test suite and sign-in, application, returns and report journeys unchanged.
Anonymous INSERT grants are NOT proposed for blanket revoke: public intake (complaints, registration) must be inventoried first.

## SEC-02, 04, 05, 06, 07, 14, 15, 16, 17, 19
NOT TESTED in this pass — each needs a per-function read of live definitions before exact SQL can be written safely. Carried forward from the functional gap register unchanged. Existing holds (correction-save, application visibility, returns write grants, report read grants) remain on hold.

---

# Phase 1A addendum (2026-11-27) — read-only, nothing executed

# Phase 1a — database/backend security addendum (proposals only)

Read-only live catalogue and repository inspection. No DDL, DML, grant changes, RPC execution, deployments or project-file modifications performed. Database identity: `postgres` / `sandbox_exec`. Earlier counts are historical; the inventories below are the current observed snapshot. Evidence and proposed scripts are siblings of this file in `/tmp/phase1a/`. SQL in this document is NOT EXECUTED.

**Frozen boundary:** No proposed statement references AML/CFT `supervisory_assessment*` tables or functions. This overrides the request to revoke on literally every public table. Frozen exposures are noted but must be handled by their owner. Default privileges affect future objects globally within public, including future frozen-family tables: obtain frozen-owner approval before applying those two default ACL statements; they are not an exception-free deployment authorization.

## SEC-01 — CONFIRMED

RLS does not protect TRUNCATE. Anonymous DML grants are not themselves proof that RLS permits writes. PUBLIC is the implicit grantee (OID 0), not a login role. Only base/partitioned public tables are counted below; raw ACL snapshot includes views too. `information_schema.role_table_grants` is visibility-limited and omits PUBLIC grants; `aclexplode(relacl)` is authoritative for explicit ACLs. Effective anon/authenticated results were checked with has_table_privilege.

### anon: direct ACL grants

**TRUNCATE: 391**

`ai_governance_presentation_aliases`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `audit_export_downloads`, `audit_export_jobs`, `authorization_class_activities`, `authorization_classes`, `authorization_schemes`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `classification_aliases`, `classification_business_types`, `classification_change_log`, `common_sector_families`, `complaint_allegation_history`, `complaint_allegations`, `complaint_contact_preferences`, `complaint_correspondence`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_investigation_tasks`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `conduct_actions`, `conduct_alert_thresholds`, `conduct_alerts`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_investigations`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_attachments`, `correspondence_events`, `correspondence_messages`, `correspondence_routing_rules`, `correspondence_templates`, `correspondence_thread_participants`, `correspondence_threads`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_obligations`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_team_members`, `examination_workpapers`, `examinations`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_committee_decision_snapshots`, `fp_condition_events`, `fp_condition_evidence`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_oversight_config`, `payment_oversight_events`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_process_sla_config`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulated_activity_catalogue`, `regulatory_metrics`, `regulatory_profiles`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `subject_forms`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_question_plan`, `supervisory_assessment_question_plan_override`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_methodology_fact_requirement`, `supervisory_methodology_parameter`, `supervisory_methodology_question_fact`, `supervisory_methodology_question_rule`, `supervisory_methodology_reference_decision`, `supervisory_methodology_regulator_approval`, `supervisory_methodology_semantic_profile`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_policy_component_type`, `supervisory_policy_domain_component_requirement`, `supervisory_policy_profile`, `supervisory_policy_profile_binding`, `supervisory_policy_profile_event`, `supervisory_policy_profile_requirement`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_actions`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_findings`, `thematic_review_letters`, `thematic_review_products`, `thematic_review_reports`, `thematic_review_status_history`, `thematic_reviews`, `user_dynamic_roles`


**INSERT: 365**

`ai_governance_presentation_aliases`, `ai_insight_actions`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_closure_reviews`, `complaint_contact_preferences`, `complaint_correspondence`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `conduct_alert_thresholds`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_committee_decision_snapshots`, `fp_condition_events`, `fp_condition_evidence`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_oversight_config`, `payment_oversight_events`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_process_sla_config`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_question_plan`, `supervisory_assessment_question_plan_override`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_methodology_fact_requirement`, `supervisory_methodology_parameter`, `supervisory_methodology_question_fact`, `supervisory_methodology_question_rule`, `supervisory_methodology_reference_decision`, `supervisory_methodology_regulator_approval`, `supervisory_methodology_semantic_profile`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_policy_component_type`, `supervisory_policy_domain_component_requirement`, `supervisory_policy_profile`, `supervisory_policy_profile_binding`, `supervisory_policy_profile_event`, `supervisory_policy_profile_requirement`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`


**UPDATE: 363**

`ai_governance_presentation_aliases`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_contact_preferences`, `complaint_correspondence`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `conduct_alert_thresholds`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_committee_decision_snapshots`, `fp_condition_events`, `fp_condition_evidence`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_oversight_config`, `payment_oversight_events`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_process_sla_config`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_question_plan`, `supervisory_assessment_question_plan_override`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_methodology_fact_requirement`, `supervisory_methodology_parameter`, `supervisory_methodology_question_fact`, `supervisory_methodology_question_rule`, `supervisory_methodology_reference_decision`, `supervisory_methodology_regulator_approval`, `supervisory_methodology_semantic_profile`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_policy_component_type`, `supervisory_policy_domain_component_requirement`, `supervisory_policy_profile`, `supervisory_policy_profile_binding`, `supervisory_policy_profile_event`, `supervisory_policy_profile_requirement`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`


**DELETE: 363**

`ai_governance_presentation_aliases`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_contact_preferences`, `complaint_correspondence`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `conduct_alert_thresholds`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_committee_decision_snapshots`, `fp_condition_events`, `fp_condition_evidence`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_oversight_config`, `payment_oversight_events`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_process_sla_config`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_question_plan`, `supervisory_assessment_question_plan_override`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_methodology_fact_requirement`, `supervisory_methodology_parameter`, `supervisory_methodology_question_fact`, `supervisory_methodology_question_rule`, `supervisory_methodology_reference_decision`, `supervisory_methodology_regulator_approval`, `supervisory_methodology_semantic_profile`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_policy_component_type`, `supervisory_policy_domain_component_requirement`, `supervisory_policy_profile`, `supervisory_policy_profile_binding`, `supervisory_policy_profile_event`, `supervisory_policy_profile_requirement`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`


**Effective counts (direct + PUBLIC + inherited):** TRUNCATE=391, INSERT=365, UPDATE=363, DELETE=363

### authenticated: direct ACL grants

**TRUNCATE: 441**

`ai_governance_presentation_aliases`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `approval_action_notifications`, `approval_actions`, `approval_step_actions`, `approval_step_entry_notifications`, `approval_steps`, `approval_workflow_types`, `approval_workflow_versions`, `approval_workflows`, `audit_export_downloads`, `audit_export_jobs`, `authorization_class_activities`, `authorization_classes`, `authorization_schemes`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `classification_aliases`, `classification_business_types`, `classification_change_log`, `common_sector_families`, `complaint_allegation_history`, `complaint_allegations`, `complaint_contact_preferences`, `complaint_correspondence`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_investigation_tasks`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `conduct_actions`, `conduct_alert_thresholds`, `conduct_alerts`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_investigations`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_attachments`, `correspondence_events`, `correspondence_messages`, `correspondence_routing_rules`, `correspondence_templates`, `correspondence_thread_participants`, `correspondence_threads`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `delegation_rules`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_actions`, `enforcement_appeals`, `enforcement_case_events`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_obligations`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_team_members`, `examination_workpapers`, `examinations`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_assessments`, `fp_committee_decision_snapshots`, `fp_committee_members`, `fp_committee_votes`, `fp_committees`, `fp_condition_events`, `fp_condition_evidence`, `fp_conditions`, `fp_determinations`, `fp_findings`, `fp_individual_party_links`, `fp_individual_roles`, `fp_individuals`, `fp_manual_screening_tasks`, `fp_monitoring_events`, `fp_screening_configs`, `fp_screening_execution_rules`, `fp_screening_runs`, `fp_sector_decision_rules`, `fp_task_evidence`, `fp_training_attestations`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `legacy_supervisory_plan_actions`, `legacy_supervisory_plans`, `licensee_channels`, `licensee_products`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_attachments`, `payment_oversight_config`, `payment_oversight_events`, `payment_remarks`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_actions`, `prudential_assessment_component_ratings`, `prudential_assessment_components`, `prudential_assessments`, `prudential_data_feed_logs`, `prudential_detection_runs`, `prudential_escalations`, `prudential_ewi_alerts`, `prudential_ewi_rules`, `prudential_process_sla_config`, `prudential_ratio_versions`, `prudential_ratios`, `prudential_risk_taxonomy`, `prudential_stress_events`, `prudential_stress_indicators`, `prudential_threshold_versions`, `prudential_thresholds`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulated_activity_catalogue`, `regulatory_metrics`, `regulatory_profiles`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `review_comments`, `review_narrative_fields`, `review_role_display_settings`, `review_step_permissions`, `review_suggestions`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `subject_forms`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_question_plan`, `supervisory_assessment_question_plan_override`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_methodology_fact_requirement`, `supervisory_methodology_parameter`, `supervisory_methodology_question_fact`, `supervisory_methodology_question_rule`, `supervisory_methodology_reference_decision`, `supervisory_methodology_regulator_approval`, `supervisory_methodology_semantic_profile`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_actions`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_findings`, `thematic_review_letters`, `thematic_review_products`, `thematic_review_reports`, `thematic_review_status_history`, `thematic_reviews`, `user_dynamic_roles`, `workflow_instances`, `workflow_templates`


**INSERT: 398**

`ai_governance_presentation_aliases`, `ai_insight_actions`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `application_ai_assessments`, `application_form_versions`, `application_legal_notes`, `application_legal_referrals`, `application_rfi_auto_rules`, `application_rfi_responses`, `approval_workflow_types`, `approval_workflow_versions`, `approval_workflows`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_closure_reviews`, `complaint_contact_preferences`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `compliance_audit_logs`, `conduct_alert_thresholds`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `delegation_rules`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_events`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_assessments`, `fp_committee_decision_snapshots`, `fp_committee_members`, `fp_committee_votes`, `fp_committees`, `fp_condition_events`, `fp_condition_evidence`, `fp_conditions`, `fp_determinations`, `fp_findings`, `fp_manual_screening_tasks`, `fp_monitoring_events`, `fp_screening_configs`, `fp_screening_execution_rules`, `fp_screening_runs`, `fp_sector_decision_rules`, `fp_task_evidence`, `fp_training_attestations`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `license_action_form_configs`, `license_actions`, `license_certificates`, `licensee_channels`, `licensee_products`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_attachments`, `payment_oversight_config`, `payment_oversight_events`, `payment_remarks`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_assessment_component_ratings`, `prudential_assessment_components`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_ewi_rules`, `prudential_process_sla_config`, `prudential_ratio_versions`, `prudential_threshold_versions`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_form_submissions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `review_comments`, `review_narrative_fields`, `review_role_display_settings`, `review_step_permissions`, `review_suggestions`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `rule_overrides`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_assurance_policy`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`, `workflow_instances`, `workflow_templates`


**UPDATE: 394**

`ai_governance_presentation_aliases`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `application_ai_assessments`, `application_form_versions`, `application_legal_referrals`, `application_rfi_auto_rules`, `application_rfi_responses`, `approval_workflow_types`, `approval_workflow_versions`, `approval_workflows`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_contact_preferences`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `compliance_audit_logs`, `conduct_alert_thresholds`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `delegation_rules`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_events`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_assessments`, `fp_committee_decision_snapshots`, `fp_committee_members`, `fp_committee_votes`, `fp_committees`, `fp_condition_events`, `fp_condition_evidence`, `fp_conditions`, `fp_determinations`, `fp_findings`, `fp_manual_screening_tasks`, `fp_monitoring_events`, `fp_screening_configs`, `fp_screening_execution_rules`, `fp_screening_runs`, `fp_sector_decision_rules`, `fp_task_evidence`, `fp_training_attestations`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `license_action_form_configs`, `license_certificates`, `licensee_channels`, `licensee_products`, `licensees`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_attachments`, `payment_oversight_config`, `payment_oversight_events`, `payment_remarks`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `profiles`, `prudential_action_events`, `prudential_action_responses`, `prudential_assessment_component_ratings`, `prudential_assessment_components`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_ewi_rules`, `prudential_process_sla_config`, `prudential_ratio_versions`, `prudential_threshold_versions`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_form_submissions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `review_comments`, `review_narrative_fields`, `review_role_display_settings`, `review_step_permissions`, `review_suggestions`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_assurance_policy`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`, `workflow_instances`, `workflow_templates`


**DELETE: 389**

`ai_governance_presentation_aliases`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `application_ai_assessments`, `application_form_versions`, `application_rfi_auto_rules`, `application_rfi_responses`, `approval_workflow_types`, `approval_workflow_versions`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_contact_preferences`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `complaints`, `compliance_audit_logs`, `conduct_alert_thresholds`, `conduct_channels`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_results`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rule_versions`, `conduct_monitoring_rules`, `conduct_post_closure_monitoring`, `conduct_products`, `conduct_risk_categories`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `conduct_triage_rules`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `delegation_rules`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_events`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `file_uploads`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_assessments`, `fp_committee_decision_snapshots`, `fp_committee_members`, `fp_committee_votes`, `fp_committees`, `fp_condition_events`, `fp_condition_evidence`, `fp_conditions`, `fp_determinations`, `fp_findings`, `fp_manual_screening_tasks`, `fp_monitoring_events`, `fp_screening_configs`, `fp_screening_execution_rules`, `fp_screening_runs`, `fp_sector_decision_rules`, `fp_task_evidence`, `fp_training_attestations`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `license_action_form_configs`, `license_certificates`, `licensee_channels`, `licensee_products`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_preferences`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_attachments`, `payment_oversight_config`, `payment_oversight_events`, `payment_remarks`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_assessment_component_ratings`, `prudential_assessment_components`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_ewi_rules`, `prudential_process_sla_config`, `prudential_ratio_versions`, `prudential_threshold_versions`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_source_columns`, `report_source_filters`, `report_sources`, `report_status_options`, `report_templates`, `reports`, `resilience_arrangements`, `resilience_incidents`, `review_comments`, `review_narrative_fields`, `review_role_display_settings`, `review_step_permissions`, `review_suggestions`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_assessment_assignment`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_signal`, `supervisory_assurance_policy`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`, `workflow_instances`, `workflow_templates`


**Effective counts (direct + PUBLIC + inherited):** TRUNCATE=441, INSERT=398, UPDATE=394, DELETE=389

### public: direct ACL grants

**TRUNCATE: 0**

(none)


**INSERT: 0**

(none)


**UPDATE: 0**

(none)


**DELETE: 0**

(none)


### Inheritance and default privileges

Neither anon nor authenticated is a member of another role in pg_auth_members, so there are no inherited table grants from parent roles. Authenticator/postgres memberships IN anon/authenticated are the reverse direction and do not grant anon their privileges. PUBLIC explicit table DML/TRUNCATE grants are listed above, and apply to all roles.

```json
[
  {
    "acl": "{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}",
    "owner": "supabase_admin",
    "nspname": "public",
    "defaclobjtype": "S"
  },
  {
    "acl": "{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}",
    "owner": "supabase_admin",
    "nspname": "public",
    "defaclobjtype": "r"
  },
  {
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_sndfttzqmbkmkcnrvpfn=X/postgres,app_certification_runner=X/postgres}",
    "owner": "postgres",
    "nspname": "public",
    "defaclobjtype": "f"
  },
  {
    "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec_sndfttzqmbkmkcnrvpfn=ar/postgres,sandbox_exec=ar/postgres,app_certification_runner=arwd/postgres}",
    "owner": "postgres",
    "nspname": "public",
    "defaclobjtype": "r"
  },
  {
    "acl": "{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres,sandbox_exec_sndfttzqmbkmkcnrvpfn=rU/postgres,sandbox_exec=rU/postgres}",
    "owner": "postgres",
    "nspname": "public",
    "defaclobjtype": "S"
  },
  {
    "acl": "{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}",
    "owner": "supabase_admin",
    "nspname": "public",
    "defaclobjtype": "f"
  }
]
```

Both postgres and supabase_admin public-table defaults grant arwdDxtm to anon/authenticated: future tables created by either owner inherit INSERT/UPDATE/DELETE/TRUNCATE. The original unqualified ALTER DEFAULT PRIVILEGES would affect only the executing creator, not both owners. No global (null-schema) defaults were observed granting these privileges. Default DML remains an explicit follow-up decision: per-table intake allowlists cannot be expressed by a blanket default grant. Recommended future policy is deny anonymous DML by default and explicitly grant intake migrations, but not bundled here to avoid inventing future intake contracts.

### Anonymous write-policy allowlist

Conservatively keep tables with an anon OR PUBLIC write policy (PUBLIC applies to anon). This is broader and safer than checking the literal anon role only; predicate success is not implied. All policies are in catalog.json.

**Literal anon policies: 28**

- `sla_stage_events` / `sla_stage_events_no_client_write` / INSERT: `false`

- `sla_stage_events` / `sla_stage_events_no_delete` / DELETE: `false`

- `sla_stage_events` / `sla_stage_events_no_update` / UPDATE: `false`

- `supervisory_response_sla_obligation` / `srso_no_client_delete` / DELETE: `false`

- `supervisory_response_sla_obligation` / `srso_no_client_insert` / INSERT: `false`

- `supervisory_response_sla_obligation` / `srso_no_client_update` / UPDATE: `false`

- `file_uploads` / `Allow anon registration file_uploads insert` / INSERT: `(entity_type = ANY (ARRAY['registration'::text, 'form_field'::text, 'document_version'::text]))`

- `cert_v2_diag` / `cert_v2_diag deny by default` / ALL: `false`

- `sufficiency_determinations` / `sufficiency_determinations_no_client_insert` / INSERT: `false`

- `sufficiency_determinations` / `sufficiency_determinations_no_delete` / DELETE: `false`

- `sufficiency_determinations` / `sufficiency_determinations_no_update` / UPDATE: `false`

- `application_acknowledgements` / `acknowledgements_no_client_insert` / INSERT: `false`

- `application_acknowledgements` / `acknowledgements_no_delete` / DELETE: `false`

- `application_acknowledgements` / `acknowledgements_no_update` / UPDATE: `false`

- `application_legal_notes` / `legal_notes_no_delete` / DELETE: `false`

- `application_legal_notes` / `legal_notes_no_update` / UPDATE: `false`

- `worker_invocation_tokens` / `worker_invocation_tokens_no_client_access` / ALL: `false`

- `rule_overrides` / `rule_overrides_no_delete` / DELETE: `false`

- `rule_overrides` / `rule_overrides_no_update` / UPDATE: `false`

- `security_event_logs` / `security_event_logs_no_delete` / DELETE: `false`

- `security_event_logs` / `security_event_logs_no_update` / UPDATE: `false`

- `sla_stage_instances` / `sla_stage_instances_no_client_write` / INSERT: `false`

- `sla_stage_instances` / `sla_stage_instances_no_delete` / DELETE: `false`

- `sla_stage_instances` / `sla_stage_instances_no_update` / UPDATE: `false`

- `application_legal_referrals` / `legal_referrals_no_delete` / DELETE: `false`

- `decision_artifacts` / `decision_artifacts_no_client_insert` / INSERT: `false`

- `decision_artifacts` / `decision_artifacts_no_delete` / DELETE: `false`

- `decision_artifacts` / `decision_artifacts_no_update` / UPDATE: `false`

**PUBLIC-applicable policies: 24**

- `report_definitions` / `Manage report definitions` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `report_dashboard_widgets` / `rpt_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `conduct_alerts` / `Manage conduct alerts` / ALL: `(is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'conduct_alerts'::text, 'edit'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid) OR has_scoped_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text, NULL::uuid, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid))`

- `reports` / `Admins delete reports` / DELETE: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `reports` / `Internal users create reports` / INSERT: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `report_sources` / `rpt_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `conduct_alert_thresholds` / `conduct_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))`

- `conduct_products` / `conduct_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))`

- `conduct_monitoring_rule_runs` / `cmrr_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text))`

- `report_source_filters` / `rpt_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `conduct_actions` / `Manage conduct actions` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'issue_enforcement_action'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text))`

- `conduct_risk_categories` / `conduct_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))`

- `report_source_columns` / `rpt_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `conduct_monitoring_results` / `Write cmres` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text))`

- `complaints` / `Internal can insert complaints` / INSERT: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text))`

- `complaints` / `Update complaints` / UPDATE: `(is_super_admin(auth.uid()) OR (auth.uid() = investigator_id) OR has_scoped_permission(auth.uid(), 'complaint_management'::text, 'edit'::text, id, license_holder_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = complaints.license_holder_id)), complainant_id))`

- `entity_user_access` / `eua_admin_write` / ALL: `(has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))`

- `report_dashboard_layouts` / `rpt_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))`

- `conduct_triage_rules` / `conduct_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))`

- `conduct_channels` / `conduct_cfg_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))`

- `conduct_monitoring_rules` / `Write cmr` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))`

- `conduct_evidence` / `ce_write` / ALL: `(is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct_investigation'::text, 'manage_evidence_repository'::text))`

- `conduct_investigations` / `ci_write` / ALL: `(is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'market_conduct_investigation'::text, 'access_investigation_workspace'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_investigations.licensee_id)), NULL::uuid))`

- `notification_preferences` / `Users manage own notification prefs` / ALL: `(auth.uid() = user_id)`

**Keep tables (35):** `application_acknowledgements`, `application_legal_notes`, `application_legal_referrals`, `cert_v2_diag`, `complaints`, `conduct_actions`, `conduct_alert_thresholds`, `conduct_alerts`, `conduct_channels`, `conduct_evidence`, `conduct_investigations`, `conduct_monitoring_results`, `conduct_monitoring_rule_runs`, `conduct_monitoring_rules`, `conduct_products`, `conduct_risk_categories`, `conduct_triage_rules`, `decision_artifacts`, `entity_user_access`, `file_uploads`, `notification_preferences`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_definitions`, `report_source_columns`, `report_source_filters`, `report_sources`, `reports`, `rule_overrides`, `security_event_logs`, `sla_stage_events`, `sla_stage_instances`, `sufficiency_determinations`, `supervisory_response_sla_obligation`, `worker_invocation_tokens`

**Revoke anon DML tables (334; frozen excluded):** `ai_governance_presentation_aliases`, `ai_insight_actions`, `ai_insights`, `aml_assessments`, `api_key_usage`, `api_keys`, `app_environment_config`, `appeal_independence_policies`, `appeal_panel_scopes`, `audit_export_downloads`, `audit_export_jobs`, `business_calendar_process_assignments`, `captcha_verifications`, `cert_certification_users`, `cert_fixture_object_types`, `cert_fixture_objects`, `cert_fixture_runs`, `cert_machine_identities`, `cert_nonproduction_guard`, `certification_seed_manifest`, `complaint_allegation_history`, `complaint_allegations`, `complaint_closure_reviews`, `complaint_contact_preferences`, `complaint_correspondence`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_duplicate_rules`, `complaint_duplicate_scoring_config`, `complaint_escalation_cases`, `complaint_escalation_log`, `complaint_escalation_rules`, `complaint_evidence`, `complaint_evidence_allegations`, `complaint_import_batches`, `complaint_import_rows`, `complaint_intake_details`, `complaint_intake_rules`, `complaint_investigation_plans`, `complaint_jurisdiction_assessments`, `complaint_jurisdiction_factor_catalogue`, `complaint_jurisdiction_factors`, `complaint_jurisdiction_info_requests`, `complaint_jurisdiction_rule_set_factors`, `complaint_jurisdiction_rule_sets`, `complaint_outcomes`, `complaint_parties`, `complaint_public_intake_config`, `complaint_qa_policies`, `complaint_reconsiderations`, `complaint_redress`, `complaint_redress_types`, `complaint_referrals`, `complaint_representation_allegations`, `complaint_representation_events`, `complaint_representations`, `complaint_respondents`, `complaint_rfi_allegations`, `complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`, `complaint_rfis`, `complaint_status_catalogue`, `complaint_storage_cleanup_deadletter`, `complaint_tracking_credentials`, `complaint_triage_evaluations`, `complaint_vulnerability_assessments`, `conduct_closure_breaches`, `conduct_cluster_history`, `conduct_cluster_members`, `conduct_cluster_metrics`, `conduct_clusters`, `conduct_evidence_access_log`, `conduct_findings`, `conduct_intelligence_report_recipients`, `conduct_intelligence_report_versions`, `conduct_intelligence_reports`, `conduct_intelligence_templates`, `conduct_interview_attachments`, `conduct_interview_participants`, `conduct_interviews`, `conduct_investigation_closures`, `conduct_monitoring_reviews`, `conduct_monitoring_rule_versions`, `conduct_post_closure_monitoring`, `conduct_saved_views`, `conduct_signal_events`, `conduct_signal_evidence`, `conduct_supervision_annotations`, `conduct_triage_audit_events`, `conduct_triage_rule_versions`, `config_governed_tables`, `config_public_read_allowlist`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_routing_rules`, `correspondence_templates`, `countries`, `data_concepts`, `decision_options`, `decision_rationale_templates`, `declaration_invitations`, `document_action_logs`, `document_categories`, `document_extractions`, `document_groups`, `document_holds`, `document_relationships`, `document_retention_policies`, `document_types`, `document_versions`, `documents`, `email_provider_test_log`, `enforcement_appeals`, `enforcement_case_number_counters`, `enforcement_compliance_evidence`, `enforcement_penalty_payments`, `enforcement_representations`, `enforcement_workflow_stages`, `enforcement_workflow_transitions`, `engine_rule_action_results`, `engine_rule_alerts`, `engine_rule_executions`, `engine_rule_lifecycle_events`, `engine_rule_suppressions`, `engine_rule_tasks`, `engine_rule_tests`, `engine_rule_versions`, `engine_rules`, `entity_data_authority_rules`, `entity_external_references`, `entity_facts`, `entity_match_candidates`, `entity_membership_role_permissions`, `entity_registry_bindings`, `entity_registry_sync_states`, `entity_resolution_events`, `entity_risk_scores`, `entity_sync_conflicts`, `entity_user_access_request_events`, `entity_user_access_requests`, `escalation_notification_events`, `escalation_ownership_events`, `escalation_rules`, `escalation_tier_events`, `escalations`, `examination_data_requests`, `examination_events`, `examination_exit_meetings`, `examination_findings`, `examination_origin`, `examination_reports`, `examination_scope_area`, `examination_scope_dimension`, `examination_scoping`, `examination_workpapers`, `executive_dashboard_snapshots`, `field_conditions`, `file_upload_scan_events`, `financial_group_members`, `financial_groups`, `form_applicability_rules`, `form_data_domains`, `form_field_definitions`, `form_field_dependencies`, `form_fields`, `form_lifecycle_applicability`, `form_package_items`, `form_packages`, `form_responses`, `form_submission_values`, `form_templates`, `form_versions`, `forms`, `fp_committee_decision_snapshots`, `fp_condition_events`, `fp_condition_evidence`, `group_consolidated_snapshots`, `group_consolidation_methods`, `group_ewi_alerts`, `group_ewi_rules`, `group_risk_scores`, `integration_alert_rules`, `integration_connections`, `integration_credentials`, `integration_dead_letter`, `integration_fallback_events`, `integration_logs`, `integration_retry_queue`, `intragroup_exposures`, `job_queue`, `metric_calculation_rules`, `module_rule_tests`, `notification_digest_items`, `notification_digest_log`, `notification_digest_runs`, `notification_dispatch_log`, `notification_event_channel_templates`, `notification_event_queue`, `notification_template_versions`, `notification_templates`, `notification_user_event_preferences`, `notifications`, `organization_names`, `ownership_types`, `payment_oversight_config`, `payment_oversight_events`, `payment_system_incidents`, `payment_system_operators`, `permission_actions`, `permission_dependent_actions`, `permission_module_routes`, `permission_modules`, `permissions`, `pfmi_assessment_principles`, `pfmi_assessments`, `pfmi_principle_applicability`, `pfmi_principles`, `ppoc_mapping_sectors`, `process_templates`, `prudential_action_events`, `prudential_action_responses`, `prudential_detection_runs`, `prudential_ewi_alerts`, `prudential_process_sla_config`, `public_intake_events`, `rbac_module_scopes`, `rdm_migration_decisions`, `registration_upload_capabilities`, `registration_upload_files`, `registry_publication_policies`, `regulatory_metrics`, `regulatory_request_form_requirements`, `regulatory_requests`, `reinsurance_contracts`, `report_favorites`, `report_filters`, `report_logs`, `report_option_sets`, `report_run_files`, `report_run_rows`, `report_runtime_config`, `report_schedules`, `report_status_options`, `report_templates`, `resilience_arrangements`, `resilience_incidents`, `risk_score_weights`, `role_migration_log`, `role_permissions`, `roles`, `sec_anon_execute_allowlist`, `sec_credential_sanitisation_log`, `sec_legacy_permission_map`, `sec_module_scopes`, `sec_modules`, `sec_navigation_items`, `sec_permission_dependencies`, `sec_permissions`, `sec_role_permissions`, `sec_role_scope_values`, `sec_role_scopes`, `sec_role_template_permissions`, `sec_role_template_scope_values`, `sec_role_template_scopes`, `sec_role_templates`, `sec_roles`, `sec_routes`, `sec_scope_types`, `sec_seed_reports`, `sec_user_roles`, `sector_alias_map`, `share_classes`, `site_settings`, `sla_process_team_leads`, `states`, `sufficiency_evaluation_results`, `sufficiency_evaluations`, `sufficiency_overrides`, `sufficiency_rule_set_items`, `sufficiency_rule_sets`, `sufficiency_rules`, `supervisory_attention_origin`, `supervisory_detector`, `supervisory_detector_run`, `supervisory_domain_authority`, `supervisory_domain_calculation_rule`, `supervisory_domain_perimeter`, `supervisory_finding`, `supervisory_finding_event`, `supervisory_methodology_fact_requirement`, `supervisory_methodology_parameter`, `supervisory_methodology_question_fact`, `supervisory_methodology_question_rule`, `supervisory_methodology_reference_decision`, `supervisory_methodology_regulator_approval`, `supervisory_methodology_semantic_profile`, `supervisory_outcome_evaluation`, `supervisory_plan_assessment`, `supervisory_plan_template_actions`, `supervisory_plan_templates`, `supervisory_policy_component`, `supervisory_policy_component_event`, `supervisory_policy_component_type`, `supervisory_policy_domain_component_requirement`, `supervisory_policy_profile`, `supervisory_policy_profile_binding`, `supervisory_policy_profile_event`, `supervisory_policy_profile_requirement`, `supervisory_rating_scale`, `supervisory_reassessment_requirement`, `supervisory_remediation_action`, `supervisory_remediation_event`, `supervisory_remediation_validation`, `supervisory_residual_acceptance`, `supervisory_risk_monitoring_decision`, `supervisory_signal`, `supervisory_signal_occurrence`, `supervisory_work_assignment`, `supervisory_work_type`, `support_ticket_attachments`, `support_ticket_audit`, `support_ticket_messages`, `support_tickets`, `system_subscription_package`, `system_subscription_package_history`, `thematic_review_entities`, `thematic_review_evidence`, `thematic_review_products`, `thematic_review_reports`, `user_dynamic_roles`

**Frozen tables not changed:** `supervisory_assessment`, `supervisory_assessment_approval_decision`, `supervisory_assessment_assignment`, `supervisory_assessment_calculation`, `supervisory_assessment_calculation_history`, `supervisory_assessment_calculation_override`, `supervisory_assessment_calculation_run`, `supervisory_assessment_dimension`, `supervisory_assessment_dimension_evidence`, `supervisory_assessment_event`, `supervisory_assessment_evidence_basis`, `supervisory_assessment_evidence_exception`, `supervisory_assessment_fact`, `supervisory_assessment_policy_snapshot`, `supervisory_assessment_programme`, `supervisory_assessment_programme_event`, `supervisory_assessment_programme_set`, `supervisory_assessment_programme_trigger`, `supervisory_assessment_programme_vocabulary`, `supervisory_assessment_question_evidence`, `supervisory_assessment_question_plan`, `supervisory_assessment_question_plan_override`, `supervisory_assessment_question_response`, `supervisory_assessment_review_challenge`, `supervisory_assessment_review_round`, `supervisory_assessment_risk_publication`, `supervisory_assessment_signal`

### Anonymous SECURITY INVOKER write dependencies

The following are anon-executable, non-definer public functions with lexical DML in their live bodies. This is a conservative direct-body scan, not proof of reachable writes; nested calls, dynamic SQL and trigger effects require separate tracing. Do not assume absence of a direct browser call makes a grant unused.

- `_todo()`: EXECUTE 'DELETE FROM __tcache__ WHERE id = ' || todos[1];; EXECUTE 'DELETE FROM __tcache__ WHERE id = ' || todos[1];

- `_add(text, integer, text)`: EXECUTE 'INSERT INTO __tcache__ (label, value, note) values (' ||

- `todo_end()`: EXECUTE 'DELETE FROM __tcache__ WHERE id = ' || id;

Count: 3. Full live definitions are in catalog.json. Invoker functions need underlying caller grants and RLS; definer RPCs/edge service-role intake do not depend on anon table DML. Confirm trigger-only functions cannot be ordinarily invoked before treating them as browser dependencies.

### Public source dependency review

See `public-source-evidence.txt` for a recursive, multiline source scan of registration, complaint, tracking, landing and password-related files and their named public helpers. `ForgotPassword.tsx` calls auth.resetPasswordForEmail, not public table DML. Public declarations use get_declaration_invitation_public / verify_declaration_identity / submit_declaration_form RPCs. Registration OTP uses send-registration-otp / verify-registration-otp edge functions; storage uploads are storage-schema grants, outside this proposal. `public-complaint-intake` is a distinct edge function and must be smoke-tested along with tracking and registration. Source search is not a runtime call graph; unresolved imported wrappers are a deployment gate, not grounds for claiming no dependencies.

### Exact SQL, ordering, rollback and checks

`sec01-proposed.sql` is the exact per-table generated revoke list and owner-qualified default fix. `sec01-rollback.sql` restores only privileges that existed in this snapshot, including grant options; execute as the original grantor (recorded in catalog.json) for identical grant provenance. No blanket GRANT rollback. Grantor provenance should be revalidated immediately before deployment.

Order: (1) re-snapshot grants and owners; (2) resolve public-source and invoker dependency smoke tests; (3) obtain frozen-owner approval for future-object defaults or defer just those two statements; (4) execute one short transaction as authorized original grantor; (5) post-check effective privileges and public journeys; (6) commit only after catalogue checks, otherwise ROLLBACK. DML revokes can break invoker-based intake; TRUNCATE revoke does not affect normal browser DML. DDL locks can block; use the deployment lock-timeout standard. Do not use REVOKE ALL ON ALL TABLES.

```sql
SELECT c.relname, r.rolname, has_table_privilege(r.oid,c.oid,'TRUNCATE') AS can_truncate
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relkind IN ('r','p')
AND r.rolname IN ('anon','authenticated') ORDER BY 1,2;
```

Post-check: false on all non-frozen tables; frozen residuals explicitly excepted. For each revoke-list table repeat has_table_privilege for INSERT/UPDATE/DELETE; expect false. Compare allowlist effective DML unchanged. Test successful registration/OTP, anonymous complaint with attachments, valid tracking, password reset, public landing; invalid tracking tokens, unauthorized edits and cross-user writes must fail. Never test TRUNCATE against production data. Re-query pg_default_acl for both creators; future-table tests belong only in disposable staging.

## SEC-02 — CONFIRMED (coverage gap)

**Root cause / impact:** Package configuration exists, but create_application_draft and application_draft_save do not consult system_subscription_package. Licence eligibility is not subscription entitlement. Browser-only package gating can be bypassed by RPC calls.

**Affected objects:** `system_subscription_package`, `system_subscription_package_set`, create/save RPCs and other package-gated entry points.

**Live evidence:**

`create_application_draft`:

```sql

  v_is_staff := public.is_super_admin(v_uid)
                OR public.has_permission(v_uid, 'application_management', 'create');


  IF v_is_post THEN
    v_applicability := public.post_license_service_applicability(
      NULLIF(v_service_id,'')::uuid, v_license_id

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  IF NOT v_is_post AND v_reg_id IS NOT NULL THEN
    INSERT INTO public.registration_licensing_handoffs
      (registration_id, application_id, registration_reference, detail)
    SELECT v_reg_id, v_application.id, r.registration_reference,
```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.

`system_subscription_package_set`:

```sql
CREATE OR REPLACE FUNCTION public.system_subscription_package_set(_package text, _overrides jsonb, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_prev text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a super administrator can change the subscription package' USING ERRCODE = '42501';
  END IF;
  IF _package NOT IN ('PACKAGE_A','PACKAGE_B','PACKAGE_C') THEN RAISE EXCEPTION 'Unknown package'; END IF;
  IF coalesce(length(trim(_reason)),0) < 5 THEN RAISE EXCEPTION 'A reason of at least 5 characters is required'; END IF;
  IF _overrides IS NULL OR jsonb_typeof(_overrides) <> 'object' THEN _overrides := '{}'::jsonb; END IF;
  SELECT active_package INTO v_prev FROM public.system_subscription_package WHERE id;
  UPDATE public.system_subscription_package
     SET active_package=_package, module_overrides=_overrides, updated_at=now(), updated_by=auth.uid()
   WHERE id;
  INSERT INTO public.system_subscription_package_history(previous_package,new_package,module_overrides,reason,changed_by)
  VALUES (v_prev,_package,_overrides,trim(_reason),auth.uid());
END $function$

```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
**DECISION REQUIRED — no safe exact entitlement SQL can be selected.** Approve feature-to-module/package mapping, overrides, default-on-missing configuration, staff/worker bypasses and existing-draft grandfathering first. A new `package_feature_enabled` predicate must read the approved mapping, fail closed, and be called from all protected RPCs and edge handlers before writes; do not substitute licence eligibility. No production DDL is proposed pending those decisions.


**Dependencies / business decisions:** Package matrix and bypass contract; inventory every feature mutation, not just draft creation.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: entitled package + permission + scope succeeds. Negative: direct RPC from excluded package, missing configuration and tampered browser package all deny, without rows created.


## SEC-04 — CONFIRMED (identity predicate absent; licence checks present)

**Root cause / impact:** Create admits applicant/pre_licensee; post-licence branch checks licence/entity eligibility but not the browser account-class restriction. Save checks ownership/membership/status, not post-licence identity. This is not an unrestricted licence bypass: can_act_on_specific_license and renewal exceptions already constrain it.

**Affected objects:** create_application_draft, application_draft_save, submit entry points, entity_license_entitlements.

**Live evidence:**

`create_application_draft`:

```sql
    v_is_staff
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)

  IF v_is_post THEN
    v_applicability := public.post_license_service_applicability(
      NULLIF(v_service_id,'')::uuid, v_license_id
    IF NOT v_is_staff THEN
      IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL)
         AND NOT COALESCE((
           v_data->>'is_renewal' = 'true'
```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.

`application_draft_save`:

```sql
    public.is_super_admin(v_uid)
    OR v_app.applicant_id = v_uid
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.entity_user_memberships m
       WHERE m.user_id = v_uid AND m.status = 'APPROVED'
         AND m.entity_id = v_app.entity_id

  UPDATE public.applications
     SET data = COALESCE(_data, data),
         license_type = COALESCE(NULLIF(trim(COALESCE(_license_type, '')), ''), license_type),
```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
**DECISION REQUIRED — no executable identity-policy SQL proposed.** Port `src/lib/postLicenceAccess.ts` precedence (institutional role / PPOC, then reject applicant/pre_licensee, then primary/secondary/profile fallback) only after authoritative database PPOC and active identity sources and multi-role precedence are agreed. Apply one predicate to create/save/submit; do not alter existing licence eligibility, renewal grace exceptions or correction-save holds.


**Dependencies / business decisions:** Canonical account identity, PPOC representation, multi-role precedence and submit-path inventory.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: authorized primary/secondary/PPOC for same institution passes create/save/submit. Negative: applicant/pre-licensee with linked licensed entity denied; cross-entity and unlicensed requests denied; initial licensing and existing correction behavior unchanged.


## SEC-05 — CONFIRMED

**Root cause / impact:** _entity_id is unused. External capability returns global sec_has_permission regardless of institution, so a capability resolver cannot itself prove entity access.

**Affected objects:** has_portal_capability; callers using this predicate as an entity gate.

**Live evidence:**

`has_portal_capability`:

```sql
CREATE OR REPLACE FUNCTION public.has_portal_capability(_user_id uuid, _entity_id uuid, _area portal_area, _capability text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_action text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;
  IF public.is_internal_staff_user(_user_id) OR public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  v_module := CASE _area
    WHEN 'licensing'        THEN 'licensing'
    WHEN 'returns'          THEN 'returns_management'
    WHEN 'complaints'       THEN 'complaint_management'
    WHEN 'fp_declarations'  THEN 'fit_and_proper'
  END;

  v_action := CASE _capability
    WHEN 'can_submit'                  THEN 'submit'
    WHEN 'can_submit_returns'          THEN 'submit'
    WHEN 'can_submit_complaints'       THEN 'submit'
    WHEN 'can_submit_fp_declarations'  THEN 'submit'
    WHEN 'can_upload_documents'        THEN 'upload_documents'
    WHEN 'can_view_status'             THEN 'view_status'
    WHEN 'can_respond_rfi'             THEN 'respond_rfi'
    ELSE _capability
  END;

  RETURN public.sec_has_permission(_user_id, v_module, v_action);
END;
$function$

```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
Exact conditional replacement: `sec05-conditional-proposed.sql` inserts approved membership + non-null entity guard after existing internal-staff bypass and before module mapping. Existing caller/user anti-spoof check remains. **ON HOLD / DECISION REQUIRED:** approve whether PPOC/profile-only/legacy links without an APPROVED membership must count. This file is an explicit membership-only option, not authorized final policy.


**Dependencies / business decisions:** Existing SEC-05 hold; authoritative membership/PPOC rule.

**Regression risk:** Membership-only option excludes legacy/profile/PPOC-only users; review all null-entity callers.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: approved same-entity member with mapped permission succeeds; internal staff existing behavior preserved. Negative: other entity, revoked/pending membership, null entity and spoofed user deny.


## SEC-06 — CONFIRMED

**Root cause / impact:** INSERT policy checks read access only and never binds actor_id. An appeal reader with INSERT grant can fabricate audit events/actors independently of a governed transition.

**Affected objects:** license_appeal_events / appeal_events_insert; can_read_license_appeal.

**Live evidence:**

`can_read_license_appeal`:

```sql
CREATE OR REPLACE FUNCTION public.can_read_license_appeal(_user_id uuid, _appeal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.license_appeals la
    JOIN public.applications a ON a.id = la.application_id
    WHERE la.id = _appeal_id
      AND (
        la.filed_by = _user_id
        OR a.applicant_id = _user_id
        OR public.has_permission(_user_id, 'license_appeals', 'view')
        OR public.is_appeal_panel_member(_user_id, la.id)
      )
  );
$function$

```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
Live policy: `WITH CHECK (can_read_license_appeal(auth.uid(), appeal_id))`. Immediate containment proposal, only after auditing direct client writers and definer command paths:
```sql
BEGIN;
REVOKE INSERT ON TABLE public.license_appeal_events FROM anon, authenticated;
COMMIT;
```
Rollback only pre-existing explicit INSERT grants shown in catalog.json (`GRANT INSERT ON public.license_appeal_events TO authenticated;` and anon only if present). Preferred final change: insert events only in authorized existing appeal transition commands with actor_id := auth.uid(), not caller-supplied; **DECISION REQUIRED** event-type/role/transition matrix before inventing a generic append-event RPC. Revocation is containment, not complete definer-path actor validation.


**Dependencies / business decisions:** Appeal command caller inventory and approved event transition matrix.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: authorized appeal workflow command emits exactly one event with caller actor. Negative: reader direct insert, fake actor, unauthorized event type, other appeal and unauthenticated calls deny.


## SEC-07 — CONFIRMED (repository; deployed edge bundle not inspectable)

**Root cause / impact:** run-scheduled-reports authenticates the invoking user, then selects schedules and queries data with service role. Setting executed_by/created_by to schedule owner is attribution, not owner authorization. No per-owner permission/scope validation precedes executeQuery(admin,...).

**Affected objects:** supabase/functions/run-scheduled-reports/index.ts; _shared/report-generator.ts executeQuery; report_schedules.

**Live evidence:**


**Exact proposal / implementation boundary:**
**No SQL-only fix.** Exact source change points: replace `executeQuery(admin, {` in the schedule loop with an owner-effective scoped executor; before it revalidate `s.created_by` is active, has report execute permission and allowed source/entity/sector scope, then intersect saved filters with current scope server-side. Do not forward the worker or invoking admin JWT as the owner. An authenticated worker endpoint and trusted owner-scoped query contract require separate design/deployment approval. **DECISION REQUIRED:** disabled owners, changed scopes, recipient visibility and worker identity. SQL proposal: none; service_role bypasses ordinary RLS so a new client policy does not fix this.


**Dependencies / business decisions:** Worker authentication (SEC-08), source-specific scope matrix, trusted owner-effective execution design.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: active owner generates only currently authorized rows. Negative: scope revoked after schedule creation, disabled/deleted owner, forged schedule id and out-of-scope saved filter yield no data/export/notification.


## SEC-14 — CONFIRMED (repository bypass; live governance exists)

**Root cause / impact:** Kill-switch/model/instruction checks are implemented in the live resolver, but document-extract and generate-return-analysis use hard-coded google/gemini-2.5-flash and do not invoke governance before provider fetch. Existence of governance tables is not enforcement of outbound edge calls.

**Affected objects:** ai_governance_* / conduct_ai_use_cases; document-extract/index.ts:126, generate-return-analysis/index.ts:242.

**Live evidence:**

`ai_governance_resolve_execution`:

```sql
CREATE OR REPLACE FUNCTION public.ai_governance_resolve_execution(_use_case_code text, _acting_user uuid, _requested_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
  IF _uc.code IS NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','USE_CASE_NOT_REGISTERED',
      'message','This AI capability is not registered in the AI use-case register.');
  END IF;
  -- 0. Institutional stop control overrides everything else.
  _stop := public.ai_gov_stop_active(_uc.owning_module);
  IF _stop IS NOT NULL THEN
    RETURN _deny || jsonb_build_object('reason_code','AI_STOPPED',
  END IF;
  IF _requested_model IS NOT NULL AND _requested_model <> _m.technical_identifier THEN
    RETURN _deny || jsonb_build_object('reason_code','MODEL_NOT_PERMITTED',
      'message','The requested AI model is not the model approved for this capability.');

  IF _uc.approved_instruction_id IS NOT NULL THEN
    SELECT * INTO _i FROM public.ai_governance_instructions WHERE id = _uc.approved_instruction_id;
  ELSE
    SELECT * INTO _i FROM public.ai_governance_instructions
```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
**No SQL-only fix; no DDL proposed.** Before any signed external document URL/provider call in document-extract and before AI fetch in generate-return-analysis, call the existing governed resolver using the validated caller id and registered use-case code; fail closed on RPC error or allowed != true; take provider/model/instruction from result, not body/hard-code. Apply existing data-release/scan checks separately. Source rollback/redeploy is required. Do not call ai_governance_surface_gate during this review: it writes refusal events. **DECISION REQUIRED:** authoritative registered use-case/surface codes, approved bindings and trusted evaluator actor contract.


**Dependencies / business decisions:** Governance registration/bindings, trusted actor, API deployment approval. Frozen AML/CFT supervisory_assessment* objects are excluded; no changes proposed to them.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: active approved use case uses bound model/instruction and records attempt. Negative: global/module stop, suspended use case/model/instruction, missing binding, governance RPC failure and unauthorized actor produce zero outbound AI calls; deterministic workflows remain functional.


## SEC-15 — CONFIRMED (missing independence/state/version guards)

**Root cause / impact:** review_prudential_action_response checks permission and existence of any entity response, but not reviewer != submitter, current reviewable state or response version. Reads are unlocked, permitting competing reviews/stale decisions.

**Affected objects:** review_prudential_action_response; prudential_actions; prudential_action_responses/events.

**Live evidence:**

`review_prudential_action_response`:

```sql
CREATE OR REPLACE FUNCTION public.review_prudential_action_response(_action_id uuid, _decision text, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
        _a public.prudential_actions;
        _has_resp boolean;
        _new_status text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;
  IF _decision NOT IN ('accepted','rejected') THEN
    RETURN jsonb_build_object('error','Decision must be accepted or rejected','code','VALIDATION');
  END IF;
  IF _notes IS NULL OR length(trim(_notes)) < 5 THEN
    RETURN jsonb_build_object('error','Review notes of at least 5 characters are required','code','VALIDATION');
  END IF;
  SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Action not found','code','NOT_FOUND');
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'prudential_supervision','workflow_action')
          OR public.has_permission(_uid,'prudential_supervision','edit')
          OR public.has_permission(_uid,'prudential_supervision','manage_remediation')) THEN
    RETURN jsonb_build_object('error','You are not permitted to review supervisory actions','code','FORBIDDEN');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.prudential_action_responses r
                  WHERE r.action_id = _action_id AND r.kind = 'entity_response') INTO _has_resp;
  IF NOT _has_resp THEN
    RETURN jsonb_build_object('error','There is no entity response to review','code','NO_RESPONSE');
  END IF;

  _new_status := CASE WHEN _decision = 'accepted' THEN 'completed' ELSE 'in_progress' END;

  INSERT INTO public.prudential_action_responses(action_id, kind, narrative, decision, submitted_by)
  VALUES (_action_id, 'supervisor_review', trim(_notes), _decision, _uid);

  UPDATE public.prudential_actions
     SET review_status = _decision,
         review_notes = trim(_notes),
         reviewed_by = _uid,
         reviewed_at = now(),
         status = _new_status,
         completion_notes = CASE WHEN _decision = 'accepted' THEN trim(_notes) ELSE completion_notes END,
         closed_at = CASE WHEN _decision = 'accepted' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN _decision = 'accepted' THEN _uid ELSE closed_by END,
         progress_percent = CASE WHEN _decision = 'accepted' THEN 100 ELSE progress_percent END,
         updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
  VALUES (_action_id, 'supervisor_review_' || _decision, _a.status, _new_status, _uid, trim(_notes));

  RETURN jsonb_build_object('ok', true, 'status', _new_status, 'review_status', _decision);
END $function$

```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
**DECISION REQUIRED — do not invent maker/checker rules.** Define maker as action preparer, latest response submitter, or both; define reviewable states, latest-response ordering, response version key and super-admin exceptions. Then replace initial action SELECT with `SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id FOR UPDATE;`, lock/select the authoritative response version, reject maker identity and stale/wrong state, and bind review to that immutable version in the same transaction. The FOR UPDATE statement alone is exact but is NOT a complete fix and is not proposed as a standalone deployment. No schema DDL until version binding is approved.


**Dependencies / business decisions:** Maker/checker and workflow/version decisions; no AML/CFT supervisory_assessment* changes.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: independent permitted checker reviews current pending version once. Negative: same maker/checker, stale version, double concurrent approval, absent response and closed/rejected-state replay deny without partial events.


## SEC-16 — CONFIRMED (function-text drift)

**Root cause / impact:** Live application_draft_save contains APPLICATION_UNDER_REVIEW submitted_at lock absent from the 20260820183504 repository definition. Replaying that repository version could regress the live protection.

**Affected objects:** application_draft_save(uuid,jsonb,text,uuid); both migration trees scanned.

**Live evidence:**

`application_draft_save`:

```sql
CREATE OR REPLACE FUNCTION public.application_draft_save(_application_id uuid, _data jsonb, _license_type text DEFAULT NULL::text, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.applications;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to save an application.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application % does not exist.', _application_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR v_app.applicant_id = v_uid
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.entity_user_memberships m
       WHERE m.user_id = v_uid AND m.status = 'APPROVED'
         AND m.entity_id = v_app.entity_id
    )
  ) THEN
    RAISE EXCEPTION 'APPLICATION_EDIT_FORBIDDEN: You do not have permission to edit this application.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_app.status, 'draft') NOT IN (
    'draft', 'in_progress', 'returned', 'info_requested', 'query_raised',
    'resubmission_required', 'pending_payment'
  ) AND NOT public.is_super_admin(v_uid)
    AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE: This application is not currently open for editing.'
      USING ERRCODE = '42501';
  END IF;

  -- Submitted applications advanced by the workflow keep 'in_progress';
  -- they are under regulator review and closed to applicant edits.
  IF v_app.status IN ('in_progress','submitted') AND v_app.submitted_at IS NOT NULL
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_UNDER_REVIEW: This application is under regulator review and cannot be edited.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.applications
     SET data = COALESCE(_data, data),
         license_type = COALESCE(NULLIF(trim(COALESCE(_license_type, '')), ''), license_type),
         regulator_id = COALESCE(_regulator_id, regulator_id),
         updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('success', true, 'application_id', _application_id);
END;
$function$

```

**Repository definition(s):** No matching CREATE FUNCTION by name in either migration tree.


**Exact proposal / implementation boundary:**
Exact SQL for a new reconciliation migration: use only the application_draft_save CREATE OR REPLACE statement in `live-selected-definitions.sql`, without changing ownership/grants. Proposed file: `supabase/migrations/<new-approved-version>_reconcile_application_draft_save.sql` (also update Drizzle migration bookkeeping only if that tree is authoritative). This is live-no-op reconciliation, not a correction-save behavior fix. Rollback SQL is the same captured live definition; never roll back to the stale definition and reopen submitted edits.


**Dependencies / business decisions:** Migration-version allocation; authoritative migration tree; existing APP-01 hold.

**Regression risk:** Authorization tightening can deny previously permitted clients; stage with representative identities.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: replay onto clean staging yields identical pg_get_functiondef and draft owner save works. Negative: ordinary applicant cannot save submitted/in_progress with submitted_at; unauthorized member denied. Confirm staff exception and held correction statuses unchanged.


## SEC-17 — CONFIRMED source-definition drift; CANNOT INSPECT migration-ledger parity

`SELECT version FROM supabase_migrations.schema_migrations` failed: **permission denied for schema supabase_migrations**. No inference of applied/pending versions is justified. Ask an authorized read-only operator to run that SELECT and compare sorted version prefixes against the repository inventory. No permissions were changed to bypass the restriction.

Public function count: **3641**. Functions with no CREATE FUNCTION by name in either migration tree: **3641 signatures / 2883 names**. Full list: `live-functions-absent-by-name.txt`. This is a conservative lexical source-coverage metric, not a count of proven unauthorized drift: extension functions, generated SQL, quoted/schema forms and overloaded signatures may need classification. Existing names with differing bodies are additional drift and not included in that count.

- `file_upload_enqueue_scan()`: no CREATE definition by name

- `entity_access_request_submit(_entity_id uuid, _request_type text, _reason text, _letter_path text, _target_membership_id uuid, _full_name text, _email text, _phone text, _position text, _requested_role_id uuid, _effective_date date, _supporting_paths text[])`: no CREATE definition by name

- `entity_access_request_withdraw(_id uuid)`: no CREATE definition by name

- `entity_access_request_review(_id uuid, _recommendation text, _notes text)`: no CREATE definition by name

- `entity_access_request_decide(_id uuid, _approve boolean, _notes text)`: no CREATE definition by name

**Root cause/impact:** live-only definitions and stale migrations undermine deterministic restore and security review. **Exact proposed SQL:** for each approved non-frozen live-only application RPC, capture the exact pg_get_functiondef already present in catalog.json into a versioned reconciliation migration, plus its existing ACL/owner as explicitly reviewed. Do not blindly dump/reapply all functions: extension-owned functions and frozen supervisory_assessment* objects are out of scope. No behavior-changing database SQL is required on the current live instance. **Dependencies / DECISION REQUIRED:** authoritative migration tree, ledger access, extension classification and migration version allocation. **Pre-check:** authorized ledger SELECT; classify each absent function and diff exact bodies/overloads. **Rollback SQL:** saved pre-change CREATE OR REPLACE definitions; for this no-op reconciliation these are identical. Never DROP a live-only function as rollback. **Post-check:** clean replay contains expected functions and equivalent ACLs; ledger/file mismatch list empty or explicitly explained. **Transactional:** reconciliation DDL yes; ledger registration follows platform migration runner, never manual ledger DML. **Tests:** positive clean restore resolves upload scan trigger and four access-request RPCs; negative stale replay cannot remove submitted-lock protections; unexpected live-only app functions fail CI reconciliation. **Risk:** a definition-only capture without owners/ACLs/search_path/dependencies is not a faithful restore.

## SEC-19 — CONFIRMED

**Root cause / impact:** persistRun writes reports.status=ready before storing rows, silently breaks on first batch failure and ignores completion update errors. Client-write policies additionally allow reports updates and own-run row INSERT/DELETE; privileged clients can alter persisted evidence. Owner-bound row policies are not immutable provenance.

**Affected objects:** reports, report_run_rows; report_logs and export-named tables inventoried below; _shared/report-generator.ts:785-837.

**Live evidence:**


**Exact proposal / implementation boundary:**
**Trusted persistence path required before revocation.** Exact containment SQL (separate approval; breaks browser persistence until migrated):
```sql
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON public.reports, public.report_run_rows FROM anon, authenticated;
COMMIT;
```
Restore only each pre-existing ACL in catalog.json, not a blanket GRANT to both roles. Source exact replacement: replace `if (rRes.error) break;` with `if (rRes.error) throw new Error(rRes.error.message);`; replace initial `status: 'ready'` with an approved nonfinal status only after checking the status constraint; finalize ready only after persisted count and indices match expected projection and all errors checked. This source-only error fix still leaves partial data: design a transaction-backed trusted finalize RPC or staged run protocol. **DECISION REQUIRED:** whether reports contains editable definitions as well as immutable generated runs, allowed states, retention and export manifest schema; do not revoke mixed-purpose writes without splitting that contract. No speculative finalizer DDL supplied.


**Dependencies / business decisions:** Trusted generator rollout, report definition/run separation and status schema; preserve held report read grants.

**Regression risk:** Immediate revocation breaks manual generation if caller-scoped persistence remains; RLS-only changes do not constrain service role.

**Pre-checks:** Re-capture the affected definitions, grants, policies and callers; compare with this snapshot, inspect trigger dependencies, and establish staging fixtures before approval. No runtime mutation tests were executed.

**Rollback SQL:** For changed functions, execute the exact saved CREATE OR REPLACE definition in `live-selected-definitions.sql` inside BEGIN/COMMIT. For grant-only changes use the matching GRANT statements below; never blanket-grant. Edge changes require source rollback/redeploy, not SQL. Where no deployable SQL is proposed there is no database rollback.

**Post-checks:** Compare pg_get_functiondef, pg_policies and effective privileges with the intended delta; run the acceptance cases below in an isolated test database.

**Transactional:** SQL-only changes can be BEGIN/COMMIT; edge deploys and external AI/export calls cannot share a database transaction. Do not deploy revocations ahead of replacement trusted paths.

**Acceptance tests:** Positive: all rows committed, expected count equals persisted count and export refers to immutable completed run. Negative: failed middle batch never ready/success; client alters creator/status/count/rows denied; mismatched export digest/count and concurrent finalization denied.


### Report and export live ACL/policy inventory

#### `report_logs`

Client ACL: [('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'), ('authenticated', 'INSERT'), ('authenticated', 'UPDATE'), ('authenticated', 'DELETE')]

- Insert own report logs [['authenticated'], INSERT]: USING None; CHECK (executed_by = auth.uid())

- Insert report logs [['authenticated'], INSERT]: USING None; CHECK (auth.uid() = executed_by)

#### `report_run_files`

Client ACL: [('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'), ('authenticated', 'INSERT'), ('authenticated', 'UPDATE'), ('authenticated', 'DELETE')]

- Insert files for own runs [['authenticated'], INSERT]: USING None; CHECK (EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_files.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)))))

#### `report_run_rows`

Client ACL: [('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'), ('authenticated', 'INSERT'), ('authenticated', 'UPDATE'), ('authenticated', 'DELETE')]

- Delete rows for own runs [['authenticated'], DELETE]: USING (EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_rows.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))))); CHECK None

- Insert rows for own runs [['authenticated'], INSERT]: USING None; CHECK (EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_rows.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)))))

#### `report_runtime_config`

Client ACL: [('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'), ('authenticated', 'INSERT'), ('authenticated', 'UPDATE'), ('authenticated', 'DELETE')]

- report_runtime_config admin write [['authenticated'], ALL]: USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)); CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))

#### `reports`

Client ACL: [('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'), ('authenticated', 'INSERT'), ('authenticated', 'UPDATE'), ('authenticated', 'DELETE')]

- Admins delete reports [['public'], DELETE]: USING (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)); CHECK None

- Internal users create reports [['public'], INSERT]: USING None; CHECK (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))

- Owners update reports [['authenticated'], UPDATE]: USING (is_super_admin(auth.uid()) OR (created_by = auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)); CHECK (is_super_admin(auth.uid()) OR (created_by = auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))

- external_users_denied_reports [['authenticated'], ALL]: USING (NOT has_external_role(auth.uid())); CHECK (NOT has_external_role(auth.uid()))

## Evidence limits and shared deployment gate

Catalogue snapshots are read-only point-in-time evidence, not successful exploitation or end-to-end verification. Edge source is inspectable, but deployed bundles/secrets/provider logs were not; SEC-07/14/19 source findings cannot certify deployed parity. No writable database function was invoked. No SQL affecting frozen objects is proposed. All DECISION REQUIRED sections intentionally withhold invented business-rule SQL; they are not implementation-complete fixes. The original all-table rollback is unsafe and superseded by the exact captured ACL-delta rollback for SEC-01.

For every eventual rollout: obtain object-owner/deployment approval, re-snapshot, test positive and negative roles/scopes in isolated staging, deploy trusted replacements before revokes, and keep the captured pre-change definitions and ACLs. No production mutation tests were run.
