-- F6-X discoverability: /settings/currency (currency master, base/reporting
-- currency and the effective-dated rate register) existed only as a typed URL
-- and a Settings Hub card. Register it canonically so it appears in the
-- database-driven sidebar and global search, and so breadcrumbs derive from the
-- menu ancestry. Menu visibility is discoverability only — the route guard,
-- RLS and the governed FX routines remain the enforcement layer.

INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id,
                               audience, is_protected, is_system, is_active, priority)
SELECT 'route_settings_currency', '/settings/currency', 'exact',
       (SELECT p.id FROM public.sec_permissions p
          JOIN public.sec_modules m ON m.id = p.module_id
         WHERE m.key = 'fee_management' AND p.key = 'view'),
       'internal', true, true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.sec_routes WHERE path_pattern = '/settings/currency');

INSERT INTO public.sec_navigation_items (key, parent_id, label, description, item_type,
                                         route_id, href_override, icon_key, sort_order,
                                         audience, is_active, show_in_sidebar, show_in_search,
                                         keywords, is_system, admin_only, required_permission_id)
SELECT 'nav_adm_sys_currency',
       (SELECT id FROM public.sec_navigation_items WHERE key = 'nav_adm_system'),
       'Currency & Exchange Rates',
       'Currency master, base and reporting currency, and the effective-dated exchange rate register',
       'link',
       (SELECT id FROM public.sec_routes WHERE path_pattern = '/settings/currency'),
       '/settings/currency',
       'Banknote', 40, 'internal', true, true, true,
       ARRAY['currency','exchange rate','fx','base currency','reporting currency','forex'],
       true, false,
       (SELECT p.id FROM public.sec_permissions p
          JOIN public.sec_modules m ON m.id = p.module_id
         WHERE m.key = 'fee_management' AND p.key = 'view')
WHERE NOT EXISTS (SELECT 1 FROM public.sec_navigation_items WHERE key = 'nav_adm_sys_currency');