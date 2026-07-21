-- ============================================================
-- Slice 1 — Critical backend RBAC lockdown
--  * search_path pin for 6 SECURITY DEFINER functions
--  * register audit_management / security_management / admin_dashboard /
--    notification_management / ai_management permissions
--  * explicit storage policies for the private `audit-exports` bucket
-- ============================================================

-- 1. Pin search_path on the 6 flagged SECURITY DEFINER functions
ALTER FUNCTION public.generate_receipt_number()          SET search_path = public;
ALTER FUNCTION public.generate_return_unique_id()        SET search_path = public;
ALTER FUNCTION public.generate_complaint_number()        SET search_path = public;
ALTER FUNCTION public.generate_registration_reference()  SET search_path = public;
ALTER FUNCTION public.generate_license_number()          SET search_path = public;
ALTER FUNCTION public.generate_application_number()      SET search_path = public;

-- 2. Register new permission modules + actions used by later slices.
--    Idempotent: safe to re-run.
INSERT INTO public.permission_modules (key, label, description, sort_order, is_system, audience)
VALUES
  ('audit_management',        'Audit Management',        'Audit log viewing and exports',           910, true, 'internal'),
  ('security_management',     'Security Management',     'Security event logs and breakglass',       911, true, 'internal'),
  ('admin_dashboard',         'Admin Dashboard',         'Administration hub tiles and KPIs',        100, true, 'internal'),
  ('notification_management', 'Notification Management', 'Manual notification and email dispatch',   920, true, 'internal'),
  ('ai_management',           'AI Management',           'AI analysis and consolidated report runs', 930, true, 'internal')
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_system = true;

INSERT INTO public.permission_actions (module_id, key, label, sort_order, is_system, audience)
SELECT m.id, a.key, a.label, a.sort_order, true, 'internal'
FROM public.permission_modules m
JOIN (VALUES
  ('audit_management',        'view',     'View Audit Logs',         10),
  ('audit_management',        'export',   'Export Audit Logs',       20),
  ('security_management',     'view',     'View Security Events',    10),
  ('admin_dashboard',         'view',     'View Admin Hub',          10),
  ('notification_management', 'view',     'View Notifications',      10),
  ('notification_management', 'dispatch', 'Dispatch Notifications',  20),
  ('ai_management',           'view',     'View AI Panels',          10),
  ('ai_management',           'execute',  'Run AI / Consolidated',   20),
  ('report_management',       'export',   'Export Reports',          30)
) AS a(module_key, key, label, sort_order) ON a.module_key = m.key
ON CONFLICT (module_id, key) DO NOTHING;

INSERT INTO public.permissions (module, name, description, action_id, enforced)
SELECT m.key, m.key || '.' || a.key,
       a.label || ' (' || m.label || ')',
       a.id, true
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key IN ('audit_management','security_management','admin_dashboard',
                'notification_management','ai_management','report_management')
  AND a.key IN ('view','export','dispatch','execute')
ON CONFLICT (module, name) DO UPDATE SET action_id = EXCLUDED.action_id;

-- 3. Storage policies for the `audit-exports` bucket.
--    Reads require audit_management.export; writes/updates/deletes are
--    service-role only (the audit-export edge function uses the service key).

-- Drop any pre-existing policies with our names so this migration is idempotent.
DROP POLICY IF EXISTS "audit_exports_select_permitted" ON storage.objects;
DROP POLICY IF EXISTS "audit_exports_service_write"    ON storage.objects;
DROP POLICY IF EXISTS "audit_exports_service_update"   ON storage.objects;
DROP POLICY IF EXISTS "audit_exports_service_delete"   ON storage.objects;

CREATE POLICY "audit_exports_select_permitted"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audit-exports'
    AND public.has_permission(auth.uid(), 'audit_management', 'export')
  );

CREATE POLICY "audit_exports_service_write"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'audit-exports');

CREATE POLICY "audit_exports_service_update"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'audit-exports')
  WITH CHECK (bucket_id = 'audit-exports');

CREATE POLICY "audit_exports_service_delete"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'audit-exports');