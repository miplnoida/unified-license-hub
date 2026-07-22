
-- Seed Admin Dashboard as a first-class permission module so the sidebar and
-- route guards can gate the Admin Control Panel on `admin_dashboard.view`
-- instead of hard-coded role names. Also backfill the permission to every
-- role that already carries `settings.view` (Legacy Admin + templates) so
-- existing admins keep their menu after the switch.

INSERT INTO public.permission_modules (key, label, description, audience, is_system, sort_order)
SELECT 'admin_dashboard', 'Admin Dashboard', 'Access the Administration Control Panel and admin landing page.', 'internal', true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.permission_modules WHERE key = 'admin_dashboard');

INSERT INTO public.permissions (module, name, description, enforced)
SELECT 'admin_dashboard', 'view', 'View the Admin Control Panel.', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions WHERE module = 'admin_dashboard' AND name = 'view'
);

-- Backfill: any role that has settings.view should also see the admin
-- landing page. This preserves current behaviour for Legacy Admin.
WITH src AS (
  SELECT id AS perm_id FROM public.permissions
  WHERE module = 'settings' AND name = 'view'
), tgt AS (
  SELECT id AS perm_id FROM public.permissions
  WHERE module = 'admin_dashboard' AND name = 'view'
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, (SELECT perm_id FROM tgt)
FROM public.role_permissions rp
WHERE rp.permission_id = (SELECT perm_id FROM src)
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = rp.role_id
      AND rp2.permission_id = (SELECT perm_id FROM tgt)
  );

-- Same treatment for role_management.view_coverage: ensure any role that
-- already administers role_management (has role_management.edit) receives the
-- coverage-diagnostic permission so the Permission Coverage menu appears for
-- them and not just super_admin.
WITH src AS (
  SELECT id AS perm_id FROM public.permissions
  WHERE module = 'role_management' AND name = 'edit'
), tgt AS (
  SELECT id AS perm_id FROM public.permissions
  WHERE module = 'role_management' AND name = 'view_coverage'
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, (SELECT perm_id FROM tgt)
FROM public.role_permissions rp
WHERE rp.permission_id = (SELECT perm_id FROM src)
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = rp.role_id
      AND rp2.permission_id = (SELECT perm_id FROM tgt)
  );
