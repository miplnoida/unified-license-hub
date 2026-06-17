
-- 1. Module catalog
CREATE TABLE public.permission_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_modules TO authenticated;
GRANT ALL ON public.permission_modules TO service_role;
ALTER TABLE public.permission_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads permission_modules" ON public.permission_modules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage permission_modules" ON public.permission_modules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

-- 2. Actions catalog
CREATE TABLE public.permission_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_actions TO authenticated;
GRANT ALL ON public.permission_actions TO service_role;
ALTER TABLE public.permission_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads permission_actions" ON public.permission_actions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage permission_actions" ON public.permission_actions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

-- 3. Route attachments
CREATE TABLE public.permission_module_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  route_prefix text NOT NULL,
  menu_label text,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, route_prefix)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_module_routes TO authenticated;
GRANT ALL ON public.permission_module_routes TO service_role;
ALTER TABLE public.permission_module_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads permission_module_routes" ON public.permission_module_routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage permission_module_routes" ON public.permission_module_routes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

-- 4. Link permissions → action
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS action_id uuid REFERENCES public.permission_actions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_permissions_action_id ON public.permissions(action_id);

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_permission_modules_updated BEFORE UPDATE ON public.permission_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_column();
CREATE TRIGGER trg_permission_actions_updated BEFORE UPDATE ON public.permission_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_column();
CREATE TRIGGER trg_permission_module_routes_updated BEFORE UPDATE ON public.permission_module_routes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_column();

-- 6. Seed existing 12 modules (is_system=false so admins can edit names/descriptions, but key is stable)
INSERT INTO public.permission_modules (key, label, description, sort_order, is_system) VALUES
  ('application_management','Application Management','Review, process and approve license applications.',10,true),
  ('license_management','License Management','Manage issued licenses and licensee entities.',20,true),
  ('registration_management','Registration Review','View and process submitted licensee registration requests.',30,true),
  ('returns_management','Returns Management','Configure and review periodic regulatory returns.',40,true),
  ('complaint_management','Complaint Handling','Handle complaints filed against licensees.',50,true),
  ('user_management','User Management','Manage internal employees and licensee portal users.',60,true),
  ('role_management','Role Management','Create roles and assign permissions.',70,true),
  ('report_management','Reports','View analytics dashboards and run reports.',80,true),
  ('fee_management','Fee Management','Configure application and license fees.',90,true),
  ('form_management','Form Management','Build and version application & registration forms.',100,true),
  ('workflow_management','Workflow Management','Configure approval workflows and delegation rules.',110,true),
  ('settings','System Settings','Manage system configuration, branding, master data and audit logs.',120,true)
ON CONFLICT (key) DO NOTHING;

-- 7. Seed actions from current permissions table
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system)
SELECT m.id, p.name,
  initcap(replace(p.name,'_',' ')),
  NULL,
  CASE p.name WHEN 'view' THEN 10 WHEN 'create' THEN 20 WHEN 'edit' THEN 30 WHEN 'approve' THEN 40 WHEN 'reject' THEN 50 ELSE 100 END,
  true
FROM (SELECT DISTINCT module, name FROM public.permissions) p
JOIN public.permission_modules m ON m.key = p.module
ON CONFLICT (module_id, key) DO NOTHING;

-- 8. Backfill permissions.action_id
UPDATE public.permissions p
SET action_id = a.id
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key = p.module AND a.key = p.name AND p.action_id IS NULL;

