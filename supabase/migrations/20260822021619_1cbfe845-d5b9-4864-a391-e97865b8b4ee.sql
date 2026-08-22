-- ============================================================
-- Canonical regulatory role catalogue + navigation convergence
-- ============================================================

create or replace function pg_temp.perm_ids(_perms text[]) returns uuid[] language sql as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from public.sec_permissions p
  join public.sec_modules m on m.id = p.module_id
  where m.key || '.' || p.key = any(_perms) and p.is_active;
$$;

create or replace function pg_temp.upsert_template(
  _key text, _name text, _desc text, _type text, _tier text, _sort int, _perms text[]
) returns uuid language plpgsql as $$
declare tid uuid; pids uuid[];
begin
  insert into public.sec_role_templates(key, name, description, role_type, dashboard_tier, sort_order, is_system, is_active)
  values (_key, _name, _desc, _type, _tier, _sort, true, true)
  on conflict (key) do update set
    name = excluded.name, description = excluded.description, role_type = excluded.role_type,
    dashboard_tier = excluded.dashboard_tier, sort_order = excluded.sort_order,
    is_active = true, updated_at = now()
  returning id into tid;

  pids := pg_temp.perm_ids(_perms);
  insert into public.sec_role_template_permissions(template_id, permission_id)
  select tid, x from unnest(pids) x
  where not exists (
    select 1 from public.sec_role_template_permissions e where e.template_id = tid and e.permission_id = x
  );
  delete from public.sec_role_template_permissions
  where template_id = tid and not (permission_id = any(pids));
  return tid;
end $$;

-- Materialise a live role from its template. Roles that already have active
-- assignments are only widened (never silently narrowed) so live access never
-- breaks mid-flight.
create or replace function pg_temp.sync_role(_key text) returns void language plpgsql as $$
declare t record; rid uuid; assigned int;
begin
  select * into t from public.sec_role_templates where key = _key;
  if not found then return; end if;
  select id into rid from public.sec_roles where key = _key;
  if rid is null then
    insert into public.sec_roles(key, name, description, role_type, role_category, dashboard_tier, status, is_system, is_break_glass)
    values (t.key, t.name, t.description, t.role_type, t.dashboard_tier, t.dashboard_tier, 'active', true, false)
    returning id into rid;
  else
    update public.sec_roles set
      name = t.name, description = coalesce(description, t.description), role_type = t.role_type,
      role_category = coalesce(role_category, t.dashboard_tier), dashboard_tier = coalesce(dashboard_tier, t.dashboard_tier),
      updated_at = now()
    where id = rid;
  end if;

  insert into public.sec_role_permissions(role_id, permission_id)
  select rid, tp.permission_id
  from public.sec_role_template_permissions tp
  where tp.template_id = t.id
    and not exists (select 1 from public.sec_role_permissions e where e.role_id = rid and e.permission_id = tp.permission_id);

  select count(*) into assigned from public.sec_user_roles where role_id = rid and status = 'active';
  if assigned = 0 then
    delete from public.sec_role_permissions rp
    where rp.role_id = rid
      and not exists (select 1 from public.sec_role_template_permissions tp where tp.template_id = t.id and tp.permission_id = rp.permission_id);
  end if;
end $$;

create or replace function pg_temp.nav_perm(_nav text, _perm text) returns void language plpgsql as $$
begin
  update public.sec_navigation_items
  set required_permission_id = (
        select p.id from public.sec_permissions p join public.sec_modules m on m.id = p.module_id
        where m.key || '.' || p.key = _perm limit 1),
      updated_at = now()
  where key = _nav;
end $$;

create or replace function pg_temp.nav_move(_nav text, _parent text, _sort int, _label text default null) returns void language plpgsql as $$
begin
  update public.sec_navigation_items n
  set parent_id = (select p.id from public.sec_navigation_items p where p.key = _parent),
      sort_order = _sort,
      label = coalesce(_label, n.label),
      is_active = true,
      show_in_sidebar = true,
      updated_at = now()
  where n.key = _nav;
end $$;

-- ============================================================
-- 1. Role catalogue completion (regulatory personas)
-- ============================================================
select pg_temp.upsert_template('complaints_officer','Complaints Officer','Intake, triage and investigation of consumer complaints.','internal','operational',121,
  array['complaint_management.view','complaint_management.create','complaint_management.edit','complaint_management.assign','complaint_management.investigate','complaint_management.upload_documents','complaint_management.resolve','complaint_management.view_status','complaint_type.view','correspondence_management.dispatch']);
