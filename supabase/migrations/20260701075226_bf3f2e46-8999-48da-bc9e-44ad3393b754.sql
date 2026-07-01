
-- =========================================================
-- Audit hardening migration
-- =========================================================

-- 1. Additive columns
ALTER TABLE public.compliance_audit_logs
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE public.security_event_logs
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 2. Immutability trigger (shared)
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log rows are immutable (table=%, op=%)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs','compliance_audit_logs','security_event_logs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_mutation ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_prevent_mutation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation()', t);
  END LOOP;
END $$;

-- 3. Revoke UPDATE/DELETE and client INSERT; keep SELECT for admin RLS
REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.compliance_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.security_event_logs FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.compliance_audit_logs FROM anon, authenticated;
REVOKE INSERT ON public.security_event_logs FROM anon, authenticated;
REVOKE INSERT ON public.audit_logs FROM anon, authenticated;

-- Drop now-redundant client insert policies (RPCs remain the only write path)
DROP POLICY IF EXISTS cal_self_insert ON public.compliance_audit_logs;
DROP POLICY IF EXISTS sel_self_insert ON public.security_event_logs;
DROP POLICY IF EXISTS sel_anon_insert ON public.security_event_logs;

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.compliance_audit_logs TO authenticated;
GRANT SELECT ON public.security_event_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
GRANT ALL ON public.compliance_audit_logs TO service_role;
GRANT ALL ON public.security_event_logs TO service_role;

-- 4. Helper: resolve highest role for a user
CREATE OR REPLACE FUNCTION public.resolve_actor_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role::text
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'supervisor' THEN 3
    WHEN 'licensing_officer' THEN 4
    WHEN 'legal_compliance' THEN 5
    WHEN 'analyst' THEN 6
    WHEN 'licensee_primary' THEN 7
    WHEN 'licensee_secondary' THEN 8
    WHEN 'pre_licensee' THEN 9
    WHEN 'applicant' THEN 10
    ELSE 99
  END
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_actor_role(uuid) TO authenticated, service_role;

-- 5. Rewrite log_compliance_audit (server stamps identity/timestamp; validates OVERRIDE justification)
DROP FUNCTION IF EXISTS public.log_compliance_audit(compliance_audit_action, text, text, jsonb, jsonb, text, text, text);
CREATE OR REPLACE FUNCTION public.log_compliance_audit(
  _action_type compliance_audit_action,
  _object_type text,
  _object_id text DEFAULT NULL,
  _before_value jsonb DEFAULT NULL,
  _after_value jsonb DEFAULT NULL,
  _justification text DEFAULT NULL,
  _ai_model_version text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.resolve_actor_role(auth.uid());
  v_id uuid;
BEGIN
  IF _action_type = 'OVERRIDE'::compliance_audit_action
     AND (_justification IS NULL OR length(btrim(_justification)) < 10) THEN
    RAISE EXCEPTION 'Override actions require a justification of at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.compliance_audit_logs (
    timestamp, user_id, user_role, action_type, object_type, object_id,
    before_value, after_value, justification, ai_model_version,
    ip_address, user_agent, metadata, created_at
  ) VALUES (
    now(), v_user, v_role, _action_type, _object_type, _object_id,
    _before_value, _after_value, _justification, _ai_model_version,
    NULLIF(_ip_address,'')::inet, NULLIF(_metadata->>'user_agent',''),
    COALESCE(_metadata, '{}'::jsonb), now()
  )
  RETURNING entry_id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_compliance_audit(compliance_audit_action, text, text, jsonb, jsonb, text, text, text, jsonb) TO authenticated, service_role;

