-- MC-08 certification defect: the governed AI operations record their audit
-- entry with a uuid object id, but the audit helper expects text. Every
-- lifecycle transition, stop-control change and assurance conclusion therefore
-- failed at the point of writing its audit trail. Add a compatible overload so
-- the governed operations succeed and the audit entry is still written.
CREATE OR REPLACE FUNCTION public.log_compliance_audit_as_actor(
  _actor_id uuid,
  _action_type text,
  _object_type text,
  _object_id uuid DEFAULT NULL,
  _before_value jsonb DEFAULT NULL,
  _after_value jsonb DEFAULT NULL,
  _justification text DEFAULT NULL,
  _ai_model_version text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.log_compliance_audit_as_actor(
    _actor_id, _action_type::public.compliance_audit_action, _object_type,
    _object_id::text, _before_value, _after_value, _justification,
    _ai_model_version, _ip_address, _user_agent, _metadata);
$$;

REVOKE ALL ON FUNCTION public.log_compliance_audit_as_actor(uuid, text, text, uuid, jsonb, jsonb, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_compliance_audit_as_actor(uuid, text, text, uuid, jsonb, jsonb, text, text, text, text, jsonb) TO service_role;