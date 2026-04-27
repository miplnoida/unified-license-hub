-- Downgrade users who have a custom (non-system) dynamic role but were
-- granted elevated app_role (admin/super_admin) due to the previous bug.
UPDATE public.user_roles ur
SET role = 'analyst'::public.app_role
FROM public.profiles p
LEFT JOIN public.roles r ON r.id = p.role_id
WHERE ur.user_id = p.id
  AND p.role_id IS NOT NULL
  AND COALESCE(r.is_system, false) = false
  AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role);

UPDATE public.profiles p
SET role = 'analyst'
FROM public.roles r
WHERE r.id = p.role_id
  AND COALESCE(r.is_system, false) = false
  AND p.role IN ('admin', 'super_admin');