DO $$
DECLARE v_perm uuid; v_route_network uuid; v_route_address uuid; v_group uuid;
BEGIN
  SELECT id INTO v_perm FROM public.sec_permissions
   WHERE id = 'e024eb66-0279-4ed7-b20c-43849fd0f4e9';
  IF v_perm IS NULL THEN
    RAISE EXCEPTION 'entity_structure.view permission missing';
  END IF;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_relationship_intelligence','/intelligence/network','exact','internal',true,0,v_perm)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern,
    match_type = EXCLUDED.match_type,
    audience = EXCLUDED.audience,
    is_protected = true,
    is_active = true,
    required_permission_id = EXCLUDED.required_permission_id
  RETURNING id INTO v_route_network;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_address_360','/intelligence/addresses/:addressId','exact','internal',true,0,v_perm)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern,
    match_type = EXCLUDED.match_type,
    audience = EXCLUDED.audience,
    is_protected = true,
    is_active = true,
    required_permission_id = EXCLUDED.required_permission_id
  RETURNING id INTO v_route_address;

  SELECT id INTO v_group FROM public.sec_navigation_items WHERE key = 'grp_nav_entities';

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_relationship_intelligence', v_group, 'Relationship Intelligence',
          'Deterministic common-address evidence across canonical entities, persons and addresses',
          'link', v_route_network, 'Network', 70, 'internal', true, true,
          ARRAY['address','addresses','co-location','common address','relationship','intelligence','network','address 360'], v_perm)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    route_id = EXCLUDED.route_id,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    audience = EXCLUDED.audience,
    is_active = true,
    show_in_sidebar = true,
    show_in_search = true,
    keywords = EXCLUDED.keywords,
    required_permission_id = EXCLUDED.required_permission_id;

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_address_360', v_group, 'Address 360',
          'Canonical address record, recorded usages and co-location evidence',
          'link', v_route_address, 'MapPin', 71, 'internal', false, true,
          ARRAY['address 360','canonical address','normalized address','address usage'], v_perm)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    route_id = EXCLUDED.route_id,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    audience = EXCLUDED.audience,
    is_active = true,
    show_in_sidebar = false,
    show_in_search = true,
    keywords = EXCLUDED.keywords,
    required_permission_id = EXCLUDED.required_permission_id;
END $$;