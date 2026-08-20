-- RDM-ENTITY-001 / BUILD WAVE A — Part 1: canonical security
CREATE TABLE IF NOT EXISTS public.sec_seed_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sec_seed_reports TO authenticated;
GRANT ALL ON public.sec_seed_reports TO service_role;
ALTER TABLE public.sec_seed_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sec_seed_reports_read ON public.sec_seed_reports;
CREATE POLICY sec_seed_reports_read ON public.sec_seed_reports
  FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'role_management', 'view'));

CREATE TABLE IF NOT EXISTS public.sec_role_template_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.sec_role_templates(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.sec_modules(id) ON DELETE CASCADE,
  scope_type_id uuid NOT NULL REFERENCES public.sec_scope_types(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, module_id)
);
CREATE TABLE IF NOT EXISTS public.sec_role_template_scope_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_scope_id uuid NOT NULL REFERENCES public.sec_role_template_scopes(id) ON DELETE CASCADE,
  value_kind text NOT NULL,
  value_id uuid,
  value_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sec_role_template_scopes TO authenticated;
GRANT SELECT ON public.sec_role_template_scope_values TO authenticated;
GRANT ALL ON public.sec_role_template_scopes TO service_role;
GRANT ALL ON public.sec_role_template_scope_values TO service_role;
ALTER TABLE public.sec_role_template_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_role_template_scope_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sec_rts_read ON public.sec_role_template_scopes;
CREATE POLICY sec_rts_read ON public.sec_role_template_scopes
  FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'role_management', 'view_catalog')
         OR public.sec_has_permission(auth.uid(), 'role_management', 'view'));
DROP POLICY IF EXISTS sec_rtsv_read ON public.sec_role_template_scope_values;
CREATE POLICY sec_rtsv_read ON public.sec_role_template_scope_values
  FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'role_management', 'view_catalog')
         OR public.sec_has_permission(auth.uid(), 'role_management', 'view'));

