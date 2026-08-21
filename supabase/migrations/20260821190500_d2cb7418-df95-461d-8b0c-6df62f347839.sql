INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.sec_roles r
  JOIN public.sec_permissions p ON true
  JOIN public.sec_modules m ON m.id = p.module_id
 WHERE m.key = 'onboarding'
   AND r.key IN ('super_admin','system_administrator','licensing_supervisor','licensing_officer','licensing_analyst','legacy_admin')
   AND (p.key IN ('view','audit_view')
        OR (p.key = 'security_audit_view' AND r.key IN ('super_admin','system_administrator')))
ON CONFLICT DO NOTHING;