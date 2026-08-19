-- ============================================================
-- PHASE 2: backfill sec_* from legacy tables (access-preserving)
-- ============================================================

-- 1. Modules ---------------------------------------------------
INSERT INTO public.sec_modules (id, key, label, description, parent_id, sort_order, is_system, is_active, audience)
SELECT id, key, label, description, parent_id, sort_order, is_system, is_active, audience
FROM public.permission_modules
ON CONFLICT (key) DO NOTHING;

-- Module keys referenced by permissions but missing from the catalogue.
INSERT INTO public.sec_modules (key, label, is_system, is_active)
SELECT DISTINCT lower(regexp_replace(p.module, '\s+', '_', 'g')),
       initcap(replace(lower(regexp_replace(p.module, '\s+', '_', 'g')), '_', ' ')),
       true, true
FROM public.permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM public.sec_modules m
  WHERE m.key = lower(regexp_replace(p.module, '\s+', '_', 'g'))
)
ON CONFLICT (key) DO NOTHING;

-- 2. Permissions (canonical = lowest legacy id per module+key) --
WITH canon AS (
  SELECT DISTINCT ON (lower(regexp_replace(p.module,'\s+','_','g')), lower(p.name))
         p.id, lower(regexp_replace(p.module,'\s+','_','g')) AS module_key,
         lower(p.name) AS perm_key, p.description, p.enforced, p.deprecated, p.action_id
  FROM public.permissions p
  ORDER BY lower(regexp_replace(p.module,'\s+','_','g')), lower(p.name), p.id
)
INSERT INTO public.sec_permissions (id, module_id, key, label, description, is_enforced, is_active, is_system, sort_order, is_sensitive)
SELECT c.id, m.id, c.perm_key,
       COALESCE(a.label, initcap(replace(c.perm_key,'_',' '))),
       c.description, c.enforced, NOT c.deprecated, true,
       COALESCE(a.sort_order, 100),
       c.perm_key IN ('delete','approve','reject','assign_permissions','override','export',
                      'manage_roles','bypass','publish','close','reopen')
FROM canon c
JOIN public.sec_modules m ON m.key = c.module_key
LEFT JOIN public.permission_actions a ON a.id = c.action_id
ON CONFLICT (module_id, key) DO NOTHING;

-- Actions defined in the catalogue but with no legacy permission row.
INSERT INTO public.sec_permissions (module_id, key, label, description, is_active, is_system, sort_order)
SELECT a.module_id, lower(a.key), a.label, a.description, a.is_active, a.is_system, a.sort_order
FROM public.permission_actions a
JOIN public.sec_modules m ON m.id = a.module_id
ON CONFLICT (module_id, key) DO NOTHING;

-- 3. Legacy permission id -> canonical id bridge ---------------
INSERT INTO public.sec_legacy_permission_map (legacy_permission_id, permission_id)
SELECT p.id, sp.id
FROM public.permissions p
JOIN public.sec_modules m ON m.key = lower(regexp_replace(p.module,'\s+','_','g'))
JOIN public.sec_permissions sp ON sp.module_id = m.id AND sp.key = lower(p.name)
ON CONFLICT (legacy_permission_id) DO NOTHING;

-- 4. Roles -----------------------------------------------------
INSERT INTO public.sec_roles (id, key, name, description, role_type, role_category, dashboard_tier,
                              status, system_role, is_system, is_break_glass, created_at, updated_at)
SELECT r.id,
       -- stable key: slug of name, disambiguated by id fragment when needed
       CASE WHEN cnt.n > 1
            THEN regexp_replace(lower(trim(r.name)), '[^a-z0-9]+', '_', 'g') || '_' || left(r.id::text, 8)
            ELSE regexp_replace(lower(trim(r.name)), '[^a-z0-9]+', '_', 'g')
       END,
       r.name, r.description,
       COALESCE(r.role_type, 'internal'),
       r.role_category, r.dashboard_tier,
       COALESCE(r.status, 'active'),
       r.system_role, COALESCE(r.is_system, false),
       (r.system_role = 'super_admin'),
       r.created_at, COALESCE(r.updated_at, now())
FROM public.roles r
JOIN (
  SELECT regexp_replace(lower(trim(name)), '[^a-z0-9]+', '_', 'g') AS slug, count(*) n
  FROM public.roles GROUP BY 1
) cnt ON cnt.slug = regexp_replace(lower(trim(r.name)), '[^a-z0-9]+', '_', 'g')
ON CONFLICT (id) DO NOTHING;

