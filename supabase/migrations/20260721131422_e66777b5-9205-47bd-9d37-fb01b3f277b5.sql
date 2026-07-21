
INSERT INTO public.permissions (module, name) VALUES
  ('application_management','view_all_entities'),
  ('application_management','workflow_action'),
  ('application_management','delete'),
  ('application_management','manage_config')
  ON CONFLICT (module, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_read_application(_user uuid, _application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user IS NULL OR _application_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'application_management','view_all_entities') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = _application_id
         AND (
           a.applicant_id = _user
           OR (public.has_permission(_user, 'application_management','view')
               AND NOT public.has_external_role(_user))
           OR (public.user_licensee_id(_user) IS NOT NULL
               AND a.id IN (SELECT public.application_ids_for_licensee(public.user_licensee_id(_user))))
           OR a.applicant_id IN (
             SELECT p.id FROM public.profiles p
              WHERE p.licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(_user))
           )
           OR public.external_can_access_application(_user, a.id, 'can_view'::text)
         )
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_application(_user uuid, _application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user IS NULL OR _application_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'application_management','edit') THEN true
    WHEN public.has_permission(_user, 'application_management','workflow_action') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = _application_id
         AND (
           (a.applicant_id = _user AND a.status = ANY (ARRAY[
             'draft','in_progress','resubmission_requested','resubmission_required',
             'query_raised','returned_for_correction','info_requested'
           ]))
           OR public.external_can_access_application(_user, a.id, 'can_submit'::text)
           OR public.external_can_access_application(_user, a.id, 'can_respond_rfi'::text)
         )
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_application(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_mutate_application(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_application(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_mutate_application(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Applicants insert own apps" ON public.applications;
DROP POLICY IF EXISTS "Applicants read own apps" ON public.applications;
DROP POLICY IF EXISTS "Licensee users read linked applications" ON public.applications;
DROP POLICY IF EXISTS "PPOC read mapped applications" ON public.applications;
DROP POLICY IF EXISTS "Update apps" ON public.applications;
DROP POLICY IF EXISTS "external_applications_insert_capability_gate" ON public.applications;
DROP POLICY IF EXISTS "external_applications_select_capability_gate" ON public.applications;
DROP POLICY IF EXISTS "external_applications_update_capability_gate" ON public.applications;

CREATE POLICY applications_read ON public.applications FOR SELECT TO authenticated
  USING (public.can_read_application(auth.uid(), id));
CREATE POLICY applications_insert ON public.applications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'application_management','create')
    OR (applicant_id = auth.uid()
        AND (NOT public.has_external_role(auth.uid())
             OR public.has_role(auth.uid(),'applicant'::app_role)
             OR public.has_role(auth.uid(),'pre_licensee'::app_role)
             OR public.has_role(auth.uid(),'licensee_primary'::app_role)
             OR public.has_role(auth.uid(),'licensee_secondary'::app_role)))
  );
CREATE POLICY applications_update ON public.applications FOR UPDATE TO authenticated
  USING (public.can_mutate_application(auth.uid(), id))
  WITH CHECK (public.can_mutate_application(auth.uid(), id));
CREATE POLICY applications_delete ON public.applications FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','delete'));

DROP POLICY IF EXISTS "Internal staff can view AI assessments" ON public.application_ai_assessments;
CREATE POLICY application_ai_assessments_read ON public.application_ai_assessments FOR SELECT TO authenticated
  USING (public.can_read_application(auth.uid(), application_id)
         AND NOT public.has_external_role(auth.uid()));
CREATE POLICY application_ai_assessments_write ON public.application_ai_assessments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','edit')
         OR public.has_permission(auth.uid(),'application_management','workflow_action'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'application_management','edit')
              OR public.has_permission(auth.uid(),'application_management','workflow_action'));

DROP POLICY IF EXISTS "App owners and internal staff can view assignments" ON public.application_form_versions;
CREATE POLICY application_form_versions_read ON public.application_form_versions FOR SELECT TO authenticated
  USING (public.can_read_application(auth.uid(), application_id));
CREATE POLICY application_form_versions_write ON public.application_form_versions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'application_management','manage_config'));

