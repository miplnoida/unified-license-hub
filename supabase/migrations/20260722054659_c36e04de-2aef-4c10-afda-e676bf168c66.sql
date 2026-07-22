-- Phase 1 (retry 2): CREATE OR REPLACE has_scoped_permission (policies depend on it).

DROP FUNCTION IF EXISTS public.user_scope_for(uuid, text);

CREATE OR REPLACE FUNCTION public.user_scope_for(
  _user_id uuid, _module text, _action text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  has_all boolean := false;
  sectors_agg text[] := '{}';
  licensees_agg text[] := '{}';
  has_assigned boolean := false;
  has_own boolean := false;
  qualified boolean := false;
  rec record; sc jsonb; s text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('scope','none','source','anonymous');
  END IF;
  IF public.is_super_admin(_user_id) THEN
    RETURN jsonb_build_object('scope','all','source','super_admin');
  END IF;

  FOR rec IN
    SELECT r.id, r.scope_config
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE udr.user_id = _user_id
      AND COALESCE(r.status,'active') = 'active'
      AND lower(regexp_replace(p.module,'\s+','_','g')) = lower(_module)
      AND lower(p.name) = lower(_action)
    GROUP BY r.id, r.scope_config
  LOOP
    qualified := true;
    sc := rec.scope_config -> _module;
    IF sc IS NULL THEN has_all := true; CONTINUE; END IF;
    s := COALESCE(sc ->> 'scope', 'all');
    IF s = 'all' THEN has_all := true;
    ELSIF s = 'sector' THEN
      sectors_agg := sectors_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'sectors')), '{}');
    ELSIF s = 'institution' THEN
      licensees_agg := licensees_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'licensees')), '{}');
    ELSIF s = 'assigned' THEN has_assigned := true;
    ELSIF s = 'own' THEN has_own := true;
    END IF;
  END LOOP;

  IF NOT qualified THEN RETURN jsonb_build_object('scope','none','source','no_qualifying_role'); END IF;
  IF has_all THEN RETURN jsonb_build_object('scope','all','source','role_grant'); END IF;
  IF array_length(sectors_agg,1) > 0 THEN
    RETURN jsonb_build_object('scope','sector',
      'sectors', to_jsonb(ARRAY(SELECT DISTINCT unnest(sectors_agg))),
      'source','role_grant');
  END IF;
  IF array_length(licensees_agg,1) > 0 THEN
    RETURN jsonb_build_object('scope','institution',
      'licensees', to_jsonb(ARRAY(SELECT DISTINCT unnest(licensees_agg))),
      'source','role_grant');
  END IF;
  IF has_assigned THEN RETURN jsonb_build_object('scope','assigned','source','role_grant'); END IF;
  IF has_own THEN RETURN jsonb_build_object('scope','own','source','role_grant'); END IF;
  RETURN jsonb_build_object('scope','none','source','unbacked_scope_only');
END;
$$;

