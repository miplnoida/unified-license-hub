INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, href_override, icon_key, sort_order,
   audience, is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only,
   required_permission_id)
SELECT 'nav_sup_portfolio_intelligence',
       (SELECT id FROM public.sec_navigation_items WHERE key = 'grp_nav_supervision'),
       'Portfolio & Thematic Intelligence',
       'Cross-portfolio, thematic, peer, group and cross-domain supervisory intelligence derived from canonical detected conditions.',
       'link', '/supervision/portfolio-intelligence', 'ChartNetwork', 11,
       'internal', true, true, true,
       ARRAY['portfolio','thematic','systemic','peer','trend','intelligence'],
       true, false,
       (SELECT required_permission_id FROM public.sec_navigation_items WHERE key = 'nav_sup_monitoring')
WHERE NOT EXISTS (
  SELECT 1 FROM public.sec_navigation_items WHERE key = 'nav_sup_portfolio_intelligence');