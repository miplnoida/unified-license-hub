-- Navigation + route registration for the Supervisory Methodology administration
-- workspace. Authority reuses the existing methodology configuration permission
-- (aml_supervision.manage_config) already carried by the calculation screens.
DO $do$
DECLARE
  _perm uuid;
  _parent uuid;
  _route_reg uuid;
  _route_detail uuid;
BEGIN
  SELECT required_permission_id, parent_id INTO _perm, _parent
    FROM public.sec_navigation_items WHERE key = 'nav_cfg_sup_calculation';

  IF _parent IS NULL THEN
    RAISE NOTICE 'Supervision configuration navigation parent not found; skipping.';
    RETURN;
  END IF;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
  VALUES ('route_admin_supervisory_methodology', '/admin/supervisory-methodology', 'exact', _perm, 'internal', true, true, true, 100)
  ON CONFLICT (key) DO UPDATE SET path_pattern = EXCLUDED.path_pattern, required_permission_id = EXCLUDED.required_permission_id, updated_at = now()
  RETURNING id INTO _route_reg;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
  VALUES ('route_admin_supervisory_methodology_detail', '/admin/supervisory-methodology/:methodologyId', 'exact', _perm, 'internal', true, true, true, 100)
  ON CONFLICT (key) DO UPDATE SET path_pattern = EXCLUDED.path_pattern, required_permission_id = EXCLUDED.required_permission_id, updated_at = now()
  RETURNING id INTO _route_detail;

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
     is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
  VALUES
    ('nav_cfg_sup_methodology', _parent, 'Supervisory Methodology',
     'Review supervisory assessment methodologies, versions, origin, content, readiness and regulator approval.',
     'link', _route_reg, 'BookOpenCheck', 59, 'internal',
     true, false, true,
     ARRAY['methodology','supervisory','assessment','questions','version','adoption','regulator approval'],
     true, true, _perm)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
    route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order,
    keywords = EXCLUDED.keywords, required_permission_id = EXCLUDED.required_permission_id,
    is_active = true, updated_at = now();

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
     is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
  VALUES
    ('nav_cfg_sup_methodology_detail',
     (SELECT id FROM public.sec_navigation_items WHERE key = 'nav_cfg_sup_methodology'),
     'Methodology Version',
     'Methodology version review workspace: content, semantics, evidence, parameters, decisions, approval and audit.',
     'link', _route_detail, 'FileSearch', 1, 'internal',
     true, false, false,
     ARRAY['methodology version','review','compare','approval'],
     true, true, _perm)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
    route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order,
    required_permission_id = EXCLUDED.required_permission_id, is_active = true, updated_at = now();
END
$do$;