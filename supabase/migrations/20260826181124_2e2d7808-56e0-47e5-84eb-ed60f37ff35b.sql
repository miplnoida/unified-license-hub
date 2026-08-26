INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, pm.id
  FROM public.sec_roles r
  JOIN public.sec_permissions pm ON pm.key = 'approve'
  JOIN public.sec_modules m ON m.id = pm.module_id AND m.key = 'market_conduct'
 WHERE r.key = 'conduct_supervisor'
   AND NOT EXISTS (
     SELECT 1 FROM public.sec_role_permissions x
      WHERE x.role_id = r.id AND x.permission_id = pm.id);