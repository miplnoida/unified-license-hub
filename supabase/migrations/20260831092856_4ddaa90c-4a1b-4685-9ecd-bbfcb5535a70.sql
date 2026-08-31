DO $$
DECLARE
  v_admin uuid;
  v_grp uuid;
  v_view uuid;
BEGIN
  SELECT id INTO v_admin FROM public.sec_navigation_items WHERE key = 'grp_nav_administration';
  SELECT p.id INTO v_view FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE m.key = 'ai_management' AND p.key = 'view';

  IF v_admin IS NULL OR v_view IS NULL THEN
    RAISE EXCEPTION 'AI governance nav prerequisites missing';
  END IF;

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, description, item_type, href_override, icon_key, sort_order,
     audience, is_active, show_in_sidebar, show_in_search, admin_only, required_permission_id, keywords)
  VALUES
    ('nav_adm_ai_governance', v_admin, 'AI Governance', 'Governed AI use cases, models, instructions and assurance',
     'group', NULL, 'BrainCircuit', 645, 'internal', true, true, true, false, v_view,
     ARRAY['ai','governance','model','assurance'])
  ON CONFLICT (key) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, item_type = 'group',
        icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order,
        audience = EXCLUDED.audience, is_active = true, show_in_sidebar = true,
        required_permission_id = EXCLUDED.required_permission_id;

  SELECT id INTO v_grp FROM public.sec_navigation_items WHERE key = 'nav_adm_ai_governance';

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, item_type, href_override, icon_key, sort_order,
     audience, is_active, show_in_sidebar, show_in_search, admin_only, required_permission_id, keywords)
  VALUES
    ('nav_adm_ai_gov_overview',     v_grp, 'Overview',           'link', '/governance/ai',              'BrainCircuit',  10, 'internal', true, true, true, false, v_view, ARRAY['ai','governance']),
    ('nav_adm_ai_gov_use_cases',    v_grp, 'AI Use Cases',       'link', '/governance/ai/use-cases',    'ListChecks',    20, 'internal', true, true, true, false, v_view, ARRAY['ai','use case']),
    ('nav_adm_ai_gov_models',       v_grp, 'AI Models',          'link', '/governance/ai/models',       'Boxes',         30, 'internal', true, true, true, false, v_view, ARRAY['ai','model']),
    ('nav_adm_ai_gov_instructions', v_grp, 'AI Instructions',    'link', '/governance/ai/instructions', 'BookOpenCheck', 40, 'internal', true, true, true, false, v_view, ARRAY['ai','prompt','instruction']),
    ('nav_adm_ai_gov_surfaces',     v_grp, 'AI Surfaces',        'link', '/governance/ai/surfaces',     'LayoutGrid',    50, 'internal', true, true, true, false, v_view, ARRAY['ai','surface']),
    ('nav_adm_ai_gov_assurance',    v_grp, 'AI Assurance',       'link', '/governance/ai/assurance',    'FileCheck2',    60, 'internal', true, true, true, false, v_view, ARRAY['ai','assurance','review']),
    ('nav_adm_ai_gov_exceptions',   v_grp, 'AI Exceptions',      'link', '/governance/ai/exceptions',   'TriangleAlert', 70, 'internal', true, true, true, false, v_view, ARRAY['ai','exception']),
    ('nav_adm_ai_gov_activity',     v_grp, 'AI Activity Register','link','/governance/ai/activity',     'ScrollText',    80, 'internal', true, true, true, false, v_view, ARRAY['ai','activity','log'])
  ON CONFLICT (key) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, item_type = 'link',
        href_override = EXCLUDED.href_override, icon_key = EXCLUDED.icon_key,
        sort_order = EXCLUDED.sort_order, audience = EXCLUDED.audience,
        is_active = true, show_in_sidebar = true,
        required_permission_id = EXCLUDED.required_permission_id;

  UPDATE public.sec_navigation_items
     SET label = 'Onsite Examinations',
         keywords = ARRAY['onsite','examination','inspection']
   WHERE key = 'nav_prudential_supervision_onsite_examinations';
END $$;