-- Auditor persona is read-only oversight: it must be able to read the
-- compliance audit trail through the governed catalogue.
WITH perm AS (
  SELECT p.id FROM public.sec_permissions p
  JOIN public.sec_modules m ON m.id = p.module_id
  WHERE m.key = 'compliance_management' AND p.key IN ('view_audit_logs','view')
)
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, perm.id FROM public.sec_roles r, perm WHERE r.key = 'auditor'
ON CONFLICT DO NOTHING;

WITH perm AS (
  SELECT p.id FROM public.sec_permissions p
  JOIN public.sec_modules m ON m.id = p.module_id
  WHERE m.key = 'compliance_management' AND p.key IN ('view_audit_logs','view')
)
INSERT INTO public.sec_role_template_permissions (template_id, permission_id)
SELECT t.id, perm.id FROM public.sec_role_templates t, perm WHERE t.key = 'auditor'
ON CONFLICT DO NOTHING;

-- Notification event queue visibility moves off the legacy app_role enum onto
-- the canonical notification-administration permission.
DROP POLICY IF EXISTS neq_admin_read ON public.notification_event_queue;
CREATE POLICY neq_governed_read ON public.notification_event_queue
FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'notification_management', 'view')
    OR public.has_permission(auth.uid(), 'compliance_management', 'view_audit_logs')
  )
);