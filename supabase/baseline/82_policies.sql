CREATE POLICY aia_insert ON public.ai_insight_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY aia_read ON public.ai_insight_actions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'view'::text) OR has_permission(auth.uid(), 'executive_oversight'::text, 'receive_ils'::text)));
CREATE POLICY ai_insights_feedback_update ON public.ai_insights AS PERMISSIVE FOR UPDATE TO authenticated USING (((module = 'prudential'::text) AND has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text))) WITH CHECK (((module = 'prudential'::text) AND has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text)));
CREATE POLICY ai_insights_feedback_update_supervisory ON public.ai_insights AS PERMISSIVE FOR UPDATE TO authenticated USING (can_view_advisory_ai(module, source_modules)) WITH CHECK (can_view_advisory_ai(module, source_modules));
CREATE POLICY ai_insights_insert ON public.ai_insights AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY ai_insights_insert_prudential ON public.ai_insights AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((module = 'prudential'::text) AND has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text)));
CREATE POLICY ai_insights_read ON public.ai_insights AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'view'::text) OR has_permission(auth.uid(), 'executive_oversight'::text, 'receive_ils'::text)));
CREATE POLICY ai_insights_read_prudential ON public.ai_insights AS PERMISSIVE FOR SELECT TO authenticated USING (((module = 'prudential'::text) AND has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text)));
CREATE POLICY ai_insights_read_supervisory ON public.ai_insights AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_advisory_ai(module, source_modules));
CREATE POLICY aml_assess_read ON public.aml_assessments AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'aml_supervision'::text, 'view'::text)));
CREATE POLICY aml_assess_write ON public.aml_assessments AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'aml_supervision'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'aml_supervision'::text, 'edit'::text)));
CREATE POLICY aml_find_read ON public.aml_findings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'aml_supervision'::text, 'view'::text)));
CREATE POLICY aml_find_write ON public.aml_findings AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'aml_supervision'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'aml_supervision'::text, 'edit'::text)));
CREATE POLICY "Staff view api key usage" ON public.api_key_usage AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "Staff manage api keys" ON public.api_keys AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY appeal_panel_scopes_manage ON public.appeal_panel_scopes AS PERMISSIVE FOR ALL TO authenticated USING (has_permission(auth.uid(), 'license_appeals'::text, 'manage_config'::text)) WITH CHECK (has_permission(auth.uid(), 'license_appeals'::text, 'manage_config'::text));
CREATE POLICY appeal_panel_scopes_select ON public.appeal_panel_scopes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY acknowledgements_no_client_insert ON public.application_acknowledgements AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY acknowledgements_no_delete ON public.application_acknowledgements AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY acknowledgements_no_update ON public.application_acknowledgements AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY acknowledgements_read ON public.application_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_application(auth.uid(), application_id));
CREATE POLICY application_ai_assessments_read ON public.application_ai_assessments AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_application(auth.uid(), application_id) AND (NOT has_external_role(auth.uid()))));
CREATE POLICY application_ai_assessments_write ON public.application_ai_assessments AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text)));
CREATE POLICY "application requirements readable" ON public.application_form_requirements AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'application_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = application_form_requirements.application_id) AND ((a.applicant_id = auth.uid()) OR wb_entity_member(a.entity_id)))))));
CREATE POLICY application_form_versions_read ON public.application_form_versions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_application(auth.uid(), application_id));
CREATE POLICY application_form_versions_write ON public.application_form_versions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'manage_config'::text)));
CREATE POLICY "fp links readable by licensing and applicant" ON public.application_fp_links AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'application_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = application_fp_links.application_id) AND ((a.applicant_id = auth.uid()) OR wb_entity_member(a.entity_id)))))));
CREATE POLICY "Legal reviewers insert legal notes" ON public.application_legal_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_legal_access(auth.uid()) AND (actor_id = auth.uid())));
CREATE POLICY "Legal reviewers read legal notes" ON public.application_legal_notes AS PERMISSIVE FOR SELECT TO authenticated USING ((has_legal_access(auth.uid()) OR (actor_id = auth.uid())));
CREATE POLICY "Service role manages legal notes" ON public.application_legal_notes AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY legal_notes_no_delete ON public.application_legal_notes AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY legal_notes_no_update ON public.application_legal_notes AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY legal_referrals_insert ON public.application_legal_referrals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((referred_by = auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text))));
CREATE POLICY legal_referrals_no_delete ON public.application_legal_referrals AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY legal_referrals_read ON public.application_legal_referrals AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_legal_access(auth.uid()) OR (referred_to = auth.uid()) OR (referred_by = auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text)));
CREATE POLICY legal_referrals_update ON public.application_legal_referrals AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_legal_access(auth.uid()) OR (referred_to = auth.uid()) OR (referred_by = auth.uid()))) WITH CHECK ((is_super_admin(auth.uid()) OR has_legal_access(auth.uid()) OR (referred_to = auth.uid()) OR (referred_by = auth.uid())));
CREATE POLICY "application requirement migration status readable" ON public.application_requirement_migration_status AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR has_permission(auth.uid(), 'form_management'::text, 'view'::text) OR has_permission(auth.uid(), 'regulatory_data_model'::text, 'view'::text)));
CREATE POLICY application_rfi_auto_rules_read ON public.application_rfi_auto_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((NOT has_external_role(auth.uid())));
CREATE POLICY application_rfi_auto_rules_write ON public.application_rfi_auto_rules AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'manage_config'::text)));
CREATE POLICY application_rfi_items_read ON public.application_rfi_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM application_rfis r
  WHERE ((r.id = application_rfi_items.rfi_id) AND can_read_application(auth.uid(), r.application_id)))));
CREATE POLICY application_rfi_items_write ON public.application_rfi_items AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text)));
CREATE POLICY application_rfi_responses_read ON public.application_rfi_responses AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (application_rfi_items it
     JOIN application_rfis r ON ((r.id = it.rfi_id)))
  WHERE ((it.id = application_rfi_responses.rfi_item_id) AND can_read_application(auth.uid(), r.application_id)))));
CREATE POLICY application_rfi_responses_write ON public.application_rfi_responses AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text) OR (EXISTS ( SELECT 1
   FROM (application_rfi_items it
     JOIN application_rfis r ON ((r.id = it.rfi_id)))
  WHERE ((it.id = application_rfi_responses.rfi_item_id) AND can_mutate_application(auth.uid(), r.application_id)))))) WITH CHECK (((submitted_by = auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text) OR (EXISTS ( SELECT 1
   FROM (application_rfi_items it
     JOIN application_rfis r ON ((r.id = it.rfi_id)))
  WHERE ((it.id = application_rfi_responses.rfi_item_id) AND can_mutate_application(auth.uid(), r.application_id)))))));
CREATE POLICY application_rfis_read ON public.application_rfis AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_application(auth.uid(), application_id));
CREATE POLICY application_rfis_write ON public.application_rfis AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'application_management'::text, 'workflow_action'::text)));
CREATE POLICY applications_delete ON public.applications AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'delete'::text)));
CREATE POLICY applications_insert ON public.applications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'create'::text) OR ((applicant_id = auth.uid()) AND ((NOT has_external_role(auth.uid())) OR has_role(auth.uid(), 'applicant'::app_role) OR has_role(auth.uid(), 'pre_licensee'::app_role) OR has_role(auth.uid(), 'licensee_primary'::app_role) OR has_role(auth.uid(), 'licensee_secondary'::app_role)))));
CREATE POLICY applications_read ON public.applications AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_application(auth.uid(), id));
CREATE POLICY applications_update ON public.applications AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_application(auth.uid(), id)) WITH CHECK (can_mutate_application(auth.uid(), id));
CREATE POLICY approval_action_notif_read ON public.approval_action_notifications AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY approval_action_notif_write ON public.approval_action_notifications AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY approval_actions_delete ON public.approval_actions AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY approval_actions_insert ON public.approval_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = actor_id) AND can_act_on_approval(auth.uid())));
CREATE POLICY approval_actions_read ON public.approval_actions AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = actor_id) OR can_read_approval_config(auth.uid()) OR can_act_on_approval(auth.uid())));
CREATE POLICY approval_actions_update ON public.approval_actions AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY approval_step_actions_read ON public.approval_step_actions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY approval_step_actions_write ON public.approval_step_actions AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY approval_step_entry_notif_read ON public.approval_step_entry_notifications AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY approval_step_entry_notif_write ON public.approval_step_entry_notifications AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY approval_steps_read ON public.approval_steps AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY approval_steps_write ON public.approval_steps AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY workflow_types_read ON public.approval_workflow_types AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY workflow_types_write ON public.approval_workflow_types AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY workflow_versions_read ON public.approval_workflow_versions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY workflow_versions_write ON public.approval_workflow_versions AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY workflow_config_read ON public.approval_workflows AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY workflow_config_write ON public.approval_workflows AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY "Export downloads visible to owner or audit admin" ON public.audit_export_downloads AS PERMISSIVE FOR SELECT TO authenticated USING (((downloaded_by = auth.uid()) OR can_view_lineage(auth.uid())));
CREATE POLICY "Staff manage audit export jobs" ON public.audit_export_jobs AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "Users log their own exports" ON public.audit_export_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((requested_by = auth.uid()));
CREATE POLICY "Users see their own exports" ON public.audit_export_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (((requested_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "Internal staff can read audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_internal_staff(auth.uid()));
CREATE POLICY "Admins or super_admins manage" ON public.business_calendar_holidays AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read holidays" ON public.business_calendar_holidays AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins or super_admins manage" ON public.business_calendar_process_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read calendar assignments" ON public.business_calendar_process_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins or super_admins manage" ON public.business_calendar_profiles AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read calendar profiles" ON public.business_calendar_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage captcha configurations" ON public.captcha_configurations AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "No client access to captcha secrets" ON public.captcha_secrets AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY captcha_verifications_service_only ON public.captcha_verifications AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins manage categories" ON public.categories AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read categories" ON public.categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read categories" ON public.categories AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Admins read certification seed manifest" ON public.certification_seed_manifest AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY classification_schemes_read ON public.classification_schemes AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY classification_values_read ON public.classification_values AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY ccr_insert ON public.complaint_closure_reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_complaint_perm(auth.uid(), 'edit'::text));
CREATE POLICY ccr_read ON public.complaint_closure_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (has_complaint_perm(auth.uid(), 'view'::text));
CREATE POLICY "Complainant reads own correspondence" ON public.complaint_correspondence AS PERMISSIVE FOR SELECT TO authenticated USING (((direction <> 'internal_note'::text) AND (EXISTS ( SELECT 1
   FROM complaints c
  WHERE ((c.id = complaint_correspondence.complaint_id) AND (c.complainant_id = auth.uid()))))));
CREATE POLICY "Internal manage complaint correspondence" ON public.complaint_correspondence AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'view'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text)));
CREATE POLICY dup_clusters_read ON public.complaint_duplicate_clusters AS PERMISSIVE FOR SELECT TO authenticated USING ((has_complaint_perm(auth.uid(), 'triage'::text) OR has_complaint_perm(auth.uid(), 'view_all'::text)));
CREATE POLICY dup_clusters_write ON public.complaint_duplicate_clusters AS PERMISSIVE FOR ALL TO authenticated USING (has_complaint_perm(auth.uid(), 'triage'::text)) WITH CHECK (has_complaint_perm(auth.uid(), 'triage'::text));
CREATE POLICY dup_pairs_read ON public.complaint_duplicate_pairs AS PERMISSIVE FOR SELECT TO authenticated USING ((has_complaint_perm(auth.uid(), 'triage'::text) OR has_complaint_perm(auth.uid(), 'view_all'::text)));
CREATE POLICY dup_pairs_write ON public.complaint_duplicate_pairs AS PERMISSIVE FOR ALL TO authenticated USING (has_complaint_perm(auth.uid(), 'triage'::text)) WITH CHECK (has_complaint_perm(auth.uid(), 'triage'::text));
CREATE POLICY dup_rules_read ON public.complaint_duplicate_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((has_complaint_perm(auth.uid(), 'triage'::text) OR has_complaint_perm(auth.uid(), 'view_all'::text)));
CREATE POLICY dup_rules_write ON public.complaint_duplicate_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_complaint_perm(auth.uid(), 'triage'::text)) WITH CHECK (has_complaint_perm(auth.uid(), 'triage'::text));
CREATE POLICY "admins manage scoring config" ON public.complaint_duplicate_scoring_config AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "auth read scoring config" ON public.complaint_duplicate_scoring_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY esc_cases_read ON public.complaint_escalation_cases AS PERMISSIVE FOR SELECT TO authenticated USING ((has_complaint_perm(auth.uid(), 'triage'::text) OR has_complaint_perm(auth.uid(), 'view_all'::text) OR has_complaint_perm(auth.uid(), 'escalate'::text)));
CREATE POLICY esc_cases_write ON public.complaint_escalation_cases AS PERMISSIVE FOR ALL TO authenticated USING (has_complaint_perm(auth.uid(), 'escalate'::text)) WITH CHECK (has_complaint_perm(auth.uid(), 'escalate'::text));
CREATE POLICY esc_log_read ON public.complaint_escalation_log AS PERMISSIVE FOR SELECT TO authenticated USING ((has_complaint_perm(auth.uid(), 'triage'::text) OR has_complaint_perm(auth.uid(), 'view_all'::text)));
CREATE POLICY esc_rules_read ON public.complaint_escalation_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((has_complaint_perm(auth.uid(), 'triage'::text) OR has_complaint_perm(auth.uid(), 'view_all'::text)));
CREATE POLICY esc_rules_write ON public.complaint_escalation_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_complaint_perm(auth.uid(), 'escalate'::text)) WITH CHECK (has_complaint_perm(auth.uid(), 'escalate'::text));
CREATE POLICY "Complainant insert own complaint evidence" ON public.complaint_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM complaints c
  WHERE ((c.id = complaint_evidence.complaint_id) AND (c.complainant_id = auth.uid()))))));
CREATE POLICY "Complainant read own complaint evidence" ON public.complaint_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM complaints c
  WHERE ((c.id = complaint_evidence.complaint_id) AND (c.complainant_id = auth.uid())))));
CREATE POLICY "Internal manage complaint evidence" ON public.complaint_evidence AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'view'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text)));
CREATE POLICY cib_read ON public.complaint_import_batches AS PERMISSIVE FOR SELECT TO authenticated USING (has_complaint_perm(auth.uid(), 'view'::text));
CREATE POLICY cib_update ON public.complaint_import_batches AS PERMISSIVE FOR UPDATE TO authenticated USING (has_complaint_perm(auth.uid(), 'edit'::text));
CREATE POLICY cib_write ON public.complaint_import_batches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_complaint_perm(auth.uid(), 'edit'::text));
CREATE POLICY cir_read ON public.complaint_import_rows AS PERMISSIVE FOR SELECT TO authenticated USING (has_complaint_perm(auth.uid(), 'view'::text));
CREATE POLICY cir_write ON public.complaint_import_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_complaint_perm(auth.uid(), 'edit'::text));
CREATE POLICY intake_rules_admin_write ON public.complaint_intake_rules AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY intake_rules_read_all ON public.complaint_intake_rules AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Internal manage complaint tasks" ON public.complaint_investigation_tasks AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'view'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'edit'::text)));
CREATE POLICY "Entity read own complaint rfi items" ON public.complaint_rfi_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_complaint_rfi_entity_user(rfi_id));
CREATE POLICY "Internal read complaint rfi items" ON public.complaint_rfi_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM complaint_rfis r
  WHERE ((r.id = complaint_rfi_items.rfi_id) AND (is_super_admin(auth.uid()) OR has_complaint_perm(auth.uid(), 'view'::text)) AND ((r.approval_state = 'dispatched'::text) OR (r.raised_by = auth.uid()) OR (r.approver_id = auth.uid()) OR can_approve_complaint_rfi(auth.uid()))))));
