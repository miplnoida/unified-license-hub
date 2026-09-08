-- =====================================================================
-- AML-01 §3.1 — register the existing AML runtime routes (no authorization change)
-- + register the new Policy Profile administration routes
-- =====================================================================
DO $$
DECLARE
  v_view uuid; v_cfg uuid; v_grp uuid;
  v_reg uuid; v_det uuid;
BEGIN
  SELECT p.id INTO v_view FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'aml_supervision' AND p.key = 'view';
  SELECT p.id INTO v_cfg FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'aml_supervision' AND p.key = 'manage_config';
  IF v_view IS NULL OR v_cfg IS NULL THEN
    RAISE EXCEPTION 'aml_supervision view/manage_config permissions missing';
  END IF;

  -- existing runtime routes, registered exactly as the router already guards them
  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES
    ('route_sup_aml_overview',            '/supervision/aml',                  'exact','internal',true,0,v_view),
    ('route_sup_aml_work_queue',          '/supervision/aml/work-queue',       'exact','internal',true,0,v_view),
    ('route_sup_aml_entities',            '/supervision/aml/entities',         'exact','internal',true,0,v_view),
    ('route_sup_aml_assessments',         '/supervision/aml/assessments',      'exact','internal',true,0,v_view),
    ('route_sup_aml_assessment_workspace','/supervision/aml/assessments/:id',  'exact','internal',true,0,v_view),
    ('route_sup_aml_heatmap',             '/supervision/aml/heatmap',          'exact','internal',true,0,v_view),
    ('route_sup_aml_examinations',        '/supervision/aml/examinations',     'exact','internal',true,0,v_view),
    ('route_sup_aml_findings',            '/supervision/aml/findings',         'exact','internal',true,0,v_view)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern, match_type = EXCLUDED.match_type,
    audience = EXCLUDED.audience, is_protected = true, is_active = true,
    required_permission_id = EXCLUDED.required_permission_id, updated_at = now();

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_adm_supervisory_policy_profiles','/admin/supervisory-policy-profiles','exact','internal',true,0,v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern, is_protected = true, is_active = true,
    required_permission_id = EXCLUDED.required_permission_id, updated_at = now()
  RETURNING id INTO v_reg;

  INSERT INTO public.sec_routes (key, path_pattern, match_type, audience, is_protected, priority, required_permission_id)
  VALUES ('route_adm_supervisory_policy_profile_detail','/admin/supervisory-policy-profiles/:profileId','exact','internal',true,0,v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    path_pattern = EXCLUDED.path_pattern, is_protected = true, is_active = true,
    required_permission_id = EXCLUDED.required_permission_id, updated_at = now()
  RETURNING id INTO v_det;

  SELECT id INTO v_grp FROM public.sec_navigation_items WHERE key = 'nav_adm_cfg_supervision';

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, admin_only, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_cfg_sup_policy_profiles', v_grp, 'Supervisory Policy Profiles',
          'Governed containers binding the exact policy component versions a regulator applies in a supervisory domain',
          'link', v_reg, 'FileStack', 58, 'internal', true, true, true,
          ARRAY['policy','profile','policy profile','configuration','methodology binding','calculation policy','AML','supervisory policy'],
          v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
    route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order,
    keywords = EXCLUDED.keywords, required_permission_id = EXCLUDED.required_permission_id,
    is_active = true, updated_at = now();

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, route_id, icon_key, sort_order,
     audience, admin_only, show_in_sidebar, show_in_search, keywords, required_permission_id)
  VALUES ('nav_cfg_sup_policy_profile_detail',
          (SELECT id FROM public.sec_navigation_items WHERE key = 'nav_cfg_sup_policy_profiles'),
          'Policy Profile Workspace',
          'Component bindings, requirements, readiness, lifecycle and history for one policy profile version',
          'link', v_det, 'ScrollText', 1, 'internal', true, false, true,
          ARRAY['policy profile','component binding','readiness','policy approval'], v_cfg)
  ON CONFLICT (key) DO UPDATE SET
    parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
    route_id = EXCLUDED.route_id, icon_key = EXCLUDED.icon_key, show_in_sidebar = false,
    required_permission_id = EXCLUDED.required_permission_id, is_active = true, updated_at = now();
END $$;