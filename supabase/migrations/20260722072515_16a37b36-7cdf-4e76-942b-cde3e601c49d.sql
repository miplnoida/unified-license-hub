
CREATE OR REPLACE FUNCTION public.enforce_permission(_module text, _action text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required for %.%', _module, _action
      USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(v_uid) THEN
    RETURN;
  END IF;
  IF NOT public.has_permission(v_uid, _module, _action) THEN
    RAISE EXCEPTION 'permission denied: %.%', _module, _action
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_permission(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_scoped_permission(
  _module text,
  _action text,
  _holder uuid DEFAULT NULL,
  _sector uuid DEFAULT NULL,
  _region uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required for %.%', _module, _action
      USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(v_uid) THEN
    RETURN;
  END IF;
  IF NOT public.has_scoped_permission(v_uid, _module, _action, _holder, _sector, _region) THEN
    RAISE EXCEPTION 'permission denied: %.% (scope check failed)', _module, _action
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_scoped_permission(text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_scoped_permission(text, text, uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.enforce_permission(text, text) IS
  'RBAC Batch 3: raises 42501 if auth.uid() lacks module.action. Bypasses for super admin.';
COMMENT ON FUNCTION public.enforce_scoped_permission(text, text, uuid, uuid, uuid) IS
  'RBAC Batch 3: scoped variant. Raises 42501 if scope resolver rejects.';
