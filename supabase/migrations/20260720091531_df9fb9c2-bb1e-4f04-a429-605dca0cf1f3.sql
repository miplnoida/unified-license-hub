
DROP POLICY IF EXISTS "Users manage own returns" ON public.returns_filed;

CREATE POLICY "Internal staff modify returns" ON public.returns_filed
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'analyst'::app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Internal staff update returns" ON public.returns_filed
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'analyst'::app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Internal staff delete returns" ON public.returns_filed
  FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Return creator can view own return" ON public.returns_filed
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);