INSERT INTO public.sec_modules (key, label, description, module_type, audience, sort_order, is_system, is_active)
VALUES
  ('entity_resolution', 'Entity Resolution', 'Identity resolution of regulated entities: cases, candidates, merges.', 'business', 'internal', 125, true, true),
  ('entity_membership', 'Entity Membership', 'Authority of external users to represent a regulated entity.', 'business', 'both', 126, true, true),
  ('regulatory_data_model', 'Regulatory Data Model', 'Canonical regulatory metadata: classifications, identifier types, vocabularies.', 'business', 'internal', 690, true, true),
  ('integration_management', 'Integration Management', 'Integration Manager: connections, health, provider configuration.', 'business', 'internal', 695, true, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, v.key, v.label, v.description, v.sort_order, v.sensitive, true, true, true
FROM (VALUES
  ('entity_resolution', 'view',     'View resolution cases',   'Read the entity resolution queue and case detail.', 10, false),
  ('entity_resolution', 'resolve',  'Resolve identity',        'Resolve an applicant identity against an existing entity or confirm a new one.', 20, false),
  ('entity_resolution', 'verify',   'Verify identity evidence','Verify identifier evidence supplied for an entity.', 30, false),
  ('entity_resolution', 'escalate', 'Escalate case',           'Escalate a resolution case for supervisory decision.', 40, false),
  ('entity_resolution', 'approve',  'Approve resolution',      'Approve a resolution decision.', 50, true),
  ('entity_resolution', 'merge',    'Merge entities',          'Approve and execute a controlled entity merge.', 60, true),
  ('entity_membership', 'view',     'View memberships',        'View entity membership records.', 10, false),
  ('entity_membership', 'request',  'Request membership',      'Request authority to represent an entity.', 20, false),
  ('entity_membership', 'verify',   'Verify authority',        'Verify authority evidence for a membership request.', 30, false),
  ('entity_membership', 'approve',  'Approve membership',      'Approve entity membership.', 40, true),
  ('entity_membership', 'revoke',   'Revoke membership',       'Revoke entity membership.', 50, true),
  ('entity_membership', 'manage',   'Manage memberships',      'Administer membership roles and records.', 60, true),
  ('regulatory_data_model', 'view',   'View regulatory data model', 'Read canonical regulatory metadata.', 10, false),
  ('regulatory_data_model', 'manage', 'Manage regulatory data model', 'Create and change canonical regulatory metadata.', 20, true),
  ('integration_management', 'view',            'View integrations',   'View integration connections.', 10, false),
  ('integration_management', 'manage',          'Manage integrations', 'Create and configure integration connections.', 20, true),
  ('integration_management', 'test_connection', 'Test connection',     'Execute connection tests.', 30, false),
  ('integration_management', 'view_health',     'View connection health', 'View integration health and telemetry.', 40, false)
) AS v(module_key, key, label, description, sort_order, sensitive)
JOIN public.sec_modules m ON m.key = v.module_key
ON CONFLICT (module_id, key) DO NOTHING;

INSERT INTO public.sec_permission_dependencies (permission_id, depends_on_permission_id)
SELECT p.id, d.id
FROM (VALUES
  ('entity_resolution','resolve','entity_resolution','view'),
  ('entity_resolution','verify','entity_resolution','view'),
  ('entity_resolution','escalate','entity_resolution','view'),
  ('entity_resolution','approve','entity_resolution','view'),
  ('entity_resolution','merge','entity_resolution','view'),
  ('entity_resolution','merge','entity_resolution','approve'),
  ('entity_membership','request','entity_membership','view'),
  ('entity_membership','verify','entity_membership','view'),
  ('entity_membership','approve','entity_membership','view'),
  ('entity_membership','revoke','entity_membership','view'),
  ('entity_membership','manage','entity_membership','view'),
  ('regulatory_data_model','manage','regulatory_data_model','view'),
  ('integration_management','manage','integration_management','view'),
  ('integration_management','test_connection','integration_management','view'),
  ('integration_management','view_health','integration_management','view')
) AS v(pm, pk, dm, dk)
JOIN public.sec_modules mp ON mp.key = v.pm
JOIN public.sec_permissions p ON p.module_id = mp.id AND p.key = v.pk
JOIN public.sec_modules md ON md.key = v.dm
JOIN public.sec_permissions d ON d.module_id = md.id AND d.key = v.dk
ON CONFLICT DO NOTHING;

INSERT INTO public.sec_role_templates (key, name, description, role_type, dashboard_tier, sort_order, is_system, is_active)
VALUES
  ('system_administrator','System Administrator','System configuration, users and technical settings. Not a regulatory decision maker.','internal','admin',10,true,true),
  ('security_administrator','Security Administrator','Users, roles, permissions, security and security audit.','internal','admin',20,true,true),
  ('regulatory_data_administrator','Regulatory Data Administrator','Regulatory Data Model, classifications, identifier types and reporting metadata.','internal','admin',30,true,true),
  ('integration_administrator','Integration Administrator','Integration Manager, connections, health and provider configuration.','internal','admin',40,true,true),
  ('registration_officer','Registration Officer','Processes registration submissions.','internal','operational',50,true,true),
  ('entity_resolution_officer','Entity Resolution Officer','Resolves regulated-entity identity cases.','internal','operational',60,true,true),
  ('entity_resolution_supervisor','Entity Resolution Supervisor','Approves resolution decisions and controlled entity merges.','internal','supervisory',70,true,true),
  ('licensing_officer','Licensing Officer','Processes licence applications day-to-day.','internal','operational',80,true,true),
  ('licensing_supervisor','Licensing Supervisor','Reviews and decides licence applications and issuance.','internal','supervisory',90,true,true),
  ('prudential_analyst','Prudential Analyst','Prudential analysis and returns review.','internal','operational',100,true,true),
  ('prudential_supervisor','Prudential Supervisor','Prudential supervisory decisions and examinations.','internal','supervisory',110,true,true),
  ('conduct_analyst','Conduct Analyst','Market conduct analysis and complaint investigation.','internal','operational',120,true,true),
  ('conduct_supervisor','Conduct Supervisor','Market conduct supervisory decisions.','internal','supervisory',130,true,true),
  ('fit_proper_officer','Fit & Proper Officer','Processes fit & proper assessments.','internal','operational',140,true,true),
  ('fit_proper_supervisor','Fit & Proper Supervisor','Fit & proper determinations.','internal','supervisory',150,true,true),
  ('returns_officer','Returns Officer','Processes regulatory returns.','internal','operational',160,true,true),
  ('returns_supervisor','Returns Supervisor','Approves regulatory returns.','internal','supervisory',170,true,true),
  ('inspector','Inspector','Conducts inspections and onsite work.','internal','operational',180,true,true),
  ('enforcement_officer','Enforcement Officer','Prepares and progresses enforcement matters.','internal','operational',190,true,true),
  ('correspondence_officer','Correspondence Officer','Handles regulatory correspondence.','internal','operational',200,true,true),
  ('regulatory_analyst','Regulatory Analyst','Cross-module analysis and reporting.','internal','operational',210,true,true),
  ('auditor','Auditor','Read-only assurance access across regulatory records.','internal','oversight',220,true,true),
  ('read_only','Read Only','Ordinary operational read-only access.','internal','operational',230,true,true)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, role_type = EXCLUDED.role_type,
      dashboard_tier = EXCLUDED.dashboard_tier, is_system = true, is_active = true, updated_at = now();

CREATE TEMP TABLE _tpl_perm(template_key text, module_key text, perm_key text);
INSERT INTO _tpl_perm VALUES
  ('system_administrator','settings','view'),('system_administrator','settings','edit'),
  ('system_administrator','user_management','view'),('system_administrator','user_management','create'),('system_administrator','user_management','edit'),
  ('system_administrator','role_management','view'),('system_administrator','role_management','view_catalog'),
  ('system_administrator','security_management','view'),
  ('system_administrator','audit_management','view'),
  ('system_administrator','integration_management','view'),('system_administrator','integration_management','manage'),
  ('system_administrator','integration_management','test_connection'),('system_administrator','integration_management','view_health'),
  ('system_administrator','form_management','view'),
  ('system_administrator','regulatory_data_model','view'),
  ('security_administrator','user_management','view'),('security_administrator','user_management','create'),('security_administrator','user_management','edit'),
  ('security_administrator','role_management','view'),('security_administrator','role_management','view_catalog'),('security_administrator','role_management','create'),
  ('security_administrator','role_management','edit'),('security_administrator','role_management','delete'),('security_administrator','role_management','assign_role'),
  ('security_administrator','role_management','assign_permissions'),('security_administrator','role_management','manage_catalog'),('security_administrator','role_management','view_coverage'),
  ('security_administrator','security_management','view'),
  ('security_administrator','audit_management','view'),('security_administrator','audit_management','export'),
  ('security_administrator','settings','view'),
  ('regulatory_data_administrator','regulatory_data_model','view'),('regulatory_data_administrator','regulatory_data_model','manage'),
  ('regulatory_data_administrator','form_management','view'),('regulatory_data_administrator','form_management','create'),('regulatory_data_administrator','form_management','edit'),
  ('regulatory_data_administrator','report_management','view'),
  ('regulatory_data_administrator','settings','view'),
  ('integration_administrator','integration_management','view'),('integration_administrator','integration_management','manage'),
  ('integration_administrator','integration_management','test_connection'),('integration_administrator','integration_management','view_health'),
  ('integration_administrator','settings','view'),
  ('registration_officer','registration_management','view'),('registration_officer','registration_management','create'),
  ('registration_officer','registration_management','edit'),('registration_officer','registration_management','workflow_action'),
  ('registration_officer','application_management','view'),
  ('registration_officer','entity_resolution','view'),
  ('registration_officer','licensee_management','view'),
  ('entity_resolution_officer','entity_resolution','view'),('entity_resolution_officer','entity_resolution','resolve'),
  ('entity_resolution_officer','entity_resolution','verify'),('entity_resolution_officer','entity_resolution','escalate'),
  ('entity_resolution_officer','entity_membership','view'),('entity_resolution_officer','entity_membership','verify'),
  ('entity_resolution_officer','registration_management','view'),
  ('entity_resolution_officer','licensee_management','view'),
  ('entity_resolution_supervisor','entity_resolution','view'),('entity_resolution_supervisor','entity_resolution','resolve'),
  ('entity_resolution_supervisor','entity_resolution','verify'),('entity_resolution_supervisor','entity_resolution','escalate'),
  ('entity_resolution_supervisor','entity_resolution','approve'),('entity_resolution_supervisor','entity_resolution','merge'),
  ('entity_resolution_supervisor','entity_membership','view'),('entity_resolution_supervisor','entity_membership','verify'),
  ('entity_resolution_supervisor','entity_membership','approve'),('entity_resolution_supervisor','entity_membership','revoke'),
  ('entity_resolution_supervisor','registration_management','view'),
  ('entity_resolution_supervisor','licensee_management','view'),('entity_resolution_supervisor','licensee_management','view_all_entities'),
  ('licensing_officer','application_management','view'),('licensing_officer','application_management','create'),
  ('licensing_officer','application_management','edit'),('licensing_officer','application_management','workflow_action'),
  ('licensing_officer','license_management','view'),('licensing_officer','license_management','create'),('licensing_officer','license_management','edit'),
  ('licensing_officer','licensee_management','view'),
  ('licensing_officer','entity_resolution','view'),
  ('licensing_officer','registration_management','view'),
  ('licensing_officer','fee_management','view'),
  ('licensing_supervisor','application_management','view'),('licensing_supervisor','application_management','edit'),
  ('licensing_supervisor','application_management','approve'),('licensing_supervisor','application_management','reject'),
  ('licensing_supervisor','application_management','workflow_action'),('licensing_supervisor','application_management','view_all_entities'),
  ('licensing_supervisor','license_management','view'),('licensing_supervisor','license_management','approve'),
  ('licensing_supervisor','license_management','manage_certificates'),('licensing_supervisor','license_management','manage_conditions'),
  ('licensing_supervisor','license_management','workflow_action'),
  ('licensing_supervisor','licensee_management','view'),('licensing_supervisor','licensee_management','view_all_entities'),
  ('licensing_supervisor','entity_resolution','view'),
  ('licensing_supervisor','registration_management','view'),('licensing_supervisor','registration_management','approve'),('licensing_supervisor','registration_management','reject'),
  ('prudential_analyst','prudential_supervision','view'),('prudential_analyst','prudential_supervision','create'),
  ('prudential_analyst','prudential_supervision','edit'),('prudential_analyst','prudential_supervision','run_analytics'),
  ('prudential_analyst','prudential_supervision','review_returns'),
  ('prudential_analyst','returns_management','view'),('prudential_analyst','licensee_management','view'),
  ('prudential_supervisor','prudential_supervision','view'),('prudential_supervisor','prudential_supervision','create'),
  ('prudential_supervisor','prudential_supervision','edit'),('prudential_supervisor','prudential_supervision','run_analytics'),
  ('prudential_supervisor','prudential_supervision','review_returns'),('prudential_supervisor','prudential_supervision','initiate_supervisory_action'),
  ('prudential_supervisor','prudential_supervision','record_camels_assessment'),('prudential_supervisor','prudential_supervision','manage_examination'),
  ('prudential_supervisor','prudential_supervision','signoff_workpaper'),('prudential_supervisor','prudential_supervision','workflow_action'),
  ('prudential_supervisor','prudential_supervision','view_all_entities'),
  ('prudential_supervisor','returns_management','view'),('prudential_supervisor','licensee_management','view'),
  ('conduct_analyst','market_conduct','view'),('conduct_analyst','market_conduct','run_conduct_analytics'),
  ('conduct_analyst','complaint_management','view'),('conduct_analyst','complaint_management','investigate'),('conduct_analyst','complaint_management','assign'),
  ('conduct_analyst','licensee_management','view'),
  ('conduct_supervisor','market_conduct','view'),('conduct_supervisor','market_conduct','run_conduct_analytics'),
  ('conduct_supervisor','market_conduct','initiate_investigation'),('conduct_supervisor','market_conduct','initiate_thematic_review'),
  ('conduct_supervisor','market_conduct','manage_complaints'),('conduct_supervisor','market_conduct','manage_monitoring_rules'),
  ('conduct_supervisor','complaint_management','view'),('conduct_supervisor','complaint_management','investigate'),
  ('conduct_supervisor','complaint_management','assign'),('conduct_supervisor','complaint_management','resolve'),
  ('conduct_supervisor','complaint_management','close'),('conduct_supervisor','complaint_management','escalate'),
  ('conduct_supervisor','complaint_management','approve_rfi'),('conduct_supervisor','licensee_management','view'),
  ('fit_proper_officer','fit_and_proper','view'),('fit_proper_officer','fit_and_proper','create'),('fit_proper_officer','fit_and_proper','edit'),
  ('fit_proper_officer','fit_and_proper','submit'),('fit_proper_officer','fit_and_proper','execute'),
  ('fit_proper_officer','fit_and_proper','workflow_action'),('fit_proper_officer','fit_and_proper','upload_documents'),
  ('fit_proper_supervisor','fit_and_proper','view'),('fit_proper_supervisor','fit_and_proper','edit'),
  ('fit_proper_supervisor','fit_and_proper','execute'),('fit_proper_supervisor','fit_and_proper','workflow_action'),
  ('fit_proper_supervisor','fit_and_proper','approve'),('fit_proper_supervisor','fit_and_proper','override_committee'),
  ('fit_proper_supervisor','fit_and_proper','export'),
  ('returns_officer','returns_management','view'),('returns_officer','returns_management','create'),
  ('returns_officer','returns_management','edit'),('returns_officer','returns_management','workflow_action'),
  ('returns_officer','returns_management','respond_rfi'),('returns_officer','licensee_management','view'),
  ('returns_supervisor','returns_management','view'),('returns_supervisor','returns_management','edit'),
  ('returns_supervisor','returns_management','approve'),('returns_supervisor','returns_management','workflow_action'),
  ('returns_supervisor','returns_management','view_all_entities'),('returns_supervisor','returns_management','manage_config'),
  ('returns_supervisor','licensee_management','view'),
  ('inspector','inspection_management','view'),('inspector','inspection_management','create'),
  ('inspector','inspection_management','edit'),('inspector','inspection_management','workflow_action'),
  ('inspector','licensee_management','view'),
  ('enforcement_officer','enforcement_management','view'),('enforcement_officer','enforcement_management','create'),
  ('enforcement_officer','enforcement_management','edit'),('enforcement_officer','enforcement_management','workflow_action'),
  ('enforcement_officer','licensee_management','view'),
  ('correspondence_officer','complaint_management','view'),('correspondence_officer','complaint_management','upload_documents'),
  ('correspondence_officer','notification_management','view'),('correspondence_officer','licensee_management','view'),
  ('regulatory_analyst','report_management','view'),('regulatory_analyst','report_management','create'),('regulatory_analyst','report_management','export'),
  ('regulatory_analyst','prudential_supervision','view'),('regulatory_analyst','market_conduct','view'),
  ('regulatory_analyst','returns_management','view'),('regulatory_analyst','licensee_management','view'),
  ('auditor','audit_management','view'),('auditor','audit_management','export'),
  ('auditor','licensee_management','view'),('auditor','entity_resolution','view'),
  ('auditor','application_management','view'),('auditor','license_management','view'),
  ('auditor','returns_management','view'),('auditor','prudential_supervision','view'),
  ('auditor','regulatory_data_model','view'),('auditor','report_management','view'),
  ('read_only','licensee_management','view'),('read_only','application_management','view'),
  ('read_only','license_management','view'),('read_only','returns_management','view'),
  ('read_only','report_management','view');

INSERT INTO public.sec_role_template_permissions (template_id, permission_id)
SELECT t.id, p.id
FROM _tpl_perm tp
JOIN public.sec_role_templates t ON t.key = tp.template_key
JOIN public.sec_modules m ON m.key = tp.module_key
JOIN public.sec_permissions p ON p.module_id = m.id AND p.key = tp.perm_key
ON CONFLICT DO NOTHING;

INSERT INTO public.sec_seed_reports (wave, category, subject, action, detail)
SELECT 'A', 'template_permission_unmapped', tp.template_key, 'skipped',
       tp.module_key || '.' || tp.perm_key || ' does not exist in the catalogue'
FROM _tpl_perm tp
WHERE NOT EXISTS (
  SELECT 1 FROM public.sec_modules m
  JOIN public.sec_permissions p ON p.module_id = m.id AND p.key = tp.perm_key
  WHERE m.key = tp.module_key
);

CREATE TEMP TABLE _tpl_scope(template_key text, module_key text, scope_key text);
INSERT INTO _tpl_scope VALUES
  ('registration_officer','registration_management','assigned'),
  ('registration_officer','licensee_management','all'),
  ('entity_resolution_officer','entity_resolution','all'),
  ('entity_resolution_officer','licensee_management','all'),
  ('entity_resolution_supervisor','entity_resolution','all'),
  ('entity_resolution_supervisor','licensee_management','all'),
  ('licensing_officer','application_management','assigned'),
  ('licensing_officer','license_management','assigned'),
  ('licensing_supervisor','application_management','all'),
  ('licensing_supervisor','license_management','all'),
  ('prudential_analyst','prudential_supervision','assigned'),
  ('prudential_supervisor','prudential_supervision','all'),
  ('conduct_analyst','complaint_management','assigned'),
  ('conduct_supervisor','complaint_management','all'),
  ('fit_proper_officer','fit_and_proper','assigned'),
  ('fit_proper_supervisor','fit_and_proper','all'),
  ('returns_officer','returns_management','assigned'),
  ('returns_supervisor','returns_management','all'),
  ('inspector','inspection_management','assigned'),
  ('enforcement_officer','enforcement_management','assigned'),
  ('regulatory_analyst','report_management','all'),
  ('auditor','licensee_management','all'),
  ('read_only','licensee_management','all');

INSERT INTO public.sec_role_template_scopes (template_id, module_id, scope_type_id)
SELECT t.id, m.id, st.id
FROM _tpl_scope ts
JOIN public.sec_role_templates t ON t.key = ts.template_key
JOIN public.sec_modules m ON m.key = ts.module_key
JOIN public.sec_scope_types st ON st.key = ts.scope_key
ON CONFLICT (template_id, module_id) DO NOTHING;

DO $$
DECLARE
  t RECORD;
  r RECORD;
  wave_modules text[] := ARRAY['entity_resolution','entity_membership','regulatory_data_model','integration_management'];
  new_role_id uuid;
  granted int;
BEGIN
  FOR t IN SELECT * FROM public.sec_role_templates WHERE is_system ORDER BY sort_order LOOP
    SELECT * INTO r FROM public.sec_roles WHERE key = t.key;
    IF r.id IS NULL THEN
      INSERT INTO public.sec_roles (key, name, description, role_type, role_category, dashboard_tier, status, is_system, is_break_glass)
      VALUES (t.key, t.name, t.description, t.role_type, t.dashboard_tier, t.dashboard_tier, 'active', true, false)
      RETURNING id INTO new_role_id;
      INSERT INTO public.sec_role_permissions (role_id, permission_id)
      SELECT new_role_id, tp.permission_id FROM public.sec_role_template_permissions tp
      WHERE tp.template_id = t.id ON CONFLICT DO NOTHING;
      INSERT INTO public.sec_role_scopes (role_id, module_id, scope_type_id)
      SELECT new_role_id, s.module_id, s.scope_type_id FROM public.sec_role_template_scopes s
      WHERE s.template_id = t.id ON CONFLICT DO NOTHING;
      INSERT INTO public.sec_seed_reports (wave, category, subject, action, detail)
      VALUES ('A','role',t.key,'created','baseline role created from canonical template');
    ELSIF r.is_system THEN
      WITH ins AS (
        INSERT INTO public.sec_role_permissions (role_id, permission_id)
        SELECT r.id, tp.permission_id
        FROM public.sec_role_template_permissions tp
        JOIN public.sec_permissions p ON p.id = tp.permission_id
        JOIN public.sec_modules m ON m.id = p.module_id
        WHERE tp.template_id = t.id AND m.key = ANY(wave_modules)
        ON CONFLICT DO NOTHING
        RETURNING 1
      ) SELECT count(*) INTO granted FROM ins;
      INSERT INTO public.sec_seed_reports (wave, category, subject, action, detail)
      VALUES ('A','role',t.key,'reused','existing system role kept; wave-A grants added: ' || granted);
    ELSE
      INSERT INTO public.sec_seed_reports (wave, category, subject, action, detail)
      VALUES ('A','role',t.key,'collision','role exists with is_system=false — custom configuration preserved, template available for optional use');
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_view uuid;
  v_manage uuid;
BEGIN
  SELECT p.id INTO v_view FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
    WHERE m.key='regulatory_data_model' AND p.key='view';
  SELECT p.id INTO v_manage FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
    WHERE m.key='regulatory_data_model' AND p.key='manage';
  INSERT INTO public.sec_seed_reports (wave, category, subject, action, detail)
  SELECT DISTINCT 'A','rdm_parity', r.key, 'granted', 'held settings.edit -> regulatory_data_model.view+manage'
  FROM public.sec_roles r
  JOIN public.sec_role_permissions rp ON rp.role_id = r.id
  JOIN public.sec_permissions p ON p.id = rp.permission_id
  JOIN public.sec_modules m ON m.id = p.module_id
  WHERE m.key='settings' AND p.key='edit';
  INSERT INTO public.sec_role_permissions (role_id, permission_id)
  SELECT DISTINCT r.id, x.pid
  FROM public.sec_roles r
  JOIN public.sec_role_permissions rp ON rp.role_id = r.id
  JOIN public.sec_permissions p ON p.id = rp.permission_id
  JOIN public.sec_modules m ON m.id = p.module_id
  CROSS JOIN (VALUES (v_view),(v_manage)) AS x(pid)
  WHERE m.key='settings' AND p.key='edit'
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
SELECT v.key, v.path, v.match_type, p.id, v.audience, true, true, true, v.priority
FROM (VALUES
  ('route_entities','/entities','prefix','licensee_management','view','internal',120),
  ('route_entity_resolution','/licensing/entity-resolution','prefix','entity_resolution','view','internal',110),
  ('route_my_organisations','/account/organisations','exact','entity_membership','view','external',130)
) AS v(key, path, match_type, module_key, perm_key, audience, priority)
JOIN public.sec_modules m ON m.key = v.module_key
JOIN public.sec_permissions p ON p.module_id = m.id AND p.key = v.perm_key
ON CONFLICT (key) DO UPDATE
  SET path_pattern = EXCLUDED.path_pattern, match_type = EXCLUDED.match_type,
      required_permission_id = EXCLUDED.required_permission_id, audience = EXCLUDED.audience,
      is_active = true, updated_at = now();

UPDATE public.sec_routes r
SET required_permission_id = p.id, updated_at = now()
FROM public.sec_permissions p
JOIN public.sec_modules m ON m.id = p.module_id
WHERE m.key='regulatory_data_model' AND p.key='view'
  AND r.key = 'route_admin_regulatory_data_model';

INSERT INTO public.sec_navigation_items
  (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience,
   is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
SELECT v.key, parent.id, v.label, v.description, 'link', rt.id, v.icon, v.sort_order, v.audience,
       true, true, true, v.keywords, true, false, p.id
FROM (VALUES
  ('nav_lic_entity_resolution','nav_lic_registration','Entity Resolution',
   'Resolve applicant identity against the regulated entity register.',
   'route_entity_resolution','ScanSearch',125,'internal',
   ARRAY['entity','resolution','identity','match','duplicate'],'entity_resolution','view'),
  ('nav_sup_regulated_entities','grp_nav_supervision','Regulated Entities',
   'Directory of regulated entities, identity status and licences.',
   'route_entities','Building2',205,'internal',
   ARRAY['entity','entities','register','directory','licensee'],'licensee_management','view')
) AS v(key, parent_key, label, description, route_key, icon, sort_order, audience, keywords, module_key, perm_key)
JOIN public.sec_navigation_items parent ON parent.key = v.parent_key
JOIN public.sec_routes rt ON rt.key = v.route_key
JOIN public.sec_modules m ON m.key = v.module_key
JOIN public.sec_permissions p ON p.module_id = m.id AND p.key = v.perm_key
ON CONFLICT (key) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, route_id = EXCLUDED.route_id,
      icon_key = EXCLUDED.icon_key, sort_order = EXCLUDED.sort_order,
      required_permission_id = EXCLUDED.required_permission_id,
      is_active = true, show_in_sidebar = true, updated_at = now();

UPDATE public.sec_navigation_items n
SET required_permission_id = p.id, updated_at = now()
FROM public.sec_permissions p
JOIN public.sec_modules m ON m.id = p.module_id
WHERE m.key='regulatory_data_model' AND p.key='view'
  AND n.key = 'admin_config_regulatory_data_model';

DROP TABLE IF EXISTS _tpl_perm;
DROP TABLE IF EXISTS _tpl_scope;