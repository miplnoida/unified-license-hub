
INSERT INTO public.permissions (module, name)
  VALUES ('returns_management', 'manage_config')
  ON CONFLICT (module, name) DO NOTHING;

-- return_configs
DROP POLICY IF EXISTS "Admins manage return_configs" ON public.return_configs;
DROP POLICY IF EXISTS "Auth read return_configs" ON public.return_configs;
CREATE POLICY return_configs_read ON public.return_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY return_configs_write ON public.return_configs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_configurations
DROP POLICY IF EXISTS "Admins manage return configs" ON public.return_configurations;
DROP POLICY IF EXISTS "Anyone reads return configs" ON public.return_configurations;
CREATE POLICY return_configurations_read ON public.return_configurations FOR SELECT TO authenticated USING (true);
CREATE POLICY return_configurations_write ON public.return_configurations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_config_forms
DROP POLICY IF EXISTS "Admins manage return_config_forms" ON public.return_config_forms;
DROP POLICY IF EXISTS "Auth read return_config_forms" ON public.return_config_forms;
CREATE POLICY return_config_forms_read ON public.return_config_forms FOR SELECT TO authenticated USING (true);
CREATE POLICY return_config_forms_write ON public.return_config_forms FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_types
DROP POLICY IF EXISTS "Admins manage return_types" ON public.return_types;
DROP POLICY IF EXISTS "Auth read return_types" ON public.return_types;
CREATE POLICY return_types_read ON public.return_types FOR SELECT TO authenticated USING (true);
CREATE POLICY return_types_write ON public.return_types FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_templates
DROP POLICY IF EXISTS "Admins manage return templates" ON public.return_templates;
DROP POLICY IF EXISTS "Anyone reads return templates" ON public.return_templates;
CREATE POLICY return_templates_read ON public.return_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY return_templates_write ON public.return_templates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_cutoff_config
DROP POLICY IF EXISTS "Admins manage cutoff" ON public.return_cutoff_config;
DROP POLICY IF EXISTS "Auth read cutoff" ON public.return_cutoff_config;
CREATE POLICY return_cutoff_config_read ON public.return_cutoff_config FOR SELECT TO authenticated USING (true);
CREATE POLICY return_cutoff_config_write ON public.return_cutoff_config FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_notification_templates
DROP POLICY IF EXISTS "Admins manage notif templates" ON public.return_notification_templates;
DROP POLICY IF EXISTS "Auth read notif templates" ON public.return_notification_templates;
CREATE POLICY return_notification_templates_read ON public.return_notification_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY return_notification_templates_write ON public.return_notification_templates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_validation_rules
DROP POLICY IF EXISTS "admins manage validation rules" ON public.return_validation_rules;
DROP POLICY IF EXISTS "authenticated read active validation rules" ON public.return_validation_rules;
CREATE POLICY return_validation_rules_read ON public.return_validation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY return_validation_rules_write ON public.return_validation_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_validation_rule_versions
DROP POLICY IF EXISTS "auth read rule versions" ON public.return_validation_rule_versions;
CREATE POLICY return_validation_rule_versions_read ON public.return_validation_rule_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY return_validation_rule_versions_write ON public.return_validation_rule_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_due_dates
DROP POLICY IF EXISTS "Admins manage due dates" ON public.return_due_dates;
DROP POLICY IF EXISTS "Users read own due dates" ON public.return_due_dates;
CREATE POLICY return_due_dates_read ON public.return_due_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY return_due_dates_write ON public.return_due_dates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_form_versions
DROP POLICY IF EXISTS "Return owners and internal staff can view version assignments" ON public.return_form_versions;
CREATE POLICY return_form_versions_read ON public.return_form_versions FOR SELECT TO authenticated
  USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_versions_write ON public.return_form_versions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management','manage_config'));

-- return_template_downloads (owner column is downloaded_by)
DROP POLICY IF EXISTS rtd_insert_self ON public.return_template_downloads;
DROP POLICY IF EXISTS rtd_select_owner_or_staff ON public.return_template_downloads;
CREATE POLICY return_template_downloads_read ON public.return_template_downloads FOR SELECT TO authenticated
  USING (
    auth.uid() = downloaded_by
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'returns_management','view_all_entities')
    OR public.has_permission(auth.uid(), 'returns_management','manage_config')
  );
CREATE POLICY return_template_downloads_insert ON public.return_template_downloads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = downloaded_by);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'return_configs','return_configurations','return_config_forms','return_types',
    'return_templates','return_cutoff_config','return_notification_templates',
    'return_validation_rules','return_validation_rule_versions','return_due_dates',
    'return_form_versions','return_template_downloads'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
