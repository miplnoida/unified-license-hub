INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.sec_roles r
  JOIN public.sec_permissions p ON p.key = 'policy_approve'
  JOIN public.sec_modules m ON m.id = p.module_id AND m.key = 'aml_supervision'
 WHERE r.key = 'aml_head'
ON CONFLICT DO NOTHING;