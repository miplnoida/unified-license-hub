INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, priority)
VALUES ('route_onboarding_oversight', '/licensing/onboarding-oversight', 'prefix',
        (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
          WHERE m.key='onboarding' AND p.key='audit_view'), 'internal', true, true, 100)
ON CONFLICT (key) DO UPDATE
  SET path_pattern = EXCLUDED.path_pattern,
      required_permission_id = EXCLUDED.required_permission_id,
      is_active = true;

INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
   show_in_sidebar, show_in_search, keywords, required_permission_id)
VALUES ('nav_lic_onboarding_oversight',
        (SELECT id FROM public.sec_navigation_items WHERE key='nav_lic_registration'),
        'Onboarding Oversight',
        'Audit of organisation identification activity across both registration journeys.',
        'link',
        (SELECT id FROM public.sec_routes WHERE key='route_onboarding_oversight'),
        'SearchCheck', 130, 'internal', true, true,
        ARRAY['onboarding','entity search','identification','audit','registration journey'],
        (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
          WHERE m.key='onboarding' AND p.key='audit_view'))
ON CONFLICT (key) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, route_id = EXCLUDED.route_id,
      required_permission_id = EXCLUDED.required_permission_id, is_active = true, show_in_sidebar = true;