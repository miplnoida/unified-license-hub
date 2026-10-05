-- SEC-CRIT-01: replace USING(true) reads on internal configuration / RBAC / methodology tables
-- with the canonical internal-staff predicate. External portal users (applicant, pre-licensee,
-- licensee) have no browser consumer of these tables; edge functions use service_role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.cmd = 'SELECT' AND btrim(p.qual) = 'true'
      AND p.tablename = ANY (ARRAY[
        'appeal_panel_scopes','business_calendar_process_assignments','classification_change_log',
        'decision_options','decision_rationale_templates','document_retention_policies',
        'entity_membership_role_permissions','entity_relationships','fp_committee_members','fp_committees',
        'identity_capability_register','identity_data_remediation_register','permission_module_routes',
        'permissions','rbac_module_scopes','regulatory_profiles','return_due_dates','review_narrative_fields',
        'review_role_display_settings','review_step_permissions','role_permissions','sec_anon_execute_allowlist',
        'sec_legacy_permission_map','sec_module_scopes','sec_permission_dependencies','sec_permissions',
        'sec_routes','sla_process_team_leads','subject_forms','sufficiency_rule_set_items',
        'supervisory_domain_authority','supervisory_methodology_fact_requirement',
        'supervisory_methodology_parameter','supervisory_methodology_question_fact',
        'supervisory_methodology_reference_decision','supervisory_methodology_semantic_profile',
        'supervisory_rating_scale'])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()))',
      'sec_crit01_internal_read', r.tablename);
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.tablename);
  END LOOP;
END $$;

-- reports: UPDATE must re-check the same authority on the new row
DROP POLICY IF EXISTS "Owners update reports" ON public.reports;
CREATE POLICY "Owners update reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR created_by = auth.uid() OR public.has_permission(auth.uid(), 'report_management', 'create'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR created_by = auth.uid() OR public.has_permission(auth.uid(), 'report_management', 'create'));

-- secure-documents registration uploads: signed-in readers only see files they uploaded;
-- reviewers keep access through secure_documents_read (permission-gated).
DROP POLICY IF EXISTS "Authenticated read registration uploads" ON storage.objects;
CREATE POLICY "Authenticated read registration uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'secure-documents' AND (storage.foldername(name))[1] = 'registrations' AND owner_id = (auth.uid())::text);