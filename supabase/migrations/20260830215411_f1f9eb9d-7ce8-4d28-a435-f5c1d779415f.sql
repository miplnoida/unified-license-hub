DROP POLICY IF EXISTS compliance_audit_logs_read ON public.compliance_audit_logs;
CREATE POLICY compliance_audit_logs_read ON public.compliance_audit_logs
FOR SELECT
USING (
  (NOT (SELECT public.has_external_role(auth.uid())))
  AND (
    (SELECT public.is_super_admin(auth.uid()))
    OR (SELECT public.has_permission(auth.uid(), 'compliance_management', 'view_audit_logs'))
    OR (SELECT public.has_permission(auth.uid(), 'compliance_management', 'view_all_entities'))
  )
);