
-- 1. Module scope capability registry -----------------------------------------
CREATE TABLE IF NOT EXISTS public.rbac_module_scopes (
  module text NOT NULL,
  scope  text NOT NULL,
  selector text,
  label text NOT NULL,
  help text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, scope)
);

GRANT SELECT ON public.rbac_module_scopes TO authenticated;
GRANT ALL    ON public.rbac_module_scopes TO service_role;

ALTER TABLE public.rbac_module_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read scope registry" ON public.rbac_module_scopes;
CREATE POLICY "authenticated can read scope registry"
  ON public.rbac_module_scopes FOR SELECT TO authenticated USING (true);

-- Seed / refresh mirror of src/lib/rbac/scopeCapabilities.ts
INSERT INTO public.rbac_module_scopes (module, scope, selector, label, help) VALUES
  ('returns_management','all',NULL,'All records','See every record in this module.'),
  ('returns_management','assigned',NULL,'Assigned only','Only records assigned to this user.'),
  ('returns_management','institution','licensees','Selected institutions','Records for a specific list of licensees.'),
  ('returns_management','sector','sectors','Selected sectors','Records whose licensee belongs to selected sectors.'),
  ('complaint_management','all',NULL,'All records',NULL),
  ('complaint_management','assigned',NULL,'Assigned only',NULL),
  ('complaint_management','team','teams','Team records',NULL),
  ('market_conduct','all',NULL,'All records',NULL),
  ('market_conduct','assigned',NULL,'Assigned only',NULL),
  ('market_conduct','sector','sectors','Selected sectors',NULL),
  ('application_management','all',NULL,'All records',NULL),
  ('application_management','assigned',NULL,'Assigned only',NULL),
  ('application_management','department','departments','Own department',NULL),
  ('licensee_management','all',NULL,'All records',NULL),
  ('licensee_management','assigned',NULL,'Assigned only',NULL),
  ('licensee_management','institution','licensees','Selected institutions',NULL),
  ('licensee_management','sector','sectors','Selected sectors',NULL),
  ('license_management','all',NULL,'All records',NULL),
  ('license_management','assigned',NULL,'Assigned only',NULL),
  ('license_management','institution','licensees','Selected institutions',NULL),
  ('registration_management','all',NULL,'All records',NULL),
  ('registration_management','assigned',NULL,'Assigned only',NULL),
  ('prudential_supervision','all',NULL,'All records',NULL),
  ('prudential_supervision','assigned',NULL,'Assigned only',NULL),
  ('prudential_supervision','institution','licensees','Selected institutions',NULL),
  ('prudential_supervision','sector','sectors','Selected sectors',NULL),
  ('fit_and_proper','all',NULL,'All records',NULL),
  ('fit_and_proper','assigned',NULL,'Assigned only',NULL),
  ('fit_and_proper','institution','licensees','Selected institutions',NULL),
  ('enforcement','all',NULL,'All records',NULL),
  ('enforcement','assigned',NULL,'Assigned only',NULL),
  ('inspection_management','all',NULL,'All records',NULL),
  ('inspection_management','assigned',NULL,'Assigned only',NULL),
  ('inspection_management','institution','licensees','Selected institutions',NULL),
  ('compliance_returns','all',NULL,'All records',NULL),
  ('compliance_returns','assigned',NULL,'Assigned only',NULL),
  ('compliance_returns','institution','licensees','Selected institutions',NULL),
  ('fee_management','all',NULL,'All records',NULL),
  ('fee_management','assigned',NULL,'Assigned only',NULL),
  ('form_management','all',NULL,'All records',NULL),
  ('form_management','own',NULL,'Own records only',NULL),
  ('audit_management','all',NULL,'All records',NULL),
  ('settings','all',NULL,'All records',NULL),
  ('role_management','all',NULL,'All records',NULL),
  ('notification_management','all',NULL,'All records',NULL),
  ('reports_management','all',NULL,'All records',NULL),
  ('reports_management','assigned',NULL,'Assigned only',NULL),
  ('reports_management','sector','sectors','Selected sectors',NULL)
ON CONFLICT (module, scope) DO UPDATE
  SET selector = EXCLUDED.selector, label = EXCLUDED.label, help = EXCLUDED.help;

-- 2. Inactive-role enforcement in has_permission ------------------------------
-- Rewrite has_permission so any role with status <> 'active' is skipped.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_dynamic_roles udr
      JOIN public.roles r ON r.id = udr.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE udr.user_id = _user_id
        AND COALESCE(r.status, 'active') = 'active'
        AND lower(regexp_replace(p.module, '\s+', '_', 'g')) = lower(regexp_replace(_module, '\s+', '_', 'g'))
        AND lower(p.name) = lower(_action)
    );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, service_role;

-- 3. Scope resolvers ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.role_scope_for(_role_id uuid, _module text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (scope_config -> _module) FROM public.roles WHERE id = _role_id),
    jsonb_build_object('scope','all')
  );
$$;