REVOKE ALL ON FUNCTION public.user_scope_for(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_scope_for(uuid,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.user_scope_for(uuid,text,text) IS
  'Authoritative scope resolver. Only roles that actually grant (module, action) contribute scope; unrelated active roles never widen access.';

-- CREATE OR REPLACE keeps existing policies pointing at this function; parameter
-- names match the prior definition (_user_id, _module, _action, _licensee_id,
-- _sector_id, _owner_id) so Postgres accepts the redefinition in place.
CREATE OR REPLACE FUNCTION public.has_scoped_permission(
  _user_id uuid, _module text, _action text,
  _licensee_id uuid DEFAULT NULL, _sector_id uuid DEFAULT NULL, _owner_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE scope jsonb; kind text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF NOT public.has_permission(_user_id, _module, _action) THEN RETURN false; END IF;

  scope := public.user_scope_for(_user_id, _module, _action);
  kind := scope ->> 'scope';

  IF kind = 'all' THEN RETURN true;
  ELSIF kind = 'sector' THEN
    RETURN _sector_id IS NOT NULL AND scope -> 'sectors' ? _sector_id::text;
  ELSIF kind = 'institution' THEN
    RETURN _licensee_id IS NOT NULL AND scope -> 'licensees' ? _licensee_id::text;
  ELSIF kind = 'assigned' THEN RETURN true;
  ELSIF kind = 'own' THEN
    RETURN _owner_id IS NOT NULL AND _owner_id = _user_id;
  END IF;
  RETURN false;
END;
$$;

-- Backfill explicit "all" for any (role, scope-aware module) with no entry.
WITH role_modules AS (
  SELECT DISTINCT rp.role_id,
         lower(regexp_replace(p.module,'\s+','_','g')) AS module_key
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
),
targets AS (
  SELECT rm.role_id, rm.module_key
  FROM role_modules rm
  JOIN public.rbac_module_scopes s ON s.module = rm.module_key
  JOIN public.roles r ON r.id = rm.role_id
  WHERE NOT (COALESCE(r.scope_config,'{}'::jsonb) ? rm.module_key)
  GROUP BY rm.role_id, rm.module_key
)
UPDATE public.roles r
SET scope_config = COALESCE(r.scope_config,'{}'::jsonb)
                   || jsonb_build_object(t.module_key, jsonb_build_object('scope','all'))
FROM targets t
WHERE t.role_id = r.id;

CREATE OR REPLACE FUNCTION public.rbac_save_role(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean;
  target_id uuid;
  new_name text := NULLIF(trim(_payload ->> 'name'), '');
  perm_ids uuid[];
  scope_cfg jsonb := COALESCE(_payload -> 'scope_config', '{}'::jsonb);
  m text; s text; missing_module text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  is_admin := public.is_super_admin(uid) OR public.has_permission(uid,'role_management','edit');
  IF NOT is_admin THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF new_name IS NULL THEN RAISE EXCEPTION 'role_name_required' USING ERRCODE = '22023'; END IF;

  FOR m, s IN SELECT k, COALESCE(v ->> 'scope','all') FROM jsonb_each(scope_cfg) AS x(k,v) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rbac_module_scopes WHERE module = m AND scope = s) THEN
      RAISE EXCEPTION 'invalid_scope: module=%, scope=%', m, s USING ERRCODE = '22023';
    END IF;
  END LOOP;

  perm_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload -> 'permission_ids','[]'::jsonb))::uuid);

  IF EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.id = ANY(perm_ids) AND lower(p.name) <> 'view'
      AND NOT EXISTS (
        SELECT 1 FROM public.permissions v
        WHERE v.id = ANY(perm_ids) AND lower(v.name) = 'view'
          AND lower(regexp_replace(v.module,'\s+','_','g')) = lower(regexp_replace(p.module,'\s+','_','g'))
      )
  ) THEN
    RAISE EXCEPTION 'permission_dependency_violation: action selected without view on its module'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(regexp_replace(p.module,'\s+','_','g')) INTO missing_module
  FROM public.permissions p
  JOIN public.rbac_module_scopes s ON s.module = lower(regexp_replace(p.module,'\s+','_','g'))
  WHERE p.id = ANY(perm_ids)
    AND NOT (scope_cfg ? lower(regexp_replace(p.module,'\s+','_','g')))
  LIMIT 1;
  IF missing_module IS NOT NULL THEN
    RAISE EXCEPTION 'scope_required_for_module: %', missing_module USING ERRCODE = '22023';
  END IF;

  target_id := NULLIF(_payload ->> 'id', '')::uuid;
  IF target_id IS NULL THEN
    INSERT INTO public.roles (
      name, description, system_role, is_system,
      role_type, dashboard_tier, role_category, status,
      access_summary, scope_config
    ) VALUES (
      new_name,
      NULLIF(_payload ->> 'description',''),
      COALESCE(NULLIF(_payload ->> 'system_role',''), 'custom'),
      false,
      COALESCE(NULLIF(_payload ->> 'role_type',''), 'custom'),
      COALESCE(NULLIF(_payload ->> 'dashboard_tier',''), 'operational'),
      NULLIF(_payload ->> 'role_category',''),
      COALESCE(NULLIF(_payload ->> 'status',''), 'active'),
      COALESCE(_payload -> 'access_summary', '{}'::jsonb),
      scope_cfg
    ) RETURNING id INTO target_id;
  ELSE
    UPDATE public.roles SET
      name = new_name,
      description = NULLIF(_payload ->> 'description',''),
      role_type = COALESCE(NULLIF(_payload ->> 'role_type',''), role_type),
      dashboard_tier = COALESCE(NULLIF(_payload ->> 'dashboard_tier',''), dashboard_tier),
      role_category = NULLIF(_payload ->> 'role_category',''),
      status = COALESCE(NULLIF(_payload ->> 'status',''), status),
      access_summary = COALESCE(_payload -> 'access_summary', access_summary),
      scope_config = scope_cfg,
      updated_at = now()
    WHERE id = target_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'role_not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = target_id;
  IF array_length(perm_ids, 1) > 0 THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT target_id, p FROM unnest(perm_ids) AS p
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('id', target_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_save_role(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_save_role(jsonb) TO authenticated, service_role;