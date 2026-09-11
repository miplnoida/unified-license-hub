DO $$
DECLARE v_cfg uuid; v_grp uuid; v_reg uuid; v_det uuid;
BEGIN
  SELECT p.id INTO v_cfg FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'aml_supervision' AND p.key = 'manage_config';
  IF v_cfg IS NULL THEN RAISE EXCEPTION 'aml_supervision manage_config permission missing'; END IF;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_adm_supervisory_policy_components','/admin/supervisory-policy-components','exact','internal',true,0,v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern, is_protected = true, is_active = true,
    required_permission_id = EXCLUDED.required_permission_id, updated_at = now()
  RETURNING id INTO v_reg;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_adm_supervisory_policy_component_detail','/admin/supervisory-policy-components/:componentId','exact','internal',true,0,v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern, is_protected = true, is_active = true,
    required_permission_id = EXCLUDED.required_permission_id, updated_at = now()
  RETURNING id INTO v_det;

  SELECT id INTO v_grp FROM public.sec_navigation_items WHERE key = 'nav_adm_cfg_supervision';

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, admin_only, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_cfg_sup_policy_components', v_grp, 'Supervisory Policy Components',
          'Versioned regulator configuration for each supervisory policy area: applicability, facts, sources, evidence, materiality, override, supervisory response, service levels, dashboards and notifications',
          'link', v_reg, 'SlidersHorizontal', 59, 'internal', true, true, true,
          ARRAY['policy component','sector overlay','fact configuration','source binding','evidence policy',
                'materiality','judgement','override','supervisory response','SLA','dashboard policy',
                'notification policy','configuration'],
          v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
    route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order,
    keywords = EXCLUDED.keywords, required_permission_id = EXCLUDED.required_permission_id,
    is_active = true, updated_at = now();

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, admin_only, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_cfg_sup_policy_component_detail',
          (SELECT id FROM public.sec_navigation_items WHERE key = 'nav_cfg_sup_policy_components'),
          'Policy Component Workspace',
          'Entries, validation verdict, lifecycle and history for one policy component version',
          'link', v_det, 'ScrollText', 1, 'internal', true, false, true,
          ARRAY['policy component','configuration version','approval','lifecycle'], v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
    route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key, show_in_sidebar = false,
    required_permission_id = EXCLUDED.required_permission_id, is_active = true, updated_at = now();
END $$;