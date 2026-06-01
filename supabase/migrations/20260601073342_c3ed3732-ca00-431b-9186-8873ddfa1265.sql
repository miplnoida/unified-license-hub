DROP POLICY IF EXISTS "Update apps" ON public.applications;

CREATE POLICY "Update apps" ON public.applications
FOR UPDATE
USING (
  (
    (auth.uid() = applicant_id)
    AND (status = ANY (ARRAY['draft','in_progress','resubmission_requested','query_raised']))
  )
  OR (
    (user_licensee_id(auth.uid()) IS NOT NULL)
    AND (id IN (SELECT application_ids_for_licensee(user_licensee_id(auth.uid()))))
    AND (status = ANY (ARRAY['draft','in_progress','resubmission_requested','query_raised']))
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
)
WITH CHECK (
  (
    (auth.uid() = applicant_id)
    AND (status = ANY (ARRAY['draft','in_progress','resubmission_requested','query_raised']))
  )
  OR (
    (user_licensee_id(auth.uid()) IS NOT NULL)
    AND (id IN (SELECT application_ids_for_licensee(user_licensee_id(auth.uid()))))
    AND (status = ANY (ARRAY['draft','in_progress','resubmission_requested','query_raised']))
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
);