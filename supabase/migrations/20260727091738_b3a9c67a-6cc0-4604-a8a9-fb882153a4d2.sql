CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH aliased AS (
    SELECT CASE
             WHEN _action = 'view_all' THEN ARRAY['view']
             WHEN _action = 'triage'   THEN ARRAY['assign','edit','investigate']
             ELSE ARRAY[_action]
           END AS actions
  )
  SELECT
    public.has_role(_user_id, 'super_admin')
    OR public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p         ON p.id = rp.permission_id
      JOIN public.permission_actions pa ON pa.id = p.action_id
      JOIN public.permission_modules pm ON pm.id = pa.module_id
      JOIN public.user_dynamic_roles udr ON udr.role_id = rp.role_id
      CROSS JOIN aliased a
      WHERE udr.user_id = _user_id
        AND pm.key = 'complaint_management'
        AND pa.key = ANY (a.actions)
    );
$function$;

UPDATE public.roles r
   SET scope_config = COALESCE(r.scope_config, '{}'::jsonb)
                      || jsonb_build_object('complaint_management', jsonb_build_object('scope','all')),
       updated_at = now()
 WHERE r.status = 'active'
   AND (r.scope_config IS NULL OR NOT (r.scope_config ? 'complaint_management'))
   AND EXISTS (
     SELECT 1 FROM public.role_permissions rp
     JOIN public.permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = r.id
       AND p.module = 'complaint_management'
       AND p.name = 'view'
   );