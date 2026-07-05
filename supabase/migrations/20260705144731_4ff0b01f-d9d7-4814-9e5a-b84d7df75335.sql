
-- 1. site_settings
DROP POLICY IF EXISTS "Anyone can read site_settings" ON public.site_settings;

CREATE POLICY "Public read non-sensitive site_settings"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (key NOT IN ('email_sms_settings'));

CREATE POLICY "Admins read all site_settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. inspection_findings
DROP POLICY IF EXISTS "Staff can read inspection findings" ON public.inspection_findings;
DROP POLICY IF EXISTS "Staff can insert inspection findings" ON public.inspection_findings;
DROP POLICY IF EXISTS "Staff can update inspection findings" ON public.inspection_findings;
DROP POLICY IF EXISTS "Staff can delete inspection findings" ON public.inspection_findings;

CREATE POLICY "Internal staff read inspection findings"
  ON public.inspection_findings FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR has_role(auth.uid(), 'legal_compliance'::app_role)
  );

CREATE POLICY "Internal staff insert inspection findings"
  ON public.inspection_findings FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Internal staff update inspection findings"
  ON public.inspection_findings FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Internal staff delete inspection findings"
  ON public.inspection_findings FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );

-- 3. return_threshold_breaches
DROP POLICY IF EXISTS "Staff can update breaches" ON public.return_threshold_breaches;

CREATE POLICY "Internal staff update breaches"
  ON public.return_threshold_breaches FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
  );

-- 4. sufficiency_evaluations
DROP POLICY IF EXISTS "Internal insert evaluations" ON public.sufficiency_evaluations;
DROP POLICY IF EXISTS "Internal read evaluations" ON public.sufficiency_evaluations;

CREATE POLICY "Internal staff insert evaluations"
  ON public.sufficiency_evaluations FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Read own or internal evaluations"
  ON public.sufficiency_evaluations FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR has_role(auth.uid(), 'legal_compliance'::app_role)
    OR application_id IN (SELECT id FROM public.applications WHERE applicant_id = auth.uid())
  );

-- 5. sufficiency_evaluation_results
DROP POLICY IF EXISTS "Internal insert results" ON public.sufficiency_evaluation_results;
DROP POLICY IF EXISTS "Internal read results" ON public.sufficiency_evaluation_results;

CREATE POLICY "Internal staff insert results"
  ON public.sufficiency_evaluation_results FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Read own or internal results"
  ON public.sufficiency_evaluation_results FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR has_role(auth.uid(), 'legal_compliance'::app_role)
    OR evaluation_id IN (
      SELECT se.id FROM public.sufficiency_evaluations se
      JOIN public.applications a ON a.id = se.application_id
      WHERE a.applicant_id = auth.uid()
    )
  );

-- 6. sectors
DROP POLICY IF EXISTS "Anyone can insert sectors" ON public.sectors;
DROP POLICY IF EXISTS "Anyone can update sectors" ON public.sectors;
DROP POLICY IF EXISTS "Anyone can delete sectors" ON public.sectors;

CREATE POLICY "Admins insert sectors"
  ON public.sectors FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update sectors"
  ON public.sectors FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete sectors"
  ON public.sectors FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
