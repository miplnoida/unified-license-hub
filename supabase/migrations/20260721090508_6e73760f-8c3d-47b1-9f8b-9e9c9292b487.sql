
-- 1) Deprecation flag on the permission catalog.
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS deprecated boolean NOT NULL DEFAULT false;

-- 2) Catalog-management + role-assignment actions.
INSERT INTO public.permissions (module, name, description, enforced)
VALUES
  ('role_management', 'view_catalog',   'View the permission catalog (modules and actions)', true),
  ('role_management', 'manage_catalog', 'Create, edit, or delete permission modules and actions', true),
  ('role_management', 'assign_role',    'Grant or revoke role assignments to users', true)
ON CONFLICT (module, name) DO UPDATE
  SET enforced = EXCLUDED.enforced,
      description = COALESCE(public.permissions.description, EXCLUDED.description);

-- 3) Trigger function for permission_modules / permission_actions catalog tables.
CREATE OR REPLACE FUNCTION public.trg_permission_catalog_action_guard()
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

DROP TRIGGER IF EXISTS trg_permission_modules_guard ON public.permission_modules;
CREATE TRIGGER trg_permission_modules_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.permission_modules
  FOR EACH ROW EXECUTE FUNCTION public.trg_permission_catalog_action_guard();

DROP TRIGGER IF EXISTS trg_permission_actions_guard ON public.permission_actions;
CREATE TRIGGER trg_permission_actions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.permission_actions
  FOR EACH ROW EXECUTE FUNCTION public.trg_permission_catalog_action_guard();

-- 4) Trigger function for user_dynamic_roles (role assignment guard).
CREATE OR REPLACE FUNCTION public.trg_user_dynamic_roles_action_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_role_management_action('assign_role');
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_dynamic_roles_guard ON public.user_dynamic_roles;
CREATE TRIGGER trg_user_dynamic_roles_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_dynamic_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_dynamic_roles_action_guard();
