DO $$
DECLARE v_perm uuid; v_parent uuid; v_route_cfg uuid; v_route_app uuid;
BEGIN
  SELECT p.id INTO v_perm FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'aml_supervision' AND p.key = 'manage_config';
  IF v_perm IS NULL THEN RAISE EXCEPTION 'permission aml_supervision.manage_config not found'; END IF;

  SELECT id INTO v_parent FROM public.sec_navigation_items WHERE key = 'nav_adm_cfg_supervision';

  INSERT INTO public.sec_routes(key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
  VALUES ('route_adm_supervisory_calculation', '/admin/supervisory-calculation', 'exact', v_perm, 'internal', true, true, true, 100)
  ON CONFLICT (key) DO UPDATE SET path_pattern = EXCLUDED.path_pattern, required_permission_id = EXCLUDED.required_permission_id,
    audience = EXCLUDED.audience, is_protected = true, is_active = true
  RETURNING id INTO v_route_cfg;

  INSERT INTO public.sec_routes(key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
  VALUES ('route_adm_supervisory_calculation_approvals', '/admin/supervisory-calculation/approvals', 'exact', v_perm, 'internal', true, true, true, 100)
  ON CONFLICT (key) DO UPDATE SET path_pattern = EXCLUDED.path_pattern, required_permission_id = EXCLUDED.required_permission_id,
    audience = EXCLUDED.audience, is_protected = true, is_active = true
  RETURNING id INTO v_route_app;

  INSERT INTO public.sec_navigation_items(
    key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
    is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
  VALUES (
    'nav_cfg_sup_calculation', v_parent, 'Calculation Configuration',
    'Response scoring, risk bands, residual matrix, aggregation and effective-date rule for supervisory assessments.',
    'link', v_route_cfg, 'Calculator', 60, 'internal', true, false, true,
    ARRAY['calculation','methodology','scoring','matrix','bands','residual','aggregation'], true, true, v_perm)
  ON CONFLICT (key) DO UPDATE SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label,
    description = EXCLUDED.description, route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order, audience = EXCLUDED.audience, is_active = true,
    show_in_sidebar = EXCLUDED.show_in_sidebar, show_in_search = EXCLUDED.show_in_search,
    keywords = EXCLUDED.keywords, admin_only = true, required_permission_id = EXCLUDED.required_permission_id;

  INSERT INTO public.sec_navigation_items(
    key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
    is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
  VALUES (
    'nav_cfg_sup_calculation_approvals', v_parent, 'Calculation Approvals',
    'Independent approval and publication of supervisory calculation configurations.',
    'link', v_route_app, 'ShieldCheck', 61, 'internal', true, false, true,
    ARRAY['calculation','approval','maker checker','methodology','publish'], true, true, v_perm)
  ON CONFLICT (key) DO UPDATE SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label,
    description = EXCLUDED.description, route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order, audience = EXCLUDED.audience, is_active = true,
    show_in_sidebar = EXCLUDED.show_in_sidebar, show_in_search = EXCLUDED.show_in_search,
    keywords = EXCLUDED.keywords, admin_only = true, required_permission_id = EXCLUDED.required_permission_id;
END $$;