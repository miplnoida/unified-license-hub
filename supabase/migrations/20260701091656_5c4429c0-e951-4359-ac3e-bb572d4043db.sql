-- Backend-only audit RPCs for edge functions that need to log an explicit actor.
-- No tables are created in this migration.

CREATE OR REPLACE FUNCTION public.log_compliance_audit_as_actor(
  _actor_id uuid,
  _action_type compliance_audit_action,
  _object_type text,
  _object_id text DEFAULT NULL::text,
  _before_value jsonb DEFAULT NULL::jsonb,
  _after_value jsonb DEFAULT NULL::jsonb,
  _justification text DEFAULT NULL::text,
  _ai_model_version text DEFAULT NULL::text,
  _ip_address text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text,
  _metadata jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.resolve_actor_role(_actor_id);
  v_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor id is required for backend audit logging'
      USING ERRCODE = '22023';
  END IF;

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
    now(), _actor_id, v_role, _action_type, _object_type, _object_id,
    _before_value, _after_value, _justification, _ai_model_version,
    NULLIF(_ip_address, '')::inet,
    NULLIF(COALESCE(_user_agent, _metadata->>'user_agent'), ''),
    COALESCE(_metadata, '{}'::jsonb),
    now()
  )
  RETURNING entry_id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_security_event_as_actor(
  _actor_id uuid,
  _event_type security_event_type,
  _target_resource text DEFAULT NULL::text,
  _ip_address text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text,
  _detail jsonb DEFAULT NULL::jsonb,
  _metadata jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.resolve_actor_role(_actor_id);
  v_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor id is required for backend security audit logging'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.security_event_logs (
    event_time, user_id, user_role, event_type, ip_address,
    user_agent, target_resource, detail, metadata, created_at
  ) VALUES (
    now(), _actor_id, v_role, _event_type, NULLIF(_ip_address, '')::inet,
    _user_agent, _target_resource, _detail, COALESCE(_metadata, '{}'::jsonb), now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_compliance_audit_as_actor(uuid, compliance_audit_action, text, text, jsonb, jsonb, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_security_event_as_actor(uuid, security_event_type, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_compliance_audit_as_actor(uuid, compliance_audit_action, text, text, jsonb, jsonb, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_security_event_as_actor(uuid, security_event_type, text, text, text, jsonb, jsonb) TO service_role;