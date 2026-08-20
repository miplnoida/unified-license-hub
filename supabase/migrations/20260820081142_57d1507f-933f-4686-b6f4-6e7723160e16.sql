-- RDM-ENTITY-001 Wave A — register the membership review surface in the
-- canonical route + navigation registry (menu = discoverability only).
DO $$
DECLARE v_perm uuid; v_route uuid; v_parent uuid; v_sort int;
BEGIN
  SELECT p.id INTO v_perm
    FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'entity_membership' AND p.key = 'view';

  INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, priority)
  VALUES ('route_entity_memberships', '/admin/entity-memberships', 'exact', v_perm, 'internal', true, true, 100)
  ON CONFLICT (key) DO UPDATE SET required_permission_id = EXCLUDED.required_permission_id,
                                  path_pattern = EXCLUDED.path_pattern
  RETURNING id INTO v_route;

  SELECT id INTO v_parent FROM public.sec_navigation_items WHERE key = 'grp_internal_access_control';
  IF v_parent IS NULL THEN
    SELECT id INTO v_parent FROM public.sec_navigation_items WHERE key = 'grp_nav_administration';
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_sort
    FROM public.sec_navigation_items WHERE parent_id = v_parent;

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, is_active, show_in_sidebar, show_in_search, keywords, is_system,
     admin_only, required_permission_id)
  VALUES
    ('nav_admin_entity_memberships', v_parent, 'Entity Memberships',
     'Approve who may act for a regulated entity', 'link', v_route, 'user-check', v_sort,
     'internal', true, true, true, ARRAY['membership','entity','access','delegate'], true,
     false, v_perm)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    route_id = EXCLUDED.route_id,
    required_permission_id = EXCLUDED.required_permission_id,
    is_active = true,
    show_in_sidebar = true;
END $$;