create or replace function public.log_compliance_audit(
  _action_type text,
  _object_type text,
  _object_id uuid,
  _before_value jsonb,
  _after_value jsonb,
  _justification text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  RETURN public.log_compliance_audit(
    upper(btrim(_action_type))::public.compliance_audit_action,
    _object_type,
    _object_id::text,
    _before_value,
    _after_value,
    _justification
  );
END;
$$;

revoke all on function public.log_compliance_audit(text,text,uuid,jsonb,jsonb,text) from public, anon;
grant execute on function public.log_compliance_audit(text,text,uuid,jsonb,jsonb,text) to authenticated, service_role;