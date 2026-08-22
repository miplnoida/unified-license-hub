create or replace function public._nav_seed_item(
  p_key text,
  p_parent_key text,
  p_label text,
  p_path text,
  p_match_type text,
  p_module text,
  p_action text,
  p_icon text,
  p_sidebar boolean,
  p_sort integer,
  p_audience text default 'internal',
  p_item_type text default 'link',
  p_protected boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perm_id uuid;
  v_route_id uuid;
  v_parent_id uuid;
begin
  if p_module is not null then
    select p.id into v_perm_id
    from sec_permissions p
    join sec_modules m on m.id = p.module_id
    where m.key = p_module and p.key = p_action;
    if v_perm_id is null then
      raise exception 'permission %.% not found', p_module, p_action;
    end if;
  end if;

  if p_path is not null then
    select id into v_route_id from sec_routes where path_pattern = p_path;
    if v_route_id is null then
      insert into sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_active, priority)
      values (regexp_replace(trim(both '/' from p_path), '[^a-zA-Z0-9]+', '_', 'g'), p_path, p_match_type, v_perm_id, p_audience, p_protected, true, 100)
      returning id into v_route_id;
    else
      update sec_routes
         set required_permission_id = coalesce(required_permission_id, v_perm_id),
             is_active = true
       where id = v_route_id;
    end if;
  end if;

  if p_parent_key is not null then
    select id into v_parent_id from sec_navigation_items where key = p_parent_key;
    if v_parent_id is null then
      raise exception 'parent nav item % not found', p_parent_key;
    end if;
  end if;

  insert into sec_navigation_items (
    key, parent_id, label, item_type, route_id, icon_key, sort_order,
    audience, is_active, show_in_sidebar, show_in_search, admin_only, required_permission_id
  ) values (
    p_key, v_parent_id, p_label, p_item_type, v_route_id, p_icon, p_sort,
    p_audience, true, p_sidebar, true, false, v_perm_id
  )
  on conflict (key) do update set
    parent_id = excluded.parent_id,
    label = excluded.label,
    item_type = excluded.item_type,
    route_id = coalesce(excluded.route_id, sec_navigation_items.route_id),
    icon_key = excluded.icon_key,
    sort_order = excluded.sort_order,
    audience = excluded.audience,
    is_active = true,
    show_in_sidebar = excluded.show_in_sidebar,
    required_permission_id = coalesce(excluded.required_permission_id, sec_navigation_items.required_permission_id),
    updated_at = now();
end;
$$;

