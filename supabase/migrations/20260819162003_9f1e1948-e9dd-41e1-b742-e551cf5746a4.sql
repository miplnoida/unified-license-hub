CREATE OR REPLACE FUNCTION public.sec_nav_id(_key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.sec_navigation_items WHERE key = _key
$$;
REVOKE ALL ON FUNCTION public.sec_nav_id(text) FROM PUBLIC;

UPDATE public.sec_navigation_items SET label = 'Home', icon_key = 'Home'
WHERE key = 'nav_main_dashboard';

UPDATE public.sec_navigation_items SET label = 'People & Access',   icon_key = 'Users',        sort_order = 620 WHERE key = 'nav_adm_access';
UPDATE public.sec_navigation_items SET label = 'Communications',    icon_key = 'Mail',         sort_order = 680 WHERE key = 'nav_adm_notifications';
UPDATE public.sec_navigation_items SET label = 'Security & Audit',  icon_key = 'ShieldAlert',  sort_order = 690 WHERE key = 'nav_adm_audit';
UPDATE public.sec_navigation_items SET label = 'System',            icon_key = 'Cog',          sort_order = 700 WHERE key = 'nav_adm_masters';
UPDATE public.sec_navigation_items SET label = 'Supervision Configuration', icon_key = 'SlidersHorizontal', sort_order = 660 WHERE key = 'nav_adm_conduct_config';

INSERT INTO public.sec_navigation_items (key, parent_id, label, item_type, icon_key, sort_order, audience, is_active, is_system)
VALUES
  ('nav_adm_licensing_reg',   public.sec_nav_id('grp_nav_administration'), 'Licensing & Registration', 'group', 'FileStack',  630, 'internal', true, true),
  ('nav_adm_returns_prud',    public.sec_nav_id('grp_nav_administration'), 'Returns & Prudential',     'group', 'CalendarCheck',640, 'internal', true, true),
  ('nav_adm_workflows_rules', public.sec_nav_id('grp_nav_administration'), 'Workflows & Rules',        'group', 'GitBranch',  670, 'internal', true, true)
ON CONFLICT (key) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, item_type = EXCLUDED.item_type,
      icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order, audience = EXCLUDED.audience, is_active = true;

UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_licensing_reg'), sort_order = 10 WHERE key = 'nav_form_management_form_management';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_licensing_reg'), sort_order = 20 WHERE key = 'nav_form_management_registration_forms';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_licensing_reg'), sort_order = 30 WHERE key = 'nav_license_requests_license_action_forms';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_licensing_reg'), sort_order = 40 WHERE key = 'nav_configuration_fee_management';

UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_returns_prud'), item_type = 'group', label = 'Return Configuration', sort_order = 10 WHERE key = 'nav_returns_management_returns_admin';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_returns_prud'), item_type = 'group', label = 'Prudential Configuration', sort_order = 20 WHERE key = 'nav_sup_prud_config';

UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_workflows_rules'), sort_order = 10 WHERE key = 'nav_workflows_approval_workflows';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_workflows_rules'), sort_order = 20 WHERE key = 'nav_workflows_delegation_rules';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_workflows_rules'), sort_order = 30 WHERE key = 'nav_administration_sla_manager';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_workflows_rules'), sort_order = 40 WHERE key = 'nav_administration_escalation_alerts';

UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_adm_masters'), sort_order = 5 WHERE key = 'nav_administration_settings';

UPDATE public.sec_navigation_items SET is_active = false, show_in_sidebar = false, show_in_search = false WHERE key = 'nav_adm_forms';

INSERT INTO public.sec_navigation_items (key, parent_id, label, item_type, icon_key, sort_order, audience, is_active, is_system)
VALUES ('nav_lic_registration', public.sec_nav_id('grp_nav_licensing'), 'Registration', 'group', 'ClipboardList', 120, 'internal', true, true)
ON CONFLICT (key) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, item_type = EXCLUDED.item_type,
      icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order, is_active = true;

UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_lic_registration'), sort_order = 10 WHERE key = 'nav_license_requests_registration_review';

UPDATE public.sec_navigation_items SET label = 'Licences', sort_order = 130 WHERE key = 'nav_lic_licenses';
UPDATE public.sec_navigation_items SET label = 'Application Review Queue', sort_order = 10 WHERE key = 'nav_license_requests_all_license_requests';
UPDATE public.sec_navigation_items SET label = 'Pre-Licensing',  sort_order = 20 WHERE key = 'nav_license_requests_pre_licensing_applications';
UPDATE public.sec_navigation_items SET label = 'Post-Licensing', sort_order = 30 WHERE key = 'nav_license_requests_post_licensing_applications';
UPDATE public.sec_navigation_items SET sort_order = 140 WHERE key = 'nav_lic_appeals';
UPDATE public.sec_navigation_items SET sort_order = 150 WHERE key = 'nav_payments_payment_history';

