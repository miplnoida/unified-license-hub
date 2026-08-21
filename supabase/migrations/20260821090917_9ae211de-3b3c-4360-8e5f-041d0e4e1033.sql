-- EPR-01 certification defect: 12 governed Returns functions call an audit-log
-- helper signature (entity_type, entity_id, action, metadata) that does not
-- exist, so every governed Returns mutation (open filing, submit, review,
-- definition saves) failed at runtime with 42883. Restore the compatible
-- overload, delegating to the canonical audit writer with the acting user.
CREATE OR REPLACE FUNCTION public.create_audit_log(
  _entity_type text,
  _entity_id uuid,
  _action text,
  _metadata jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.create_audit_log(
    auth.uid(), _action, _entity_type, _entity_id::text, NULL::jsonb, NULL::jsonb, _metadata
  );
$$;

REVOKE ALL ON FUNCTION public.create_audit_log(text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_audit_log(text, uuid, text, jsonb) TO authenticated, service_role;