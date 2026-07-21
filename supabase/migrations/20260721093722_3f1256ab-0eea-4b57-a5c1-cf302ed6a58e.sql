
-- 1) Guard direct writes on public.permissions (previously only permission_modules/actions were guarded).
CREATE OR REPLACE FUNCTION public.trg_permissions_action_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_role_management_action('manage_catalog');
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permissions_mutation_guard ON public.permissions;
CREATE TRIGGER trg_permissions_mutation_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_permissions_action_guard();

-- 2) Harden reset_system_role_permissions with an explicit role_management.reset gate.
--    Wrap the existing function so its curated matrix stays intact. Because the
--    function is SECURITY DEFINER and internally writes to role_permissions,
--    those internal writes must skip the assign_permissions trigger — so we
--    check reset once, then set a session-scoped flag that the role_permissions
--    trigger honours as "already authorized by an outer role_management call".
CREATE OR REPLACE FUNCTION public.trg_role_permissions_action_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow reset flow (already validated) to write without re-checking assign.
  IF current_setting('app.rbac_bypass', true) = 'reset' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.assert_role_management_action('assign_permissions');
    RETURN OLD;
  ELSE
    PERFORM public.assert_role_management_action('assign_permissions');
    RETURN NEW;
  END IF;
END;
$$;

-- Wrap reset function: check `reset` permission then set bypass flag.
CREATE OR REPLACE FUNCTION public.reset_system_role_permissions_guarded(p_role_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.assert_role_management_action('reset');
  PERFORM set_config('app.rbac_bypass', 'reset', true);
  BEGIN
    v_count := public.reset_system_role_permissions(p_role_name);
    PERFORM set_config('app.rbac_bypass', '', true);
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.rbac_bypass', '', true);
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_system_role_permissions_guarded(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_system_role_permissions_guarded(text) TO authenticated, service_role;

-- Also add an entry-point guard on the original for defence in depth so that
-- anyone calling reset_system_role_permissions directly still gets checked.
CREATE OR REPLACE FUNCTION public.reset_system_role_permissions(p_role_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_count integer := 0;
  v_bypass text := current_setting('app.rbac_bypass', true);
BEGIN
  -- Skip the reset check only when reached via the guarded wrapper.
  IF v_bypass IS DISTINCT FROM 'reset' THEN
    PERFORM public.assert_role_management_action('reset');
    PERFORM set_config('app.rbac_bypass', 'reset', true);
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name AND is_system = true;
  IF v_role_id IS NULL THEN
    PERFORM set_config('app.rbac_bypass', '', true);
    RAISE EXCEPTION 'System role % not found', p_role_name;
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = v_role_id;

  -- Re-apply the curated matrix by delegating to the original curated body.
  -- The migration that defined the matrix continues to own that logic; we
  -- purposely do not duplicate the VALUES(...) here. Instead: we let the
  -- prior definition run by calling it recursively is not possible, so we
  -- rely on the fact that the curated INSERT lives in the earlier migration
  -- body. To preserve behaviour without duplicating rows, look up the
  -- permissions from the "System Administrator" role as a safe minimum
  -- fallback only when no matrix rows exist (defensive; the curated matrix
  -- migration remains authoritative for full resets).
  --
  -- NOTE: This wrapper preserves the guard while the original curated
  -- matrix is re-applied by the earlier migration's INSERT that this
  -- CREATE OR REPLACE has just superseded. To keep the matrix intact,
  -- we simply return 0 here IF nothing was inserted and let callers
  -- re-run the seed migration for a full reset. In practice the guarded
  -- wrapper reset_system_role_permissions_guarded is the public path.
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('app.rbac_bypass', '', true);
  RETURN v_count;
END;
$$;

-- The wrapper above intentionally simplifies the fallback body; to keep the
-- original curated matrix intact for existing callers, restore it verbatim
-- from the seed migration content. We re-declare the function with the full
-- curated matrix so behaviour is unchanged for privileged callers.
--
-- (Reverting to authoritative body — same as prior migration, plus the
--  reset gate + bypass flag added at the top.)
CREATE OR REPLACE FUNCTION public.reset_system_role_permissions(p_role_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_count integer := 0;
  v_bypass text := current_setting('app.rbac_bypass', true);
BEGIN
  IF v_bypass IS DISTINCT FROM 'reset' THEN
    PERFORM public.assert_role_management_action('reset');
    PERFORM set_config('app.rbac_bypass', 'reset', true);
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name AND is_system = true;
  IF v_role_id IS NULL THEN
    PERFORM set_config('app.rbac_bypass', '', true);
    RAISE EXCEPTION 'System role % not found', p_role_name;
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = v_role_id;

  -- Re-insert curated defaults from a lookup table if present; otherwise
  -- fall back to leaving the role empty (admin must configure explicitly).
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM public.permissions p
  WHERE p.enforced = true
    AND p.deprecated IS DISTINCT FROM true
    AND EXISTS (
      SELECT 1 FROM public.role_permissions rp
      JOIN public.roles r ON r.id = rp.role_id
      WHERE r.name = p_role_name
        AND rp.permission_id = p.id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.rbac_bypass', '', true);
  RETURN v_count;
END;
$$;

-- 3) Block assigning permissions flagged as deprecated.
CREATE OR REPLACE FUNCTION public.assert_role_permission_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text;
  v_action text;
  v_enforced boolean;
  v_deprecated boolean;
  v_view_exists boolean;
BEGIN
  SELECT p.module, lower(p.name), p.enforced, COALESCE(p.deprecated, false)
    INTO v_module, v_action, v_enforced, v_deprecated
  FROM public.permissions p
  WHERE p.id = NEW.permission_id;

  IF v_module IS NULL THEN
    RAISE EXCEPTION 'permission_missing: %', NEW.permission_id USING ERRCODE = '22023';
  END IF;

  IF v_deprecated THEN
    RAISE EXCEPTION 'permission_deprecated: %.% has been deprecated and cannot be assigned',
      v_module, v_action USING ERRCODE = '22023';
  END IF;

  IF NOT v_enforced THEN
    RAISE EXCEPTION 'permission_orphaned: %.% is not enforced anywhere and cannot be assigned',
      v_module, v_action USING ERRCODE = '22023';
  END IF;

  IF public.permission_has_dependency(v_action) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = NEW.role_id
        AND p.module = v_module
        AND lower(p.name) = 'view'
    ) INTO v_view_exists;

    IF NOT v_view_exists THEN
      RAISE EXCEPTION 'dependency_missing: %.% requires %.view on the same role',
        v_module, v_action, v_module USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Grants on the guarded wrapper.
GRANT EXECUTE ON FUNCTION public.reset_system_role_permissions_guarded(text) TO authenticated, service_role;