CREATE POLICY "Entity read own complaint rfi responses" ON public.complaint_rfi_responses AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM complaint_rfi_items i
  WHERE ((i.id = complaint_rfi_responses.rfi_item_id) AND is_complaint_rfi_entity_user(i.rfi_id)))));
CREATE POLICY "Internal read submitted complaint rfi responses" ON public.complaint_rfi_responses AS PERMISSIVE FOR SELECT TO authenticated USING (((is_draft = false) AND (is_super_admin(auth.uid()) OR has_complaint_perm(auth.uid(), 'view'::text))));
CREATE POLICY "Internal read complaint rfi settings" ON public.complaint_rfi_settings AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff(auth.uid()));
CREATE POLICY "Entity read own complaint rfis" ON public.complaint_rfis AS PERMISSIVE FOR SELECT TO authenticated USING (((approval_state = 'dispatched'::text) AND can_current_user_access_licensee(licensee_id, NULL::uuid)));
CREATE POLICY "Internal read complaint rfis" ON public.complaint_rfis AS PERMISSIVE FOR SELECT TO authenticated USING (((is_super_admin(auth.uid()) OR has_complaint_perm(auth.uid(), 'view'::text)) AND ((approval_state = 'dispatched'::text) OR (raised_by = auth.uid()) OR (approver_id = auth.uid()) OR can_approve_complaint_rfi(auth.uid()))));
CREATE POLICY "Admins manage status catalogue" ON public.complaint_status_catalogue AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read status catalogue" ON public.complaint_status_catalogue AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "admins read deadletter" ON public.complaint_storage_cleanup_deadletter AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins manage complaint types" ON public.complaint_types AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads complaint types" ON public.complaint_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert complaints" ON public.complaints AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = complainant_id));
CREATE POLICY "Internal can insert complaints" ON public.complaints AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text)));
CREATE POLICY "Read complaints" ON public.complaints AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR (auth.uid() = complainant_id) OR ((internal_created_by IS NOT NULL) AND (internal_created_by = auth.uid())) OR ((investigator_id IS NULL) AND is_internal_staff(auth.uid()) AND has_permission(auth.uid(), 'complaint_management'::text, 'assign'::text)) OR has_scoped_permission(auth.uid(), 'complaint_management'::text, 'view'::text, id, license_holder_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = complaints.license_holder_id)), complainant_id)));
CREATE POLICY "Update complaints" ON public.complaints AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((is_super_admin(auth.uid()) OR (auth.uid() = investigator_id) OR has_scoped_permission(auth.uid(), 'complaint_management'::text, 'edit'::text, id, license_holder_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = complaints.license_holder_id)), complainant_id)));
CREATE POLICY external_complaints_insert_capability_gate ON public.complaints AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((is_internal_staff(auth.uid()) OR (NOT has_external_role(auth.uid())) OR external_can_access_complaint_values(auth.uid(), complainant_id, license_holder_id, 'can_submit_complaints'::text)));
CREATE POLICY external_complaints_select_capability_gate ON public.complaints AS RESTRICTIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) OR (NOT has_external_role(auth.uid())) OR (complainant_id = auth.uid()) OR external_can_access_complaint(auth.uid(), id, 'can_view_status'::text) OR external_can_access_complaint(auth.uid(), id, 'can_submit_complaints'::text)));
CREATE POLICY external_complaints_update_capability_gate ON public.complaints AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY compliance_audit_logs_read ON public.compliance_audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'compliance_management'::text, 'view_audit_logs'::text) OR has_permission(auth.uid(), 'compliance_management'::text, 'view_all_entities'::text))));
CREATE POLICY compliance_returns_delete ON public.compliance_returns AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'compliance_management'::text, 'delete'::text)));
CREATE POLICY compliance_returns_insert ON public.compliance_returns AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((submitter_id = auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'compliance_management'::text, 'create'::text) OR ((on_behalf_of_licensee_id IS NOT NULL) AND (on_behalf_of_licensee_id IN ( SELECT ppoc_mapped_licensee_ids(auth.uid()) AS ppoc_mapped_licensee_ids)) AND ((license_id IS NULL) OR (license_id IN ( SELECT ppoc_accessible_license_ids(auth.uid()) AS ppoc_accessible_license_ids)))) OR (has_external_role(auth.uid()) AND external_can_access_compliance_return_values(auth.uid(), license_id, on_behalf_of_licensee_id, submitter_id, 'can_submit_returns'::text)))));
CREATE POLICY compliance_returns_read ON public.compliance_returns AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_compliance_return(auth.uid(), id));
CREATE POLICY compliance_returns_update ON public.compliance_returns AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_compliance_return(auth.uid(), id)) WITH CHECK ((can_mutate_compliance_return(auth.uid(), id) AND ((NOT has_external_role(auth.uid())) OR external_can_access_compliance_return_values(auth.uid(), license_id, on_behalf_of_licensee_id, submitter_id, 'can_submit_returns'::text))));
CREATE POLICY "Manage conduct actions" ON public.conduct_actions AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'issue_enforcement_action'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'issue_enforcement_action'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text)));
CREATE POLICY "Read conduct actions" ON public.conduct_actions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY "Manage alert thresholds" ON public.conduct_alert_thresholds AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Read alert thresholds" ON public.conduct_alert_thresholds AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY conduct_cfg_read ON public.conduct_alert_thresholds AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY conduct_cfg_write ON public.conduct_alert_thresholds AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text)));
CREATE POLICY "Manage conduct alerts" ON public.conduct_alerts AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'conduct_alerts'::text, 'edit'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid) OR has_scoped_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text, NULL::uuid, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid))) WITH CHECK ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'conduct_alerts'::text, 'edit'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid) OR has_scoped_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text, NULL::uuid, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid)));
CREATE POLICY "Read conduct alerts" ON public.conduct_alerts AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'conduct_alerts'::text, 'view'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid) OR has_scoped_permission(auth.uid(), 'market_conduct'::text, 'view'::text, NULL::uuid, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_alerts.licensee_id)), NULL::uuid)));
CREATE POLICY conduct_cfg_read ON public.conduct_channels AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'view'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text)));
CREATE POLICY conduct_cfg_write ON public.conduct_channels AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text)));
CREATE POLICY "conduct closure breaches manageable" ON public.conduct_closure_breaches AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_investigation_closures c
  WHERE ((c.id = conduct_closure_breaches.closure_id) AND can_manage_conduct_investigation(c.investigation_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM conduct_investigation_closures c
  WHERE ((c.id = conduct_closure_breaches.closure_id) AND can_manage_conduct_investigation(c.investigation_id)))));
CREATE POLICY "conduct closure breaches readable" ON public.conduct_closure_breaches AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_investigation_closures c
  WHERE ((c.id = conduct_closure_breaches.closure_id) AND can_view_conduct_investigation(c.investigation_id)))));
CREATE POLICY ce_read ON public.conduct_evidence AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct_investigation'::text, 'view'::text) OR has_permission(auth.uid(), 'market_conduct_investigation'::text, 'manage_evidence_repository'::text)));
CREATE POLICY ce_write ON public.conduct_evidence AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct_investigation'::text, 'manage_evidence_repository'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct_investigation'::text, 'manage_evidence_repository'::text)));
CREATE POLICY ceal_ins ON public.conduct_evidence_access_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((actor_id = auth.uid()));
CREATE POLICY ceal_read ON public.conduct_evidence_access_log AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY conduct_findings_internal_read ON public.conduct_findings AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'market_conduct'::text, 'view'::text));
CREATE POLICY "cirr entity read" ON public.conduct_intelligence_report_recipients AS PERMISSIVE FOR SELECT TO authenticated USING (can_current_user_access_licensee(licensee_id));
CREATE POLICY "cirr internal read" ON public.conduct_intelligence_report_recipients AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_intelligence());
CREATE POLICY "cirr write" ON public.conduct_intelligence_report_recipients AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_intelligence()) WITH CHECK (can_manage_conduct_intelligence());
CREATE POLICY "cirv entity read published" ON public.conduct_intelligence_report_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (conduct_intelligence_reports rep
     JOIN conduct_intelligence_report_recipients r ON ((r.report_id = rep.id)))
  WHERE ((rep.id = conduct_intelligence_report_versions.report_id) AND (rep.status = 'published'::text) AND (rep.current_version = conduct_intelligence_report_versions.version) AND can_current_user_access_licensee(r.licensee_id)))));
CREATE POLICY "cirv internal read" ON public.conduct_intelligence_report_versions AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_intelligence());
CREATE POLICY "cirv write" ON public.conduct_intelligence_report_versions AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_intelligence()) WITH CHECK (can_manage_conduct_intelligence());
CREATE POLICY "cir entity read published" ON public.conduct_intelligence_reports AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM conduct_intelligence_report_recipients r
  WHERE ((r.report_id = conduct_intelligence_reports.id) AND can_current_user_access_licensee(r.licensee_id))))));
CREATE POLICY "cir internal read" ON public.conduct_intelligence_reports AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_intelligence());
CREATE POLICY "cir write" ON public.conduct_intelligence_reports AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_intelligence()) WITH CHECK (can_manage_conduct_intelligence());
CREATE POLICY "cit read" ON public.conduct_intelligence_templates AS PERMISSIVE FOR SELECT TO authenticated USING ((can_view_conduct_intelligence() OR is_active));
CREATE POLICY "cit write" ON public.conduct_intelligence_templates AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_intelligence()) WITH CHECK (can_manage_conduct_intelligence());
CREATE POLICY cintva_read ON public.conduct_interview_attachments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_interviews i
  WHERE ((i.id = conduct_interview_attachments.interview_id) AND can_view_conduct_investigation(i.investigation_id)))));
CREATE POLICY cintva_write ON public.conduct_interview_attachments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_interviews i
  WHERE ((i.id = conduct_interview_attachments.interview_id) AND can_manage_conduct_investigation(i.investigation_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM conduct_interviews i
  WHERE ((i.id = conduct_interview_attachments.interview_id) AND can_manage_conduct_investigation(i.investigation_id)))));
CREATE POLICY cintvp_read ON public.conduct_interview_participants AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_interviews i
  WHERE ((i.id = conduct_interview_participants.interview_id) AND can_view_conduct_investigation(i.investigation_id)))));
CREATE POLICY cintvp_write ON public.conduct_interview_participants AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_interviews i
  WHERE ((i.id = conduct_interview_participants.interview_id) AND can_manage_conduct_investigation(i.investigation_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM conduct_interviews i
  WHERE ((i.id = conduct_interview_participants.interview_id) AND can_manage_conduct_investigation(i.investigation_id)))));
CREATE POLICY cintv_read ON public.conduct_interviews AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_investigation(investigation_id));
CREATE POLICY cintv_write ON public.conduct_interviews AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_investigation(investigation_id)) WITH CHECK (can_manage_conduct_investigation(investigation_id));
CREATE POLICY "conduct closures manageable" ON public.conduct_investigation_closures AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_investigation(investigation_id)) WITH CHECK (can_manage_conduct_investigation(investigation_id));
CREATE POLICY "conduct closures readable" ON public.conduct_investigation_closures AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_investigation(investigation_id));
CREATE POLICY ci_read ON public.conduct_investigations AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'conduct_investigations'::text, 'view'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_investigations.licensee_id)), NULL::uuid) OR has_scoped_permission(auth.uid(), 'market_conduct_investigation'::text, 'view'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_investigations.licensee_id)), NULL::uuid) OR has_scoped_permission(auth.uid(), 'market_conduct_investigation'::text, 'access_investigation_workspace'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_investigations.licensee_id)), NULL::uuid)));
CREATE POLICY ci_write ON public.conduct_investigations AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'market_conduct_investigation'::text, 'access_investigation_workspace'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_investigations.licensee_id)), NULL::uuid))) WITH CHECK ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'market_conduct_investigation'::text, 'access_investigation_workspace'::text, id, licensee_id, ( SELECT l.sector_id
   FROM licensees l
  WHERE (l.id = conduct_investigations.licensee_id)), NULL::uuid)));
CREATE POLICY "Read cmres" ON public.conduct_monitoring_results AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text)));
CREATE POLICY "Write cmres" ON public.conduct_monitoring_results AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text)));
CREATE POLICY "conduct monitoring reviews manageable" ON public.conduct_monitoring_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_post_closure_monitoring m
  WHERE ((m.id = conduct_monitoring_reviews.monitoring_id) AND can_manage_conduct_investigation(m.investigation_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM conduct_post_closure_monitoring m
  WHERE ((m.id = conduct_monitoring_reviews.monitoring_id) AND can_manage_conduct_investigation(m.investigation_id)))));
CREATE POLICY "conduct monitoring reviews readable" ON public.conduct_monitoring_reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM conduct_post_closure_monitoring m
  WHERE ((m.id = conduct_monitoring_reviews.monitoring_id) AND can_view_conduct_investigation(m.investigation_id)))));
