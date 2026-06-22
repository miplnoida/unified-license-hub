DROP POLICY IF EXISTS "external_applications_select_capability_gate" ON public.applications;

CREATE POLICY "external_applications_select_capability_gate"
ON public.applications
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  (NOT public.has_external_role(auth.uid()))
  OR (
    applicant_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'applicant'::public.app_role)
      OR public.has_role(auth.uid(), 'pre_licensee'::public.app_role)
      OR public.has_role(auth.uid(), 'licensee_primary'::public.app_role)
      OR public.has_role(auth.uid(), 'licensee_secondary'::public.app_role)
    )
  )
  OR public.external_can_access_application(auth.uid(), id, 'can_view_status'::text)
);