-- 9. Seed route attachments from current static map
INSERT INTO public.permission_module_routes (module_id, route_prefix, menu_label, sort_order)
SELECT m.id, r.route_prefix, r.menu_label, r.sort_order
FROM (VALUES
  ('form_management','/admin/forms','Form Management',10),
  ('form_management','/admin/registration-forms','Registration Forms',20),
  ('application_management','/applications/queue','All License Requests',10),
  ('user_management','/admin/users','Employee Management',10),
  ('user_management','/admin/web-users',NULL,20),
  ('user_management','/admin/employees',NULL,30),
  ('user_management','/admin/external-portal-access','External Portal Access',40),
  ('role_management','/admin/roles','Role Management',10),
  ('license_management','/admin/licensees','Licensee Entities',10),
  ('license_management','/admin/approved-licensees',NULL,20),
  ('license_management','/admin/ppoc-mappings','PPOC Mappings',30),
  ('registration_management','/admin/registration-review','Registration Review',10),
  ('returns_management','/admin/returns','Returns Admin',10),
  ('returns_management','/admin/return-config',NULL,20),
  ('fee_management','/admin/fees','Fee Management',10),
  ('workflow_management','/workflows','Approval Workflows',10),
  ('workflow_management','/delegation-rules','Delegation Rules',20),
  ('complaint_management','/admin/complaint-types','Complaint Types',10),
  ('complaint_management','/complaints','Complaints',20),
  ('report_management','/reports','Reports',10),
  ('report_management','/analytics','Analytics',20),
  ('settings','/settings','Settings',10),
  ('settings','/admin/audit-logs','Activity Logs',20),
  ('settings','/admin/compliance-audit-logs','Audit Logs',30),
  ('settings','/admin/notification-templates','Notification Templates',40),
  ('settings','/admin/master-data','Master Data',50),
  ('settings','/admin/masters','Master Configuration',60),
  ('settings','/admin/regulators',NULL,70),
  ('settings','/admin','Admin Control Panel',5)
) AS r(module_key, route_prefix, menu_label, sort_order)
JOIN public.permission_modules m ON m.key = r.module_key
ON CONFLICT (module_id, route_prefix) DO NOTHING;

