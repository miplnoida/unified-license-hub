-- Register the MC-02 complaint intake queue in the canonical route + navigation registry.
INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
SELECT 'complaints_intake_queue', '/complaints/intake-queue', 'exact',
       (SELECT p.id FROM public.sec_permissions p
          JOIN public.sec_modules m ON m.id = p.module_id
         WHERE m.key = 'complaint_management' AND p.key = 'view'),
       'internal', true, true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.sec_routes WHERE key = 'complaints_intake_queue');

INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
   is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
SELECT 'nav_market_conduct_intake_queue',
       (SELECT id FROM public.sec_navigation_items WHERE key = 'nav_sup_conduct'),
       'Complaint Intake Queue',
       'Received complaints awaiting jurisdiction assessment, information, triage or a support review',
       'link',
       (SELECT id FROM public.sec_routes WHERE key = 'complaints_intake_queue'),
       'Inbox', 15, 'internal', true, true, true,
       ARRAY['intake','triage','jurisdiction','queue','complaints'], true, false,
       (SELECT p.id FROM public.sec_permissions p
          JOIN public.sec_modules m ON m.id = p.module_id
         WHERE m.key = 'complaint_management' AND p.key = 'view')
WHERE NOT EXISTS (SELECT 1 FROM public.sec_navigation_items WHERE key = 'nav_market_conduct_intake_queue');