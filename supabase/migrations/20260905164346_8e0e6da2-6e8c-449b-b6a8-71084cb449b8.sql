INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience,
                               is_protected, is_system, is_active, priority)
SELECT 'route_supervision_monitoring', '/supervision/monitoring', 'exact',
       r.required_permission_id, 'internal', true, true, true, 100
  FROM public.sec_routes r
 WHERE r.path_pattern = '/supervision/portfolio'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, href_override, icon_key, sort_order,
   audience, is_active, show_in_sidebar, show_in_search, keywords, is_system,
   admin_only, required_permission_id)
SELECT 'nav_sup_monitoring', p.parent_id, 'Continuous Monitoring',
       'Continuous offsite supervision: entity and domain monitoring facts derived live from canonical supervisory records.',
       'link', '/supervision/monitoring', 'Radar', 9, 'internal', true, true, true,
       ARRAY['continuous monitoring','offsite supervision','monitoring register','early warning','portfolio monitoring'],
       true, false, p.required_permission_id
  FROM public.sec_navigation_items p
 WHERE p.key = 'nav_sup_portfolio'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, href_override, icon_key, sort_order,
   audience, is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only)
SELECT v.key, p.id, v.label,
       'Opens the generic Continuous Monitoring register filtered to this domain.',
       'link', v.href, 'Radar', 81, 'internal', true, false, true,
       ARRAY['continuous monitoring','offsite supervision'], true, false
  FROM (VALUES
    ('nav_sup_aml_monitoring', 'nav_sup_aml',
     'Continuous Monitoring (AML/CFT)', '/supervision/monitoring?domain=AML_CFT'),
    ('nav_sup_prudential_monitoring', 'nav_sup_prudential',
     'Continuous Monitoring (Prudential)', '/supervision/monitoring?domain=PRUDENTIAL'),
    ('nav_sup_conduct_monitoring', 'nav_sup_conduct',
     'Continuous Monitoring (Market Conduct)', '/supervision/monitoring?domain=MARKET_CONDUCT')
  ) AS v(key, parent_key, label, href)
  JOIN public.sec_navigation_items p ON p.key = v.parent_key
ON CONFLICT (key) DO NOTHING;