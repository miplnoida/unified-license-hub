
-- Phase 1: Canonical authorization helpers.
-- All helpers are SECURITY DEFINER, STABLE, search_path pinned to public,
-- and executable only by authenticated / service_role.

-- 1) is_super_admin ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND public.has_role(_user_id, 'super_admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- 2) has_permission (re-declare to lock search_path + strict grants) --------
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _module IS NULL OR _action IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin(_user_id) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.role_permissions rp ON rp.role_id = udr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE udr.user_id = _user_id
      AND lower(regexp_replace(coalesce(p.module,''), '\s+', '_', 'g'))
          = lower(regexp_replace(coalesce(_module,''), '\s+', '_', 'g'))
      AND lower(coalesce(p.name,'')) = lower(coalesce(_action,''))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, service_role;

-- 3) has_any_permission -----------------------------------------------------
-- Accepts an array of 'module.action' strings; returns true when any matches.
CREATE OR REPLACE FUNCTION public.has_any_permission(_user_id uuid, _keys text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  parts text[];
BEGIN
  IF _user_id IS NULL OR _keys IS NULL OR array_length(_keys, 1) IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin(_user_id) THEN
    RETURN true;
  END IF;
  FOREACH k IN ARRAY _keys LOOP
    parts := string_to_array(k, '.');
    IF array_length(parts, 1) = 2
       AND public.has_permission(_user_id, parts[1], parts[2]) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.has_any_permission(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_permission(uuid, text[]) TO authenticated, service_role;

-- 4) user_has_entity_assignment --------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_entity_assignment(_user_id uuid, _licensee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _licensee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.id = _licensee_id
      AND (
        l.lead_regulator_id = _user_id
        OR l.regulator_officer_id = _user_id
        OR l.alternate_regulator_id = _user_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_entity_assignment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_entity_assignment(uuid, uuid) TO authenticated, service_role;

-- 5) is_assignment_only_regulator ------------------------------------------
-- True when the user is mapped as a regulator on >=1 licensee AND has zero
-- dynamic-role permissions. Super admin is explicitly NOT assignment-only.
CREATE OR REPLACE FUNCTION public.is_assignment_only_regulator(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_assignment boolean;
  v_has_any_permission boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin(_user_id) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.lead_regulator_id = _user_id
       OR l.regulator_officer_id = _user_id
       OR l.alternate_regulator_id = _user_id
  ) INTO v_has_assignment;

  IF NOT v_has_assignment THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.role_permissions rp ON rp.role_id = udr.role_id
    WHERE udr.user_id = _user_id
  ) INTO v_has_any_permission;

  RETURN NOT v_has_any_permission;
END;
$$;

REVOKE ALL ON FUNCTION public.is_assignment_only_regulator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assignment_only_regulator(uuid) TO authenticated, service_role;

-- 6) can_view_entity_returns — refactor to compose the helpers -------------
-- Semantics preserved: super_admin OR view_all_entities OR mapped regulator.
CREATE OR REPLACE FUNCTION public.can_view_entity_returns(_user_id uuid, _licensee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'returns_management', 'view_all_entities')
    OR public.user_has_entity_assignment(_user_id, _licensee_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_entity_returns(
  _user_id uuid,
  _licensee_id uuid,
  _workflow_status text,
  _status text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- _workflow_status / _status kept in signature for backward compatibility
  -- with existing callers; assignment now grants any status for mapped entities.
  SELECT public.can_view_entity_returns(_user_id, _licensee_id);
$$;

REVOKE ALL ON FUNCTION public.can_view_entity_returns(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text) TO authenticated, service_role;
