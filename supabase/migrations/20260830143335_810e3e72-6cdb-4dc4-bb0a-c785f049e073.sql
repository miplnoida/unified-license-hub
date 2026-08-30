DO $$
DECLARE v_perm uuid; v_route_person uuid; v_route_queue uuid; v_group uuid;
BEGIN
  SELECT id INTO v_perm FROM public.sec_permissions
   WHERE id = 'e024eb66-0279-4ed7-b20c-43849fd0f4e9';
  IF v_perm IS NULL THEN
    RAISE EXCEPTION 'entity_structure.view permission missing';
  END IF;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_person_detail','/persons/:partyId','exact','internal',true,0,v_perm)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern,
    match_type = EXCLUDED.match_type,
    audience = EXCLUDED.audience,
    is_protected = true,
    is_active = true,
    required_permission_id = EXCLUDED.required_permission_id
  RETURNING id INTO v_route_person;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_person_identity_queue','/persons/identity-queue','exact','internal',true,0,v_perm)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern,
    match_type = EXCLUDED.match_type,
    audience = EXCLUDED.audience,
    is_protected = true,
    is_active = true,
    required_permission_id = EXCLUDED.required_permission_id
  RETURNING id INTO v_route_queue;

  SELECT id INTO v_group FROM public.sec_navigation_items WHERE key = 'grp_nav_entities';

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_person_identity_queue', v_group, 'Identity Resolution Queue',
          'Unresolved links between Fit & Proper records and canonical persons',
          'link', v_route_queue, 'UserSearch', 60, 'internal', true, true,
          ARRAY['person','identity','fit and proper','linkage','resolution','person 360'], v_perm)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    route_id = EXCLUDED.route_id,
    sort_order = EXCLUDED.sort_order,
    audience = EXCLUDED.audience,
    is_active = true,
    show_in_sidebar = true,
    show_in_search = true,
    keywords = EXCLUDED.keywords,
    required_permission_id = EXCLUDED.required_permission_id;
END $$;