select pg_temp.upsert_template('complaints_supervisor','Complaints Supervisor','Approves complaint RFIs, escalations and closures.','internal','supervisory',122,
  array['complaint_management.view','complaint_management.edit','complaint_management.assign','complaint_management.investigate','complaint_management.resolve','complaint_management.close','complaint_management.escalate','complaint_management.approve_rfi','complaint_management.analytics','complaint_management.retry_triage','complaint_type.view','market_conduct.view','market_conduct.manage_complaints']);
select pg_temp.upsert_template('enforcement_supervisor','Enforcement Supervisor','Decides enforcement outcomes and sanctions.','internal','supervisory',191,
  array['enforcement_management.view','enforcement_management.create','enforcement_management.edit','enforcement_management.decide','enforcement_management.issue_notice','enforcement_management.impose_sanction','enforcement_management.close','enforcement_management.refer','enforcement_management.view_all_entities','enforcement_management.workflow_action','market_conduct.issue_enforcement_action']);
select pg_temp.upsert_template('legal_counsel','Legal Counsel','Legal review of licensing, enforcement and appeal matters.','internal','oversight',192,
  array['licensing.add_legal_notes','licensing.view','license_appeals.view','enforcement_management.view','complaint_management.view','fit_and_proper.view','audit_management.view','application_management.view']);
select pg_temp.upsert_template('aml_supervision_officer','AML/CFT Supervision Officer','AML/CFT risk assessment and confidential findings.','internal','operational',193,
  array['aml_supervision.view','aml_supervision.edit','aml_supervision.view_confidential','prudential_supervision.view','inspection_management.view']);
select pg_temp.upsert_template('aml_supervision_supervisor','AML/CFT Supervision Supervisor','Approves AML/CFT assessments and findings.','internal','supervisory',194,
  array['aml_supervision.view','aml_supervision.edit','aml_supervision.approve','aml_supervision.view_confidential','prudential_supervision.view','prudential_supervision.initiate_supervisory_action']);
select pg_temp.upsert_template('operational_resilience_officer','Operational Resilience Officer','Operational resilience and continuity oversight.','internal','operational',195,
  array['operational_resilience.view','operational_resilience.edit','prudential_supervision.view','inspection_management.view']);
select pg_temp.upsert_template('coordination_officer','Regulatory Coordination Officer','Cross-regulator coordination cases and referrals.','internal','operational',196,
  array['coordination.view','coordination.create','coordination.update','coordination_cases.view','coordination_cases.create','coordination_cases.edit','coordination_flags.view','coordination_flags.create','coordination_messages.view','coordination_messages.create','coordination_escalations.view','coordination_escalations.create']);
select pg_temp.upsert_template('coordination_supervisor','Regulatory Coordination Supervisor','Approves coordination escalations and overrides.','internal','supervisory',197,
  array['coordination.view','coordination.admin','coordination_cases.view','coordination_cases.approve','coordination_cases.override','coordination_escalations.view','coordination_escalations.approve','coordination_escalations.override','coordination_flags.view','coordination_flags.approve','coordination_messages.view','coordination_messages.approve']);
select pg_temp.upsert_template('appeals_panel_member','Appeals Panel Member','Independent determination of licensing and F&P appeals.','internal','oversight',198,
  array['license_appeals.view','license_appeals.decide','fit_and_proper_appeals.view','fit_and_proper_appeals.approve','application_management.view','license_management.view']);
select pg_temp.upsert_template('executive_management','Executive Management','Cross-module executive oversight and reporting.','internal','oversight',199,
  array['executive_oversight.view_all_dashboards','executive_oversight.view_all_reports','executive_oversight.drill_into_cases','executive_oversight.receive_ai_insights','executive_oversight.view_cross_module_audit','report_management.view','report_management.export','ai_management.view']);
select pg_temp.upsert_template('payment_systems_supervisor','Payment Systems Supervisor','FMI, MSB and PFMI oversight.','internal','supervisory',200,
  array['prudential_payment_systems.view','prudential_payment_systems.supervise_fmi','prudential_payment_systems.oversee_msb','prudential_payment_systems.conduct_pfmi_assessment','prudential_payment_systems.manage_payment_workflow','prudential_supervision.view','prudential_supervision.manage_payment_oversight']);
select pg_temp.upsert_template('inspection_supervisor','Inspection Supervisor','Plans examinations and signs off workpapers.','internal','supervisory',201,
  array['inspection_management.view','inspection_management.create','inspection_management.edit','inspection_management.view_all_entities','inspection_management.workflow_action','prudential_supervision.conduct_onsite_examination','prudential_supervision.manage_examination','prudential_supervision.signoff_workpaper']);
