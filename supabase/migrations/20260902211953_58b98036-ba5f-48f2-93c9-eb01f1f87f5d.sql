DO $$
DECLARE _parent uuid; _grp uuid;
BEGIN
  SELECT id INTO _parent FROM public.sec_navigation_items WHERE key = 'grp_nav_supervision';
  IF _parent IS NULL THEN RETURN; END IF;

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, item_type, href_override, icon_key, sort_order, audience,
     is_active, show_in_sidebar, show_in_search, is_system, admin_only)
  VALUES ('nav_sup_aml', _parent, 'AML/CFT', 'group', NULL, 'ShieldCheck', 215, 'internal',
          true, true, true, true, false)
  ON CONFLICT (key) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
        is_active = true, show_in_sidebar = true;

  SELECT id INTO _grp FROM public.sec_navigation_items WHERE key = 'nav_sup_aml';

  INSERT INTO public.sec_navigation_items
    (key, parent_id, label, item_type, href_override, icon_key, sort_order, audience,
     is_active, show_in_sidebar, show_in_search, is_system, admin_only)
  VALUES
    ('nav_sup_aml_overview',    _grp, 'AML/CFT Overview',      'link', '/supervision/aml',              'LayoutDashboard', 10, 'internal', true, true, true, true, false),
    ('nav_sup_aml_work_queue',  _grp, 'AML/CFT Work Queue',    'link', '/supervision/aml/work-queue',   'ClipboardList',   20, 'internal', true, true, true, true, false),
    ('nav_sup_aml_entities',    _grp, 'Supervised Entities',   'link', '/supervision/aml/entities',     'Building2',       30, 'internal', true, true, true, true, false),
    ('nav_sup_aml_assessments', _grp, 'Risk Assessments',      'link', '/supervision/aml/assessments',  'ClipboardCheck',  40, 'internal', true, true, true, true, false),
    ('nav_sup_aml_heatmap',     _grp, 'Risk Heatmap',          'link', '/supervision/aml/heatmap',      'FileBarChart',    50, 'internal', true, true, true, true, false),
    ('nav_sup_aml_examinations',_grp, 'Examinations',          'link', '/supervision/aml/examinations', 'ClipboardCheck',  60, 'internal', true, true, true, true, false),
    ('nav_sup_aml_findings',    _grp, 'Findings & Remediation','link', '/supervision/aml/findings',     'AlertTriangle',   70, 'internal', true, true, true, true, false)
  ON CONFLICT (key) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, href_override = EXCLUDED.href_override,
        sort_order = EXCLUDED.sort_order, is_active = true, show_in_sidebar = true;
END $$;