CREATE POLICY cmrr_read ON public.conduct_monitoring_rule_runs AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY cmrr_write ON public.conduct_monitoring_rule_runs AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text)));
CREATE POLICY "Read conduct rule versions" ON public.conduct_monitoring_rule_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY "Read cmr" ON public.conduct_monitoring_rules AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY "Write cmr" ON public.conduct_monitoring_rules AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text)));
CREATE POLICY "conduct pcm manageable" ON public.conduct_post_closure_monitoring AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_investigation(investigation_id)) WITH CHECK (can_manage_conduct_investigation(investigation_id));
CREATE POLICY "conduct pcm readable" ON public.conduct_post_closure_monitoring AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_investigation(investigation_id));
CREATE POLICY conduct_cfg_read ON public.conduct_products AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'view'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text)));
CREATE POLICY conduct_cfg_write ON public.conduct_products AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text)));
CREATE POLICY conduct_cfg_read ON public.conduct_risk_categories AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'view'::text) OR has_permission(auth.uid(), 'complaint_management'::text, 'create'::text)));
CREATE POLICY conduct_cfg_write ON public.conduct_risk_categories AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text)));
CREATE POLICY "Owners delete own conduct saved views" ON public.conduct_saved_views AS PERMISSIVE FOR DELETE TO authenticated USING (((owner_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Owners insert own conduct saved views" ON public.conduct_saved_views AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Owners read own conduct saved views" ON public.conduct_saved_views AS PERMISSIVE FOR SELECT TO authenticated USING (((owner_id = auth.uid()) OR is_shared OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Owners update own conduct saved views" ON public.conduct_saved_views AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((owner_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Read conduct signal events" ON public.conduct_signal_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY "Add conduct signal evidence" ON public.conduct_signal_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((added_by = auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'run_conduct_analytics'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_complaints'::text))));
CREATE POLICY "Read conduct signal evidence" ON public.conduct_signal_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY "csa internal read" ON public.conduct_supervision_annotations AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_conduct_intelligence());
CREATE POLICY "csa manage" ON public.conduct_supervision_annotations AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_conduct_intelligence()) WITH CHECK (can_manage_conduct_intelligence());
CREATE POLICY "Staff read triage audit" ON public.conduct_triage_audit_events AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY conduct_cfg_read ON public.conduct_triage_rules AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text)));
CREATE POLICY conduct_cfg_write ON public.conduct_triage_rules AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'manage_monitoring_rules'::text)));
CREATE POLICY "Internal can create coordination cases" ON public.coordination_cases AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_user_id));
CREATE POLICY "Owner can delete coordination case" ON public.coordination_cases AS PERMISSIVE FOR DELETE TO authenticated USING (((owner_user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Owner can update coordination case" ON public.coordination_cases AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Participants can view coordination cases" ON public.coordination_cases AS PERMISSIVE FOR SELECT TO authenticated USING ((is_coordination_participant(id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Admin deletes escalations" ON public.coordination_escalations AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Participants raise escalations" ON public.coordination_escalations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((raised_by = auth.uid()) AND (is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Participants read escalations" ON public.coordination_escalations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Raiser assignee owner or admin update" ON public.coordination_escalations AS PERMISSIVE FOR UPDATE TO authenticated USING (((raised_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM coordination_cases c
  WHERE ((c.id = coordination_escalations.case_id) AND (c.owner_user_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Creator or owner can delete flag" ON public.coordination_flags AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM coordination_cases c
  WHERE ((c.id = coordination_flags.case_id) AND (c.owner_user_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Participants can create flags" ON public.coordination_flags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND is_coordination_participant(case_id, auth.uid())));
CREATE POLICY "Participants can update flags" ON public.coordination_flags AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Participants can view flags" ON public.coordination_flags AS PERMISSIVE FOR SELECT TO authenticated USING ((is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Author can delete own message" ON public.coordination_messages AS PERMISSIVE FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Participants can post messages" ON public.coordination_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND is_coordination_participant(case_id, auth.uid())));
CREATE POLICY "Participants can read messages" ON public.coordination_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Owner can add participants" ON public.coordination_participants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM coordination_cases c
  WHERE ((c.id = coordination_participants.case_id) AND (c.owner_user_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Owner can remove participants" ON public.coordination_participants AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM coordination_cases c
  WHERE ((c.id = coordination_participants.case_id) AND (c.owner_user_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Participants can view participant list" ON public.coordination_participants AS PERMISSIVE FOR SELECT TO authenticated USING ((is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Self or owner can update clearance" ON public.coordination_participants AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM coordination_cases c
  WHERE ((c.id = coordination_participants.case_id) AND (c.owner_user_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY corr_attachments_insert ON public.correspondence_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (correspondence_thread_visible(thread_id, auth.uid()));
CREATE POLICY corr_attachments_read ON public.correspondence_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (correspondence_thread_visible(thread_id, auth.uid()));
CREATE POLICY "Recipients read their own dispatches" ON public.correspondence_dispatches AS PERMISSIVE FOR SELECT TO authenticated USING ((recipient_user_id = auth.uid()));
CREATE POLICY "Staff read dispatches" ON public.correspondence_dispatches AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff(auth.uid()));
CREATE POLICY corr_events_read ON public.correspondence_events AS PERMISSIVE FOR SELECT TO authenticated USING ((correspondence_thread_visible(thread_id, auth.uid()) AND ((visible_to_licensee = true) OR is_internal_staff(auth.uid()))));
CREATE POLICY corr_messages_insert ON public.correspondence_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((correspondence_thread_visible(thread_id, auth.uid()) AND ((is_internal_note = false) OR is_internal_staff(auth.uid()))));
CREATE POLICY corr_messages_read ON public.correspondence_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((correspondence_thread_visible(thread_id, auth.uid()) AND ((is_internal_note = false) OR is_internal_staff(auth.uid()))));
CREATE POLICY corr_rules_manage ON public.correspondence_routing_rules AS PERMISSIVE FOR ALL TO authenticated USING ((is_internal_staff(auth.uid()) AND has_permission(auth.uid(), 'settings'::text, 'edit'::text))) WITH CHECK ((is_internal_staff(auth.uid()) AND has_permission(auth.uid(), 'settings'::text, 'edit'::text)));
CREATE POLICY corr_rules_read ON public.correspondence_routing_rules AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff(auth.uid()));
CREATE POLICY "Internal staff manage correspondence templates" ON public.correspondence_templates AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY corr_participants_read ON public.correspondence_thread_participants AS PERMISSIVE FOR SELECT TO PUBLIC USING ((correspondence_thread_visible(thread_id, auth.uid()) AND (is_internal_staff(auth.uid()) OR (COALESCE(is_internal, false) = false))));
CREATE POLICY corr_participants_update ON public.correspondence_thread_participants AS PERMISSIVE FOR UPDATE TO authenticated USING (correspondence_thread_visible(thread_id, auth.uid())) WITH CHECK (correspondence_thread_visible(thread_id, auth.uid()));
CREATE POLICY corr_participants_write ON public.correspondence_thread_participants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (correspondence_thread_visible(thread_id, auth.uid()));
CREATE POLICY corr_threads_insert ON public.correspondence_threads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_internal_staff(auth.uid()) OR ((licensee_id IS NOT NULL) AND (licensee_id = user_licensee_id(auth.uid())))));
CREATE POLICY corr_threads_read ON public.correspondence_threads AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_internal_staff(auth.uid()) OR ((is_entity_facing = true) AND (((licensee_id IS NOT NULL) AND (licensee_id = user_licensee_id(auth.uid()))) OR (created_by = auth.uid())))));
CREATE POLICY corr_threads_staff_write ON public.correspondence_threads AS PERMISSIVE FOR UPDATE TO authenticated USING (is_internal_staff(auth.uid())) WITH CHECK (is_internal_staff(auth.uid()));
CREATE POLICY "Admins manage countries" ON public.countries AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Auth read countries" ON public.countries AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read countries" ON public.countries AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "rdm config readable by permitted staff" ON public.data_concepts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'regulatory_data_model'::text, 'view'::text) OR has_permission(auth.uid(), 'form_management'::text, 'view'::text)));
CREATE POLICY data_domains_read ON public.data_domains AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY decision_artifacts_internal_read ON public.decision_artifacts AS PERMISSIVE FOR SELECT TO authenticated USING ((NOT has_external_role(auth.uid())));
CREATE POLICY decision_artifacts_no_client_insert ON public.decision_artifacts AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY decision_artifacts_no_delete ON public.decision_artifacts AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY decision_artifacts_no_update ON public.decision_artifacts AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY "Admins manage decision options" ON public.decision_options AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Internal read decision options" ON public.decision_options AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rationale templates" ON public.decision_rationale_templates AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Internal read rationale templates" ON public.decision_rationale_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_staff_insert_invitations ON public.declaration_invitations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY fp_staff_read_invitations ON public.declaration_invitations AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY fp_staff_update_invitations ON public.declaration_invitations AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY delegation_rules_read ON public.delegation_rules AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY delegation_rules_write ON public.delegation_rules AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
CREATE POLICY doc_action_logs_insert_self ON public.document_action_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((actor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM document_groups g
  WHERE ((g.id = document_action_logs.group_id) AND ((g.owner_id = auth.uid()) OR is_doc_staff(auth.uid())))))));
CREATE POLICY doc_action_logs_select_via_group ON public.document_action_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM document_groups g
  WHERE ((g.id = document_action_logs.group_id) AND ((g.owner_id = auth.uid()) OR is_doc_staff(auth.uid()))))));
CREATE POLICY "Internal staff read document extractions" ON public.document_extractions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Users can insert their own extraction requests" ON public.document_extractions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((requested_by = auth.uid()) OR (requested_by IS NULL)));
CREATE POLICY "Users can update their own extraction requests" ON public.document_extractions AS PERMISSIVE FOR UPDATE TO authenticated USING ((requested_by = auth.uid()));
CREATE POLICY "Users read own document extractions" ON public.document_extractions AS PERMISSIVE FOR SELECT TO authenticated USING ((requested_by = auth.uid()));
CREATE POLICY doc_groups_delete_own_or_staff ON public.document_groups AS PERMISSIVE FOR DELETE TO authenticated USING (((owner_id = auth.uid()) OR is_doc_staff(auth.uid())));
CREATE POLICY doc_groups_insert_own ON public.document_groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY doc_groups_select_own_or_staff ON public.document_groups AS PERMISSIVE FOR SELECT TO authenticated USING (((owner_id = auth.uid()) OR is_doc_staff(auth.uid())));
CREATE POLICY doc_groups_update_own_or_staff ON public.document_groups AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR is_doc_staff(auth.uid()))) WITH CHECK (((owner_id = auth.uid()) OR is_doc_staff(auth.uid())));
CREATE POLICY doc_versions_insert_via_group ON public.document_versions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM document_groups g
  WHERE ((g.id = document_versions.group_id) AND ((g.owner_id = auth.uid()) OR is_doc_staff(auth.uid())))))));
CREATE POLICY doc_versions_select_via_group ON public.document_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM document_groups g
  WHERE ((g.id = document_versions.group_id) AND ((g.owner_id = auth.uid()) OR is_doc_staff(auth.uid()))))));
CREATE POLICY doc_versions_update_via_group ON public.document_versions AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM document_groups g
  WHERE ((g.id = document_versions.group_id) AND ((g.owner_id = auth.uid()) OR is_doc_staff(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM document_groups g
  WHERE ((g.id = document_versions.group_id) AND ((g.owner_id = auth.uid()) OR is_doc_staff(auth.uid()))))));
CREATE POLICY "Read documents" ON public.documents AS PERMISSIVE FOR SELECT TO PUBLIC USING (((auth.uid() = uploaded_by) OR is_internal_staff(auth.uid())));
CREATE POLICY "Upload documents" ON public.documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = uploaded_by));
CREATE POLICY external_documents_insert_capability_gate ON public.documents AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((NOT has_external_role(auth.uid())) OR ((uploaded_by = auth.uid()) AND external_can_upload_document_ref(auth.uid(), entity_type, entity_id))));
CREATE POLICY external_documents_select_capability_gate ON public.documents AS RESTRICTIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_document_ref(auth.uid(), entity_type, entity_id, 'can_view_status'::text) OR external_can_access_document_ref(auth.uid(), entity_type, entity_id, 'can_submit_returns'::text) OR external_can_access_document_ref(auth.uid(), entity_type, entity_id, 'can_submit_complaints'::text)));
CREATE POLICY ea_delete ON public.enforcement_actions AS PERMISSIVE FOR DELETE TO authenticated USING (can_act_on_enforcement(auth.uid(), 'delete'::text));
CREATE POLICY ea_insert ON public.enforcement_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_act_on_enforcement(auth.uid(), 'create'::text) AND ((opened_by IS NULL) OR (opened_by = auth.uid()))));
CREATE POLICY ea_select ON public.enforcement_actions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_enforcement(auth.uid(), entity_id));
CREATE POLICY ea_update ON public.enforcement_actions AS PERMISSIVE FOR UPDATE TO authenticated USING ((can_act_on_enforcement(auth.uid(), 'edit'::text) OR can_act_on_enforcement(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_enforcement(auth.uid(), 'edit'::text) OR can_act_on_enforcement(auth.uid(), 'workflow_action'::text)));
CREATE POLICY enf_appeal_read ON public.enforcement_appeals AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM enforcement_actions ea
  WHERE ((ea.id = enforcement_appeals.case_id) AND can_read_enforcement(auth.uid(), ea.entity_id)))));
CREATE POLICY ece_delete ON public.enforcement_case_events AS PERMISSIVE FOR DELETE TO authenticated USING (can_act_on_enforcement(auth.uid(), 'delete'::text));
CREATE POLICY ece_insert ON public.enforcement_case_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_act_on_enforcement(auth.uid(), 'workflow_action'::text) AND ((actor_id IS NULL) OR (actor_id = auth.uid()))));
CREATE POLICY ece_select ON public.enforcement_case_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM enforcement_actions ea
  WHERE ((ea.id = enforcement_case_events.case_id) AND can_read_enforcement(auth.uid(), ea.entity_id)))));
CREATE POLICY ece_update ON public.enforcement_case_events AS PERMISSIVE FOR UPDATE TO authenticated USING (can_act_on_enforcement(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_enforcement(auth.uid(), 'edit'::text));
CREATE POLICY encc_read ON public.enforcement_case_number_counters AS PERMISSIVE FOR SELECT TO authenticated USING (can_act_on_enforcement(auth.uid(), 'view'::text));
CREATE POLICY ece_insert ON public.enforcement_compliance_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_act_on_enforcement(auth.uid(), 'edit'::text));
CREATE POLICY ece_read ON public.enforcement_compliance_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM enforcement_actions ea
  WHERE ((ea.id = enforcement_compliance_evidence.case_id) AND can_read_enforcement(auth.uid(), ea.entity_id)))));
CREATE POLICY ece_update ON public.enforcement_compliance_evidence AS PERMISSIVE FOR UPDATE TO authenticated USING (can_act_on_enforcement(auth.uid(), 'edit'::text));
CREATE POLICY eo_insert ON public.enforcement_obligations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_act_on_enforcement(auth.uid(), 'edit'::text));
CREATE POLICY eo_read ON public.enforcement_obligations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM enforcement_actions ea
  WHERE ((ea.id = enforcement_obligations.case_id) AND can_read_enforcement(auth.uid(), ea.entity_id)))));
CREATE POLICY eo_update ON public.enforcement_obligations AS PERMISSIVE FOR UPDATE TO authenticated USING (can_act_on_enforcement(auth.uid(), 'edit'::text));
CREATE POLICY enf_pay_read ON public.enforcement_penalty_payments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM enforcement_actions ea
  WHERE ((ea.id = enforcement_penalty_payments.case_id) AND can_read_enforcement(auth.uid(), ea.entity_id)))));
CREATE POLICY enf_rep_read ON public.enforcement_representations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM enforcement_actions ea
  WHERE ((ea.id = enforcement_representations.case_id) AND can_read_enforcement(auth.uid(), ea.entity_id)))));
CREATE POLICY ews_read ON public.enforcement_workflow_stages AS PERMISSIVE FOR SELECT TO authenticated USING ((can_act_on_enforcement(auth.uid(), 'view'::text) OR can_read_enforcement(auth.uid(), NULL::uuid)));
CREATE POLICY ewt_read ON public.enforcement_workflow_transitions AS PERMISSIVE FOR SELECT TO authenticated USING ((can_act_on_enforcement(auth.uid(), 'view'::text) OR can_read_enforcement(auth.uid(), NULL::uuid)));
CREATE POLICY engine_rule_action_results_read ON public.engine_rule_action_results AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rule_alerts_read ON public.engine_rule_alerts AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rule_alerts_update ON public.engine_rule_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING (can_view_rule_engine()) WITH CHECK (can_view_rule_engine());
CREATE POLICY engine_rule_executions_read ON public.engine_rule_executions AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY "rule lifecycle events readable by rule engine viewers" ON public.engine_rule_lifecycle_events AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine(auth.uid()));
CREATE POLICY engine_rule_suppressions_read ON public.engine_rule_suppressions AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rule_tasks_read ON public.engine_rule_tasks AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rule_tasks_update ON public.engine_rule_tasks AS PERMISSIVE FOR UPDATE TO authenticated USING (can_view_rule_engine()) WITH CHECK (can_view_rule_engine());
CREATE POLICY engine_rule_tests_read ON public.engine_rule_tests AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rule_tests_write ON public.engine_rule_tests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_rule_engine());
CREATE POLICY engine_rule_versions_read ON public.engine_rule_versions AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rule_versions_write ON public.engine_rule_versions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_rule_engine());
CREATE POLICY engine_rules_read ON public.engine_rules AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine());
CREATE POLICY engine_rules_write ON public.engine_rules AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_rule_engine()) WITH CHECK (can_manage_rule_engine());
CREATE POLICY "appointments readable" ON public.entity_appointments AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'view'::text) OR wb_entity_member(entity_id)));
CREATE POLICY "change items readable" ON public.entity_change_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM entity_change_sets cs
  WHERE ((cs.id = entity_change_items.change_set_id) AND (has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR wb_entity_member(cs.entity_id))))));
