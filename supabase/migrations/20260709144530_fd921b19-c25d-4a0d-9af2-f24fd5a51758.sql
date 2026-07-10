DROP POLICY IF EXISTS "Staff can insert internal complaints" ON public.complaints;

CREATE POLICY "Internal staff can insert internal complaints"
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'analyst'::public.app_role)
    OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

DROP POLICY IF EXISTS "external_complaints_insert_capability_gate" ON public.complaints;

CREATE POLICY "external_complaints_insert_capability_gate"
  ON public.complaints
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'analyst'::public.app_role)
    OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
    OR (
      NOT public.has_external_role(auth.uid())
      OR public.external_can_access_complaint_values(
        auth.uid(),
        complainant_id,
        license_holder_id,
        'can_submit_complaints'::text
      )
    )
  );