DROP POLICY IF EXISTS "Applicants view own RFIs" ON public.application_rfis;
DROP POLICY IF EXISTS "Internal manage RFIs" ON public.application_rfis;
CREATE POLICY application_rfis_read ON public.application_rfis FOR SELECT TO authenticated
  USING (public.can_read_application(auth.uid(), application_id));
CREATE POLICY application_rfis_write ON public.application_rfis FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','edit')
         OR public.has_permission(auth.uid(),'application_management','workflow_action'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'application_management','edit')
              OR public.has_permission(auth.uid(),'application_management','workflow_action'));

DROP POLICY IF EXISTS "Applicants view own RFI items" ON public.application_rfi_items;
DROP POLICY IF EXISTS "Internal manage RFI items" ON public.application_rfi_items;
CREATE POLICY application_rfi_items_read ON public.application_rfi_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.application_rfis r
                   WHERE r.id = application_rfi_items.rfi_id
                     AND public.can_read_application(auth.uid(), r.application_id)));
CREATE POLICY application_rfi_items_write ON public.application_rfi_items FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','edit')
         OR public.has_permission(auth.uid(),'application_management','workflow_action'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'application_management','edit')
              OR public.has_permission(auth.uid(),'application_management','workflow_action'));

DROP POLICY IF EXISTS "Applicants respond to own RFIs" ON public.application_rfi_responses;
DROP POLICY IF EXISTS "Internal view RFI responses" ON public.application_rfi_responses;
CREATE POLICY application_rfi_responses_read ON public.application_rfi_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.application_rfi_items it
                   JOIN public.application_rfis r ON r.id = it.rfi_id
                  WHERE it.id = application_rfi_responses.rfi_item_id
                    AND public.can_read_application(auth.uid(), r.application_id)));
CREATE POLICY application_rfi_responses_write ON public.application_rfi_responses FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'application_management','edit')
    OR public.has_permission(auth.uid(),'application_management','workflow_action')
    OR EXISTS (SELECT 1 FROM public.application_rfi_items it
                 JOIN public.application_rfis r ON r.id = it.rfi_id
                WHERE it.id = application_rfi_responses.rfi_item_id
                  AND public.can_mutate_application(auth.uid(), r.application_id))
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'application_management','edit')
      OR public.has_permission(auth.uid(),'application_management','workflow_action')
      OR EXISTS (SELECT 1 FROM public.application_rfi_items it
                   JOIN public.application_rfis r ON r.id = it.rfi_id
                  WHERE it.id = application_rfi_responses.rfi_item_id
                    AND public.can_mutate_application(auth.uid(), r.application_id))
    )
  );

DROP POLICY IF EXISTS "Admins manage rfi auto rules" ON public.application_rfi_auto_rules;
DROP POLICY IF EXISTS "Authenticated internal can read rfi auto rules" ON public.application_rfi_auto_rules;
CREATE POLICY application_rfi_auto_rules_read ON public.application_rfi_auto_rules FOR SELECT TO authenticated
  USING (NOT public.has_external_role(auth.uid()));
CREATE POLICY application_rfi_auto_rules_write ON public.application_rfi_auto_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'application_management','manage_config'));

DROP POLICY IF EXISTS "Admins manage license action form configs" ON public.license_action_form_configs;
DROP POLICY IF EXISTS "Authenticated read license action form configs" ON public.license_action_form_configs;
CREATE POLICY license_action_form_configs_read ON public.license_action_form_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY license_action_form_configs_write ON public.license_action_form_configs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'application_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'application_management','manage_config'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'applications','application_ai_assessments','application_form_versions',
    'application_rfis','application_rfi_items','application_rfi_responses',
    'application_rfi_auto_rules','license_action_form_configs'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
