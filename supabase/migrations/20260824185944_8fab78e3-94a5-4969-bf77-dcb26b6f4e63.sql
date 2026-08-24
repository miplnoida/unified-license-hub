-- Link the Regulatory Operating Structure admin page into the live navigation.
-- It was previously reachable only by typing the URL (present in the hardcoded
-- boot fallback menu only). Idempotent on sec_routes.key / sec_navigation_items.key.

DO $$
DECLARE
  v_perm uuid;
  v_route uuid;
  v_parent uuid;
BEGIN
  SELECT p.id INTO v_perm
  FROM sec_permissions p JOIN sec_modules m ON m.id = p.module_id
  WHERE m.key = 'user_management' AND p.key = 'view';

  SELECT id INTO v_parent FROM sec_navigation_items WHERE key = 'nav_adm_access';
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'nav_adm_access parent group missing';
  END IF;

  SELECT id INTO v_route FROM sec_routes WHERE path_pattern = '/admin/operating-structure';
  IF v_route IS NULL THEN
    INSERT INTO sec_routes (key, path_pattern, match_type, required_permission_id,
                            audience, is_protected, is_system, is_active, priority)
    VALUES ('route_admin_operating_structure', '/admin/operating-structure', 'exact', v_perm,
            'internal', true, true, true, 100)
    RETURNING id INTO v_route;
  ELSE
    UPDATE sec_routes
       SET required_permission_id = COALESCE(required_permission_id, v_perm),
           is_active = true, updated_at = now()
     WHERE id = v_route;
  END IF;

  INSERT INTO sec_navigation_items (
    key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
    audience, is_active, show_in_sidebar, show_in_search, keywords, is_system,
    admin_only, required_permission_id
  ) VALUES (
    'nav_administration_operating_structure', v_parent, 'Operating Structure',
    'Teams, staff responsibilities, entity supervision assignments, panels and committees.',
    'link', v_route, 'Network', 50, 'internal', true, true, true,
    ARRAY['operating structure','teams','mandates','portfolios','entity supervision','panels','committees','staff responsibilities'],
    true, true, v_perm
  )
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    item_type = EXCLUDED.item_type,
    route_id = EXCLUDED.route_id,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    audience = EXCLUDED.audience,
    is_active = true,
    show_in_sidebar = true,
    show_in_search = true,
    keywords = EXCLUDED.keywords,
    admin_only = EXCLUDED.admin_only,
    required_permission_id = EXCLUDED.required_permission_id,
    updated_at = now();
END $$;