select pg_temp.upsert_template('workflow_administrator','Workflow Administrator','Designs and publishes approval workflows and SLAs.','internal','admin',202,
  array['workflow_management.view','workflow_management.view_all','workflow_management.create','workflow_management.edit','workflow_management.publish','workflow_management.manage_config','escalation_management.view','escalation_management.configure','settings.view']);
select pg_temp.upsert_template('rule_engine_administrator','Rule Engine Administrator','Authors, tests and activates supervisory rules.','internal','admin',203,
  array['rule_engine.view','rule_engine.edit','rule_engine.test','rule_engine.activate','rule_engine.deactivate','rule_engine.view_versions','rule_engine.restore_versions','rule_engine.view_executions','rule_engine.view_alerts','rule_engine.manage_alerts','rule_engine.manage_tasks','rule_engine.view_tasks','rule_engine.export','workflow_management.view']);
select pg_temp.upsert_template('notification_administrator','Notification Administrator','Owns notification templates, events and channels.','internal','admin',204,
  array['notification_management.view','notification_management.manage_templates','notification_management.manage_events','notification_management.dispatch','notification_management.test_send','settings.view']);
select pg_temp.upsert_template('licensee_primary_user','Licensee Primary User','Submits returns, applications and filings for the licensee.','external','operational',400,
  array['license_management.view','application_management.view','application_management.create','application_management.edit','licensing.view','licensing.view_status','licensing.submit','licensing.respond_rfi','licensing.upload_documents','returns_management.view','returns_management.create','returns_management.edit','returns_management.submit','returns_management.upload_documents','returns_management.respond_rfi','returns_management.view_status','compliance_management.view','compliance_management.create','compliance_management.edit','compliance_management.respond','complaint_management.view_status','fit_and_proper.submit','fit_and_proper.view_status','fit_and_proper.upload_documents','license_appeals.view','license_appeals.create','entity_membership.view','entity_membership.request','regulatory_requests.view','regulatory_requests.create']);
select pg_temp.upsert_template('licensee_secondary_user','Licensee Secondary User','Prepares filings but cannot submit them.','external','operational',410,
  array['license_management.view','application_management.view','application_management.create','application_management.edit','licensing.view','licensing.view_status','licensing.upload_documents','returns_management.view','returns_management.create','returns_management.edit','returns_management.upload_documents','returns_management.view_status','compliance_management.view','compliance_management.create','compliance_management.edit','entity_membership.view','regulatory_requests.view']);
select pg_temp.upsert_template('entity_ppoc','Entity Primary Point of Contact','Manages entity users and confirms entity data.','external','operational',420,
  array['license_management.view','application_management.view','application_management.edit','licensing.view_status','returns_management.view','returns_management.submit','returns_management.view_status','compliance_management.view','entity_membership.view','entity_membership.request','entity_membership.manage','entity_membership.verify','entity_membership.revoke','user_management.view','regulatory_requests.view']);
select pg_temp.upsert_template('applicant_user','Applicant','Applies for authorisation before licensing.','external','operational',430,
  array['application_management.view','application_management.create','application_management.edit','licensing.view','licensing.view_status','licensing.submit','licensing.respond_rfi','licensing.upload_documents','fit_and_proper.submit','fit_and_proper.view_status','license_appeals.view','license_appeals.create']);
select pg_temp.upsert_template('pre_licensee_user','Pre-Licensee','Registered entity awaiting authorisation.','external','operational',440,
  array['application_management.view','application_management.create','application_management.edit','licensing.view_status','licensing.submit','licensing.upload_documents','complaint_management.create','complaint_management.view_status','fit_and_proper.submit','fit_and_proper.view_status']);

do $$
declare k text;
begin
  foreach k in array array['complaints_officer','complaints_supervisor','enforcement_supervisor','legal_counsel',
    'aml_supervision_officer','aml_supervision_supervisor','operational_resilience_officer','coordination_officer',
    'coordination_supervisor','appeals_panel_member','executive_management','payment_systems_supervisor',
    'inspection_supervisor','workflow_administrator','rule_engine_administrator','notification_administrator',
    'licensee_primary_user','licensee_secondary_user','entity_ppoc','applicant_user','pre_licensee_user']
  loop
    perform pg_temp.sync_role(k);
  end loop;
end $$;

