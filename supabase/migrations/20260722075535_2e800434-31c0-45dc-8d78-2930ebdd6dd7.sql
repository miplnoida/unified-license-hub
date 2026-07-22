-- Generic gated action RPC (defense-in-depth for UI mutations across all modules).
CREATE OR REPLACE FUNCTION public.enforce_action(_module text, _action text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _module IS NULL OR btrim(_module) = '' OR _action IS NULL OR btrim(_action) = '' THEN
    RAISE EXCEPTION 'module and action are required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.enforce_permission(_module, _action);
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, changes)
  VALUES (_uid, 'rbac_action.' || _module || '.' || _action, _module, NULL, COALESCE(_meta, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_action(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_action(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.enforce_action(text, text, jsonb) IS
'Universal RBAC gate: enforces has_permission(module,action) and writes an audit trail. Called from client via authorizedAction() before sensitive UI mutations.';