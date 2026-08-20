DO $$
DECLARE
  v_view uuid;
  v_config uuid;
  v_group uuid;
BEGIN
  SELECT p.id INTO v_view FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'returns_management' AND p.key = 'view';
  SELECT p.id INTO v_config FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'returns_management' AND p.key = 'manage_config';
  SELECT id INTO v_group FROM public.sec_navigation_items WHERE key = 'grp_nav_returns';

  INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, priority)
  VALUES
    ('route_returns_queue', '/returns/queue', 'exact', v_view, 'internal', true, 50),
    ('route_returns_obligations', '/returns/obligations', 'exact', v_view, 'internal', true, 50),
    ('route_returns_calendar', '/returns/calendar', 'exact', v_view, 'internal', true, 50),
    ('route_returns_configuration', '/returns/configuration', 'exact', v_config, 'internal', true, 50)
  ON CONFLICT (key) DO UPDATE
    SET path_pattern = EXCLUDED.path_pattern,
        required_permission_id = EXCLUDED.required_permission_id,
        audience = EXCLUDED.audience,
        is_protected = EXCLUDED.is_protected,
        updated_at = now();

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
     show_in_sidebar, show_in_search, keywords, required_permission_id)
  SELECT x.key, v_group, x.label, x.description, 'link',
         (SELECT id FROM public.sec_routes WHERE key = x.route_key),
         x.icon, x.sort_order, 'internal', true, true, x.keywords,
         CASE WHEN x.route_key = 'route_returns_configuration' THEN v_config ELSE v_view END
  FROM (VALUES
    ('nav_returns_queue', 'Filing Queue', 'Canonical return filings across supervised entities', 'route_returns_queue', 'Inbox', 310, ARRAY['returns','filing','queue','submissions']),
    ('nav_returns_obligations', 'Reporting Obligations', 'Derive obligations and manage reporting periods', 'route_returns_obligations', 'ListChecks', 312, ARRAY['returns','obligations','periods']),
    ('nav_returns_calendar', 'Reporting Calendar', 'Due dates and filing state per entity', 'route_returns_calendar', 'CalendarCheck', 314, ARRAY['returns','calendar','due dates']),
    ('nav_returns_configuration', 'Returns Configuration', 'Return definitions, obligation rules and metrics', 'route_returns_configuration', 'SlidersHorizontal', 316, ARRAY['returns','metrics','definitions','configuration'])
  ) AS x(key, label, description, route_key, icon, sort_order, keywords)
  ON CONFLICT (key) DO UPDATE
    SET parent_id = EXCLUDED.parent_id,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        route_id = EXCLUDED.route_id,
        icon_key = EXCLUDED.icon_key,
        sort_order = EXCLUDED.sort_order,
        required_permission_id = EXCLUDED.required_permission_id,
        is_active = true,
        show_in_sidebar = true,
        updated_at = now();
END $$;