CREATE POLICY "change sets readable" ON public.entity_change_sets AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR wb_entity_member(entity_id)));
CREATE POLICY entity_data_authority_rules_read ON public.entity_data_authority_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) AND rdm_can_read()));
CREATE POLICY entity_external_references_read ON public.entity_external_references AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), entity_id));
CREATE POLICY "entity facts readable" ON public.entity_facts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR has_permission(auth.uid(), 'licensee_management'::text, 'view'::text) OR wb_entity_member(entity_id)));
CREATE POLICY entity_identifier_types_read ON public.entity_identifier_types AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY entity_identifiers_read ON public.entity_identifiers AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), entity_id));
CREATE POLICY eire_audit_read ON public.entity_identity_resolution_events AS PERMISSIVE FOR SELECT TO authenticated USING (onboarding_can_view_audit(auth.uid()));
CREATE POLICY entity_identity_snapshots_read ON public.entity_identity_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), entity_id));
CREATE POLICY entity_identity_statuses_read ON public.entity_identity_statuses AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY entity_licenses_read ON public.entity_licenses AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), entity_id));
CREATE POLICY emc_read ON public.entity_match_candidates AS PERMISSIVE FOR SELECT TO authenticated USING (sec_has_permission(auth.uid(), 'entity_resolution'::text, 'view'::text));
CREATE POLICY emrp_read ON public.entity_membership_role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY emr_read ON public.entity_membership_roles AS PERMISSIVE FOR SELECT TO authenticated, anon USING (is_active);
CREATE POLICY em_read ON public.entity_merges AS PERMISSIVE FOR SELECT TO authenticated USING (sec_has_permission(auth.uid(), 'entity_resolution'::text, 'view'::text));
CREATE POLICY entity_registry_bindings_read ON public.entity_registry_bindings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) AND rdm_can_read()));
CREATE POLICY entity_registry_failure_policies_read ON public.entity_registry_failure_policies AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY entity_registry_sync_states_read ON public.entity_registry_sync_states AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff(auth.uid()));
CREATE POLICY "Admins manage entity relationships" ON public.entity_relationships AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read entity relationships" ON public.entity_relationships AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ero_read ON public.entity_reporting_obligations AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_entity_returns(auth.uid(), entity_id));
CREATE POLICY erc_read ON public.entity_resolution_cases AS PERMISSIVE FOR SELECT TO authenticated USING (sec_has_permission(auth.uid(), 'entity_resolution'::text, 'view'::text));
CREATE POLICY ere_read ON public.entity_resolution_events AS PERMISSIVE FOR SELECT TO authenticated USING (sec_has_permission(auth.uid(), 'entity_resolution'::text, 'view'::text));
CREATE POLICY entity_resolution_policies_read ON public.entity_resolution_policies AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY "Internal can read risk scores" ON public.entity_risk_scores AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Internal can write risk scores" ON public.entity_risk_scores AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY esa_read ON public.entity_supervision_assignments AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text) OR has_permission(auth.uid(), 'licensee_management'::text, 'view'::text)));
CREATE POLICY esa_write ON public.entity_supervision_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text)));
CREATE POLICY entity_sync_conflicts_read ON public.entity_sync_conflicts AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff(auth.uid()));
CREATE POLICY eua_admin_write ON public.entity_user_access AS PERMISSIVE FOR ALL TO PUBLIC USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY eua_select ON public.entity_user_access AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR (user_id = auth.uid()) OR (entity_id IN ( SELECT profiles.licensee_id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.licensee_id IS NOT NULL))))));
CREATE POLICY eum_manage ON public.entity_user_memberships AS PERMISSIVE FOR ALL TO authenticated USING (sec_has_permission(auth.uid(), 'entity_membership'::text, 'manage'::text)) WITH CHECK (sec_has_permission(auth.uid(), 'entity_membership'::text, 'manage'::text));
CREATE POLICY eum_read_own_or_internal ON public.entity_user_memberships AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR sec_has_permission(auth.uid(), 'entity_membership'::text, 'view'::text)));
CREATE POLICY esc_notif_events_read ON public.escalation_notification_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM escalations e
  WHERE (e.id = escalation_notification_events.escalation_id))));
CREATE POLICY esc_owner_events_read ON public.escalation_ownership_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM escalations e
  WHERE (e.id = escalation_ownership_events.escalation_id))));
CREATE POLICY escalation_rules_read ON public.escalation_rules AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff(auth.uid()));
CREATE POLICY escalation_rules_write ON public.escalation_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_permission(auth.uid(), 'escalation_management'::text, 'configure'::text)) WITH CHECK (has_permission(auth.uid(), 'escalation_management'::text, 'configure'::text));
CREATE POLICY esc_tier_events_read ON public.escalation_tier_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM escalations e
  WHERE (e.id = escalation_tier_events.escalation_id))));
CREATE POLICY escalations_no_direct_write ON public.escalations AS PERMISSIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY escalations_read ON public.escalations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) AND (has_permission(auth.uid(), 'escalation_management'::text, 'view'::text) OR (assigned_user_id = auth.uid()) OR (created_by = auth.uid()) OR has_module_access_for_escalation(auth.uid(), source_module))));
CREATE POLICY exam_dr_read ON public.examination_data_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_data_requests.examination_id) AND (can_read_examination(auth.uid(), e.entity_id) OR ((examination_data_requests.status <> 'draft'::text) AND can_current_user_access_licensee(e.entity_id)))))));
CREATE POLICY exam_dr_write ON public.examination_data_requests AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY exam_events_read ON public.examination_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_events.examination_id) AND can_read_examination(auth.uid(), e.entity_id)))));
CREATE POLICY exam_exit_read ON public.examination_exit_meetings AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_exit_meetings.examination_id) AND can_read_examination(auth.uid(), e.entity_id)))));
CREATE POLICY exam_exit_write ON public.examination_exit_meetings AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY exam_findings_read ON public.examination_findings AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_findings.examination_id) AND can_read_examination(auth.uid(), e.entity_id)))));
CREATE POLICY exam_findings_write ON public.examination_findings AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY exam_reports_read ON public.examination_reports AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_reports.examination_id) AND (can_read_examination(auth.uid(), e.entity_id) OR ((examination_reports.issued_at IS NOT NULL) AND can_current_user_access_licensee(e.entity_id)))))));
CREATE POLICY exam_reports_write ON public.examination_reports AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY examination_scoping_read ON public.examination_scoping AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_scoping.examination_id) AND can_read_examination(auth.uid(), e.entity_id)))));
CREATE POLICY examination_scoping_write ON public.examination_scoping AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY exam_team_read ON public.examination_team_members AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_team_members.examination_id) AND can_read_examination(auth.uid(), e.entity_id)))));
CREATE POLICY exam_team_write ON public.examination_team_members AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY exam_wp_read ON public.examination_workpapers AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM examinations e
  WHERE ((e.id = examination_workpapers.examination_id) AND can_read_examination(auth.uid(), e.entity_id)))));
CREATE POLICY exam_wp_write ON public.examination_workpapers AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY examinations_delete ON public.examinations AS PERMISSIVE FOR DELETE TO authenticated USING (can_act_on_examination(auth.uid(), 'delete'::text));
CREATE POLICY examinations_insert ON public.examinations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_act_on_examination(auth.uid(), 'create'::text));
CREATE POLICY examinations_read ON public.examinations AS PERMISSIVE FOR SELECT TO PUBLIC USING ((can_read_examination(auth.uid(), entity_id) OR (has_external_role(auth.uid()) AND can_current_user_access_licensee(entity_id) AND examination_has_issued_report(id))));
CREATE POLICY examinations_update ON public.examinations AS PERMISSIVE FOR UPDATE TO authenticated USING ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_examination(auth.uid(), 'edit'::text) OR can_act_on_examination(auth.uid(), 'workflow_action'::text)));
CREATE POLICY "Admins manage fee components" ON public.fee_components AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Applicants delete own fee components" ON public.fee_components AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = fee_components.application_id) AND (a.applicant_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Applicants insert own fee components" ON public.fee_components AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = fee_components.application_id) AND (a.applicant_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Applicants read own fee components" ON public.fee_components AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = fee_components.application_id) AND (a.applicant_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY "Applicants update own fee components" ON public.fee_components AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = fee_components.application_id) AND (a.applicant_id = auth.uid())))) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins manage fees" ON public.fee_configurations AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone can read fees" ON public.fee_configurations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage fee rules" ON public.fee_rules AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads fee rules" ON public.fee_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage fee types" ON public.fee_types AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read fee types" ON public.fee_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage field conditions" ON public.field_conditions AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads field conditions" ON public.field_conditions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins delete uploads" ON public.file_uploads AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR (uploaded_by = auth.uid())));
CREATE POLICY "Admins update uploads" ON public.file_uploads AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR (uploaded_by = auth.uid())));
CREATE POLICY "Allow anon registration file_uploads insert" ON public.file_uploads AS PERMISSIVE FOR INSERT TO anon WITH CHECK ((entity_type = ANY (ARRAY['registration'::text, 'form_field'::text, 'document_version'::text])));
CREATE POLICY "Users insert uploads" ON public.file_uploads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = uploaded_by));
CREATE POLICY "Users read own uploads" ON public.file_uploads AS PERMISSIVE FOR SELECT TO PUBLIC USING (((uploaded_by = auth.uid()) OR is_internal_staff(auth.uid())));
CREATE POLICY external_file_uploads_select_capability_gate ON public.file_uploads AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_document_ref(auth.uid(), entity_type, safe_uuid(entity_id), 'can_view_status'::text) OR external_can_access_document_ref(auth.uid(), entity_type, safe_uuid(entity_id), 'can_submit_returns'::text) OR external_can_access_document_ref(auth.uid(), entity_type, safe_uuid(entity_id), 'can_submit_complaints'::text) OR ((lower(COALESCE(entity_type, ''::text)) = ANY (ARRAY['rfi_response'::text, 'application_rfi_response'::text, 'rfi'::text, 'application_rfi'::text])) AND external_can_upload_document_ref(auth.uid(), entity_type, safe_uuid(entity_id)))));
CREATE POLICY fgm_read ON public.financial_group_members AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), group_id));
CREATE POLICY fgm_write ON public.financial_group_members AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY fg_delete ON public.financial_groups AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY fg_insert ON public.financial_groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY fg_read ON public.financial_groups AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), id));
CREATE POLICY fg_update ON public.financial_groups AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY "form applicability readable" ON public.form_applicability_rules AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'form_management'::text, 'view'::text));
CREATE POLICY "form domains readable" ON public.form_data_domains AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'form_management'::text, 'view'::text));
CREATE POLICY "form field definitions readable" ON public.form_field_definitions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'form_management'::text, 'view'::text) OR has_permission(auth.uid(), 'regulatory_data_model'::text, 'view'::text)));
CREATE POLICY "Admins manage field dependencies" ON public.form_field_dependencies AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads field dependencies" ON public.form_field_dependencies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage form fields" ON public.form_fields AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads form fields" ON public.form_fields AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "form lifecycle readable" ON public.form_lifecycle_applicability AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'form_management'::text, 'view'::text));
CREATE POLICY "form package items readable" ON public.form_package_items AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'form_management'::text, 'view'::text));
CREATE POLICY "form packages readable" ON public.form_packages AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'form_management'::text, 'view'::text));
CREATE POLICY form_purposes_read ON public.form_purposes AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY "Admins read all responses" ON public.form_responses AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role)));
CREATE POLICY "Internal staff read license_action form responses" ON public.form_responses AS PERMISSIVE FOR SELECT TO authenticated USING (((entity_type = 'license_action'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role))));
CREATE POLICY "Users manage own responses" ON public.form_responses AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "submission values readable by staff" ON public.form_submission_values AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'form_management'::text, 'view'::text) OR has_permission(auth.uid(), 'application_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM form_responses r
  WHERE ((r.id = form_submission_values.response_id) AND (r.user_id = auth.uid()))))));
CREATE POLICY "Applicants can read published application templates" ON public.form_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'published'::text) AND (form_type = ANY (ARRAY['pre_license'::text, 'application'::text, 'post_license'::text, 'registration'::text]))));
CREATE POLICY "Manage form templates" ON public.form_templates AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'form_management'::text, 'edit'::text, NULL::uuid, sector_id, created_by))) WITH CHECK ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'form_management'::text, 'edit'::text, NULL::uuid, sector_id, created_by)));
CREATE POLICY "Read form templates" ON public.form_templates AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_scoped_permission(auth.uid(), 'form_management'::text, 'view'::text, NULL::uuid, sector_id, created_by)));
CREATE POLICY form_trigger_types_read ON public.form_trigger_types AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY "Admins manage form versions" ON public.form_versions AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads form versions" ON public.form_versions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage forms" ON public.forms AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read forms" ON public.forms AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_appeals_read ON public.fp_appeals AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY fp_appeals_write ON public.fp_appeals AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY fp_assessments_delete ON public.fp_assessments AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'delete'::text)));
CREATE POLICY fp_assessments_insert ON public.fp_assessments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND can_act_on_fp(auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'view_all_entities'::text) OR user_has_entity_assignment(auth.uid(), licensee_id))));
CREATE POLICY fp_assessments_read ON public.fp_assessments AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_fp_assessment(auth.uid(), id) OR can_read_fp_individual(auth.uid(), individual_id)));
CREATE POLICY fp_assessments_update ON public.fp_assessments AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY fp_snapshots_read ON public.fp_committee_decision_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'fit_and_proper'::text, 'view'::text) AND fp_regulator_visible(regulator_id)));
CREATE POLICY fp_committee_members_read ON public.fp_committee_members AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_committee_members_write ON public.fp_committee_members AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_fp_config(auth.uid())) WITH CHECK (can_manage_fp_config(auth.uid()));
CREATE POLICY fp_committee_votes_insert ON public.fp_committee_votes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM fp_committee_members m
  WHERE ((m.id = fp_committee_votes.member_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.committee_id = fp_committee_votes.committee_id)))));
CREATE POLICY fp_committee_votes_read ON public.fp_committee_votes AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'view_all_entities'::text) OR (EXISTS ( SELECT 1
   FROM fp_committee_members m
  WHERE ((m.committee_id = fp_committee_votes.committee_id) AND (m.user_id = auth.uid()))))));
CREATE POLICY fp_committee_votes_update ON public.fp_committee_votes AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM fp_committee_members m
  WHERE ((m.id = fp_committee_votes.member_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM fp_committee_members m
  WHERE ((m.id = fp_committee_votes.member_id) AND (m.user_id = auth.uid())))));
CREATE POLICY fp_committees_read ON public.fp_committees AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_committees_write ON public.fp_committees AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_fp_config(auth.uid())) WITH CHECK (can_manage_fp_config(auth.uid()));
CREATE POLICY fp_condition_events_read ON public.fp_condition_events AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'fit_and_proper'::text, 'view'::text) AND fp_regulator_visible(regulator_id)));
CREATE POLICY fp_condition_evidence_read ON public.fp_condition_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((fp_regulator_visible(regulator_id) AND (((individual_id IS NULL) AND has_permission(auth.uid(), 'fit_and_proper'::text, 'view'::text)) OR can_read_fp_individual(auth.uid(), individual_id))));
CREATE POLICY fp_condition_evidence_review ON public.fp_condition_evidence AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) AND fp_regulator_visible(regulator_id) AND ((individual_id IS NULL) OR can_read_fp_individual(auth.uid(), individual_id)))) WITH CHECK ((has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) AND fp_regulator_visible(regulator_id) AND ((individual_id IS NULL) OR can_read_fp_individual(auth.uid(), individual_id))));
CREATE POLICY fp_condition_evidence_write ON public.fp_condition_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) AND fp_regulator_visible(regulator_id) AND ((individual_id IS NULL) OR can_read_fp_individual(auth.uid(), individual_id))));
CREATE POLICY fp_conditions_read ON public.fp_conditions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY fp_conditions_write ON public.fp_conditions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY fp_determinations_read ON public.fp_determinations AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_fp_individual(auth.uid(), individual_id) OR can_read_fp_assessment(auth.uid(), assessment_id)));
CREATE POLICY fp_determinations_write ON public.fp_determinations AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY fp_findings_read ON public.fp_findings AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_fp_individual(auth.uid(), individual_id) OR can_read_fp_assessment(auth.uid(), assessment_id)));
CREATE POLICY fp_findings_write ON public.fp_findings AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY "fp person links readable" ON public.fp_individual_party_links AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'fit_and_proper'::text, 'view'::text) OR has_permission(auth.uid(), 'entity_structure'::text, 'view'::text)));
CREATE POLICY fp_individual_roles_delete ON public.fp_individual_roles AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'delete'::text)));
CREATE POLICY fp_individual_roles_insert ON public.fp_individual_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND can_act_on_fp(auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'view_all_entities'::text) OR user_has_entity_assignment(auth.uid(), licensee_id))));
CREATE POLICY fp_individual_roles_read ON public.fp_individual_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_fp_licensee(auth.uid(), licensee_id) OR can_read_fp_individual(auth.uid(), individual_id)));
CREATE POLICY fp_individual_roles_update ON public.fp_individual_roles AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text)));
CREATE POLICY fp_individuals_delete ON public.fp_individuals AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'delete'::text)));
CREATE POLICY fp_individuals_insert ON public.fp_individuals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (can_act_on_fp(auth.uid()) OR (user_id = auth.uid()))));
CREATE POLICY fp_individuals_read ON public.fp_individuals AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_fp_individual(auth.uid(), id));
CREATE POLICY fp_individuals_update ON public.fp_individuals AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text) OR (user_id = auth.uid()))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text) OR (user_id = auth.uid())));
CREATE POLICY fp_manual_screening_tasks_read ON public.fp_manual_screening_tasks AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_fp_individual(auth.uid(), individual_id) OR can_read_fp_assessment(auth.uid(), assessment_id) OR (assigned_to = auth.uid())));
CREATE POLICY fp_manual_screening_tasks_write ON public.fp_manual_screening_tasks AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text) OR (assigned_to = auth.uid()))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text) OR (assigned_to = auth.uid())));
CREATE POLICY fp_monitoring_events_read ON public.fp_monitoring_events AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY fp_monitoring_events_write ON public.fp_monitoring_events AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY fp_screening_configs_read ON public.fp_screening_configs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_screening_configs_write ON public.fp_screening_configs AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_fp_config(auth.uid())) WITH CHECK (can_manage_fp_config(auth.uid()));
CREATE POLICY fp_screening_execution_rules_read ON public.fp_screening_execution_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_screening_execution_rules_write ON public.fp_screening_execution_rules AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_fp_config(auth.uid())) WITH CHECK (can_manage_fp_config(auth.uid()));
CREATE POLICY fp_screening_runs_read ON public.fp_screening_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_fp_individual(auth.uid(), individual_id) OR can_read_fp_assessment(auth.uid(), assessment_id)));
CREATE POLICY fp_screening_runs_write ON public.fp_screening_runs AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'workflow_action'::text)));
CREATE POLICY fp_sector_decision_rules_read ON public.fp_sector_decision_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_sector_decision_rules_write ON public.fp_sector_decision_rules AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_fp_config(auth.uid())) WITH CHECK (can_manage_fp_config(auth.uid()));
CREATE POLICY fp_task_evidence_read ON public.fp_task_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM fp_manual_screening_tasks t
  WHERE ((t.id = fp_task_evidence.task_id) AND (can_read_fp_individual(auth.uid(), t.individual_id) OR (t.assigned_to = auth.uid()))))));
