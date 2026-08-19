-- ============================================================
-- PHASE 1: canonical security schema (additive, no legacy changes)
-- ============================================================

CREATE TABLE public.sec_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.sec_modules(id) ON DELETE SET NULL,
  module_type text NOT NULL DEFAULT 'business',
  audience text NOT NULL DEFAULT 'internal',
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sec_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.sec_modules(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 100,
  is_sensitive boolean NOT NULL DEFAULT false,
  is_enforced boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, key)
);

-- Legacy permission id -> canonical sec_permissions id (dedup bridge).
CREATE TABLE public.sec_legacy_permission_map (
  legacy_permission_id uuid PRIMARY KEY,
  permission_id uuid NOT NULL REFERENCES public.sec_permissions(id) ON DELETE CASCADE
);

CREATE TABLE public.sec_permission_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_id uuid NOT NULL REFERENCES public.sec_permissions(id) ON DELETE CASCADE,
  depends_on_permission_id uuid NOT NULL REFERENCES public.sec_permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permission_id, depends_on_permission_id),
  CHECK (permission_id <> depends_on_permission_id)
);

CREATE TABLE public.sec_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  role_type text NOT NULL DEFAULT 'internal',
  role_category text,
  dashboard_tier text,
  status text NOT NULL DEFAULT 'active',
  system_role text,
  is_system boolean NOT NULL DEFAULT false,
  is_break_glass boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sec_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.sec_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.sec_permissions(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE public.sec_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.sec_roles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

-- ── Scope model ─────────────────────────────────────────────
CREATE TABLE public.sec_scope_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  requires_values boolean NOT NULL DEFAULT false,
  value_kind text,
  is_enforced boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sec_module_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.sec_modules(id) ON DELETE CASCADE,
  scope_type_id uuid NOT NULL REFERENCES public.sec_scope_types(id) ON DELETE CASCADE,
  selector text,
  label text,
  help text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, scope_type_id)
);

CREATE TABLE public.sec_role_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.sec_roles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.sec_modules(id) ON DELETE CASCADE,
  scope_type_id uuid NOT NULL REFERENCES public.sec_scope_types(id) ON DELETE RESTRICT,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, module_id)
);

CREATE TABLE public.sec_role_scope_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_scope_id uuid NOT NULL REFERENCES public.sec_role_scopes(id) ON DELETE CASCADE,
  value_kind text NOT NULL,
  value_id uuid,
  value_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Route registry ──────────────────────────────────────────
CREATE TABLE public.sec_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  path_pattern text NOT NULL,
  match_type text NOT NULL DEFAULT 'prefix',
  required_permission_id uuid REFERENCES public.sec_permissions(id) ON DELETE RESTRICT,
  audience text NOT NULL DEFAULT 'internal',
  is_protected boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (match_type IN ('exact','prefix','pattern')),
  CHECK (is_protected = false OR required_permission_id IS NOT NULL OR audience <> 'internal')
);

-- ── Navigation ──────────────────────────────────────────────
CREATE TABLE public.sec_navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.sec_navigation_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  item_type text NOT NULL DEFAULT 'link',
  route_id uuid REFERENCES public.sec_routes(id) ON DELETE RESTRICT,
  href_override text,
  icon_key text,
  sort_order integer NOT NULL DEFAULT 100,
  audience text NOT NULL DEFAULT 'internal',
  is_active boolean NOT NULL DEFAULT true,
  show_in_sidebar boolean NOT NULL DEFAULT true,
  show_in_search boolean NOT NULL DEFAULT true,
  keywords text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (item_type IN ('group','link','separator'))
);

