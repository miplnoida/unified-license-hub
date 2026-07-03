DROP POLICY IF EXISTS "external_complaints_select_capability_gate" ON public.complaints;

CREATE POLICY "external_complaints_select_capability_gate"
  ON public.complaints
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.has_external_role(auth.uid())
    OR complainant_id = auth.uid()
    OR public.external_can_access_complaint(auth.uid(), id, 'can_view_status'::text)
    OR public.external_can_access_complaint(auth.uid(), id, 'can_submit_complaints'::text)
  );