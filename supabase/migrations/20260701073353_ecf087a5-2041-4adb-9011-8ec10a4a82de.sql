
-- 1. Grants for Data API visibility
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

GRANT SELECT, INSERT ON public.compliance_audit_logs TO authenticated;
GRANT ALL ON public.compliance_audit_logs TO service_role;

GRANT SELECT, INSERT ON public.security_event_logs TO authenticated;
GRANT ALL ON public.security_event_logs TO service_role;

-- 2. Role column
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_role text;

-- 3. Immutability: block UPDATE and DELETE for everyone including service_role
CREATE OR REPLACE FUNCTION public.audit_logs_prevent_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_prevent_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_prevent_mutation();

REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon;

-- 4. Update log_self_audit to capture caller's role automatically
CREATE OR REPLACE FUNCTION public.log_self_audit(
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role::text INTO v_role
    FROM public.user_roles
   WHERE user_id = v_uid
   ORDER BY
     CASE role::text
       WHEN 'super_admin' THEN 1
       WHEN 'admin' THEN 2
       WHEN 'moderator' THEN 3
       ELSE 9
     END
   LIMIT 1;

  INSERT INTO public.audit_logs
    (user_id, user_role, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES
    (v_uid, v_role, _action, _entity_type, _entity_id, _old_value, _new_value, _metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
