-- GAP-3F-001: complaint creator provenance + narrow intake-queue readability.

CREATE OR REPLACE FUNCTION public.set_complaint_internal_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.internal_created_by IS NULL
     AND auth.uid() IS NOT NULL
     AND public.is_internal_staff(auth.uid()) THEN
    NEW.internal_created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_complaint_internal_creator ON public.complaints;
CREATE TRIGGER trg_set_complaint_internal_creator
BEFORE INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.set_complaint_internal_creator();

DROP POLICY IF EXISTS "Read complaints" ON public.complaints;
CREATE POLICY "Read complaints" ON public.complaints
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR auth.uid() = complainant_id
  -- narrow: the internal registrar who created the record may always read it
  OR (internal_created_by IS NOT NULL AND internal_created_by = auth.uid())
  -- narrow: triage/intake owners (holders of the assign capability) may read
  -- the UNASSIGNED intake queue only
  OR (
    investigator_id IS NULL
    AND public.is_internal_staff(auth.uid())
    AND public.has_permission(auth.uid(), 'complaint_management', 'assign')
  )
  OR public.has_scoped_permission(
       auth.uid(), 'complaint_management', 'view', id, license_holder_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = complaints.license_holder_id),
       complainant_id)
);