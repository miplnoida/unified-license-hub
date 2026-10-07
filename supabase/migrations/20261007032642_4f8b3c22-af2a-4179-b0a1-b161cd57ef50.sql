CREATE OR REPLACE FUNCTION public.sec_has_permission(p_user_id uuid, p_module text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.sec_user_roles ur
      JOIN public.sec_roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_user_id AND ur.status = 'active' AND r.is_break_glass
    )
    OR EXISTS (
      SELECT 1
      FROM public.sec_user_roles ur
      JOIN public.sec_roles r ON r.id = ur.role_id AND r.status = 'active'
      JOIN public.sec_role_permissions rp ON rp.role_id = r.id
      JOIN public.sec_permissions p ON p.id = rp.permission_id AND p.is_active
      JOIN public.sec_modules m ON m.id = p.module_id AND m.is_active
      WHERE ur.user_id = p_user_id
        AND ur.status = 'active'
        AND (ur.effective_from IS NULL OR ur.effective_from <= now())
        AND (ur.effective_until IS NULL OR ur.effective_until > now())
        AND m.key = lower(regexp_replace(coalesce(p_module,''), '\s+', '_', 'g'))
        AND p.key = lower(trim(coalesce(p_action,'')))
    );
$function$;