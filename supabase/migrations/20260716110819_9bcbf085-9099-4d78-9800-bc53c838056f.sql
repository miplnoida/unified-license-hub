CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p         ON p.id = rp.permission_id
      JOIN public.permission_actions pa ON pa.id = p.action_id
      JOIN public.permission_modules pm ON pm.id = pa.module_id
      JOIN public.user_dynamic_roles udr ON udr.role_id = rp.role_id
      WHERE udr.user_id = _user_id
        AND pm.key = 'complaint_management'
        AND pa.key = _action
    );
$$;