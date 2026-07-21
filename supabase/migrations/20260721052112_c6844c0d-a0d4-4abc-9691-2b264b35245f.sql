
-- 1. Canonical submitted-lifecycle status helper (mirrors src/lib/returnLifecycle.ts)
CREATE OR REPLACE FUNCTION public.return_status_is_submitted_lifecycle(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_status, '')) IN (
    'submitted', 'under_review', 'reviewed', 'approved', 'rejected',
    'accepted', 'archived', 'closed', 'completed', 'final'
  );
$$;
GRANT EXECUTE ON FUNCTION public.return_status_is_submitted_lifecycle(text) TO authenticated, anon;

-- 2. Unified has_permission helper for RLS/RPC use — matches frontend hook semantics.
--    super_admin bypass; all other users must have an explicit (module, action) via a dynamic role.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _module IS NULL OR _action IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.role_permissions rp ON rp.role_id = udr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE udr.user_id = _user_id
      AND lower(regexp_replace(p.module, '\s+', '_', 'g')) = lower(regexp_replace(_module, '\s+', '_', 'g'))
      AND lower(p.name) = lower(_action)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;

-- 3. One-shot backfill: any user whose profile role is 'admin' but who has no dynamic
--    role mapping gets a "Legacy Admin" dynamic role carrying every catalog permission,
--    so removing the frontend admin bypass does not lock existing admins out.
DO $$
DECLARE
  v_role_id uuid;
BEGIN
  -- Create or fetch the Legacy Admin role
  INSERT INTO public.roles (name, description, system_role, is_system)
  VALUES ('Legacy Admin', 'Backfilled full-access role for pre-RBAC admins', 'admin', true)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_role_id;

  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Legacy Admin';
  END IF;

  -- Grant it every permission in the catalog
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id FROM public.permissions p
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  -- Map any admin-role user without an existing dynamic role assignment
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  SELECT pr.id, v_role_id
  FROM public.profiles pr
  WHERE pr.role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_dynamic_roles udr WHERE udr.user_id = pr.id
    )
  ON CONFLICT DO NOTHING;
END $$;
