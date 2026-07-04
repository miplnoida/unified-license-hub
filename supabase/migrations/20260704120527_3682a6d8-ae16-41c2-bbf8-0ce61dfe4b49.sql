
CREATE POLICY "Internal staff can read profiles for triage"
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'licensing_officer'::app_role)
  OR has_role(auth.uid(),'analyst'::app_role) OR has_role(auth.uid(),'legal_compliance'::app_role)
);

CREATE POLICY "Internal staff can read pre_license_users for triage"
ON public.pre_license_users FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'licensing_officer'::app_role)
  OR has_role(auth.uid(),'analyst'::app_role) OR has_role(auth.uid(),'legal_compliance'::app_role)
);
