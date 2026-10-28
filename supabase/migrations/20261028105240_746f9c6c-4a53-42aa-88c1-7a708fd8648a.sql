INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, href_override, icon_key, sort_order, audience,
   is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only)
SELECT 'nav_entity_my_institution', parent_id, 'My Institution',
       'Your institution''s registered details, licences, key persons and authorised users',
       'link', '/entity/profile', 'Building2', 15, 'external',
       true, true, true, ARRAY['institution','profile','entity','directors','users'], true, false
  FROM public.sec_navigation_items WHERE key = 'nav_licenses_my_licenses'
ON CONFLICT (key) DO NOTHING;