-- 5. Role permission grants ------------------------------------
INSERT INTO public.sec_role_permissions (role_id, permission_id, created_at)
SELECT DISTINCT rp.role_id, lm.permission_id, min(rp.created_at) OVER (PARTITION BY rp.role_id, lm.permission_id)
FROM public.role_permissions rp
JOIN public.sec_legacy_permission_map lm ON lm.legacy_permission_id = rp.permission_id
JOIN public.sec_roles r ON r.id = rp.role_id
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 6. User role assignments -------------------------------------
INSERT INTO public.sec_user_roles (user_id, role_id, status, effective_from, created_at)
SELECT udr.user_id, udr.role_id, 'active', udr.created_at, udr.created_at
FROM public.user_dynamic_roles udr
JOIN public.sec_roles r ON r.id = udr.role_id
ON CONFLICT (user_id, role_id) DO NOTHING;

-- profiles.role_id only when not already represented.
INSERT INTO public.sec_user_roles (user_id, role_id, status, effective_from, created_at)
SELECT pr.id, pr.role_id, 'active', now(), now()
FROM public.profiles pr
JOIN public.sec_roles r ON r.id = pr.role_id
WHERE pr.role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 7. Scope types (only scopes with real backend enforcement) ----
INSERT INTO public.sec_scope_types (key, label, description, requires_values, value_kind, sort_order) VALUES
  ('all',         'All records',        'No data restriction within the module.',      false, NULL,       10),
  ('assigned',    'Assigned records',   'Only records assigned to the user.',          false, NULL,       20),
  ('sector',      'Selected sectors',   'Only records in the selected sectors.',       true,  'sector',   30),
  ('institution', 'Selected licensees', 'Only records for the selected institutions.', true,  'licensee', 40),
  ('own',         'Own records',        'Only records the user owns/created.',         false, NULL,       50)
ON CONFLICT (key) DO NOTHING;

-- 8. Module scopes from rbac_module_scopes ----------------------
INSERT INTO public.sec_module_scopes (module_id, scope_type_id, selector, label, help)
SELECT m.id, st.id, ms.selector, ms.label, ms.help
FROM public.rbac_module_scopes ms
JOIN public.sec_modules m ON m.key = lower(regexp_replace(ms.module,'\s+','_','g'))
JOIN public.sec_scope_types st ON st.key = ms.scope
ON CONFLICT (module_id, scope_type_id) DO NOTHING;

-- 9. Role scopes from roles.scope_config ------------------------
INSERT INTO public.sec_role_scopes (role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
FROM public.roles r
CROSS JOIN LATERAL jsonb_each(COALESCE(r.scope_config, '{}'::jsonb)) AS cfg(module_key, cfg_val)
JOIN public.sec_modules m ON m.key = lower(regexp_replace(cfg.module_key,'\s+','_','g'))
JOIN public.sec_scope_types st ON st.key = COALESCE(cfg.cfg_val ->> 'scope', 'all')
WHERE jsonb_typeof(cfg.cfg_val) = 'object'
ON CONFLICT (role_id, module_id) DO NOTHING;

INSERT INTO public.sec_role_scope_values (role_scope_id, value_kind, value_id)
SELECT rs.id, 'sector', v::uuid
FROM public.roles r
CROSS JOIN LATERAL jsonb_each(COALESCE(r.scope_config, '{}'::jsonb)) AS cfg(module_key, cfg_val)
JOIN public.sec_modules m ON m.key = lower(regexp_replace(cfg.module_key,'\s+','_','g'))
JOIN public.sec_role_scopes rs ON rs.role_id = r.id AND rs.module_id = m.id
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cfg.cfg_val -> 'sectors', '[]'::jsonb)) AS v
WHERE v ~ '^[0-9a-f-]{36}$';

INSERT INTO public.sec_role_scope_values (role_scope_id, value_kind, value_id)
SELECT rs.id, 'licensee', v::uuid
FROM public.roles r
CROSS JOIN LATERAL jsonb_each(COALESCE(r.scope_config, '{}'::jsonb)) AS cfg(module_key, cfg_val)
JOIN public.sec_modules m ON m.key = lower(regexp_replace(cfg.module_key,'\s+','_','g'))
JOIN public.sec_role_scopes rs ON rs.role_id = r.id AND rs.module_id = m.id
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cfg.cfg_val -> 'licensees', '[]'::jsonb)) AS v
WHERE v ~ '^[0-9a-f-]{36}$';

-- 10. Permission dependencies (every non-view action requires view)
INSERT INTO public.sec_permission_dependencies (permission_id, depends_on_permission_id)
SELECT p.id, v.id
FROM public.sec_permissions p
JOIN public.sec_permissions v ON v.module_id = p.module_id AND v.key = 'view'
WHERE p.key <> 'view'
ON CONFLICT DO NOTHING;