-- ── Role templates ──────────────────────────────────────────
CREATE TABLE public.sec_role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  role_type text NOT NULL DEFAULT 'internal',
  dashboard_tier text,
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sec_role_template_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.sec_role_templates(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.sec_permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, permission_id)
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_sec_modules_key ON public.sec_modules(key);
CREATE INDEX idx_sec_modules_parent ON public.sec_modules(parent_id);
CREATE INDEX idx_sec_permissions_module_key ON public.sec_permissions(module_id, key);
CREATE INDEX idx_sec_role_permissions_role ON public.sec_role_permissions(role_id);
CREATE INDEX idx_sec_role_permissions_permission ON public.sec_role_permissions(permission_id);
CREATE INDEX idx_sec_user_roles_user ON public.sec_user_roles(user_id);
CREATE INDEX idx_sec_user_roles_role ON public.sec_user_roles(role_id);
CREATE INDEX idx_sec_role_scopes_role_module ON public.sec_role_scopes(role_id, module_id);
CREATE INDEX idx_sec_role_scope_values_scope ON public.sec_role_scope_values(role_scope_id);
CREATE INDEX idx_sec_navigation_parent_sort ON public.sec_navigation_items(parent_id, sort_order);
CREATE INDEX idx_sec_navigation_audience ON public.sec_navigation_items(audience);
CREATE INDEX idx_sec_routes_path ON public.sec_routes(path_pattern);
CREATE INDEX idx_sec_routes_priority ON public.sec_routes(priority);
CREATE INDEX idx_sec_permission_deps_permission ON public.sec_permission_dependencies(permission_id);

-- ── updated_at triggers ─────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sec_modules','sec_permissions','sec_roles','sec_user_roles','sec_scope_types',
    'sec_module_scopes','sec_role_scopes','sec_routes','sec_navigation_items',
    'sec_role_templates'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- ── Grants: read-only from the client; writes go through RPCs ─
GRANT SELECT ON public.sec_modules, public.sec_permissions, public.sec_permission_dependencies,
  public.sec_roles, public.sec_role_permissions, public.sec_user_roles, public.sec_scope_types,
  public.sec_module_scopes, public.sec_role_scopes, public.sec_role_scope_values,
  public.sec_routes, public.sec_navigation_items, public.sec_role_templates,
  public.sec_role_template_permissions, public.sec_legacy_permission_map TO authenticated;

GRANT ALL ON public.sec_modules, public.sec_permissions, public.sec_permission_dependencies,
  public.sec_roles, public.sec_role_permissions, public.sec_user_roles, public.sec_scope_types,
  public.sec_module_scopes, public.sec_role_scopes, public.sec_role_scope_values,
  public.sec_routes, public.sec_navigation_items, public.sec_role_templates,
  public.sec_role_template_permissions, public.sec_legacy_permission_map TO service_role;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.sec_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_permission_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_scope_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_module_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_role_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_role_scope_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_role_template_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_legacy_permission_map ENABLE ROW LEVEL SECURITY;

-- Catalogue metadata: readable by any signed-in user (labels/keys only).
CREATE POLICY "sec_modules_read" ON public.sec_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_permissions_read" ON public.sec_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_permission_deps_read" ON public.sec_permission_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_scope_types_read" ON public.sec_scope_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_module_scopes_read" ON public.sec_module_scopes FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_routes_read" ON public.sec_routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_navigation_read" ON public.sec_navigation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_legacy_perm_map_read" ON public.sec_legacy_permission_map FOR SELECT TO authenticated USING (true);

-- Role/grant/scope data: role-management viewers only.
CREATE POLICY "sec_roles_read" ON public.sec_roles FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'role_management', 'view'));
CREATE POLICY "sec_role_permissions_read" ON public.sec_role_permissions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'role_management', 'view'));
CREATE POLICY "sec_role_scopes_read" ON public.sec_role_scopes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'role_management', 'view'));
CREATE POLICY "sec_role_scope_values_read" ON public.sec_role_scope_values FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'role_management', 'view'));
CREATE POLICY "sec_role_templates_read" ON public.sec_role_templates FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'role_management', 'view'));
CREATE POLICY "sec_role_template_permissions_read" ON public.sec_role_template_permissions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'role_management', 'view'));

-- Own assignments always visible; others need role-management view.
CREATE POLICY "sec_user_roles_read" ON public.sec_user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'role_management', 'view'));

COMMENT ON TABLE public.sec_modules IS 'Canonical security module catalogue (replaces permission_modules).';
COMMENT ON TABLE public.sec_permissions IS 'Canonical permission catalogue (replaces permissions + permission_actions).';
COMMENT ON TABLE public.sec_routes IS 'Route -> permission registry. Security configuration: system managed.';
COMMENT ON TABLE public.sec_navigation_items IS 'Database-driven navigation. Security is inherited from sec_routes.';