-- Data scopes: external personas only ever see their own entity's records.
insert into public.sec_role_template_scopes(template_id, module_id, scope_type_id)
select t.id, m.id, (select id from public.sec_scope_types where key = 'own')
from public.sec_role_templates t
join public.sec_modules m on m.key in ('returns_management','application_management','compliance_management','license_management','complaint_management','fit_and_proper')
where t.key in ('licensee_primary_user','licensee_secondary_user','entity_ppoc','applicant_user','pre_licensee_user')
  and not exists (select 1 from public.sec_role_template_scopes s where s.template_id = t.id and s.module_id = m.id);

-- Break-glass is reserved for the single Super Admin role.
update public.sec_roles set is_break_glass = false, updated_at = now()
where is_break_glass and key <> 'super_admin';

-- ============================================================
-- 2. Canonical navigation domains
-- ============================================================
insert into public.sec_navigation_items(key, label, description, item_type, icon_key, sort_order, audience, is_active, show_in_sidebar, show_in_search, is_system)
values
  ('grp_nav_my_work','My Work','Everything assigned to or owned by the signed-in user.','group','ListTodo',20,'any',true,true,true,true),
  ('grp_nav_entities','Entities & Registry','Regulated entity identity, resolution and membership.','group','Building2',50,'any',true,true,true,true)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, item_type = excluded.item_type,
  icon_key = excluded.icon_key, sort_order = excluded.sort_order, audience = excluded.audience,
  is_active = true, show_in_sidebar = true, show_in_search = true, updated_at = now();

update public.sec_navigation_items set label = 'Licensing & Authorisation', updated_at = now() where key = 'grp_nav_licensing';
update public.sec_navigation_items set label = 'Returns & Data', updated_at = now() where key = 'grp_nav_returns';
update public.sec_navigation_items set label = 'Correspondence & Cases', updated_at = now() where key = 'grp_nav_correspondence';
update public.sec_navigation_items set label = 'Insights & Reporting', updated_at = now() where key = 'grp_nav_insights';

-- 2a. Decommission the cross-module Approvals root: every decision queue now
-- lives inside the domain that owns the process (all targets verified to exist).
update public.sec_navigation_items set is_active = false, show_in_sidebar = false, show_in_search = false, updated_at = now()
where key like 'nav_appr_%' or key = 'grp_nav_approvals';

-- 2b. My Work — personal, cross-module surfaces.
insert into public.sec_navigation_items(key, parent_id, label, item_type, route_id, icon_key, sort_order, audience, is_active, show_in_sidebar, show_in_search, is_system)
select 'nav_mywork_notifications', (select id from public.sec_navigation_items where key = 'grp_nav_my_work'),
       'Notifications', 'link', (select id from public.sec_routes where key = 'notifications'), 'Bell', 10, 'any', true, true, true, true
on conflict (key) do update set parent_id = excluded.parent_id, sort_order = excluded.sort_order, is_active = true, show_in_sidebar = true, updated_at = now();

select pg_temp.nav_move('nav_licenses_my_licenses','grp_nav_my_work',20,'My Licences');
select pg_temp.nav_move('nav_returns_management_my_returns','grp_nav_my_work',30,'My Returns');
select pg_temp.nav_move('nav_license_requests_my_appeals','grp_nav_my_work',40,'My Appeals');
select pg_temp.nav_move('nav_correspondence_my_correspondence','grp_nav_my_work',50,'My Correspondence');
select pg_temp.nav_move('nav_correspondence_information_requests','grp_nav_my_work',60,'Information Requests');
select pg_temp.nav_move('nav_correspondence_supervisory_actions','grp_nav_my_work',70,'Supervisory Actions');
select pg_temp.nav_move('nav_payments_payment_history','grp_nav_my_work',80,'My Payments');

-- 2c. Entities & Registry — identity before authority.
select pg_temp.nav_move('nav_sup_regulated_entities','grp_nav_entities',10,'Regulated Entities');
select pg_temp.nav_move('nav_lic_entity_resolution','grp_nav_entities',20,'Entity Resolution');
select pg_temp.nav_move('nav_lic_onboarding_oversight','grp_nav_entities',30,'Onboarding Oversight');
select pg_temp.nav_move('nav_admin_entity_memberships','grp_nav_entities',40,'Entity Memberships');
select pg_temp.nav_move('nav_adm_web_users','grp_nav_entities',50,'Entity Web Users');