UPDATE public.sec_navigation_items
   SET parent_id = public.sec_nav_id('grp_nav_supervision'), label = 'Fit & Proper', icon_key = 'UserCheck', sort_order = 230
 WHERE key = 'nav_lic_fitproper';

UPDATE public.sec_navigation_items SET label = 'Market Conduct', sort_order = 210 WHERE key = 'nav_sup_conduct';
UPDATE public.sec_navigation_items SET label = 'Prudential',     sort_order = 220 WHERE key = 'nav_sup_prudential';

UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_sup_conduct'), sort_order = 15 WHERE key = 'nav_market_conduct_complaints';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_sup_conduct'), sort_order = 60, show_in_sidebar = false WHERE key = 'nav_market_conduct_duplicate_detection';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_sup_conduct'), sort_order = 61, show_in_sidebar = false WHERE key = 'nav_market_conduct_auto_escalation';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_sup_conduct'), sort_order = 62, show_in_sidebar = false WHERE key = 'nav_market_conduct_rfi_approvals';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_sup_conduct'), sort_order = 40 WHERE key = 'nav_market_conduct_enforcement_cases';
UPDATE public.sec_navigation_items SET parent_id = public.sec_nav_id('nav_sup_prudential'), sort_order = 35 WHERE key = 'nav_prudential_supervision_onsite_examinations';
UPDATE public.sec_navigation_items SET is_active = false, show_in_sidebar = false WHERE key IN ('nav_sup_complaints','nav_sup_examinations','nav_sup_enforcement');

UPDATE public.sec_navigation_items SET label = 'Overview', sort_order = 10 WHERE key = 'nav_market_conduct_conduct_dashboard';
UPDATE public.sec_navigation_items SET sort_order = 20 WHERE key = 'nav_market_conduct_market_surveillance';
UPDATE public.sec_navigation_items SET sort_order = 30 WHERE key = 'nav_market_conduct_investigations';
UPDATE public.sec_navigation_items SET sort_order = 50 WHERE key = 'nav_market_conduct_thematic_reviews';
UPDATE public.sec_navigation_items SET show_in_sidebar = false
WHERE key IN (
  'nav_market_conduct_conduct_alerts','nav_market_conduct_conduct_actions','nav_market_conduct_conduct_entities',
  'nav_market_conduct_investigation_closure_approvals','nav_market_conduct_supervision_loop',
  'nav_market_conduct_thematic_closure_approvals'
);

UPDATE public.sec_navigation_items SET label = 'Overview',  sort_order = 10 WHERE key = 'nav_fit_proper_assessment_hub';
UPDATE public.sec_navigation_items SET label = 'Processes', sort_order = 20 WHERE key = 'nav_fit_proper_process_list';
UPDATE public.sec_navigation_items SET show_in_sidebar = false
WHERE key IN (
  'nav_fit_proper_policy_initiation','nav_fit_proper_declaration_evidence','nav_fit_proper_verification_assessment',
  'nav_fit_proper_committee_determination','nav_fit_proper_conditions_monitoring','nav_fit_proper_appeals_notifications',
  'nav_fit_proper_reporting_training'
);

UPDATE public.sec_navigation_items SET label = 'Overview', sort_order = 10 WHERE key = 'nav_prudential_supervision_prudential_dashboard';
UPDATE public.sec_navigation_items SET show_in_sidebar = false WHERE key IN ('nav_prudential_supervision_stress_indicators','nav_prudential_supervision_payment_systems');

UPDATE public.sec_navigation_items SET label = 'Threads', sort_order = 20 WHERE key = 'nav_correspondence_thread_manager';
UPDATE public.sec_navigation_items SET sort_order = 10 WHERE key = 'nav_correspondence_inbox';
UPDATE public.sec_navigation_items SET sort_order = 30 WHERE key = 'nav_correspondence_records';
UPDATE public.sec_navigation_items SET show_in_sidebar = false WHERE key = 'nav_correspondence_dashboard';

UPDATE public.sec_navigation_items SET label = 'AI Reports' WHERE key = 'nav_analytics_reports_supervisory_ai_reports';

UPDATE public.sec_navigation_items SET is_active = false, show_in_sidebar = false, show_in_search = false WHERE key = 'nav_licenses_active_sector';

DROP FUNCTION IF EXISTS public.sec_nav_id(text);