do $$
begin
  -- 1. APPROVALS — cross-module decision queues in one domain.
  perform public._nav_seed_item('grp_nav_approvals', null, 'Approvals', null, 'exact', null, null, 'ClipboardCheck', true, 25, 'internal', 'group');

  perform public._nav_seed_item('nav_appr_registration_review', 'grp_nav_approvals', 'Registration Review', '/admin/registration-review', 'prefix', 'registration_management', 'approve', 'UserCheck', true, 10);
  perform public._nav_seed_item('nav_appr_entity_resolution', 'grp_nav_approvals', 'Entity Resolution Decisions', '/licensing/entity-resolution', 'prefix', 'entity_resolution', 'approve', 'GitCompareArrows', true, 20);
  perform public._nav_seed_item('nav_appr_application_queue', 'grp_nav_approvals', 'Application Review Queue', '/applications/queue', 'exact', 'application_management', 'approve', 'ClipboardList', true, 30);
  perform public._nav_seed_item('nav_appr_licence_lifecycle', 'grp_nav_approvals', 'Licence Lifecycle Actions', '/licenses/lifecycle', 'exact', 'license_management', 'approve', 'Award', true, 40);
  perform public._nav_seed_item('nav_appr_licence_appeals', 'grp_nav_approvals', 'Licence Appeals', '/admin/license-appeals', 'prefix', 'license_appeals', 'decide', 'Scale', true, 50);
  perform public._nav_seed_item('nav_appr_complaint_rfi', 'grp_nav_approvals', 'Complaint RFI Approvals', '/complaints/rfi-approvals', 'exact', 'complaint_management', 'approve_rfi', 'MailPlus', true, 60);
  perform public._nav_seed_item('nav_appr_investigation_closure', 'grp_nav_approvals', 'Investigation Closure', '/conduct/closure-approvals', 'exact', 'market_conduct', 'initiate_investigation', 'FileCheck2', true, 70);
  perform public._nav_seed_item('nav_appr_thematic_closure', 'grp_nav_approvals', 'Thematic Review Closure', '/supervision/thematic-closure-approvals', 'exact', 'market_conduct', 'initiate_thematic_review', 'BookOpenCheck', true, 80);
  perform public._nav_seed_item('nav_appr_prudential_escalations', 'grp_nav_approvals', 'Prudential Escalations', '/prudential/escalations', 'exact', 'prudential_supervision', 'initiate_supervisory_action', 'TriangleAlert', true, 90);
  perform public._nav_seed_item('nav_appr_entity_memberships', 'grp_nav_approvals', 'Entity Membership Requests', '/admin/entity-memberships', 'exact', 'entity_membership', 'approve', 'Network', true, 100);
  perform public._nav_seed_item('nav_appr_overrides', 'grp_nav_approvals', 'Approval Overrides', '/admin/overrides', 'prefix', 'settings', 'edit', 'ShieldCheck', true, 110);
  perform public._nav_seed_item('nav_appr_workflows', 'grp_nav_approvals', 'Approval Workflows', '/workflows', 'prefix', 'workflow_management', 'view', 'Workflow', true, 120);

  -- 2. LICENSING
  perform public._nav_seed_item('nav_lic_licence_lifecycle', 'nav_lic_licenses', 'Licence Lifecycle', '/licenses/lifecycle', 'exact', 'license_management', 'view', 'RefreshCcw', true, 30);
  perform public._nav_seed_item('nav_lic_approved_licensees', 'nav_lic_licenses', 'Approved Licensees', '/admin/approved-licensees', 'prefix', 'license_management', 'view', 'BadgeCheck', true, 40);
  perform public._nav_seed_item('nav_lic_bulk_intake', 'nav_lic_applications', 'Bulk Intake', '/admin/applications/bulk-intake', 'exact', 'application_management', 'create', 'Upload', true, 40);
  perform public._nav_seed_item('nav_lic_penalties', 'grp_nav_licensing', 'Fees & Penalties', '/billing/penalties', 'prefix', 'fee_management', 'view', 'Banknote', true, 65);

  -- 3. SUPERVISION
  perform public._nav_seed_item('nav_sup_planning', 'grp_nav_supervision', 'Supervisory Planning', null, 'exact', null, null, 'Target', true, 15, 'internal', 'group');
  perform public._nav_seed_item('nav_sup_plans', 'nav_sup_planning', 'Supervisory Plans', '/supervision/plans', 'exact', 'prudential_supervision', 'view', 'ClipboardPen', true, 10);
  perform public._nav_seed_item('nav_sup_risk_heatmap', 'nav_sup_planning', 'Risk Heatmap', '/supervision/risk', 'exact', 'prudential_supervision', 'view', 'ChartColumn', true, 20);
  perform public._nav_seed_item('nav_sup_breaches', 'nav_sup_planning', 'Breach Inbox', '/supervision/breaches', 'exact', 'prudential_supervision', 'view', 'ShieldAlert', true, 30);
  perform public._nav_seed_item('nav_sup_early_warnings', 'nav_sup_planning', 'Early Warning Indicators', '/supervision/early-warnings', 'exact', 'prudential_supervision', 'view', 'Radar', true, 40);
  perform public._nav_seed_item('nav_sup_inspections', 'nav_sup_planning', 'Inspections', '/inspections', 'exact', 'inspection_management', 'view', 'Microscope', true, 50);
  perform public._nav_seed_item('nav_sup_inspections_calendar', 'nav_sup_planning', 'Inspection Calendar', '/inspections/schedule', 'exact', 'inspection_management', 'view', 'CalendarCheck', true, 60);
  perform public._nav_seed_item('nav_sup_coordination', 'nav_sup_planning', 'Coordination Cases', '/coordination', 'prefix', 'coordination', 'view', 'Cable', true, 70);

  perform public._nav_seed_item('nav_prudential_work_queue', 'nav_sup_prudential', 'Work Queue', '/prudential/work', 'exact', 'prudential_supervision', 'view', 'ListTodo', true, 15);

  perform public._nav_seed_item('nav_conduct_findings', 'nav_sup_conduct', 'Conduct Findings', '/conduct/findings', 'exact', 'market_conduct', 'view', 'FileSearch', true, 75);
  perform public._nav_seed_item('nav_conduct_work_queue', 'nav_sup_conduct', 'Conduct Work Queue', '/conduct/work-queue', 'exact', 'market_conduct', 'view', 'ListTodo', true, 15);
  perform public._nav_seed_item('nav_complaints_analytics', 'nav_sup_conduct', 'Complaint Analytics', '/complaints/analytics', 'exact', 'complaint_management', 'analytics', 'ChartNoAxesCombined', true, 85);
  perform public._nav_seed_item('nav_complaints_bulk_intake', 'nav_sup_conduct', 'Complaint Bulk Intake', '/complaints/bulk-intake', 'exact', 'complaint_management', 'create', 'Upload', true, 90);

  -- 4. INSIGHTS
  perform public._nav_seed_item('nav_insights_ai_hub', 'grp_nav_insights', 'AI Insights Hub', '/analytics/ai-insights', 'exact', 'report_management', 'view', 'BrainCircuit', true, 15);
  perform public._nav_seed_item('nav_insights_executive', 'grp_nav_insights', 'Executive Dashboard', '/executive', 'exact', 'report_management', 'view', 'LayoutDashboard', true, 5);
  perform public._nav_seed_item('nav_insights_alerts', 'grp_nav_insights', 'Alert Centre', '/alerts', 'exact', 'returns_management', 'view', 'BellRing', true, 40);

  -- 5. CORRESPONDENCE
  perform public._nav_seed_item('nav_correspondence_documents', 'grp_nav_correspondence', 'Documents', '/documents', 'exact', 'compliance_management', 'view', 'FolderArchive', true, 80, 'any');

  -- 6. ADMINISTRATION
  perform public._nav_seed_item('nav_adm_web_users', 'nav_adm_access', 'Web Users', '/admin/web-users', 'exact', 'user_management', 'view', 'UsersRound', true, 25);
  perform public._nav_seed_item('nav_cfg_lic_lifecycle', 'nav_adm_cfg_licensing', 'Licence Lifecycle Configuration', '/admin/config/lifecycle', 'exact', 'license_management', 'manage_config', 'CalendarCog', false, 80);
  perform public._nav_seed_item('nav_cfg_ret_return_config', 'nav_adm_cfg_returns_prud', 'Return Configuration', '/admin/return-config', 'exact', 'returns_management', 'manage_config', 'SlidersHorizontal', false, 5);
  perform public._nav_seed_item('nav_cfg_ret_configuration_hub', 'nav_adm_cfg_returns_prud', 'Returns Configuration Hub', '/returns/configuration', 'exact', 'returns_management', 'manage_config', 'Settings2', false, 6);
  perform public._nav_seed_item('nav_cfg_prudential_operations', 'nav_adm_cfg_returns_prud', 'Prudential Engine Operations', '/admin/prudential/operations', 'exact', 'prudential_supervision', 'manage_config', 'Cog', false, 40);
  perform public._nav_seed_item('nav_wf_rule_engine_new', 'nav_adm_wf_overview', 'New Rule', '/admin/rule-engine/new', 'exact', 'rule_engine', 'edit', 'FilePlus2', false, 25);
  perform public._nav_seed_item('nav_cfg_lic_registration_form_preview', 'nav_adm_cfg_licensing', 'Registration Form Preview', '/admin/registration-forms/preview', 'exact', 'form_management', 'view', 'FileSearch', false, 90);
  perform public._nav_seed_item('nav_cfg_forms_create', 'nav_adm_cfg_licensing', 'Form Builder', '/admin/forms/create', 'exact', 'form_management', 'create', 'ClipboardPen', false, 95);

  -- Entity Memberships was parented to a retired group and floated to the root.
  perform public._nav_seed_item('nav_admin_entity_memberships', 'nav_adm_access', 'Entity Memberships', '/admin/entity-memberships', 'exact', 'entity_membership', 'view', 'Network', true, 45);

  -- 7. Operational queues that existed but were hidden from the menu.
  update sec_navigation_items set show_in_sidebar = true, updated_at = now()
  where key in (
    'nav_market_conduct_conduct_actions',
    'nav_market_conduct_conduct_alerts',
    'nav_market_conduct_conduct_entities',
    'nav_market_conduct_supervision_loop',
    'nav_market_conduct_duplicate_detection',
    'nav_market_conduct_auto_escalation',
    'nav_market_conduct_rfi_approvals',
    'nav_market_conduct_investigation_closure_approvals',
    'nav_market_conduct_thematic_closure_approvals',
    'nav_prudential_supervision_payment_systems',
    'nav_prudential_supervision_stress_indicators',
    'nav_correspondence_dashboard'
  );

  -- 8. Public register routes registered as unprotected.
  insert into sec_routes (key, path_pattern, match_type, audience, is_protected, is_active, priority)
  select v.k, v.p, 'prefix', 'any', false, true, 200
  from (values
    ('public_registry', '/registry'),
    ('public_registry_licensees', '/registry/licensees'),
    ('public_registry_entities', '/registry/entities'),
    ('public_registry_enforcement', '/registry/enforcement')
  ) as v(k, p)
  where not exists (select 1 from sec_routes r where r.path_pattern = v.p);
end;
$$;

drop function public._nav_seed_item(text, text, text, text, text, text, text, text, boolean, integer, text, text, boolean);