CREATE POLICY "Applicants can read published application templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND form_type IN ('pre_license', 'application', 'post_license', 'registration')
);