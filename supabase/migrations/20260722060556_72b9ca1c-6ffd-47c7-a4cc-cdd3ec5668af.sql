
-- Phase 4: selector validation, unsupported scopes, inactive-role enforcement.

-- 1. Authoritative scope-config validator. Rejects:
--    - unknown modules
--    - scope kinds not registered in rbac_module_scopes for that module
--    - selector arrays that reference non-existent rows (licensees, sectors)
--    - empty selectors when the scope kind requires ids
CREATE OR REPLACE FUNCTION public.validate_scope_config(_scope_config jsonb)
RETURNS TABLE(module text, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  mod text;
  entry jsonb;
  kind text;
  sels jsonb;
  ok_kind boolean;
  bad_ids uuid[];
BEGIN
  IF _scope_config IS NULL OR jsonb_typeof(_scope_config) <> 'object' THEN
    RETURN;
  END IF;

  FOR mod, entry IN SELECT k, v FROM jsonb_each(_scope_config) AS t(k,v) LOOP
    IF jsonb_typeof(entry) <> 'object' THEN
      module := mod; error := 'scope entry must be an object'; RETURN NEXT; CONTINUE;
    END IF;
    kind := entry ->> 'scope';
    IF kind IS NULL THEN
      module := mod; error := 'scope kind missing'; RETURN NEXT; CONTINUE;
    END IF;

    -- Kind must be registered for the module.
    SELECT EXISTS(
      SELECT 1 FROM public.rbac_module_scopes s
       WHERE s.module = mod AND s.scope_kind = kind
    ) INTO ok_kind;
    IF NOT ok_kind THEN
      module := mod; error := format('scope kind "%s" not supported for module %s', kind, mod);
      RETURN NEXT; CONTINUE;
    END IF;

    IF kind = 'institution' THEN
      sels := entry -> 'licensees';
      IF sels IS NULL OR jsonb_typeof(sels) <> 'array' OR jsonb_array_length(sels) = 0 THEN
        module := mod; error := 'institution scope requires at least one licensee id'; RETURN NEXT;
      ELSE
        SELECT array_agg(v::uuid) INTO bad_ids
        FROM jsonb_array_elements_text(sels) AS v
        WHERE NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = v::uuid);
        IF bad_ids IS NOT NULL AND array_length(bad_ids,1) > 0 THEN
          module := mod; error := 'unknown licensee id(s) in institution scope: ' || bad_ids::text; RETURN NEXT;
        END IF;
      END IF;
    ELSIF kind = 'sector' THEN
      sels := entry -> 'sectors';
      IF sels IS NULL OR jsonb_typeof(sels) <> 'array' OR jsonb_array_length(sels) = 0 THEN
        module := mod; error := 'sector scope requires at least one sector id'; RETURN NEXT;
      ELSE
        SELECT array_agg(v::uuid) INTO bad_ids
        FROM jsonb_array_elements_text(sels) AS v
        WHERE NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = v::uuid);
        IF bad_ids IS NOT NULL AND array_length(bad_ids,1) > 0 THEN
          module := mod; error := 'unknown sector id(s) in sector scope: ' || bad_ids::text; RETURN NEXT;
        END IF;
      END IF;
    END IF;
    -- assigned/own/all take no selectors; anything extra is silently ignored.
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_scope_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_scope_config(jsonb) TO authenticated, service_role;

-- 2. Enforce validator via BEFORE INSERT/UPDATE trigger on roles.
CREATE OR REPLACE FUNCTION public.trg_roles_validate_scope_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE first_err record;
BEGIN
  IF NEW.scope_config IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO first_err FROM public.validate_scope_config(NEW.scope_config) LIMIT 1;
  IF first_err.module IS NOT NULL THEN
    RAISE EXCEPTION 'invalid scope_config on module "%": %', first_err.module, first_err.error
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_validate_scope_config ON public.roles;
CREATE TRIGGER roles_validate_scope_config
  BEFORE INSERT OR UPDATE OF scope_config ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_roles_validate_scope_config();

-- 3. Block assigning an inactive role. status column enums: 'active'/'inactive'.
CREATE OR REPLACE FUNCTION public.trg_user_dynamic_roles_active_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM public.roles WHERE id = NEW.role_id;
  IF s IS NULL THEN
    RAISE EXCEPTION 'role % does not exist', NEW.role_id USING ERRCODE = '23503';
  END IF;
  IF s <> 'active' THEN
    RAISE EXCEPTION 'role % is % and cannot be assigned', NEW.role_id, s USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_dynamic_roles_active_only ON public.user_dynamic_roles;
CREATE TRIGGER user_dynamic_roles_active_only
  BEFORE INSERT OR UPDATE OF role_id ON public.user_dynamic_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_dynamic_roles_active_only();

-- 4. When a role flips to inactive, the resolver already ignores it via
-- user_scope_for / has_permission. Ensure this is documented and add a
-- guard against reactivating a role whose scope_config is now invalid
-- (e.g., a referenced licensee has been deleted).
CREATE OR REPLACE FUNCTION public.trg_roles_block_activate_when_invalid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE first_err record;
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') AND NEW.scope_config IS NOT NULL THEN
    SELECT * INTO first_err FROM public.validate_scope_config(NEW.scope_config) LIMIT 1;
    IF first_err.module IS NOT NULL THEN
      RAISE EXCEPTION 'cannot activate role: invalid scope_config on module "%": %',
        first_err.module, first_err.error USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_block_activate_when_invalid ON public.roles;
CREATE TRIGGER roles_block_activate_when_invalid
  BEFORE UPDATE OF status ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_roles_block_activate_when_invalid();
