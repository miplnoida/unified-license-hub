-- SEC-CRIT-01A wave 3: scanner re-triage promoted 8 more configuration tables to critical.
-- All browser consumers are internal screens; edge functions use service_role.
DROP POLICY IF EXISTS app_environment_config_read_authenticated ON public.app_environment_config;
CREATE POLICY sec_crit01_security_admin_read ON public.app_environment_config FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS prudential_ratio_versions_read ON public.prudential_ratio_versions;
DROP POLICY IF EXISTS prudential_ratios_read ON public.prudential_ratios;
DROP POLICY IF EXISTS prudential_risk_taxonomy_read ON public.prudential_risk_taxonomy;
DROP POLICY IF EXISTS prudential_stress_indicators_read ON public.prudential_stress_indicators;
DROP POLICY IF EXISTS prudential_threshold_versions_read ON public.prudential_threshold_versions;
DROP POLICY IF EXISTS "report_runtime_config read" ON public.report_runtime_config;
DROP POLICY IF EXISTS "Authenticated read risk ratings" ON public.risk_ratings;

CREATE POLICY sec_crit01_internal_read ON public.prudential_ratio_versions FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.prudential_ratios FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.prudential_risk_taxonomy FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.prudential_stress_indicators FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.prudential_threshold_versions FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.report_runtime_config FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.risk_ratings FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));