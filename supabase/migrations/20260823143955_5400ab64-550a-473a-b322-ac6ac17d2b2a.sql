-- External (licensee) users must not see internal examination records.
-- Their visibility is limited to reports/data requests explicitly issued to them.
DROP POLICY IF EXISTS examinations_read ON public.examinations;
CREATE POLICY examinations_read ON public.examinations
FOR SELECT
USING (
  can_read_examination(auth.uid(), entity_id)
  OR (
    public.has_external_role(auth.uid())
    AND public.can_current_user_access_licensee(entity_id)
    AND EXISTS (
      SELECT 1 FROM public.examination_reports r
      WHERE r.examination_id = examinations.id
        AND r.issued_at IS NOT NULL
    )
  )
);