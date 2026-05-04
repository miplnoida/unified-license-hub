
CREATE OR REPLACE FUNCTION public.log_self_audit(
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (v_uid, _action, _entity_type, _entity_id, _old_value, _new_value, _metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_self_audit(text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_self_audit(text,text,text,jsonb,jsonb,jsonb) TO authenticated;

COMMENT ON FUNCTION public.log_self_audit(text,text,text,jsonb,jsonb,jsonb) IS
'Client-callable audit writer. Always attributes the row to auth.uid() — clients cannot forge another user''s identity.';
