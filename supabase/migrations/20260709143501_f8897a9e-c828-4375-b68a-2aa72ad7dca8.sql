DROP POLICY IF EXISTS "Staff can insert internal complaints" ON public.complaints;
CREATE POLICY "Staff can insert internal complaints"
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );