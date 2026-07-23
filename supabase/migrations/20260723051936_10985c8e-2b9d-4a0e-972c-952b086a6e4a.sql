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
  scopeless_mod text;
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

  -- Auto-inject {"scope":"all"} for scopeless modules (only 'all' registered)
  -- so the UI (which hides scopeless modules) doesn't have to send them.
  FOR scopeless_mod IN
    SELECT DISTINCT lower(regexp_replace(p.module,'\s+','_','g')) AS mkey
    FROM public.permissions p
    WHERE p.id = ANY(perm_ids)
      AND NOT (scope_cfg ? lower(regexp_replace(p.module,'\s+','_','g')))
      AND EXISTS (
        SELECT 1 FROM public.rbac_module_scopes s
        WHERE s.module = lower(regexp_replace(p.module,'\s+','_','g'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.rbac_module_scopes s
        WHERE s.module = lower(regexp_replace(p.module,'\s+','_','g'))
          AND s.scope <> 'all'
      )
  LOOP
    scope_cfg := scope_cfg || jsonb_build_object(scopeless_mod, jsonb_build_object('scope','all'));
  END LOOP;

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