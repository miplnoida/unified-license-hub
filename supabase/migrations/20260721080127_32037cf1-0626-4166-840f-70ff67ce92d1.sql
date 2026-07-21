
-- 1) Register the four missing role_management actions in the catalog.
INSERT INTO public.permissions (module, name, description, enforced)
VALUES
  ('role_management', 'delete',              'Delete non-system roles',                       true),
  ('role_management', 'reset',               'Reset a system role to its default permissions', true),
  ('role_management', 'assign_permissions',  'Assign or revoke permissions on any role',       true),
  ('role_management', 'view_coverage',       'View the Permission Coverage report',            true)
ON CONFLICT (module, name) DO UPDATE
  SET enforced = EXCLUDED.enforced,
      description = COALESCE(public.permissions.description, EXCLUDED.description);

-- 2) Extend the dependency rule.
CREATE OR REPLACE FUNCTION public.permission_has_dependency(_action text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_action,'')) IN (
    'edit','update','create','delete','approve','reject','export',
    'download','upload','import','publish','archive','restore','assign','reassign',
    'bulk','bulk_update','bulk_delete','configure','status_change','workflow_action',
    'dispatch','execute','close','reopen','resolve','escalate','issue','revoke',
    'suspend','renew'
  );
$$;

-- 3) Repair: ensure every role that already holds a dependent action also
--    holds the `view` permission on the same module.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, v.id
FROM public.role_permissions rp
JOIN public.permissions p ON p.id = rp.permission_id
JOIN public.permissions v ON v.module = p.module AND lower(v.name) = 'view'
WHERE public.permission_has_dependency(lower(p.name))
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp2
    WHERE rp2.role_id = rp.role_id AND rp2.permission_id = v.id
  )
ON CONFLICT DO NOTHING;

-- 4) Backend guard: enforce role_management.<action> on any mutation of
--    roles / role_permissions. Super admins bypass; service_role bypasses
--    (background jobs, migrations, edge functions using the service key).
CREATE OR REPLACE FUNCTION public.assert_role_management_action(_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- service_role and other privileged Postgres roles bypass the check.
  IF current_setting('request.jwt.claims', true) IS NULL
     OR current_setting('request.jwt.claims', true) = '' THEN
    RETURN;
  END IF;
  IF (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'role_management_action_denied: no authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_super_admin(v_uid) THEN
    RETURN;
  END IF;

  IF NOT public.has_permission(v_uid, 'role_management', _action) THEN
    RAISE EXCEPTION 'role_management_action_denied: missing role_management.%', _action
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_role_management_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_role_management_action(text) TO authenticated, service_role;

-- Trigger function for roles table.
CREATE OR REPLACE FUNCTION public.trg_roles_action_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_role_management_action('create');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.assert_role_management_action('edit');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.assert_role_management_action('delete');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger function for role_permissions table (INSERT/DELETE = assign_permissions).
CREATE OR REPLACE FUNCTION public.trg_role_permissions_action_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.assert_role_management_action('assign_permissions');
    RETURN OLD;
  ELSE
    PERFORM public.assert_role_management_action('assign_permissions');
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_mutation_guard ON public.roles;
CREATE TRIGGER trg_roles_mutation_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_roles_action_guard();

DROP TRIGGER IF EXISTS trg_role_permissions_mutation_guard ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_mutation_guard
  BEFORE INSERT OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_role_permissions_action_guard();
