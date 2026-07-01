
-- ============================================================
-- Audit hardening & coverage completion
-- ============================================================

-- 1. Ensure immutability: revoke UPDATE/DELETE and direct INSERT from client roles.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs','compliance_audit_logs','security_event_logs'] LOOP
    EXECUTE format('REVOKE UPDATE, DELETE ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('REVOKE INSERT ON public.%I FROM anon, authenticated', t);
    -- service_role keeps ALL so SECURITY DEFINER RPCs (owned by postgres) and edge
    -- functions using the service key can still write. Mutation triggers block any
    -- attempted UPDATE/DELETE regardless of role.
  END LOOP;
END$$;

-- 2. Attach generic compliance auto-audit trigger to any missing business tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inspections',
    'document_versions',
    'document_groups',
    'master_data_items',
    'master_data_types',
    'forms',
    'form_versions',
    'approval_workflows',
    'approval_workflow_versions',
    'pre_license_users',
    'notification_dispatch_log',
    'license_renewals',
    'payment_receipts',
    'workflow_instances',
    'return_comments',
    'application_legal_notes',
    'refunds',
    'complaints',
    'enforcement_actions',
    'returns_filed',
    'compliance_returns',
    'license_actions',
    'licenses',
    'applications',
    'payments',
    'approval_actions',
    'user_roles',
    'file_uploads',
    'documents'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_trigger tg
         JOIN pg_class c ON c.oid = tg.tgrelid
         WHERE c.relname = t AND tg.tgname = 'trg_auto_compliance_audit'
       )
    THEN
      EXECUTE format(
        'CREATE TRIGGER trg_auto_compliance_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_auto_compliance_audit()',
        t
      );
    END IF;
  END LOOP;
END$$;

-- 3. Indexes for common filters (guard with IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_cal_created_at ON public.compliance_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_user_created ON public.compliance_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_action ON public.compliance_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_cal_object ON public.compliance_audit_logs (object_type, object_id);

CREATE INDEX IF NOT EXISTS idx_sel_event_time ON public.security_event_logs (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_sel_event_type ON public.security_event_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_sel_user_time ON public.security_event_logs (user_id, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- 4. Unified admin audit timeline view (security_invoker so base-table RLS applies).
DROP VIEW IF EXISTS public.audit_timeline;
CREATE VIEW public.audit_timeline
WITH (security_invoker = true) AS
SELECT
  'compliance'::text                       AS source,
  cal.entry_id                             AS id,
  COALESCE(cal.timestamp, cal.created_at)  AS occurred_at,
  cal.user_id,
  cal.user_role                            AS actor_role,
  cal.action_type::text                    AS action,
  cal.object_type,
  cal.object_id,
  cal.before_value,
  cal.after_value,
  cal.justification,
  cal.ip_address::text                     AS ip_address,
  cal.user_agent,
  cal.metadata
FROM public.compliance_audit_logs cal
UNION ALL
SELECT
  'security'::text                         AS source,
  sel.id,
  COALESCE(sel.event_time, sel.created_at) AS occurred_at,
  sel.user_id,
  sel.user_role                            AS actor_role,
  sel.event_type::text                     AS action,
  COALESCE(sel.target_resource,'security') AS object_type,
  NULL::text                               AS object_id,
  NULL::jsonb                              AS before_value,
  sel.detail                               AS after_value,
  NULL::text                               AS justification,
  sel.ip_address::text                     AS ip_address,
  sel.user_agent,
  sel.metadata
FROM public.security_event_logs sel
UNION ALL
SELECT
  'legacy'::text                           AS source,
  al.id,
  al.created_at                            AS occurred_at,
  al.user_id,
  al.user_role                             AS actor_role,
  al.action                                AS action,
  al.entity_type                           AS object_type,
  al.entity_id                             AS object_id,
  al.old_value                             AS before_value,
  al.new_value                             AS after_value,
  NULL::text                               AS justification,
  NULL::text                               AS ip_address,
  NULL::text                               AS user_agent,
  al.metadata
FROM public.audit_logs al;

GRANT SELECT ON public.audit_timeline TO authenticated;
GRANT ALL    ON public.audit_timeline TO service_role;

-- 5. Add missing SELECT policy on audit_logs if absent (kept from earlier; ensure).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='audit_logs' AND policyname='Admins can read audit logs'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can read audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(),''super_admin''::app_role) OR has_role(auth.uid(),''admin''::app_role))';
  END IF;
END$$;
