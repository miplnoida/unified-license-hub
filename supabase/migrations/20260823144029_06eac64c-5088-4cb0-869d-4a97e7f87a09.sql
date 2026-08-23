CREATE OR REPLACE FUNCTION public.examination_has_issued_report(_examination_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.examination_reports r
    WHERE r.examination_id = _examination_id
      AND r.issued_at IS NOT NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.examination_has_issued_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_has_issued_report(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS examinations_read ON public.examinations;
CREATE POLICY examinations_read ON public.examinations
FOR SELECT
USING (
  can_read_examination(auth.uid(), entity_id)
  OR (
    public.has_external_role(auth.uid())
    AND public.can_current_user_access_licensee(entity_id)
    AND public.examination_has_issued_report(examinations.id)
  )
);