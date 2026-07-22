
-- Phase 5: fix validator, consolidate dependency registry, atomic role
-- delete, and custom-role preservation.

-- 0. Fix Phase 4 validator: column is `scope`, not `scope_kind`.
CREATE OR REPLACE FUNCTION public.validate_scope_config(_scope_config jsonb)
RETURNS TABLE(module text, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  mod text; entry jsonb; kind text; sels jsonb;
  ok_kind boolean; bad_ids uuid[];
BEGIN
  IF _scope_config IS NULL OR jsonb_typeof(_scope_config) <> 'object' THEN RETURN; END IF;
  FOR mod, entry IN SELECT k, v FROM jsonb_each(_scope_config) AS t(k,v) LOOP
    IF jsonb_typeof(entry) <> 'object' THEN
      module := mod; error := 'scope entry must be an object'; RETURN NEXT; CONTINUE;
    END IF;
    kind := entry ->> 'scope';
    IF kind IS NULL THEN
      module := mod; error := 'scope kind missing'; RETURN NEXT; CONTINUE;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.rbac_module_scopes s WHERE s.module = mod AND s.scope = kind) INTO ok_kind;
    IF NOT ok_kind THEN
      module := mod; error := format('scope kind "%s" not supported for module %s', kind, mod); RETURN NEXT; CONTINUE;
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
          module := mod; error := 'unknown licensee id(s): ' || bad_ids::text; RETURN NEXT;
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
          module := mod; error := 'unknown sector id(s): ' || bad_ids::text; RETURN NEXT;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 1. Consolidated dependency trigger on role_permissions. Uses the
-- authoritative registry (permission_dependent_actions) plus the same-module
-- view rule already established.
CREATE OR REPLACE FUNCTION public.trg_role_permissions_dependency_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  role_perms uuid[];
  offender record;
BEGIN
  -- Collect the effective permission set for this role AFTER the change.
  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(permission_id) INTO role_perms
      FROM public.role_permissions WHERE role_id = OLD.role_id AND permission_id <> OLD.permission_id;
  ELSE
    SELECT array_agg(permission_id) INTO role_perms
      FROM (
        SELECT permission_id FROM public.role_permissions WHERE role_id = NEW.role_id
        UNION SELECT NEW.permission_id
      ) x;
  END IF;

  IF role_perms IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Any dependent action selected must have View on the same module.
  SELECT p.module, p.name INTO offender
    FROM public.permissions p
   WHERE p.id = ANY(role_perms)
     AND lower(p.name) IN (SELECT action FROM public.permission_dependent_actions)
     AND NOT EXISTS (
       SELECT 1 FROM public.permissions v
        WHERE v.id = ANY(role_perms)
          AND lower(v.name) = 'view'
          AND lower(regexp_replace(v.module,'\s+','_','g'))
              = lower(regexp_replace(p.module,'\s+','_','g'))
     )
   LIMIT 1;
  IF offender.module IS NOT NULL THEN
    RAISE EXCEPTION 'permission_dependency_violation: "%" on % requires view on same module',
      offender.name, offender.module USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_dependency_guard ON public.role_permissions;
CREATE TRIGGER role_permissions_dependency_guard
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_role_permissions_dependency_guard();

-- 2. Atomic role delete RPC. Refuses system roles. Cleans dependents.
CREATE OR REPLACE FUNCTION public.rbac_delete_role(_role_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.roles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'role_management','delete')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.roles WHERE id = _role_id FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'role_not_found' USING ERRCODE = '02000';
  END IF;
  IF COALESCE(target.is_system,false) OR COALESCE(target.system_role,'custom') NOT IN ('custom','') THEN
    RAISE EXCEPTION 'system_role_not_deletable' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = _role_id;
  DELETE FROM public.user_dynamic_roles WHERE role_id = _role_id;
  DELETE FROM public.roles WHERE id = _role_id;
  RETURN jsonb_build_object('deleted', _role_id);
END;
$$;
REVOKE ALL ON FUNCTION public.rbac_delete_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_delete_role(uuid) TO authenticated;

-- 3. Custom-role preservation. rbac_reclassify_roles must not overwrite
-- operator-supplied fields on custom roles. Provide a helper that only
-- back-fills NULL fields and never touches roles marked custom whose
-- category/scope_config/access_summary are already populated.
CREATE OR REPLACE FUNCTION public.rbac_reclassify_roles()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated int := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Only fill missing metadata; never overwrite operator input.
  UPDATE public.roles r
     SET role_category = COALESCE(r.role_category,
           CASE
             WHEN r.is_system OR r.system_role NOT IN ('custom','') THEN 'system'
             ELSE 'operational'
           END),
         access_summary = CASE
           WHEN r.access_summary IS NULL OR r.access_summary = '{}'::jsonb
             THEN jsonb_build_object('auto_backfilled', true)
           ELSE r.access_summary END,
         status = COALESCE(NULLIF(r.status,''), 'active'),
         updated_at = now()
   WHERE (r.role_category IS NULL
       OR r.access_summary IS NULL OR r.access_summary = '{}'::jsonb
       OR r.status IS NULL OR r.status = '');
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', updated);
END;
$$;
REVOKE ALL ON FUNCTION public.rbac_reclassify_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_reclassify_roles() TO authenticated;