CREATE POLICY fp_task_evidence_write ON public.fp_task_evidence AS PERMISSIVE FOR ALL TO authenticated USING (((uploaded_by = auth.uid()) OR is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text))) WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM fp_manual_screening_tasks t
  WHERE ((t.id = fp_task_evidence.task_id) AND ((t.assigned_to = auth.uid()) OR has_permission(auth.uid(), 'fit_and_proper'::text, 'edit'::text) OR is_super_admin(auth.uid())))))));
CREATE POLICY fp_training_attestations_insert ON public.fp_training_attestations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY fp_training_attestations_read ON public.fp_training_attestations AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_super_admin(auth.uid()) OR is_fp_staff(auth.uid())));
CREATE POLICY gcs_read ON public.group_consolidated_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), group_id));
CREATE POLICY gcs_write ON public.group_consolidated_snapshots AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY gcm_read ON public.group_consolidation_methods AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), group_id));
CREATE POLICY gcm_write ON public.group_consolidation_methods AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY gea_delete ON public.group_ewi_alerts AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY gea_insert ON public.group_ewi_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY gea_read ON public.group_ewi_alerts AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), group_id));
CREATE POLICY gea_update ON public.group_ewi_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY ger_read ON public.group_ewi_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ger_write ON public.group_ewi_rules AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY grs_read ON public.group_risk_scores AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), group_id));
CREATE POLICY grs_write ON public.group_risk_scores AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY inf_delete ON public.inspection_findings AS PERMISSIVE FOR DELETE TO authenticated USING (can_act_on_inspection(auth.uid(), 'delete'::text));
CREATE POLICY inf_insert ON public.inspection_findings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_act_on_inspection(auth.uid(), 'create'::text) AND ((created_by IS NULL) OR (created_by = auth.uid()))));
CREATE POLICY inf_select ON public.inspection_findings AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM inspections i
  WHERE ((i.id = inspection_findings.inspection_id) AND can_read_inspection(auth.uid(), i.entity_id)))));
CREATE POLICY inf_update ON public.inspection_findings AS PERMISSIVE FOR UPDATE TO authenticated USING ((can_act_on_inspection(auth.uid(), 'edit'::text) OR can_act_on_inspection(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_inspection(auth.uid(), 'edit'::text) OR can_act_on_inspection(auth.uid(), 'workflow_action'::text)));
CREATE POLICY ins_delete ON public.inspections AS PERMISSIVE FOR DELETE TO authenticated USING (can_act_on_inspection(auth.uid(), 'delete'::text));
CREATE POLICY ins_insert ON public.inspections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_act_on_inspection(auth.uid(), 'create'::text));
CREATE POLICY ins_select ON public.inspections AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_inspection(auth.uid(), entity_id));
CREATE POLICY ins_update ON public.inspections AS PERMISSIVE FOR UPDATE TO authenticated USING ((can_act_on_inspection(auth.uid(), 'edit'::text) OR can_act_on_inspection(auth.uid(), 'workflow_action'::text))) WITH CHECK ((can_act_on_inspection(auth.uid(), 'edit'::text) OR can_act_on_inspection(auth.uid(), 'workflow_action'::text)));
CREATE POLICY integration_alert_rules_read ON public.integration_alert_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'view'::text)));
CREATE POLICY integration_alert_rules_write ON public.integration_alert_rules AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'edit'::text)));
CREATE POLICY integration_connections_read ON public.integration_connections AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'view'::text)));
CREATE POLICY integration_connections_write ON public.integration_connections AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'edit'::text)));
CREATE POLICY integration_credentials_service ON public.integration_credentials AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Staff with settings view can read dead letter" ON public.integration_dead_letter AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'view'::text)));
CREATE POLICY "Staff with integration view can read fallback events" ON public.integration_fallback_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'view'::text)));
CREATE POLICY "integration_logs admin read" ON public.integration_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Staff with settings view can read retry queue" ON public.integration_retry_queue AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'settings'::text, 'view'::text)));
CREATE POLICY ige_read ON public.intragroup_exposures AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_financial_group(auth.uid(), group_id));
CREATE POLICY ige_write ON public.intragroup_exposures AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_financial_group(auth.uid())) WITH CHECK (can_manage_financial_group(auth.uid()));
CREATE POLICY "Admins insert queue" ON public.job_queue AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins read queue" ON public.job_queue AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Service role manages queue" ON public.job_queue AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins manage penalty tiers" ON public.late_fee_penalty_tiers AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Auth read penalty tiers" ON public.late_fee_penalty_tiers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage late fees" ON public.late_fee_structures AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Auth read late fees" ON public.late_fee_structures AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY license_action_form_configs_read ON public.license_action_form_configs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY license_action_form_configs_write ON public.license_action_form_configs AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'manage_config'::text)));
CREATE POLICY license_actions_insert ON public.license_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((actor_id = auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'workflow_action'::text) OR has_permission(auth.uid(), 'license_management'::text, 'manage_license_actions'::text))));
CREATE POLICY license_actions_read ON public.license_actions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license(auth.uid(), license_id));
CREATE POLICY appeal_events_insert ON public.license_appeal_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_read_license_appeal(auth.uid(), appeal_id));
CREATE POLICY appeal_events_select ON public.license_appeal_events AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license_appeal(auth.uid(), appeal_id));
CREATE POLICY appeal_panel_members_manage ON public.license_appeal_panel_members AS PERMISSIVE FOR ALL TO authenticated USING (has_permission(auth.uid(), 'license_appeals'::text, 'manage_config'::text)) WITH CHECK (has_permission(auth.uid(), 'license_appeals'::text, 'manage_config'::text));
CREATE POLICY appeal_panel_members_select ON public.license_appeal_panel_members AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'license_appeals'::text, 'view'::text));
CREATE POLICY appeal_panel_snapshots_select ON public.license_appeal_panel_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license_appeal(auth.uid(), appeal_id));
CREATE POLICY appeal_panels_manage ON public.license_appeal_panels AS PERMISSIVE FOR ALL TO authenticated USING (has_permission(auth.uid(), 'license_appeals'::text, 'manage_config'::text)) WITH CHECK (has_permission(auth.uid(), 'license_appeals'::text, 'manage_config'::text));
CREATE POLICY appeal_panels_select ON public.license_appeal_panels AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'license_appeals'::text, 'view'::text));
CREATE POLICY appeals_insert ON public.license_appeals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((filed_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = license_appeals.application_id) AND (a.applicant_id = auth.uid())))) OR has_permission(auth.uid(), 'license_appeals'::text, 'create'::text))));
CREATE POLICY appeals_select ON public.license_appeals AS PERMISSIVE FOR SELECT TO authenticated USING (((filed_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = license_appeals.application_id) AND (a.applicant_id = auth.uid())))) OR has_permission(auth.uid(), 'license_appeals'::text, 'view'::text)));
CREATE POLICY appeals_select_panel_member ON public.license_appeals AS PERMISSIVE FOR SELECT TO authenticated USING (is_appeal_panel_member(auth.uid(), id));
CREATE POLICY appeals_update_internal ON public.license_appeals AS PERMISSIVE FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'license_appeals'::text, 'edit'::text)) WITH CHECK (has_permission(auth.uid(), 'license_appeals'::text, 'edit'::text));
CREATE POLICY appeals_update_owner_withdraw ON public.license_appeals AS PERMISSIVE FOR UPDATE TO authenticated USING (((filed_by = auth.uid()) AND (status = ANY (ARRAY['submitted'::text, 'under_review'::text])))) WITH CHECK (((filed_by = auth.uid()) AND (status = ANY (ARRAY['submitted'::text, 'withdrawn'::text, 'under_review'::text]))));
CREATE POLICY license_certificate_signatures_read ON public.license_certificate_signatures AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license(auth.uid(), license_id));
CREATE POLICY license_certificates_read ON public.license_certificates AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license(auth.uid(), license_id));
CREATE POLICY license_certificates_write ON public.license_certificates AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'manage_certificates'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'manage_certificates'::text)));
CREATE POLICY lce_read ON public.license_condition_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licenses l
  WHERE ((l.id = license_condition_evidence.license_id) AND (l.holder_id = auth.uid()))))));
CREATE POLICY license_conditions_read ON public.license_conditions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license(auth.uid(), license_id));
CREATE POLICY license_conditions_write ON public.license_conditions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'manage_conditions'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'manage_conditions'::text)));
CREATE POLICY "internal read license_decision_appeals" ON public.license_decision_appeals AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY ldec_read ON public.license_decisions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licenses l
  WHERE ((l.id = license_decisions.license_id) AND (l.holder_id = auth.uid()))))));
CREATE POLICY lesr_read ON public.license_expiry_sweep_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text)));
CREATE POLICY "internal read license_fee_assessments" ON public.license_fee_assessments AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "internal read license_fee_bindings" ON public.license_fee_bindings AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "fee process settings readable by internal staff" ON public.license_fee_process_settings AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY llc_admin_write ON public.license_lifecycle_configs AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY llc_read ON public.license_lifecycle_configs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY llm_read ON public.license_lifecycle_matters AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licenses l
  WHERE ((l.id = license_lifecycle_matters.license_id) AND (l.holder_id = auth.uid()))))));
CREATE POLICY lmn_read ON public.license_matter_notices AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licenses l
  WHERE ((l.id = license_matter_notices.license_id) AND (l.holder_id = auth.uid()))))));
CREATE POLICY lmr_read ON public.license_matter_representations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licenses l
  WHERE ((l.id = license_matter_representations.license_id) AND (l.holder_id = auth.uid()))))));
CREATE POLICY license_renewals_insert ON public.license_renewals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((initiated_by = auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'workflow_action'::text) OR (EXISTS ( SELECT 1
   FROM ((licenses l
     JOIN licensees lic ON ((lic.license_id = l.id)))
     JOIN entity_user_access eua ON ((eua.entity_id = lic.id)))
  WHERE ((l.id = license_renewals.license_id) AND (eua.user_id = auth.uid()) AND (eua.is_active = true)))))));
CREATE POLICY license_renewals_read ON public.license_renewals AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_license(auth.uid(), license_id) OR (initiated_by = auth.uid())));
CREATE POLICY license_renewals_update ON public.license_renewals AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'workflow_action'::text)));
CREATE POLICY license_terms_read ON public.license_terms AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licenses l
  WHERE ((l.id = license_terms.license_id) AND (l.holder_id = auth.uid()))))));
CREATE POLICY "internal read license_variation_items" ON public.license_variation_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "internal read license_variations" ON public.license_variations AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "internal read license_verification_cases" ON public.license_verification_cases AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "internal read license_verification_items" ON public.license_verification_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "internal read license_verification_templates" ON public.license_verification_templates AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY licensee_channels_read ON public.licensee_channels AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), licensee_id));
CREATE POLICY licensee_channels_write ON public.licensee_channels AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_products_channels'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_products_channels'::text)));
CREATE POLICY licensee_products_read ON public.licensee_products AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), licensee_id));
CREATE POLICY licensee_products_write ON public.licensee_products AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_products_channels'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_products_channels'::text)));
CREATE POLICY licensees_delete ON public.licensees AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'delete'::text)));
CREATE POLICY licensees_insert ON public.licensees AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'create'::text)));
CREATE POLICY licensees_read ON public.licensees AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_licensee(auth.uid(), id));
CREATE POLICY licensees_update ON public.licensees AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_licensee(auth.uid(), id)) WITH CHECK (can_mutate_licensee(auth.uid(), id));
CREATE POLICY licenses_delete ON public.licenses AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'delete'::text)));
CREATE POLICY licenses_insert ON public.licenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'license_management'::text, 'create'::text)));
CREATE POLICY licenses_read ON public.licenses AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_license(auth.uid(), id));
CREATE POLICY licenses_update ON public.licenses AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_license(auth.uid(), id)) WITH CHECK (can_mutate_license(auth.uid(), id));
CREATE POLICY "Internal staff read audit determinations" ON public.licensing_audit_determinations AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Licensing staff update audit determinations" ON public.licensing_audit_determinations AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY "Licensing staff write audit determinations" ON public.licensing_audit_determinations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((issued_by = auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role))));
CREATE POLICY "Internal staff read audit risk profiles" ON public.licensing_audit_risk_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Licensing staff write audit risk profiles" ON public.licensing_audit_risk_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((generated_by = auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role))));
CREATE POLICY lifecycle_stages_read ON public.lifecycle_stages AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY "Admins manage master data items" ON public.master_data_items AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Auth read master data items" ON public.master_data_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read master data items" ON public.master_data_items AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Admins manage master data types" ON public.master_data_types AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Auth read master data types" ON public.master_data_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read master data types" ON public.master_data_types AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY mcr_read ON public.metric_calculation_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR is_internal_staff(auth.uid())));
CREATE POLICY "Rule engine viewers read module test history" ON public.module_rule_tests AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_rule_engine(auth.uid()));
CREATE POLICY "Users read own digest items" ON public.notification_digest_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM notification_digest_runs r
  WHERE ((r.id = notification_digest_items.run_id) AND (r.user_id = auth.uid())))));
