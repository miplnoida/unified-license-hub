-- SEC-CRIT-01A wave 5.
-- Licensee-facing return configuration keeps an ownership-based external branch
-- (external-user RLS invariant): a licensee user sees a return configuration only
-- when it applies to an entity they can access or to a return they can read.
CREATE OR REPLACE FUNCTION public.sec_external_return_config_visible(_config_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.return_configs rc
      JOIN public.licensees l ON l.sector_id = rc.sector_id
      WHERE rc.id = _config_id
        AND public.can_user_access_licensee(auth.uid(), l.id, rc.sector_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.returns_filed rf
      WHERE rf.return_configuration_id = _config_id
        AND public.can_read_return_filed(auth.uid(), rf.id)
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.sec_external_return_config_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sec_external_return_config_visible(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_external_return_form_visible(_form_template_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.return_config_forms f
    WHERE f.form_id = _form_template_id
      AND public.sec_external_return_config_visible(f.return_configuration_id)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.sec_external_return_form_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sec_external_return_form_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS return_configs_read ON public.return_configs;
CREATE POLICY sec_crit01_scoped_read ON public.return_configs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid())
         OR public.sec_external_return_config_visible(id));

DROP POLICY IF EXISTS return_config_forms_read ON public.return_config_forms;
CREATE POLICY sec_crit01_scoped_read ON public.return_config_forms FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid())
         OR public.sec_external_return_config_visible(return_configuration_id));

DROP POLICY IF EXISTS rfvr_read_authenticated ON public.return_form_validation_rules;
CREATE POLICY sec_crit01_scoped_read ON public.return_form_validation_rules FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid())
         OR public.sec_external_return_form_visible(form_template_id));

-- Internal-only configuration (all browser consumers are internal/admin screens; edge uses service_role).
DROP POLICY IF EXISTS fp_screening_configs_read ON public.fp_screening_configs;
DROP POLICY IF EXISTS fp_screening_execution_rules_read ON public.fp_screening_execution_rules;
DROP POLICY IF EXISTS fp_sector_decision_rules_read ON public.fp_sector_decision_rules;
DROP POLICY IF EXISTS ger_read ON public.group_ewi_rules;
DROP POLICY IF EXISTS license_action_form_configs_read ON public.license_action_form_configs;
DROP POLICY IF EXISTS llc_read ON public.license_lifecycle_configs;
DROP POLICY IF EXISTS "Authenticated read notification templates" ON public.notification_templates;
DROP POLICY IF EXISTS "Anyone reads permission_modules" ON public.permission_modules;
CREATE POLICY sec_crit01_internal_read ON public.fp_screening_configs FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.fp_screening_execution_rules FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.fp_sector_decision_rules FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.group_ewi_rules FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.license_action_form_configs FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.license_lifecycle_configs FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.notification_templates FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.permission_modules FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));