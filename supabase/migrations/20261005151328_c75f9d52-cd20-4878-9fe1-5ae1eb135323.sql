DROP POLICY IF EXISTS sec_crit01_roles_read ON public.roles;
DROP FUNCTION IF EXISTS public.sec_own_role_ids(uuid);
CREATE OR REPLACE FUNCTION public.sec_own_role_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role_id FROM public.user_dynamic_roles WHERE user_id = auth.uid() AND role_id IS NOT NULL
  UNION
  SELECT role_id FROM public.profiles WHERE id = auth.uid() AND role_id IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.sec_own_role_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sec_own_role_ids() TO authenticated;
CREATE POLICY sec_crit01_roles_read ON public.roles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid())
         OR id IN (SELECT public.sec_own_role_ids()));