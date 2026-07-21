
-- 1. enforced flag on the catalog -------------------------------------------
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS enforced boolean NOT NULL DEFAULT true;

-- 2. shared dependency rule set ---------------------------------------------
-- Returns the fixed action → prerequisite mapping. Kept as a set-returning
-- function so both DB code and client-side scripts can read one source.
CREATE OR REPLACE FUNCTION public.get_permission_dependencies()
RETURNS TABLE(action text, requires text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT unnest(ARRAY[
    'edit','create','delete','approve','reject','export',
    'download','upload','import','publish','archive','restore','assign'
  ])::text AS action,
  'view'::text AS requires;
$$;

GRANT EXECUTE ON FUNCTION public.get_permission_dependencies() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.permission_has_dependency(_action text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_action,'')) IN (
    'edit','create','delete','approve','reject','export',
    'download','upload','import','publish','archive','restore','assign'
  );
$$;

GRANT EXECUTE ON FUNCTION public.permission_has_dependency(text) TO authenticated, service_role;

-- 3. dependency + orphan enforcement ----------------------------------------
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
  v_view_exists boolean;
BEGIN
  SELECT p.module, lower(p.name), p.enforced
    INTO v_module, v_action, v_enforced
  FROM public.permissions p
  WHERE p.id = NEW.permission_id;

  IF v_module IS NULL THEN
    RAISE EXCEPTION 'permission_missing: %', NEW.permission_id
      USING ERRCODE = '22023';
  END IF;

  -- Block orphaned permissions from ever being assigned.
  IF NOT v_enforced THEN
    RAISE EXCEPTION 'permission_orphaned: %.% is not enforced anywhere and cannot be assigned',
      v_module, v_action
      USING ERRCODE = '22023';
  END IF;

  -- Block dependent actions when the prerequisite `view` is missing on the role.
  IF public.permission_has_dependency(v_action) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = NEW.role_id
        AND p.module = v_module
        AND lower(p.name) = 'view'
    ) INTO v_view_exists;

    IF NOT v_view_exists THEN
      RAISE EXCEPTION 'dependency_missing: %.% requires %.view on the same role',
        v_module, v_action, v_module
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permission_dependencies ON public.role_permissions;
CREATE TRIGGER trg_role_permission_dependencies
  BEFORE INSERT ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_role_permission_dependencies();

-- 4. prevent removing `view` while dependents still exist -------------------
CREATE OR REPLACE FUNCTION public.assert_role_permission_view_retained()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text;
  v_action text;
  v_dependents_remaining boolean;
BEGIN
  SELECT p.module, lower(p.name) INTO v_module, v_action
  FROM public.permissions p
  WHERE p.id = OLD.permission_id;

  IF v_action IS DISTINCT FROM 'view' OR v_module IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = OLD.role_id
      AND p.module = v_module
      AND lower(p.name) <> 'view'
      AND public.permission_has_dependency(lower(p.name))
      AND rp.permission_id <> OLD.permission_id
  ) INTO v_dependents_remaining;

  IF v_dependents_remaining THEN
    RAISE EXCEPTION 'dependency_still_referenced: cannot remove %.view while dependent actions remain on the role',
      v_module
      USING ERRCODE = '22023';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permission_view_retained ON public.role_permissions;
CREATE TRIGGER trg_role_permission_view_retained
  BEFORE DELETE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_role_permission_view_retained();
