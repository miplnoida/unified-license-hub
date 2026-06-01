DROP POLICY IF EXISTS "Internal staff can insert remarks" ON public.payment_remarks;
DROP POLICY IF EXISTS "Author or admin can update remarks" ON public.payment_remarks;
DROP POLICY IF EXISTS "Author or admin can delete remarks" ON public.payment_remarks;

CREATE POLICY "Internal staff can insert remarks"
ON public.payment_remarks FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.is_internal_staff_user(auth.uid())
);

CREATE POLICY "Author or admin can update remarks"
ON public.payment_remarks FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Author or admin can delete remarks"
ON public.payment_remarks FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);