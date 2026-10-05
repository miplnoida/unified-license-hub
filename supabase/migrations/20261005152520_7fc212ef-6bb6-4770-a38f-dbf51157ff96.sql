-- SEC-CRIT-01A wave 4: nine more findings promoted by the scanner.
-- otp_verifications: only written by edge functions (service_role); the client insert rule is unreachable and unchecked.
DROP POLICY IF EXISTS "Public insert OTP" ON public.otp_verifications;

-- RBAC / navigation / scope catalogues: read by role administration and through the
-- privileged sec_get_user_context routine; no external-user browser consumer.
DROP POLICY IF EXISTS "Anyone reads permission_actions" ON public.permission_actions;
DROP POLICY IF EXISTS pda_read_all ON public.permission_dependent_actions;
DROP POLICY IF EXISTS sec_modules_read ON public.sec_modules;
DROP POLICY IF EXISTS sec_navigation_read ON public.sec_navigation_items;
DROP POLICY IF EXISTS sec_scope_types_read ON public.sec_scope_types;
DROP POLICY IF EXISTS "Authenticated read SLA configs" ON public.sla_configurations;
DROP POLICY IF EXISTS "Authenticated read escalation tiers" ON public.sla_escalation_tiers;
DROP POLICY IF EXISTS "programme vocabulary is readable by signed-in staff" ON public.supervisory_assessment_programme_vocabulary;

CREATE POLICY sec_crit01_internal_read ON public.permission_actions FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.permission_dependent_actions FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.sec_modules FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.sec_navigation_items FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.sec_scope_types FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.sla_configurations FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.sla_escalation_tiers FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.supervisory_assessment_programme_vocabulary FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
REVOKE SELECT ON public.permission_actions, public.permission_dependent_actions, public.sec_modules, public.sec_navigation_items, public.sec_scope_types, public.supervisory_assessment_programme_vocabulary FROM anon;