-- 6. Rewrite log_security_event
DROP FUNCTION IF EXISTS public.log_security_event(security_event_type, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type security_event_type,
  _target_resource text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _detail jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.resolve_actor_role(auth.uid());
  v_id uuid;
BEGIN
  INSERT INTO public.security_event_logs (
    event_time, user_id, user_role, event_type, ip_address,
    user_agent, target_resource, detail, metadata, created_at
  ) VALUES (
    now(), v_user, v_role, _event_type, NULLIF(_ip_address,'')::inet,
    _user_agent, _target_resource, _detail, COALESCE(_metadata, '{}'::jsonb), now()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_security_event(security_event_type, text, text, text, jsonb, jsonb) TO authenticated, service_role;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_cal_created_at ON public.compliance_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_user ON public.compliance_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_action ON public.compliance_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_cal_object ON public.compliance_audit_logs (object_type, object_id);

CREATE INDEX IF NOT EXISTS idx_sel_created_at ON public.security_event_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_event ON public.security_event_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_sel_user ON public.security_event_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- 8. Unified timeline view
CREATE OR REPLACE VIEW public.audit_timeline
WITH (security_invoker=on) AS
SELECT
  'compliance'::text AS source,
  cal.entry_id AS id,
  cal.created_at AS occurred_at,
  cal.user_id,
  cal.user_role AS actor_role,
  cal.action_type::text AS action,
  cal.object_type,
  cal.object_id,
  cal.before_value,
  cal.after_value,
  cal.justification,
  cal.ip_address::text AS ip_address,
  cal.metadata
FROM public.compliance_audit_logs cal
UNION ALL
SELECT
  'security'::text,
  sel.id,
  sel.created_at,
  sel.user_id,
  sel.user_role,
  sel.event_type::text,
  'security_event'::text,
  sel.target_resource,
  NULL::jsonb,
  sel.detail,
  NULL::text,
  sel.ip_address::text,
  sel.metadata
FROM public.security_event_logs sel
UNION ALL
SELECT
  'legacy'::text,
  al.id,
  al.created_at,
  al.user_id,
  al.user_role,
  al.action,
  al.entity_type,
  al.entity_id,
  al.old_value,
  al.new_value,
  NULL::text,
  NULL::text,
  al.metadata
FROM public.audit_logs al;

GRANT SELECT ON public.audit_timeline TO authenticated, service_role;

-- 9. Generic auto-audit trigger for state-changing tables
CREATE OR REPLACE FUNCTION public.tg_auto_compliance_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action compliance_audit_action;
  v_before jsonb;
  v_after jsonb;
  v_object_id text;
  v_user uuid := auth.uid();
  v_role text := public.resolve_actor_role(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE'::compliance_audit_action;
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_object_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'entry_id'));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Map status transitions to APPROVE/REJECT/WORKFLOW_TRANSITION when possible
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_object_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'entry_id'));
    IF v_after ? 'status' AND v_before->>'status' IS DISTINCT FROM v_after->>'status' THEN
      IF v_after->>'status' ILIKE '%approved%' THEN v_action := 'APPROVE';
      ELSIF v_after->>'status' ILIKE '%reject%' OR v_after->>'status' ILIKE '%denied%' THEN v_action := 'REJECT';
      ELSE v_action := 'WORKFLOW_TRANSITION';
      END IF;
    ELSE
      v_action := 'UPDATE';
    END IF;
  ELSE -- DELETE
    v_action := 'DELETE'::compliance_audit_action;
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_object_id := COALESCE((to_jsonb(OLD)->>'id'), (to_jsonb(OLD)->>'entry_id'));
  END IF;

  BEGIN
    INSERT INTO public.compliance_audit_logs (
      timestamp, user_id, user_role, action_type, object_type, object_id,
      before_value, after_value, metadata, created_at
    ) VALUES (
      now(), v_user, v_role, v_action, TG_TABLE_NAME, v_object_id,
      v_before, v_after,
      jsonb_build_object('source','trigger','schema',TG_TABLE_SCHEMA,'op',TG_OP),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the underlying transaction due to audit issues
    RAISE WARNING 'auto audit failed for %.%: %', TG_TABLE_SCHEMA, TG_TABLE_NAME, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to key tables (idempotent)
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'applications','licenses','license_renewals','license_actions','enforcement_actions',
  'payments','refunds','approval_actions','complaints','compliance_returns',
  'returns_filed','user_roles'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_audit ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_auto_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_auto_compliance_audit()', t);
    END IF;
  END LOOP;
END $$;
