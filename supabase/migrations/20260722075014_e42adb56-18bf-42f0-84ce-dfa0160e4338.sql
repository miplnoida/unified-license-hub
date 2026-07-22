
-- Batch 4: gated RPC for return rejection (backend enforcement + audit)
CREATE OR REPLACE FUNCTION public.reject_return(_return_id uuid, _reason text)
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

  IF _return_id IS NULL THEN
    RAISE EXCEPTION 'return_id required' USING ERRCODE = '22023';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.enforce_permission('returns_management', 'reject');

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (
    _uid,
    'reject_return',
    'returns_filed',
    _return_id,
    jsonb_build_object('reason', _reason, 'module', 'returns_management', 'permission_action', 'reject')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_return(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_return(uuid, text) TO authenticated;
