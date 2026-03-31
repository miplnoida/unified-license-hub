
-- Fix RLS: Allow applicants to update their own applications when status is resubmission_requested or query_raised
DROP POLICY IF EXISTS "Update apps" ON public.applications;

CREATE POLICY "Update apps" ON public.applications
FOR UPDATE TO authenticated
USING (
  (
    (auth.uid() = applicant_id) 
    AND (status IN ('draft', 'resubmission_requested', 'query_raised'))
  ) 
  OR has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'supervisor'::app_role) 
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
)
WITH CHECK (true);