CREATE POLICY "Users view own digest log" ON public.notification_digest_log AS PERMISSIVE FOR SELECT TO PUBLIC USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users read own digest runs" ON public.notification_digest_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Admins update dispatch log" ON public.notification_dispatch_log AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Delivery history readable with permission" ON public.notification_dispatch_log AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'notification_management'::text, 'view_delivery_history'::text)));
CREATE POLICY "Staff can read event channel templates" ON public.notification_event_channel_templates AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'notification_management'::text, 'view'::text));
CREATE POLICY "Admins manage notification event configs" ON public.notification_event_configs AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins read notification event configs" ON public.notification_event_configs AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY neq_governed_read ON public.notification_event_queue AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'notification_management'::text, 'view'::text) OR has_permission(auth.uid(), 'compliance_management'::text, 'view_audit_logs'::text))));
CREATE POLICY outbox_admin_read ON public.notification_outbox AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Users manage own notification prefs" ON public.notification_preferences AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Staff can read template versions" ON public.notification_template_versions AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'notification_management'::text, 'view'::text));
CREATE POLICY "Admins manage notification templates" ON public.notification_templates AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read notification templates" ON public.notification_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins read event preferences" ON public.notification_user_event_preferences AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users manage own event preferences" ON public.notification_user_event_preferences AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Internal staff insert notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "Users read own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY oar_internal_read ON public.onboarding_alert_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) OR is_super_admin(auth.uid())));
CREATE POLICY oas_audit_read ON public.onboarding_alert_signals AS PERMISSIVE FOR SELECT TO authenticated USING (onboarding_can_view_audit(auth.uid()));
CREATE POLICY ojs_owner_read ON public.onboarding_journey_state AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_super_admin(auth.uid()) OR is_internal_staff(auth.uid())));
CREATE POLICY ort_owner_read ON public.onboarding_resolution_tokens AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_super_admin(auth.uid())));
CREATE POLICY orp_internal_read ON public.onboarding_retention_policies AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) OR is_super_admin(auth.uid())));
CREATE POLICY osm_elevated_read ON public.onboarding_security_metadata AS PERMISSIVE FOR SELECT TO authenticated USING (onboarding_can_view_security_audit(auth.uid()));
CREATE POLICY "organization names readable" ON public.organization_names AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR has_permission(auth.uid(), 'licensee_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM licensees l
  WHERE ((l.party_id = organization_names.party_id) AND wb_entity_member(l.id))))));
CREATE POLICY organizations_read ON public.organizations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'view_all_entities'::text) OR (EXISTS ( SELECT 1
   FROM licensees e
  WHERE ((e.party_id = organizations.party_id) AND can_read_licensee(auth.uid(), e.id))))));
CREATE POLICY "Public insert OTP" ON public.otp_verifications AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Service role manages OTP" ON public.otp_verifications AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own OTP records" ON public.otp_verifications AS PERMISSIVE FOR SELECT TO authenticated USING ((user_email = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text));
CREATE POLICY "ownership readable" ON public.ownership_interests AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR wb_entity_member(owned_entity_id)));
CREATE POLICY "ownership types readable" ON public.ownership_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY parties_read ON public.parties AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'view_all_entities'::text) OR (EXISTS ( SELECT 1
   FROM licensees e
  WHERE ((e.party_id = parties.id) AND can_read_licensee(auth.uid(), e.id))))));
CREATE POLICY "party identity via appointment context" ON public.parties AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM entity_appointments a
  WHERE ((a.person_party_id = parties.id) AND wb_entity_member(a.entity_id)))) OR (EXISTS ( SELECT 1
   FROM ownership_interests o
  WHERE ((o.owner_party_id = parties.id) AND wb_entity_member(o.owned_entity_id))))));
CREATE POLICY "party relationships readable" ON public.party_relationships AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR ((entity_id IS NOT NULL) AND wb_entity_member(entity_id))));
CREATE POLICY "Users can delete own payment attachments" ON public.payment_attachments AS PERMISSIVE FOR DELETE TO authenticated USING ((uploaded_by = auth.uid()));
CREATE POLICY "Users can upload payment attachments" ON public.payment_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));
CREATE POLICY "Users can view own payment attachments" ON public.payment_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (((uploaded_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY external_payment_attachments_capability_gate ON public.payment_attachments AS RESTRICTIVE FOR ALL TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_payment(auth.uid(), payment_id, 'can_view_status'::text) OR external_can_access_payment(auth.uid(), payment_id, 'can_submit'::text))) WITH CHECK (((NOT has_external_role(auth.uid())) OR ((uploaded_by = auth.uid()) AND (external_can_access_payment(auth.uid(), payment_id, 'can_submit'::text) OR external_can_access_payment(auth.uid(), payment_id, 'can_view_status'::text)))));
CREATE POLICY pay_cfg_read ON public.payment_oversight_config AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY pay_cfg_write ON public.payment_oversight_config AS PERMISSIVE FOR ALL TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY poe_read ON public.payment_oversight_events AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY "Admins manage receipts" ON public.payment_receipts AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users read own receipts" ON public.payment_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = payment_receipts.payment_id) AND (p.user_id = auth.uid())))));
CREATE POLICY external_payment_receipts_capability_gate ON public.payment_receipts AS RESTRICTIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_payment(auth.uid(), payment_id, 'can_view_status'::text) OR external_can_access_payment(auth.uid(), payment_id, 'can_submit'::text)));
CREATE POLICY "Authenticated can view payment remarks" ON public.payment_remarks AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM payments p
  WHERE (p.id = payment_remarks.payment_id))));
CREATE POLICY "Author or admin can delete remarks" ON public.payment_remarks AS PERMISSIVE FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Author or admin can update remarks" ON public.payment_remarks AS PERMISSIVE FOR UPDATE TO authenticated USING (((author_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Internal staff can insert remarks" ON public.payment_remarks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND is_internal_staff_user(auth.uid())));
CREATE POLICY external_payment_remarks_capability_gate ON public.payment_remarks AS RESTRICTIVE FOR ALL TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_payment(auth.uid(), payment_id, 'can_view_status'::text) OR external_can_access_payment(auth.uid(), payment_id, 'can_submit'::text))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY prv_read ON public.payment_retail_volumes AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY prv_write ON public.payment_retail_volumes AS PERMISSIVE FOR ALL TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY psi_read ON public.payment_system_incidents AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY psi_write ON public.payment_system_incidents AS PERMISSIVE FOR ALL TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY pso_delete ON public.payment_system_operators AS PERMISSIVE FOR DELETE TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'delete'::text));
CREATE POLICY pso_insert ON public.payment_system_operators AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'create'::text));
CREATE POLICY pso_read ON public.payment_system_operators AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY pso_update ON public.payment_system_operators AS PERMISSIVE FOR UPDATE TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY "Admins update payments" ON public.payments AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users insert own payments" ON public.payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own payments" ON public.payments AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users update own pending payments" ON public.payments AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = ANY (ARRAY['completed'::text, 'failed'::text]))));
CREATE POLICY external_payments_insert_capability_gate ON public.payments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((NOT has_external_role(auth.uid())) OR external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_submit'::text) OR external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_view_status'::text)));
CREATE POLICY external_payments_select_capability_gate ON public.payments AS RESTRICTIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_payment(auth.uid(), id, 'can_view_status'::text) OR external_can_access_payment(auth.uid(), id, 'can_submit'::text)));
CREATE POLICY external_payments_update_capability_gate ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated USING (((NOT has_external_role(auth.uid())) OR external_can_access_payment(auth.uid(), id, 'can_submit'::text) OR external_can_access_payment(auth.uid(), id, 'can_view_status'::text))) WITH CHECK (((NOT has_external_role(auth.uid())) OR external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_submit'::text) OR external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_view_status'::text)));
CREATE POLICY "Admins manage permission_actions" ON public.permission_actions AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads permission_actions" ON public.permission_actions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pda_read_all ON public.permission_dependent_actions AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY pda_service_all ON public.permission_dependent_actions AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins manage permission_module_routes" ON public.permission_module_routes AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads permission_module_routes" ON public.permission_module_routes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage permission_modules" ON public.permission_modules AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone reads permission_modules" ON public.permission_modules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone reads permissions" ON public.permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage permissions" ON public.permissions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "person identity via appointment context" ON public.persons AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM entity_appointments a
  WHERE ((a.person_party_id = persons.party_id) AND wb_entity_member(a.entity_id))))));
CREATE POLICY persons_read ON public.persons AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'view_all_entities'::text)));
CREATE POLICY pfmi_ap_read ON public.pfmi_assessment_principles AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY pfmi_ap_write ON public.pfmi_assessment_principles AS PERMISSIVE FOR ALL TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY pfmi_assess_read ON public.pfmi_assessments AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY pfmi_assess_write ON public.pfmi_assessments AS PERMISSIVE FOR ALL TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY pfmi_appl_read ON public.pfmi_principle_applicability AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY pfmi_appl_write ON public.pfmi_principle_applicability AS PERMISSIVE FOR ALL TO authenticated USING (can_act_on_payment_oversight(auth.uid(), 'edit'::text)) WITH CHECK (can_act_on_payment_oversight(auth.uid(), 'edit'::text));
CREATE POLICY pfmi_principles_read ON public.pfmi_principles AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_payment_oversight(auth.uid()));
CREATE POLICY "Admins can manage ppoc mappings" ON public.ppoc_entity_mappings AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view own ppoc mappings" ON public.ppoc_entity_mappings AS PERMISSIVE FOR SELECT TO authenticated USING ((ppoc_user_id = auth.uid()));
CREATE POLICY "Admins manage ppoc mapping sectors" ON public.ppoc_mapping_sectors AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "PPOC views own mapping sectors" ON public.ppoc_mapping_sectors AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ppoc_entity_mappings m
  WHERE ((m.id = ppoc_mapping_sectors.mapping_id) AND (m.ppoc_user_id = auth.uid())))));
CREATE POLICY pre_license_users_admin_write ON public.pre_license_users AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_pre_license'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_pre_license'::text)));
CREATE POLICY pre_license_users_insert_self ON public.pre_license_users AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
CREATE POLICY pre_license_users_read ON public.pre_license_users AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'licensee_management'::text, 'manage_pre_license'::text) OR has_permission(auth.uid(), 'licensee_management'::text, 'view_all_entities'::text)));
CREATE POLICY pre_license_users_update_self ON public.pre_license_users AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "process templates readable by internal staff" ON public.process_templates AS PERMISSIVE FOR SELECT TO authenticated USING (is_internal_staff_user(auth.uid()));
CREATE POLICY "Admins can read all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can update any profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Internal staff can read profiles for triage" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Service role can manage all profiles" ON public.profiles AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY pae_read ON public.prudential_action_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prudential_actions a
  WHERE ((a.id = prudential_action_events.action_id) AND (can_read_prudential_entity(auth.uid(), a.entity_id) OR (a.entity_owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM entity_user_access eua
          WHERE ((eua.entity_id = a.entity_id) AND (eua.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = auth.uid()) AND (p.licensee_id = a.entity_id)))))))));
CREATE POLICY par_read ON public.prudential_action_responses AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prudential_actions a
  WHERE ((a.id = prudential_action_responses.action_id) AND (can_read_prudential_entity(auth.uid(), a.entity_id) OR (a.entity_owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM entity_user_access eua
          WHERE ((eua.entity_id = a.entity_id) AND (eua.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = auth.uid()) AND (p.licensee_id = a.entity_id)))))))));
CREATE POLICY prudential_actions_delete ON public.prudential_actions AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'delete'::text)));
CREATE POLICY prudential_actions_insert ON public.prudential_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND can_act_on_prudential(auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view_all_entities'::text) OR user_has_entity_assignment(auth.uid(), entity_id))));
CREATE POLICY prudential_actions_read ON public.prudential_actions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((can_read_prudential_entity(auth.uid(), entity_id) OR can_read_examination_linked_action(auth.uid(), source_type, source_id)));
CREATE POLICY prudential_actions_update ON public.prudential_actions AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'workflow_action'::text)));
CREATE POLICY pacr_delete ON public.prudential_assessment_component_ratings AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'delete'::text)));
CREATE POLICY pacr_insert ON public.prudential_assessment_component_ratings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_act_on_prudential(auth.uid()) AND (EXISTS ( SELECT 1
   FROM prudential_assessments a
  WHERE ((a.id = prudential_assessment_component_ratings.assessment_id) AND can_read_prudential_entity(auth.uid(), a.entity_id))))));
CREATE POLICY pacr_read ON public.prudential_assessment_component_ratings AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prudential_assessments a
  WHERE ((a.id = prudential_assessment_component_ratings.assessment_id) AND can_read_prudential_entity(auth.uid(), a.entity_id)))));
CREATE POLICY pacr_update ON public.prudential_assessment_component_ratings AS PERMISSIVE FOR UPDATE TO authenticated USING ((can_act_on_prudential(auth.uid()) AND (EXISTS ( SELECT 1
   FROM prudential_assessments a
  WHERE ((a.id = prudential_assessment_component_ratings.assessment_id) AND can_read_prudential_entity(auth.uid(), a.entity_id)))))) WITH CHECK (can_act_on_prudential(auth.uid()));
CREATE POLICY prudential_assessment_components_read ON public.prudential_assessment_components AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view_all_entities'::text) OR can_act_on_prudential(auth.uid()) OR can_manage_prudential_config(auth.uid())));
CREATE POLICY prudential_assessment_components_write ON public.prudential_assessment_components AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_assessments_delete ON public.prudential_assessments AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'delete'::text)));
CREATE POLICY prudential_assessments_insert ON public.prudential_assessments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND can_act_on_prudential(auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view_all_entities'::text) OR user_has_entity_assignment(auth.uid(), entity_id))));
CREATE POLICY prudential_assessments_read ON public.prudential_assessments AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY prudential_assessments_update ON public.prudential_assessments AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'workflow_action'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'workflow_action'::text)));
CREATE POLICY prudential_data_feed_logs_read ON public.prudential_data_feed_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view_all_entities'::text)));
CREATE POLICY "detection runs readable by supervisors" ON public.prudential_detection_runs AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY prudential_escalations_delete ON public.prudential_escalations AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'delete'::text)));
CREATE POLICY prudential_escalations_insert ON public.prudential_escalations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND can_act_on_prudential(auth.uid()) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view_all_entities'::text) OR user_has_entity_assignment(auth.uid(), entity_id))));
CREATE POLICY prudential_escalations_read ON public.prudential_escalations AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY prudential_escalations_update ON public.prudential_escalations AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'workflow_action'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'workflow_action'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text)));
CREATE POLICY prudential_ewi_alerts_insert ON public.prudential_ewi_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_act_on_prudential(auth.uid()) AND can_read_prudential_entity(auth.uid(), entity_id)));
CREATE POLICY prudential_ewi_alerts_read ON public.prudential_ewi_alerts AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY prudential_ewi_alerts_update ON public.prudential_ewi_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING ((can_act_on_prudential(auth.uid()) AND can_read_prudential_entity(auth.uid(), entity_id))) WITH CHECK ((can_act_on_prudential(auth.uid()) AND can_read_prudential_entity(auth.uid(), entity_id)));
CREATE POLICY prudential_ewi_rules_read ON public.prudential_ewi_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view_all_entities'::text) OR can_manage_prudential_config(auth.uid())));
CREATE POLICY prudential_ewi_rules_write ON public.prudential_ewi_rules AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_sla_config_read ON public.prudential_process_sla_config AS PERMISSIVE FOR SELECT TO authenticated USING (sup_can_read_domain(auth.uid(), 'prudential'::text));
CREATE POLICY prudential_sla_config_write ON public.prudential_process_sla_config AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_ratio_versions_read ON public.prudential_ratio_versions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prudential_ratio_versions_write ON public.prudential_ratio_versions AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_ratios_read ON public.prudential_ratios AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prudential_ratios_write ON public.prudential_ratios AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_risk_taxonomy_read ON public.prudential_risk_taxonomy AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prudential_risk_taxonomy_write ON public.prudential_risk_taxonomy AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_stress_events_read ON public.prudential_stress_events AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY prudential_stress_events_write ON public.prudential_stress_events AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'edit'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'manage_config'::text)));
CREATE POLICY prudential_stress_indicators_read ON public.prudential_stress_indicators AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prudential_stress_indicators_write ON public.prudential_stress_indicators AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_threshold_versions_read ON public.prudential_threshold_versions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prudential_threshold_versions_write ON public.prudential_threshold_versions AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY prudential_thresholds_read ON public.prudential_thresholds AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prudential_thresholds_write ON public.prudential_thresholds AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_prudential_config(auth.uid())) WITH CHECK (can_manage_prudential_config(auth.uid()));
CREATE POLICY "authenticated can read scope registry" ON public.rbac_module_scopes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "migration decisions readable" ON public.rdm_migration_decisions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'regulatory_data_model'::text, 'view'::text) OR has_permission(auth.uid(), 'form_management'::text, 'view'::text)));
CREATE POLICY "Admins manage refunds" ON public.refunds AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users read own refunds" ON public.refunds AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = requested_by));
CREATE POLICY "Users request refunds" ON public.refunds AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = requested_by));
CREATE POLICY reb_read ON public.registration_entity_bindings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) OR is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM registrations r
  WHERE ((r.id = registration_entity_bindings.registration_id) AND (r.user_id = auth.uid()))))));