-- ============================================================
-- 3. Menu permission correctness (menu = discoverability, RLS = authority)
-- ============================================================
select pg_temp.nav_perm('nav_correspondence_inbox','compliance_management.view');
select pg_temp.nav_perm('nav_correspondence_thread_manager','compliance_management.view');
select pg_temp.nav_perm('nav_correspondence_records','compliance_management.view');
select pg_temp.nav_perm('nav_correspondence_dashboard','compliance_management.view');
select pg_temp.nav_perm('nav_adm_wf_engine','workflow_management.view');
select pg_temp.nav_perm('nav_adm_wf_overview','workflow_management.view');
select pg_temp.nav_perm('nav_adm_wf_rules','workflow_management.view');
select pg_temp.nav_perm('nav_wf_overrides','workflow_management.manage_config');
select pg_temp.nav_perm('nav_wf_decision_options','workflow_management.manage_config');
select pg_temp.nav_perm('nav_wf_sufficiency_rules','rule_engine.view');
select pg_temp.nav_perm('nav_wf_sufficiency_rule_sets','rule_engine.view');
select pg_temp.nav_perm('nav_wf_rule_engine','rule_engine.view');
select pg_temp.nav_perm('nav_adm_notif_engine','notification_management.view');
select pg_temp.nav_perm('nav_adm_notif_overview','notification_management.view');
select pg_temp.nav_perm('nav_adm_notif_delivery','notification_management.view');
select pg_temp.nav_perm('nav_notif_settings','notification_management.view');
select pg_temp.nav_perm('nav_notif_correspondence_templates','notification_management.manage_templates');
select pg_temp.nav_perm('nav_notif_email_sms','notification_management.manage_templates');
select pg_temp.nav_perm('nav_prudential_supervision_notif_templates','notification_management.manage_templates');
select pg_temp.nav_perm('nav_prudential_supervision_notif_log','notification_management.view');
select pg_temp.nav_perm('nav_prudential_supervision_prudential_thresholds','prudential_supervision.manage_config');
select pg_temp.nav_perm('nav_prudential_supervision_prudential_ratios','prudential_supervision.manage_config');
select pg_temp.nav_perm('nav_prudential_supervision_prudential_analytics','prudential_supervision.run_analytics');
select pg_temp.nav_perm('nav_prudential_supervision_validations','returns_management.manage_config');
select pg_temp.nav_perm('nav_prudential_supervision_payment_systems','prudential_payment_systems.view');
select pg_temp.nav_perm('nav_market_conduct_enforcement_cases','enforcement_management.view');
select pg_temp.nav_perm('nav_market_conduct_triage_rules','market_conduct.manage_monitoring_rules');
select pg_temp.nav_perm('nav_market_conduct_monitoring_rules','market_conduct.manage_monitoring_rules');
select pg_temp.nav_perm('nav_insights_alerts','escalation_management.view');
select pg_temp.nav_perm('nav_insights_executive','executive_oversight.view_all_dashboards');
select pg_temp.nav_perm('nav_insights_ai_hub','ai_management.view');
select pg_temp.nav_perm('nav_administration_activity_logs','audit_management.view');
select pg_temp.nav_perm('nav_administration_audit_logs','audit_management.view');
select pg_temp.nav_perm('nav_sec_audit_export','audit_management.export');
select pg_temp.nav_perm('nav_sec_case_audit','audit_management.view');
select pg_temp.nav_perm('nav_adm_audit','audit_management.view');
select pg_temp.nav_perm('nav_adm_sec_security','security_management.view');
select pg_temp.nav_perm('nav_adm_sec_system_events','security_management.view');
select pg_temp.nav_perm('nav_sec_integration_logs','integration_management.view_health');
select pg_temp.nav_perm('nav_adm_sys_integrations','integration_management.view');
select pg_temp.nav_perm('nav_adm_sys_api','integration_management.manage');
select pg_temp.nav_perm('nav_cfg_sup_fp_screening','fit_and_proper.manage_config');
select pg_temp.nav_perm('nav_cfg_sup_fp_committees','fit_and_proper.manage_config');
select pg_temp.nav_perm('nav_cfg_sup_fp_sector_rules','fit_and_proper.manage_config');
select pg_temp.nav_perm('nav_cfg_sup_plan_templates','prudential_supervision.manage_config');
select pg_temp.nav_perm('nav_administration_ppoc_mappings','entity_membership.view');
select pg_temp.nav_perm('nav_lic_regulatory_requests','regulatory_requests.view');
select pg_temp.nav_perm('nav_returns_entity_dashboard','returns_management.view_status');