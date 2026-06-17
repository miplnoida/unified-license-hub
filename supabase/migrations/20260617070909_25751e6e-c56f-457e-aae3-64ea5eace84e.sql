
-- =========================================================
-- Compliance Audit Logs (immutable legal-grade audit trail)
-- =========================================================

DO $$ BEGIN
  CREATE TYPE public.compliance_audit_action AS ENUM (
    'CREATE','UPDATE','DELETE','APPROVE','REJECT','OVERRIDE','EXPORT',
    'ACCESS_DENIED','WORKFLOW_TRANSITION','NOTIFICATION_SENT',
    'INTEGRATION_EVENT','LOGIN','LOGOUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.security_event_type AS ENUM (
    'ACCESS_DENIED','AUTH_FAILED','PERMISSION_ESCALATION','INTEGRATION_FAILURE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.compliance_audit_logs (
  entry_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp"       timestamptz NOT NULL DEFAULT now(),
  user_id           uuid,
  user_role         text,
  action_type       public.compliance_audit_action NOT NULL,
  object_type       text NOT NULL,
  object_id         text,
  before_value      jsonb,
  after_value       jsonb,
  justification     text,
  ai_model_version  text,
  ip_address        inet,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_object       ON public.compliance_audit_logs (object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_cal_user         ON public.compliance_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_cal_action       ON public.compliance_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_cal_ts           ON public.compliance_audit_logs ("timestamp" DESC);

GRANT SELECT, INSERT ON public.compliance_audit_logs TO authenticated;
GRANT ALL            ON public.compliance_audit_logs TO service_role;

ALTER TABLE public.compliance_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cal_admin_read   ON public.compliance_audit_logs;
DROP POLICY IF EXISTS cal_self_insert  ON public.compliance_audit_logs;

CREATE POLICY cal_admin_read ON public.compliance_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY cal_self_insert ON public.compliance_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Tamper-proof triggers
CREATE OR REPLACE FUNCTION public.tg_cal_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance_audit_logs entries are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cal_enforce_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."timestamp" := now();
  NEW.created_at  := now();
  IF NEW.action_type = 'OVERRIDE'::public.compliance_audit_action
     AND (NEW.justification IS NULL OR length(btrim(NEW.justification)) < 10) THEN
    RAISE EXCEPTION 'Justification (min 10 chars) is mandatory for OVERRIDE actions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cal_block_update ON public.compliance_audit_logs;
DROP TRIGGER IF EXISTS cal_block_delete ON public.compliance_audit_logs;
DROP TRIGGER IF EXISTS cal_enforce_insert ON public.compliance_audit_logs;

CREATE TRIGGER cal_block_update BEFORE UPDATE ON public.compliance_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_cal_block_mutation();
CREATE TRIGGER cal_block_delete BEFORE DELETE ON public.compliance_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_cal_block_mutation();
CREATE TRIGGER cal_enforce_insert BEFORE INSERT ON public.compliance_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_cal_enforce_insert();

-- =========================================================
-- Security Event Logs
-- =========================================================

CREATE TABLE IF NOT EXISTS public.security_event_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time      timestamptz NOT NULL DEFAULT now(),
  user_id         uuid,
  event_type      public.security_event_type NOT NULL,
  ip_address      inet,
  user_agent      text,
  target_resource text,
  detail          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sel_type ON public.security_event_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_sel_user ON public.security_event_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_sel_time ON public.security_event_logs (event_time DESC);

GRANT SELECT, INSERT ON public.security_event_logs TO authenticated;
GRANT ALL            ON public.security_event_logs TO service_role;
GRANT INSERT         ON public.security_event_logs TO anon;

ALTER TABLE public.security_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_admin_read   ON public.security_event_logs;
DROP POLICY IF EXISTS sel_self_insert  ON public.security_event_logs;
DROP POLICY IF EXISTS sel_anon_insert  ON public.security_event_logs;

CREATE POLICY sel_admin_read ON public.security_event_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY sel_self_insert ON public.security_event_logs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY sel_anon_insert ON public.security_event_logs
  FOR INSERT TO anon WITH CHECK (user_id IS NULL);

CREATE OR REPLACE FUNCTION public.tg_sel_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_event_logs entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS sel_block_update ON public.security_event_logs;
DROP TRIGGER IF EXISTS sel_block_delete ON public.security_event_logs;
CREATE TRIGGER sel_block_update BEFORE UPDATE ON public.security_event_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_sel_block_mutation();
CREATE TRIGGER sel_block_delete BEFORE DELETE ON public.security_event_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_sel_block_mutation();

-- =========================================================
-- RPC helpers (SECURITY DEFINER) - resolve role snapshot
-- =========================================================

CREATE OR REPLACE FUNCTION public.log_compliance_audit(
  _action_type      public.compliance_audit_action,
  _object_type      text,
  _object_id        text DEFAULT NULL,
  _before_value     jsonb DEFAULT NULL,
  _after_value      jsonb DEFAULT NULL,
  _justification    text DEFAULT NULL,
  _ai_model_version text DEFAULT NULL,
  _ip_address       text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_id   uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT role::text INTO v_role
    FROM public.user_roles
    WHERE user_id = v_uid
    ORDER BY CASE role::text
      WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2
      WHEN 'supervisor' THEN 3 ELSE 9 END
    LIMIT 1;
  END IF;

  INSERT INTO public.compliance_audit_logs(
    user_id, user_role, action_type, object_type, object_id,
    before_value, after_value, justification, ai_model_version, ip_address
  ) VALUES (
    v_uid, v_role, _action_type, _object_type, _object_id,
    _before_value, _after_value, _justification, _ai_model_version,
    NULLIF(_ip_address,'')::inet
  )
  RETURNING entry_id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_compliance_audit(
  public.compliance_audit_action, text, text, jsonb, jsonb, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type      public.security_event_type,
  _target_resource text DEFAULT NULL,
  _ip_address      text DEFAULT NULL,
  _user_agent      text DEFAULT NULL,
  _detail          jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.security_event_logs(
    user_id, event_type, ip_address, user_agent, target_resource, detail
  ) VALUES (
    auth.uid(), _event_type, NULLIF(_ip_address,'')::inet, _user_agent, _target_resource, _detail
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_security_event(
  public.security_event_type, text, text, text, jsonb
) TO authenticated, anon;
