
CREATE POLICY "Complainant insert own complaint evidence"
  ON public.complaint_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_evidence.complaint_id
        AND c.complainant_id = auth.uid()
    )
  );

CREATE POLICY "Complainant read own complaint evidence"
  ON public.complaint_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_evidence.complaint_id
        AND c.complainant_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read own uploads" ON public.file_uploads;
CREATE POLICY "Users read own uploads"
  ON public.file_uploads
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
  );