CREATE POLICY "Admins manage registration form configs" ON public.registration_form_configs AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Public read active registration configs" ON public.registration_form_configs AS PERMISSIVE FOR SELECT TO authenticated, anon USING ((is_active = true));
CREATE POLICY "Internal staff read all registration submissions" ON public.registration_form_submissions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role)));
CREATE POLICY "Users can insert own form submissions" ON public.registration_form_submissions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own form submissions" ON public.registration_form_submissions AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own form submissions" ON public.registration_form_submissions AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY rje_read ON public.registration_journey_events AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR onboarding_can_view_audit(auth.uid())));
CREATE POLICY rjt_internal_read ON public.registration_journey_types AS PERMISSIVE FOR SELECT TO authenticated USING ((is_internal_staff(auth.uid()) OR is_super_admin(auth.uid())));
CREATE POLICY rjt_public_read ON public.registration_journey_types AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_enabled AND is_public));
CREATE POLICY "Internal staff read all registrations" ON public.registrations AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role)));
CREATE POLICY "Internal staff update registrations" ON public.registrations AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY "Users can insert own registrations" ON public.registrations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own registrations" ON public.registrations AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own registrations" ON public.registrations AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY rpp_read ON public.registry_publication_policies AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Admins manage regulators" ON public.regulators AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated users can read regulators" ON public.regulators AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY rm_read ON public.regulatory_metrics AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR is_internal_staff(auth.uid()) OR (sensitivity = 'PUBLIC'::text)));
CREATE POLICY "request requirements readable" ON public.regulatory_request_form_requirements AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'regulatory_requests'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM regulatory_requests rr
  WHERE ((rr.id = regulatory_request_form_requirements.request_id) AND wb_entity_member(rr.entity_id))))));
CREATE POLICY "request types readable" ON public.regulatory_request_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "regulatory requests readable" ON public.regulatory_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'regulatory_requests'::text, 'view'::text) OR wb_entity_member(entity_id)));
CREATE POLICY "Admins manage reinsurance contracts" ON public.reinsurance_contracts AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Entity users read own reinsurance contracts" ON public.reinsurance_contracts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM entity_user_access eua
  WHERE ((eua.user_id = auth.uid()) AND (eua.entity_id = reinsurance_contracts.entity_id) AND (eua.is_active = true) AND ((eua.end_date IS NULL) OR (eua.end_date > now()))))));
CREATE POLICY "Internal staff read reinsurance contracts" ON public.reinsurance_contracts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY relationship_types_read ON public.relationship_types AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY rpt_cfg_read ON public.report_dashboard_layouts AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY rpt_cfg_write ON public.report_dashboard_layouts AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY rpt_cfg_read ON public.report_dashboard_widgets AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY rpt_cfg_write ON public.report_dashboard_widgets AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY "Manage report definitions" ON public.report_definitions AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY "Read report definitions" ON public.report_definitions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY external_users_denied_report_definitions ON public.report_definitions AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY "Delete own favorites" ON public.report_favorites AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Insert own favorites" ON public.report_favorites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Read own favorites" ON public.report_favorites AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Create report filters" ON public.report_filters AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "Delete own filters" ON public.report_filters AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Read report filters" ON public.report_filters AS PERMISSIVE FOR SELECT TO authenticated USING (((is_global = true) OR (created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Update own filters" ON public.report_filters AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Insert own report logs" ON public.report_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((executed_by = auth.uid()));
CREATE POLICY "Insert report logs" ON public.report_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = executed_by));
CREATE POLICY "Read report logs" ON public.report_logs AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR (executed_by = auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY "report_option_sets admin write" ON public.report_option_sets AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "report_option_sets read" ON public.report_option_sets AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert files for own runs" ON public.report_run_files AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_files.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))))));
CREATE POLICY "Read files of accessible runs" ON public.report_run_files AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_files.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role))))));
CREATE POLICY "Delete rows for own runs" ON public.report_run_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_rows.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))))));
CREATE POLICY "Insert rows for own runs" ON public.report_run_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_rows.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))))));
CREATE POLICY "Read rows of accessible runs" ON public.report_run_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_run_rows.report_run_id) AND ((r.created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role))))));
CREATE POLICY "report_runtime_config admin write" ON public.report_runtime_config AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "report_runtime_config read" ON public.report_runtime_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create schedules" ON public.report_schedules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = created_by) AND (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))));
CREATE POLICY "Delete schedules" ON public.report_schedules AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Read schedules" ON public.report_schedules AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Update schedules" ON public.report_schedules AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY rpt_cfg_read ON public.report_source_columns AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY rpt_cfg_write ON public.report_source_columns AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY rpt_cfg_read ON public.report_source_filters AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY rpt_cfg_write ON public.report_source_filters AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY rpt_cfg_read ON public.report_sources AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY rpt_cfg_write ON public.report_sources AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY "report_status_options admin write" ON public.report_status_options AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "report_status_options read" ON public.report_status_options AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Delete own templates" ON public.report_templates AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Insert own templates" ON public.report_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Read own or shared templates" ON public.report_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR (visibility = 'shared'::text) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Update own templates" ON public.report_templates AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK (((created_by = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY ror_read ON public.reporting_obligation_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'view'::text)));
CREATE POLICY rp_read ON public.reporting_periods AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM entity_reporting_obligations o
  WHERE ((o.id = reporting_periods.entity_reporting_obligation_id) AND can_read_entity_returns(auth.uid(), o.entity_id)))));
CREATE POLICY "Admins delete reports" ON public.reports AS PERMISSIVE FOR DELETE TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY "Internal users create reports" ON public.reports AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text)));
CREATE POLICY "Internal users read reports" ON public.reports AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'report_management.view'::text)));
CREATE POLICY "Owners update reports" ON public.reports AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((is_super_admin(auth.uid()) OR (created_by = auth.uid()) OR has_permission(auth.uid(), 'report_management'::text, 'create'::text))) WITH CHECK (true);
CREATE POLICY external_users_denied_reports ON public.reports AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY res_arr_read ON public.resilience_arrangements AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'operational_resilience'::text, 'view'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text)));
CREATE POLICY res_arr_write ON public.resilience_arrangements AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'operational_resilience'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'operational_resilience'::text, 'edit'::text)));
CREATE POLICY res_inc_read ON public.resilience_incidents AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'operational_resilience'::text, 'view'::text) OR has_permission(auth.uid(), 'prudential_supervision'::text, 'view'::text)));
CREATE POLICY res_inc_write ON public.resilience_incidents AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'operational_resilience'::text, 'edit'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'operational_resilience'::text, 'edit'::text)));
CREATE POLICY return_audit_log_insert ON public.return_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((performed_by = auth.uid()) AND can_read_return_filed(auth.uid(), return_id)));
CREATE POLICY return_audit_log_read ON public.return_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_calculated_ratios_delete ON public.return_calculated_ratios AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_calculated_ratios_read ON public.return_calculated_ratios AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_calculated_ratios_update ON public.return_calculated_ratios AS PERMISSIVE FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text)) WITH CHECK (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text));
CREATE POLICY return_calculated_ratios_write ON public.return_calculated_ratios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text));
CREATE POLICY return_comments_delete ON public.return_comments AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'delete'::text)));
CREATE POLICY return_comments_insert ON public.return_comments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_read_return_filed(auth.uid(), return_id) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text) OR can_mutate_return_filed(auth.uid(), return_id))));
CREATE POLICY return_comments_read ON public.return_comments AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_comments_update ON public.return_comments AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_return_filed(auth.uid(), return_id)) WITH CHECK (can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_config_forms_read ON public.return_config_forms AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_config_forms_write ON public.return_config_forms AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_configs_read ON public.return_configs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_configs_write ON public.return_configs AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_configurations_read ON public.return_configurations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_configurations_write ON public.return_configurations AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_consolidated_analysis_delete ON public.return_consolidated_analysis AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_consolidated_analysis_read ON public.return_consolidated_analysis AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_return_filed(auth.uid(), return_id) OR has_permission(auth.uid(), 'report_management'::text, 'view'::text)));
CREATE POLICY return_consolidated_analysis_update ON public.return_consolidated_analysis AS PERMISSIVE FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text)) WITH CHECK (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text));
CREATE POLICY return_consolidated_analysis_write ON public.return_consolidated_analysis AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text));
CREATE POLICY return_cutoff_config_read ON public.return_cutoff_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_cutoff_config_write ON public.return_cutoff_config AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_data_revisions_delete ON public.return_data_revisions AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_data_revisions_insert ON public.return_data_revisions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_mutate_return_filed(auth.uid(), return_id) AND ((created_by IS NULL) OR (created_by = auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text))));
CREATE POLICY return_data_revisions_read ON public.return_data_revisions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY rdf_read ON public.return_definition_forms AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'view'::text)));
CREATE POLICY rd_read ON public.return_definitions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'view'::text) OR (EXISTS ( SELECT 1
   FROM entity_reporting_obligations o
  WHERE ((o.return_definition_id = return_definitions.id) AND entity_membership_capability(auth.uid(), o.entity_id, 'returns.view'::text))))));
CREATE POLICY return_documents_delete ON public.return_documents AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR (can_mutate_return_filed(auth.uid(), return_id) AND ((uploaded_by = auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text)))));
CREATE POLICY return_documents_insert ON public.return_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_mutate_return_filed(auth.uid(), return_id) AND ((uploaded_by IS NULL) OR (uploaded_by = auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text))));
CREATE POLICY return_documents_read ON public.return_documents AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_documents_update ON public.return_documents AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_return_filed(auth.uid(), return_id)) WITH CHECK (can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_due_dates_read ON public.return_due_dates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_due_dates_write ON public.return_due_dates AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_edit_requests_delete ON public.return_edit_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_edit_requests_insert ON public.return_edit_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_read_return_filed(auth.uid(), return_id) OR has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text)));
CREATE POLICY return_edit_requests_read ON public.return_edit_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_return_filed(auth.uid(), return_id) OR has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text)));
CREATE POLICY return_edit_requests_update ON public.return_edit_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text) OR is_super_admin(auth.uid()))) WITH CHECK ((has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text) OR is_super_admin(auth.uid())));
CREATE POLICY rffr_read ON public.return_filing_form_requirements AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (return_filing_versions v
     JOIN return_filings f ON ((f.id = v.return_filing_id)))
  WHERE ((v.id = return_filing_form_requirements.return_filing_version_id) AND can_read_entity_returns(auth.uid(), f.entity_id)))));
CREATE POLICY rfreq_read ON public.return_filing_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM return_filings f
  WHERE ((f.id = return_filing_requests.return_filing_id) AND can_read_entity_returns(auth.uid(), f.entity_id)))));
CREATE POLICY rfvr_read ON public.return_filing_validation_results AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM return_filings f
  WHERE ((f.id = return_filing_validation_results.return_filing_id) AND can_read_entity_returns(auth.uid(), f.entity_id)))));
CREATE POLICY rfv_read ON public.return_filing_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM return_filings f
  WHERE ((f.id = return_filing_versions.return_filing_id) AND can_read_entity_returns(auth.uid(), f.entity_id)))));
CREATE POLICY rf_read ON public.return_filings AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_entity_returns(auth.uid(), entity_id));
CREATE POLICY return_form_data_delete ON public.return_form_data AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'delete'::text)));
CREATE POLICY return_form_data_insert ON public.return_form_data AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_data_read ON public.return_form_data AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_data_update ON public.return_form_data AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_return_filed(auth.uid(), return_id)) WITH CHECK (can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_versions_read ON public.return_form_versions AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_versions_write ON public.return_form_versions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY rmv_read ON public.return_metric_values AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_entity_returns(auth.uid(), entity_id));
CREATE POLICY return_notification_templates_read ON public.return_notification_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_notification_templates_write ON public.return_notification_templates AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_notifications_log_read ON public.return_notifications_log AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_requests_delete ON public.return_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_requests_insert ON public.return_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text) OR can_mutate_return_filed(auth.uid(), return_id)));
CREATE POLICY return_requests_read ON public.return_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_return_filed(auth.uid(), return_id) OR has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text)));
CREATE POLICY return_requests_update ON public.return_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text) OR is_super_admin(auth.uid()))) WITH CHECK ((has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text) OR is_super_admin(auth.uid())));
CREATE POLICY return_template_downloads_insert ON public.return_template_downloads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = downloaded_by));
CREATE POLICY return_template_downloads_read ON public.return_template_downloads AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = downloaded_by) OR is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'view_all_entities'::text) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_templates_read ON public.return_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_templates_write ON public.return_templates AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY "Prudential readers can view breach acknowledgements" ON public.return_threshold_breach_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY return_threshold_breaches_delete ON public.return_threshold_breaches AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_threshold_breaches_insert ON public.return_threshold_breaches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text));
CREATE POLICY return_threshold_breaches_read ON public.return_threshold_breaches AS PERMISSIVE FOR SELECT TO authenticated USING ((can_read_return_filed(auth.uid(), return_id) OR has_permission(auth.uid(), 'report_management'::text, 'view'::text)));
CREATE POLICY return_threshold_breaches_read_canonical ON public.return_threshold_breaches AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY return_threshold_breaches_update ON public.return_threshold_breaches AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text))) WITH CHECK ((has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR has_permission(auth.uid(), 'returns_management'::text, 'workflow_action'::text)));
CREATE POLICY return_types_read ON public.return_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_types_write ON public.return_types AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_upload_attempts_delete ON public.return_upload_attempts AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_upload_attempts_insert ON public.return_upload_attempts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND ((return_id IS NULL) OR can_mutate_return_filed(auth.uid(), return_id) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text))));
CREATE POLICY return_upload_attempts_read ON public.return_upload_attempts AS PERMISSIVE FOR SELECT TO authenticated USING (((uploaded_by = auth.uid()) OR ((return_id IS NOT NULL) AND can_read_return_filed(auth.uid(), return_id)) OR has_permission(auth.uid(), 'returns_management'::text, 'view_all_entities'::text) OR is_super_admin(auth.uid())));
CREATE POLICY return_upload_attempts_update ON public.return_upload_attempts AS PERMISSIVE FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR is_super_admin(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR is_super_admin(auth.uid())));
CREATE POLICY return_upload_imports_delete ON public.return_upload_imports AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_upload_imports_insert ON public.return_upload_imports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM return_upload_attempts a
  WHERE ((a.id = return_upload_imports.upload_id) AND (a.uploaded_by = auth.uid())))) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text)));
CREATE POLICY return_upload_imports_read ON public.return_upload_imports AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'view_all_entities'::text) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR (EXISTS ( SELECT 1
   FROM return_upload_attempts a
  WHERE ((a.id = return_upload_imports.upload_id) AND ((a.uploaded_by = auth.uid()) OR ((a.return_id IS NOT NULL) AND can_read_return_filed(auth.uid(), a.return_id))))))));