-- 10. Seed BRD modules / sub-modules
INSERT INTO public.permission_modules (key, label, description, parent_id, sort_order, is_system) VALUES
  ('licensing','Module 1 - Licensing','Licensing lifecycle, legal review and decisions.', NULL, 200, false),
  ('fit_and_proper','Module 2 - Fit & Proper','Fit & Proper assessment lifecycle.', NULL, 210, false),
  ('prudential_supervision','Module 3 - Prudential Supervision','Prudential supervision, returns review and onsite examinations.', NULL, 220, false),
  ('market_conduct','Module 4 - Market Conduct','Market conduct supervision and investigations.', NULL, 230, false),
  ('public_complaint_portal','Public Complaint Portal','Public-facing complaint submission and tracking.', NULL, 240, false),
  ('executive_oversight','Executive Oversight','Cross-module read access and executive dashboards.', NULL, 250, false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_modules (key, label, description, parent_id, sort_order, is_system)
SELECT v.key, v.label, v.description, p.id, v.sort_order, false
FROM (VALUES
  ('fit_and_proper_initiation','F&P - Initiation','Initiate fit & proper assessments.','fit_and_proper',10),
  ('fit_and_proper_screening','F&P - Screening','Screen fit & proper candidates.','fit_and_proper',20),
  ('fit_and_proper_committee','F&P - Committee','Committee deliberation and voting on F&P.','fit_and_proper',30),
  ('prudential_payment_systems','Payment Systems Supervision','PFMI, FMIs, MSBs and payment operator oversight.','prudential_supervision',10),
  ('market_conduct_investigation','Market Conduct - Investigation','Restricted investigation workspace and evidence handling.','market_conduct',10)
) AS v(key, label, description, parent_key, sort_order)
JOIN public.permission_modules p ON p.key = v.parent_key
ON CONFLICT (key) DO NOTHING;

-- 11. Seed actions for BRD modules
WITH new_actions(module_key, action_key, label, sort_order) AS (
  VALUES
    -- Licensing module
    ('licensing','view','View',10),
    ('licensing','add_legal_notes','Add Legal Notes',20),
    ('licensing','flag_concern','Flag Concern',30),
    ('licensing','recommend_conditions','Recommend Conditions',40),
    ('licensing','approve','Approve / Decide',50),
    ('licensing','conditional_approve','Conditional Approve',60),
    ('licensing','reject','Reject',70),
    ('licensing','issue_digital_license','Issue Digitally Signed License',80),
    ('licensing','override_ai_recommendation','Override AI Recommendation',90),
    ('licensing','sign_enforcement_order','Sign Enforcement Order',100),
    -- F&P parent
    ('fit_and_proper','view','View',10),
    -- F&P initiation
    ('fit_and_proper_initiation','view','View',10),
    ('fit_and_proper_initiation','initiate_assessment','Initiate Assessment',20),
    ('fit_and_proper_initiation','manage_initiation_types','Manage Initiation Types',30),
    -- F&P screening
    ('fit_and_proper_screening','view','View',10),
    ('fit_and_proper_screening','manage_screening','Manage Screening',20),
    ('fit_and_proper_screening','record_adverse_findings','Record Adverse Findings',30),
    ('fit_and_proper_screening','run_ai_analysis','Run AI Analysis',40),
    ('fit_and_proper_screening','issue_determination','Issue Determination',50),
    ('fit_and_proper_screening','manage_conditions_monitoring','Manage Conditions & Monitoring',60),
    -- F&P committee
    ('fit_and_proper_committee','view','View',10),
    ('fit_and_proper_committee','cast_weighted_vote','Cast Weighted Vote',20),
    ('fit_and_proper_committee','provide_rationale','Provide Rationale',30),
    -- Prudential supervision parent
    ('prudential_supervision','view','View',10),
    ('prudential_supervision','review_returns','Review & Validate Returns',20),
    ('prudential_supervision','run_analytics','Run Analytics',30),
    ('prudential_supervision','record_camels_assessment','Record CAMELS Assessment',40),
    ('prudential_supervision','initiate_supervisory_action','Initiate Supervisory Action',50),
    ('prudential_supervision','set_ewi_rules','Set EWI Rules',60),
    ('prudential_supervision','manage_remediation','Manage Remediation',70),
    ('prudential_supervision','conduct_onsite_examination','Conduct Onsite Examination',80),
    -- Payment Systems sub
    ('prudential_payment_systems','view','View',10),
    ('prudential_payment_systems','supervise_fmi','Supervise FMIs / Retail Payment Operators',20),
    ('prudential_payment_systems','conduct_pfmi_assessment','Conduct PFMI Assessment',30),
    ('prudential_payment_systems','oversee_msb','Oversee MSBs',40),
    ('prudential_payment_systems','manage_payment_workflow','Manage Payment System Workflows',50),
    -- Market conduct parent
    ('market_conduct','view','View',10),
    ('market_conduct','manage_complaints','Manage Complaints',20),
    ('market_conduct','initiate_investigation','Initiate Investigation',30),
    ('market_conduct','run_conduct_analytics','Run Conduct Analytics',40),
    ('market_conduct','initiate_thematic_review','Initiate Thematic Review',50),
    ('market_conduct','issue_enforcement_action','Issue Enforcement Action',60),
    ('market_conduct','manage_monitoring_rules','Manage Ongoing Monitoring Rules',70),
    -- Investigation sub
    ('market_conduct_investigation','view','View',10),
    ('market_conduct_investigation','access_investigation_workspace','Access Investigation Workspace',20),
    ('market_conduct_investigation','manage_evidence_repository','Manage Evidence Repository',30),
    ('market_conduct_investigation','conduct_interviews','Conduct Interviews',40),
    ('market_conduct_investigation','prepare_investigation_report','Prepare Investigation Report',50),
    -- Public portal
    ('public_complaint_portal','submit_complaint_public','Submit Complaint (Public Portal)',10),
    ('public_complaint_portal','receive_acknowledgement','Receive Acknowledgement',20),
    ('public_complaint_portal','check_status_by_reference','Check Status by Reference',30),
    -- Executive oversight
    ('executive_oversight','view_all_dashboards','View All Dashboards',10),
    ('executive_oversight','drill_into_cases','Drill Into Any Case',20),
    ('executive_oversight','view_cross_module_audit','View Cross-Module Audit Trails',30),
    ('executive_oversight','view_all_reports','View All Reports',40),
    ('executive_oversight','receive_ai_insights','Receive Automated AI Insights',50)
)
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system)
SELECT m.id, na.action_key, na.label, NULL, na.sort_order, false
FROM new_actions na
JOIN public.permission_modules m ON m.key = na.module_key
ON CONFLICT (module_id, key) DO NOTHING;

-- 12. Backfill permissions table for all newly created actions (so role_permissions can link)
INSERT INTO public.permissions (module, name, description, action_id)
SELECT m.key, a.key, NULL, a.id
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
LEFT JOIN public.permissions p ON p.module = m.key AND p.name = a.key
WHERE p.id IS NULL;

-- Ensure all rows have action_id set
UPDATE public.permissions p
SET action_id = a.id
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key = p.module AND a.key = p.name AND p.action_id IS NULL;
