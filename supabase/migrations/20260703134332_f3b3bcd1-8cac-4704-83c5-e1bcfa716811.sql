
INSERT INTO public.permissions (module, name, description)
SELECT m, a, a || ' ' || m FROM (VALUES
  ('fit_and_proper','view'), ('fit_and_proper','create'), ('fit_and_proper','update'), ('fit_and_proper','delete'), ('fit_and_proper','admin'),
  ('coordination','view'), ('coordination','create'), ('coordination','update'), ('coordination','delete'), ('coordination','admin')
) AS t(m,a)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.module=t.m AND p.name=t.a);

-- Full access roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('Super Admin','System Administrator','Executive Supervisor')
  AND p.module IN ('fit_and_proper','coordination')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);

-- Operational roles: view/create/update
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN (
    'Prudential Supervisor','Market Conduct Supervisor','Committee Member',
    'Legal/Compliance Reviewer','Licensing Officer','Licensing Supervisor','F&P Assessor'
  )
  AND p.module IN ('fit_and_proper','coordination')
  AND p.name IN ('view','create','update')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);