CREATE POLICY return_validation_rule_versions_read ON public.return_validation_rule_versions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_validation_rule_versions_write ON public.return_validation_rule_versions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_validation_rules_read ON public.return_validation_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_validation_rules_write ON public.return_validation_rules AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text))) WITH CHECK ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY return_validation_run_log_delete ON public.return_validation_run_log AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY return_validation_run_log_read ON public.return_validation_run_log AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_validation_run_log_write ON public.return_validation_run_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'returns_management'::text, 'edit'::text));
CREATE POLICY returns_filed_delete ON public.returns_filed AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'delete'::text)));
CREATE POLICY returns_filed_insert ON public.returns_filed AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = created_by) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'create'::text) OR has_permission(auth.uid(), 'returns_management'::text, 'edit'::text) OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = auth.uid()) AND (pr.licensee_id IS NOT NULL) AND ((pr.licensee_id = returns_filed.entity_id) OR (pr.licensee_id = returns_filed.on_behalf_of_licensee_id))))) OR (EXISTS ( SELECT 1
   FROM ppoc_mapped_licensee_ids(auth.uid()) m(licensee_id)
  WHERE ((m.licensee_id = returns_filed.entity_id) OR (m.licensee_id = returns_filed.on_behalf_of_licensee_id)))) OR (has_external_role(auth.uid()) AND external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns'::text)))));
CREATE POLICY returns_filed_read ON public.returns_filed AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_return_filed_row(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, id));
CREATE POLICY returns_filed_update ON public.returns_filed AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mutate_return_filed(auth.uid(), id)) WITH CHECK (can_mutate_return_filed(auth.uid(), id));
CREATE POLICY rlm_read ON public.returns_legacy_mappings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'returns_management'::text, 'manage_config'::text)));
CREATE POLICY review_comments_delete ON public.review_comments AS PERMISSIVE FOR DELETE TO authenticated USING (((auth.uid() = author_user_id) OR is_collab_admin(auth.uid())));
CREATE POLICY review_comments_insert ON public.review_comments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = author_user_id) AND can_access_review_entity(auth.uid(), entity_type, entity_id)));
CREATE POLICY review_comments_select ON public.review_comments AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY review_comments_update ON public.review_comments AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = author_user_id) OR is_collab_admin(auth.uid()))) WITH CHECK (((auth.uid() = author_user_id) OR is_collab_admin(auth.uid())));
CREATE POLICY review_narrative_read ON public.review_narrative_fields AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY review_narrative_write ON public.review_narrative_fields AS PERMISSIVE FOR ALL TO authenticated USING ((is_collab_admin(auth.uid()) OR can_mutate_approval_config(auth.uid()))) WITH CHECK ((is_collab_admin(auth.uid()) OR can_mutate_approval_config(auth.uid())));
CREATE POLICY review_role_display_read ON public.review_role_display_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY review_role_display_write ON public.review_role_display_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_collab_admin(auth.uid())) WITH CHECK (is_collab_admin(auth.uid()));
CREATE POLICY review_step_perms_read ON public.review_step_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY review_step_perms_write ON public.review_step_permissions AS PERMISSIVE FOR ALL TO authenticated USING (is_collab_admin(auth.uid())) WITH CHECK (is_collab_admin(auth.uid()));
CREATE POLICY review_suggestions_delete ON public.review_suggestions AS PERMISSIVE FOR DELETE TO authenticated USING (((auth.uid() = author_user_id) OR is_collab_admin(auth.uid())));
CREATE POLICY review_suggestions_insert ON public.review_suggestions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = author_user_id) AND can_access_review_entity(auth.uid(), entity_type, entity_id)));
CREATE POLICY review_suggestions_select ON public.review_suggestions AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY review_suggestions_update ON public.review_suggestions AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = author_user_id) OR is_collab_admin(auth.uid()))) WITH CHECK (((auth.uid() = author_user_id) OR is_collab_admin(auth.uid())));
CREATE POLICY "Admins manage risk ratings" ON public.risk_ratings AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "Authenticated read risk ratings" ON public.risk_ratings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY external_users_denied_risk_ratings ON public.risk_ratings AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY "Admins manage weights" ON public.risk_score_weights AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Internal read weights" ON public.risk_score_weights AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY role_migration_log_super_admin_read ON public.role_migration_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY role_migration_log_super_admin_write ON public.role_migration_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Anyone reads role_permissions" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage role_permissions" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY role_types_read ON public.role_types AS PERMISSIVE FOR SELECT TO authenticated USING (rdm_can_read());
CREATE POLICY "Anyone reads roles" ON public.roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage roles" ON public.roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins and supervisors can read rule overrides" ON public.rule_overrides AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "Users can insert their own rule overrides" ON public.rule_overrides AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY external_users_denied_rule_overrides ON public.rule_overrides AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY rule_overrides_no_delete ON public.rule_overrides AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY rule_overrides_no_update ON public.rule_overrides AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY sec_legacy_perm_map_read ON public.sec_legacy_permission_map AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_module_scopes_read ON public.sec_module_scopes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_modules_read ON public.sec_modules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_navigation_read ON public.sec_navigation_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_permission_deps_read ON public.sec_permission_dependencies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_permissions_read ON public.sec_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_role_permissions_read ON public.sec_role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_role_scope_values_read ON public.sec_role_scope_values AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_role_scopes_read ON public.sec_role_scopes AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_role_template_permissions_read ON public.sec_role_template_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_rtsv_read ON public.sec_role_template_scope_values AS PERMISSIVE FOR SELECT TO authenticated USING ((sec_has_permission(auth.uid(), 'role_management'::text, 'view_catalog'::text) OR sec_has_permission(auth.uid(), 'role_management'::text, 'view'::text)));
CREATE POLICY sec_rts_read ON public.sec_role_template_scopes AS PERMISSIVE FOR SELECT TO authenticated USING ((sec_has_permission(auth.uid(), 'role_management'::text, 'view_catalog'::text) OR sec_has_permission(auth.uid(), 'role_management'::text, 'view'::text)));
CREATE POLICY sec_role_templates_read ON public.sec_role_templates AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_roles_read ON public.sec_roles AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_routes_read ON public.sec_routes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_scope_types_read ON public.sec_scope_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sec_seed_reports_read ON public.sec_seed_reports AS PERMISSIVE FOR SELECT TO authenticated USING (sec_has_permission(auth.uid(), 'role_management'::text, 'view'::text));
CREATE POLICY sec_user_roles_read ON public.sec_user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_permission(auth.uid(), 'role_management'::text, 'view'::text)));
CREATE POLICY "Admins delete sectors" ON public.sectors AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins insert sectors" ON public.sectors AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins update sectors" ON public.sectors AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Anyone can read sectors" ON public.sectors AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY external_users_denied_security_event_logs ON public.security_event_logs AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY security_event_logs_no_delete ON public.security_event_logs AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY security_event_logs_no_update ON public.security_event_logs AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY sel_admin_read ON public.security_event_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins manage services" ON public.services AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read services" ON public.services AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "share classes readable" ON public.share_classes AS PERMISSIVE FOR SELECT TO authenticated USING ((has_permission(auth.uid(), 'entity_structure'::text, 'view'::text) OR ((entity_id IS NOT NULL) AND wb_entity_member(entity_id))));
CREATE POLICY "Admins can manage site_settings" ON public.site_settings AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins read all site_settings" ON public.site_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins update site settings" ON public.site_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Public read non-sensitive site_settings" ON public.site_settings AS PERMISSIVE FOR SELECT TO authenticated, anon USING ((key <> 'email_sms_settings'::text));
CREATE POLICY "Admins or super_admins manage" ON public.sla_configurations AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read SLA configs" ON public.sla_configurations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "sla escalation dispatches admin read" ON public.sla_escalation_dispatches AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins or super_admins manage" ON public.sla_escalation_tiers AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read escalation tiers" ON public.sla_escalation_tiers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins or super_admins manage team leads" ON public.sla_process_team_leads AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read team leads" ON public.sla_process_team_leads AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "internal staff read sla stage events" ON public.sla_stage_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_internal_role(auth.uid()));
CREATE POLICY sla_stage_events_no_client_write ON public.sla_stage_events AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY sla_stage_events_no_delete ON public.sla_stage_events AS PERMISSIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY sla_stage_events_no_update ON public.sla_stage_events AS PERMISSIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY "internal staff read sla stage instances" ON public.sla_stage_instances AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_internal_role(auth.uid()));
CREATE POLICY sla_stage_instances_no_client_write ON public.sla_stage_instances AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY sla_stage_instances_no_delete ON public.sla_stage_instances AS PERMISSIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY sla_stage_instances_no_update ON public.sla_stage_instances AS PERMISSIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY "Admins manage states" ON public.states AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Auth read states" ON public.states AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read states" ON public.states AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Admins manage sub_sectors" ON public.sub_sectors AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated read sub_sectors" ON public.sub_sectors AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read sub_sectors" ON public.sub_sectors AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY sufficiency_determinations_no_client_insert ON public.sufficiency_determinations AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY sufficiency_determinations_no_delete ON public.sufficiency_determinations AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY sufficiency_determinations_no_update ON public.sufficiency_determinations AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY sufficiency_determinations_read ON public.sufficiency_determinations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'application_management'::text, 'view'::text) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Internal staff insert results" ON public.sufficiency_evaluation_results AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY "Read own or internal results" ON public.sufficiency_evaluation_results AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role) OR (evaluation_id IN ( SELECT se.id
   FROM (sufficiency_evaluations se
     JOIN applications a ON ((a.id = se.application_id)))
  WHERE (a.applicant_id = auth.uid())))));
CREATE POLICY "Internal staff insert evaluations" ON public.sufficiency_evaluations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role)));
CREATE POLICY "Read own or internal evaluations" ON public.sufficiency_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role) OR (application_id IN ( SELECT applications.id
   FROM applications
  WHERE (applications.applicant_id = auth.uid())))));
CREATE POLICY "Internal insert overrides" ON public.sufficiency_overrides AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = overridden_by));
CREATE POLICY "Internal staff read sufficiency overrides" ON public.sufficiency_overrides AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Admins manage set items" ON public.sufficiency_rule_set_items AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Internal read set items" ON public.sufficiency_rule_set_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rule sets" ON public.sufficiency_rule_sets AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Internal staff read sufficiency rule sets" ON public.sufficiency_rule_sets AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "Admins manage sufficiency rules" ON public.sufficiency_rules AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
CREATE POLICY "Internal staff read sufficiency rules" ON public.sufficiency_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'licensing_officer'::app_role) OR has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'legal_compliance'::app_role)));
CREATE POLICY "external users denied supervisory actions" ON public.supervisory_plan_actions AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY "supervisory actions admin manage" ON public.supervisory_plan_actions AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "supervisory actions entity read" ON public.supervisory_plan_actions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (supervisory_plans p
     JOIN entity_user_access eua ON ((eua.entity_id = p.entity_id)))
  WHERE ((p.id = supervisory_plan_actions.plan_id) AND (eua.user_id = auth.uid()) AND (eua.is_active = true)))));
CREATE POLICY "Internal can manage plan template actions" ON public.supervisory_plan_template_actions AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'supervisor'::app_role, 'licensing_officer'::app_role, 'analyst'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'supervisor'::app_role, 'licensing_officer'::app_role, 'analyst'::app_role]))))));
CREATE POLICY "Internal can manage plan templates" ON public.supervisory_plan_templates AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'supervisor'::app_role, 'licensing_officer'::app_role, 'analyst'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'supervisor'::app_role, 'licensing_officer'::app_role, 'analyst'::app_role]))))));
CREATE POLICY "external users denied supervisory plans" ON public.supervisory_plans AS RESTRICTIVE FOR ALL TO authenticated USING ((NOT has_external_role(auth.uid()))) WITH CHECK ((NOT has_external_role(auth.uid())));
CREATE POLICY "supervisory plans admin manage" ON public.supervisory_plans AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))) WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));
CREATE POLICY "supervisory plans entity read" ON public.supervisory_plans AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM entity_user_access eua
  WHERE ((eua.entity_id = supervisory_plans.entity_id) AND (eua.user_id = auth.uid()) AND (eua.is_active = true)))));
CREATE POLICY thematic_review_actions_internal_read ON public.thematic_review_actions AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY "Internal read tre" ON public.thematic_review_entities AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY "Internal write tre" ON public.thematic_review_entities AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_thematic_review(review_id)) WITH CHECK (can_manage_thematic_review(review_id));
CREATE POLICY "Internal read tre_ev" ON public.thematic_review_evidence AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY "Internal write tre_ev" ON public.thematic_review_evidence AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_thematic_review(review_id)) WITH CHECK (can_manage_thematic_review(review_id));
CREATE POLICY thematic_review_findings_internal_read ON public.thematic_review_findings AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY thematic_review_letters_internal_read ON public.thematic_review_letters AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY thematic_review_products_internal_read ON public.thematic_review_products AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY thematic_review_products_internal_write ON public.thematic_review_products AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_thematic_review(review_id)) WITH CHECK (can_manage_thematic_review(review_id));
CREATE POLICY "Internal read trr" ON public.thematic_review_reports AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY "Internal write trr" ON public.thematic_review_reports AS PERMISSIVE FOR ALL TO authenticated USING (can_manage_thematic_review(review_id)) WITH CHECK (can_manage_thematic_review(review_id));
CREATE POLICY thematic_review_status_history_internal_read ON public.thematic_review_status_history AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY "Internal read thematic_reviews" ON public.thematic_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT has_external_role(auth.uid())) AND (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'market_conduct'::text, 'view'::text))));
CREATE POLICY "Internal staff read twinpeaks clearances" ON public.twinpeaks_clearances AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'licensing_officer'::app_role, 'supervisor'::app_role, 'analyst'::app_role, 'legal_compliance'::app_role]))))));
CREATE POLICY "Internal staff update twinpeaks clearances" ON public.twinpeaks_clearances AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'licensing_officer'::app_role, 'supervisor'::app_role, 'analyst'::app_role, 'legal_compliance'::app_role]))))));
CREATE POLICY "Internal staff write twinpeaks clearances" ON public.twinpeaks_clearances AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'licensing_officer'::app_role, 'supervisor'::app_role, 'analyst'::app_role, 'legal_compliance'::app_role]))))));
CREATE POLICY "Service manages twinpeaks clearances" ON public.twinpeaks_clearances AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Internal staff read twinpeaks disagreements" ON public.twinpeaks_disagreements AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'licensing_officer'::app_role, 'supervisor'::app_role, 'analyst'::app_role, 'legal_compliance'::app_role]))))));
CREATE POLICY "Internal staff update twinpeaks disagreements" ON public.twinpeaks_disagreements AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'licensing_officer'::app_role, 'supervisor'::app_role, 'analyst'::app_role, 'legal_compliance'::app_role]))))));
CREATE POLICY "Internal staff write twinpeaks disagreements" ON public.twinpeaks_disagreements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'licensing_officer'::app_role, 'supervisor'::app_role, 'analyst'::app_role, 'legal_compliance'::app_role]))))));
CREATE POLICY "Service manages twinpeaks disagreements" ON public.twinpeaks_disagreements AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins delete dynamic roles" ON public.user_dynamic_roles AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins insert dynamic roles" ON public.user_dynamic_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users view own dynamic roles" ON public.user_dynamic_roles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can read all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Only super_admin can delete roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Only super_admin can insert roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Only super_admin can update roles" ON public.user_roles AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can read own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY worker_invocation_tokens_no_client_access ON public.worker_invocation_tokens AS PERMISSIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY workflow_instances_read ON public.workflow_instances AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_workflow_instance(auth.uid(), entity_id));
CREATE POLICY workflow_instances_write ON public.workflow_instances AS PERMISSIVE FOR ALL TO authenticated USING ((can_act_on_approval(auth.uid()) OR can_mutate_approval_config(auth.uid()))) WITH CHECK ((can_act_on_approval(auth.uid()) OR can_mutate_approval_config(auth.uid())));
CREATE POLICY workflow_templates_read ON public.workflow_templates AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_approval_config(auth.uid()));
CREATE POLICY workflow_templates_write ON public.workflow_templates AS PERMISSIVE FOR ALL TO authenticated USING (can_mutate_approval_config(auth.uid())) WITH CHECK (can_mutate_approval_config(auth.uid()));