-- Merge active roles' scope for a user + module into a single normalized blob.
-- Precedence: 'all' > 'sector' union > 'institution' union > 'assigned'/'team'/'own'.
CREATE OR REPLACE FUNCTION public.user_scope_for(_user_id uuid, _module text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_all boolean := false;
  sectors_agg text[] := '{}';
  licensees_agg text[] := '{}';
  departments_agg text[] := '{}';
  teams_agg text[] := '{}';
  has_assigned boolean := false;
  has_team boolean := false;
  has_own boolean := false;
  rec record;
  sc jsonb;
  s text;
BEGIN
  IF public.is_super_admin(_user_id) THEN
    RETURN jsonb_build_object('scope','all','source','super_admin');
  END IF;

  FOR rec IN
    SELECT r.id, r.scope_config
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    WHERE udr.user_id = _user_id
      AND COALESCE(r.status,'active') = 'active'
  LOOP
    sc := rec.scope_config -> _module;
    IF sc IS NULL THEN
      has_all := true; -- absent = full access for this role
      CONTINUE;
    END IF;
    s := COALESCE(sc ->> 'scope', 'all');
    IF s = 'all' THEN
      has_all := true;
    ELSIF s = 'sector' THEN
      sectors_agg := sectors_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'sectors')), '{}');
    ELSIF s = 'institution' THEN
      licensees_agg := licensees_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'licensees')), '{}');
    ELSIF s = 'department' THEN
      departments_agg := departments_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'departments')), '{}');
    ELSIF s = 'team' THEN
      has_team := true;
      teams_agg := teams_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'teams')), '{}');
    ELSIF s = 'assigned' THEN
      has_assigned := true;
    ELSIF s = 'own' THEN
      has_own := true;
    END IF;
  END LOOP;

  IF has_all THEN
    RETURN jsonb_build_object('scope','all');
  END IF;

  RETURN jsonb_build_object(
    'scope', CASE
              WHEN array_length(sectors_agg,1) > 0 THEN 'sector'
              WHEN array_length(licensees_agg,1) > 0 THEN 'institution'
              WHEN array_length(departments_agg,1) > 0 THEN 'department'
              WHEN has_team THEN 'team'
              WHEN has_assigned THEN 'assigned'
              WHEN has_own THEN 'own'
              ELSE 'none'
            END,
    'sectors', to_jsonb(sectors_agg),
    'licensees', to_jsonb(licensees_agg),
    'departments', to_jsonb(departments_agg),
    'teams', to_jsonb(teams_agg)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.role_scope_for(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_scope_for(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.role_scope_for(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_scope_for(uuid, text) TO authenticated, service_role;

-- 4. Transactional role save --------------------------------------------------
-- Payload:
-- { id?: uuid, name: text, description: text,
--   role_type, dashboard_tier, role_category, status,
--   access_summary: jsonb, scope_config: jsonb,
--   permission_ids: uuid[] }
CREATE OR REPLACE FUNCTION public.rbac_save_role(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean;
  target_id uuid;
  new_name text := NULLIF(trim(_payload ->> 'name'), '');
  perm_ids uuid[];
  scope_cfg jsonb := COALESCE(_payload -> 'scope_config', '{}'::jsonb);
  m text;
  s text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  is_admin := public.is_super_admin(uid) OR public.has_permission(uid, 'role_management', 'edit');
  IF NOT is_admin THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF new_name IS NULL THEN
    RAISE EXCEPTION 'role_name_required' USING ERRCODE = '22023';
  END IF;

  -- Validate scope_config against registry.
  FOR m, s IN SELECT k, COALESCE(v ->> 'scope','all') FROM jsonb_each(scope_cfg) AS x(k,v) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rbac_module_scopes WHERE module = m AND scope = s) THEN
      RAISE EXCEPTION 'invalid_scope: module=%, scope=%', m, s USING ERRCODE = '22023';
    END IF;
  END LOOP;

  perm_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload -> 'permission_ids','[]'::jsonb))::uuid);

  -- Server-side dependency check: no non-view permission without view on its module.
  IF EXISTS (
    SELECT 1
    FROM public.permissions p
    WHERE p.id = ANY(perm_ids)
      AND lower(p.name) <> 'view'
      AND NOT EXISTS (
        SELECT 1 FROM public.permissions v
        WHERE v.id = ANY(perm_ids)
          AND lower(v.name) = 'view'
          AND lower(regexp_replace(v.module,'\s+','_','g'))
              = lower(regexp_replace(p.module,'\s+','_','g'))
      )
  ) THEN
    RAISE EXCEPTION 'permission_dependency_violation: an action was selected without view on its module'
      USING ERRCODE = '22023';
  END IF;

  target_id := NULLIF(_payload ->> 'id', '')::uuid;

  IF target_id IS NULL THEN
    INSERT INTO public.roles (
      name, description, system_role, is_system,
      role_type, dashboard_tier, role_category, status,
      access_summary, scope_config
    )
    VALUES (
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
    )
    RETURNING id INTO target_id;
  ELSE
    UPDATE public.roles SET
      name          = new_name,
      description   = NULLIF(_payload ->> 'description',''),
      role_type     = COALESCE(NULLIF(_payload ->> 'role_type',''), role_type),
      dashboard_tier= COALESCE(NULLIF(_payload ->> 'dashboard_tier',''), dashboard_tier),
      role_category = NULLIF(_payload ->> 'role_category',''),
      status        = COALESCE(NULLIF(_payload ->> 'status',''), status),
      access_summary= COALESCE(_payload -> 'access_summary', access_summary),
      scope_config  = scope_cfg,
      updated_at    = now()
    WHERE id = target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'role_not_found' USING ERRCODE = 'P0002';
    END IF;
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
