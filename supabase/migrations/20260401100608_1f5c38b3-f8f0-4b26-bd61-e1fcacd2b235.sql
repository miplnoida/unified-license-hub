
DROP POLICY IF EXISTS "Submitters update draft returns" ON public.compliance_returns;
CREATE POLICY "Submitters update draft returns"
ON public.compliance_returns
FOR UPDATE
TO authenticated
USING (
  ((auth.uid() = submitter_id) AND (status = ANY (ARRAY['pending'::text, 'draft'::text, 'resubmission_requested'::text])))
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (true);
