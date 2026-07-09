DROP POLICY IF EXISTS "Return stakeholders can view revisions" ON public.return_data_revisions;
CREATE POLICY "Return stakeholders can view revisions"
ON public.return_data_revisions
FOR SELECT
TO authenticated
USING (public.can_view_return_filed(auth.uid(), return_data_revisions.return_id));