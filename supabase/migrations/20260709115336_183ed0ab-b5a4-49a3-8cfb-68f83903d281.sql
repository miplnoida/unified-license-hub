DROP POLICY IF EXISTS "Licensee viewers read return_form_data" ON public.return_form_data;

CREATE POLICY "Return viewers read return_form_data"
  ON public.return_form_data FOR SELECT
  USING (public.can_view_return_filed(auth.uid(), return_id));

GRANT SELECT ON public.return_form_data TO authenticated;